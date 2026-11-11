import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { LISTING_SELLERS_MAX } from '@apart/contracts'
import type {
  ActivityChannel,
  EvaluatedListing,
  ListingSellerOrigin,
  ListingSellerWriteResult,
  ObservedSellerType,
} from '@apart/contracts'
import {
  isEmptySeller,
  knownSellers,
  normalizeSeller,
  otherSellerText,
  referenceMatchOf,
  sameSeller,
} from '@apart/domain'
import type { NormalizedSeller, SellerFacts } from '@apart/domain'
import { ActivityService } from '../activity/activity.service'
import type { Member } from '../generated/prisma'
import { PrismaService } from '../prisma/prisma.service'
import { DuplicatesService } from './duplicates.service'
import type { Tx } from './link-writes'
import { ListingsService } from './listings.service'

export interface SellerAddInput {
  sellerType: ObservedSellerType
  sellerName?: string | undefined
  sellerReference?: string | undefined
  expectedUpdatedAt?: string | undefined
}

export interface SellerAddOptions {
  channel: ActivityChannel
  origin: ListingSellerOrigin
}

/** Le vendeur principal et les autres agences d'une annonce vue. */
export function sellersOf(item: EvaluatedListing): {
  principal: SellerFacts
  others: SellerFacts[]
} {
  return {
    principal: {
      sellerType: item.listing.sellerType,
      sellerName: item.listing.sellerName,
      sellerReference: item.listing.sellerReference,
    },
    others: item.sellers.map(seller => ({
      sellerType: seller.sellerType,
      sellerName: seller.sellerName,
      sellerReference: seller.sellerReference,
    })),
  }
}

/** Écrit une autre agence sur une annonce, dans une transaction (ajout, lien, fusion). */
export async function createListingSeller(
  tx: Tx,
  input: {
    workspaceId: string
    listingId: string
    seller: NormalizedSeller
    origin: ListingSellerOrigin
    addedById: string | null
  }
): Promise<{ id: string }> {
  return tx.listingSeller.create({
    data: {
      workspaceId: input.workspaceId,
      listingId: input.listingId,
      sellerType: input.seller.sellerType,
      sellerName: input.seller.sellerName,
      sellerReference: input.seller.sellerReference,
      sellerReferenceKey: input.seller.sellerReferenceKey,
      origin: input.origin,
      addedById: input.addedById,
    },
    select: { id: true },
  })
}

/**
 * Lot 27 (ADR 0037) : plusieurs agences vendent parfois le même bien (mandat
 * simple). L'agence principale reste sur l'annonce ; chaque autre agence
 * s'ajoute ici avec sa référence, qui sert ensuite à reconnaître la même
 * annonce sur un autre portail (doublons, rattachement d'office, liens
 * ajoutés par Claude). Ajout par un membre ou par Claude après accord ;
 * retrait par un membre dans l'application seulement. Journalisé.
 */
@Injectable()
export class ListingSellersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly listings: ListingsService,
    private readonly duplicates: DuplicatesService
  ) {}

  /**
   * Ajoute une agence qui vend le même bien. Si la fiche ne sait encore rien
   * de son vendeur, elle devient son agence principale. Refusé si l'agence
   * est déjà sur la fiche, si la limite est atteinte, ou si cette agence et
   * cette référence sont déjà celles d'une autre annonce (c'est sans doute la
   * même : les deux fiches se fusionnent).
   */
  async add(
    member: Member,
    listingId: string,
    input: SellerAddInput,
    options: SellerAddOptions
  ): Promise<ListingSellerWriteResult> {
    const item = await this.listings.get(member, listingId)
    this.listings.assertNotMerged({
      mergedIntoId: item.mergedInto?.id ?? null,
      mergedInto: item.mergedInto,
    })
    if (input.expectedUpdatedAt !== undefined) {
      this.listings.checkGuards(item.listing, {
        expectedUpdatedAt: input.expectedUpdatedAt,
      })
    }
    const seller = normalizeSeller({
      sellerType: input.sellerType,
      sellerName: input.sellerName,
      sellerReference: input.sellerReference,
    })
    if (
      seller.sellerType !== 'private' &&
      !seller.sellerName &&
      !seller.sellerReference
    ) {
      throw new BadRequestException('Donne le nom de l’agence ou sa référence')
    }
    const { principal, others } = sellersOf(item)
    if (knownSellers(principal, others).some(s => sameSeller(s, seller))) {
      throw new ConflictException(
        `Cette agence est déjà sur la fiche : ${otherSellerText(seller)}`
      )
    }
    await this.assertNotAnotherListing(member, listingId, seller)
    const text = otherSellerText(seller)

    // La fiche ne savait rien de son vendeur : c'est son agence principale.
    if (isEmptySeller(principal)) {
      const listing = await this.listings.update(
        member,
        listingId,
        {
          sellerType: seller.sellerType,
          sellerName: seller.sellerName,
          sellerReference: seller.sellerReference,
        },
        {},
        {
          channel: options.channel,
          provenance: options.channel === 'mcp' ? 'listing' : 'user',
        }
      )
      return {
        seller: null,
        listing,
        summary: `Vendeur enregistré : ${text} (la fiche n’en avait pas)`,
      }
    }
    if (others.length >= LISTING_SELLERS_MAX) {
      throw new BadRequestException(
        `Une annonce a au plus ${LISTING_SELLERS_MAX} autres agences`
      )
    }
    const id = await this.prisma.$transaction(async tx => {
      const created = await createListingSeller(tx, {
        workspaceId: member.workspaceId,
        listingId,
        seller,
        origin: options.origin,
        addedById: member.id,
      })
      // La fiche a changé : les garde-fous des autres lecteurs le voient.
      await tx.listing.update({
        where: { id: listingId },
        data: { updatedAt: new Date() },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel: options.channel,
          action: 'listing.seller_added',
          after: { sellerId: created.id, seller: text, origin: options.origin },
        },
        tx
      )
      return created.id
    })
    const listing = await this.listings.afterWrite(
      member,
      listingId,
      options.channel
    )
    return {
      seller: listing.sellers.find(s => s.id === id) ?? null,
      listing,
      summary: `Autre agence enregistrée : ${text}`,
    }
  }

  /** Retire une autre agence de la fiche (un membre, dans l'application). */
  async remove(
    member: Member,
    listingId: string,
    sellerId: string
  ): Promise<ListingSellerWriteResult> {
    const item = await this.listings.get(member, listingId)
    const seller = item.sellers.find(s => s.id === sellerId)
    if (!seller) {
      throw new NotFoundException('Agence introuvable sur cette annonce')
    }
    const text = otherSellerText(seller)
    await this.prisma.$transaction(async tx => {
      await tx.listingSeller.delete({ where: { id: sellerId } })
      await tx.listing.update({
        where: { id: listingId },
        data: { updatedAt: new Date() },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel: 'web',
          action: 'listing.seller_removed',
          before: { sellerId, seller: text },
        },
        tx
      )
    })
    const listing = await this.listings.afterWrite(member, listingId, 'web')
    return {
      seller: null,
      listing,
      summary: `Agence retirée de la fiche : ${text}`,
    }
  }

  /** La même agence avec la même référence sur une autre annonce : c'est la même, à fusionner. */
  private async assertNotAnotherListing(
    member: Member,
    listingId: string,
    seller: NormalizedSeller
  ): Promise<void> {
    if (!seller.sellerReferenceKey || !seller.sellerReference) return
    const candidates = await this.duplicates.find(member, {
      reference: seller.sellerReference,
      ...(seller.sellerName ? { sellerName: seller.sellerName } : {}),
      ...(seller.sellerType !== 'unknown'
        ? { sellerType: seller.sellerType }
        : {}),
    })
    const same = referenceMatchOf(
      candidates.filter(candidate => candidate.listingId !== listingId)
    )
    if (same) {
      throw new ConflictException(
        `Cette agence et cette référence sont déjà celles de l’annonce « ${same.title} » [id ${same.listingId}] : c’est sans doute le même bien. Fusionne les deux fiches (merge_listings, ou « Fusionner avec une autre fiche ») plutôt que d’ajouter l’agence ici.`
      )
    }
  }
}
