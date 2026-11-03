import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  ActivityChannel,
  ListingStatus,
  Offer,
  OfferInput,
  OfferResponse,
  OfferUpdate,
  OfferWriteResult,
} from '@apart/contracts'
import { PrismaService } from '../prisma/prisma.service'
import { ActivityService } from '../activity/activity.service'
import { toOfferDto } from '../listings/listing.mapper'
import { Prisma } from '../generated/prisma'
import type { Member } from '../generated/prisma'

/** Statuts d'avant toute offre : une offre enregistrée propose « offre faite ». */
const BEFORE_OFFER: readonly ListingStatus[] = [
  'to_study',
  'to_visit',
  'visited',
]
/** Statuts terminaux : aucun statut proposé. */
const CLOSED: readonly ListingStatus[] = ['discarded', 'sold_or_withdrawn']

/**
 * Le statut que l'annonce devrait prendre après cette offre et cette réponse,
 * ou null si le statut courant convient. Proposé, jamais appliqué d'office :
 * c'est le membre (ou l'agent) qui change le statut.
 */
export function suggestedStatusAfterOffer(
  current: ListingStatus,
  response: OfferResponse
): ListingStatus | null {
  if (CLOSED.includes(current)) return null
  switch (response) {
    case 'accepted':
      return current === 'offer_accepted' ? null : 'offer_accepted'
    case 'refused':
      return current === 'offer_refused' ? null : 'offer_refused'
    default:
      return BEFORE_OFFER.includes(current) || current === 'offer_refused'
        ? 'offer_made'
        : null
  }
}

/**
 * Les offres d'achat d'une annonce : montant, date, canal, réponse du vendeur
 * et contre-proposition. Création et mise à jour de la réponse ; jamais de
 * suppression. Chaque écriture est journalisée et renvoie le statut proposé.
 */
@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService
  ) {}

  async listForListing(member: Member, listingId: string): Promise<Offer[]> {
    await this.ensureListing(member, listingId)
    return this.offersOf(listingId)
  }

  async create(
    member: Member,
    listingId: string,
    input: OfferInput,
    channel: ActivityChannel = 'web'
  ): Promise<OfferWriteResult> {
    const listing = await this.ensureListing(member, listingId)
    if (input.response === 'counter_offer' && input.counterAmount === null) {
      throw new BadRequestException(
        'Une contre-proposition demande son montant (counterAmount)'
      )
    }
    const created = await this.prisma.$transaction(async tx => {
      const offer = await tx.offer.create({
        data: {
          listingId,
          madeAt: input.madeAt ? new Date(input.madeAt) : undefined,
          amount: new Prisma.Decimal(input.amount),
          channel: input.channel,
          response: input.response,
          counterAmount:
            input.counterAmount === null
              ? null
              : new Prisma.Decimal(input.counterAmount),
          respondedAt: input.response === 'pending' ? null : new Date(),
          notes: input.notes,
          createdById: member.id,
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel,
          action: 'offer.created',
          after: {
            offerId: offer.id,
            amount: input.amount,
            channel: input.channel,
            response: input.response,
            counterAmount: input.counterAmount,
          },
        },
        tx
      )
      return offer
    })
    return {
      offer: toOfferDto(created),
      offers: await this.offersOf(listingId),
      currentStatus: listing.status,
      suggestedStatus: suggestedStatusAfterOffer(
        listing.status,
        input.response
      ),
    }
  }

  async update(
    member: Member,
    listingId: string,
    offerId: string,
    update: OfferUpdate,
    channel: ActivityChannel = 'web'
  ): Promise<OfferWriteResult> {
    const listing = await this.ensureListing(member, listingId)
    const existing = await this.prisma.offer.findFirst({
      where: { id: offerId, listingId },
    })
    if (!existing) throw new NotFoundException('Offre introuvable')
    if (
      update.expectedResponse !== undefined &&
      update.expectedResponse !== existing.response
    ) {
      throw new ConflictException(
        `La réponse attendue était « ${update.expectedResponse} », l'offre est « ${existing.response} »`
      )
    }
    const response = update.response ?? existing.response
    const counterAmount =
      update.counterAmount === undefined
        ? (existing.counterAmount?.toNumber() ?? null)
        : update.counterAmount
    if (response === 'counter_offer' && counterAmount === null) {
      throw new BadRequestException(
        'Une contre-proposition demande son montant (counterAmount)'
      )
    }
    const responseChanged = response !== existing.response
    const saved = await this.prisma.$transaction(async tx => {
      const offer = await tx.offer.update({
        where: { id: offerId },
        data: {
          response,
          counterAmount:
            counterAmount === null ? null : new Prisma.Decimal(counterAmount),
          ...(update.notes !== undefined ? { notes: update.notes } : {}),
          ...(responseChanged || update.respondedAt
            ? {
                respondedAt:
                  response === 'pending'
                    ? null
                    : update.respondedAt
                      ? new Date(update.respondedAt)
                      : new Date(),
              }
            : {}),
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel,
          action: 'offer.updated',
          before: {
            offerId,
            response: existing.response,
            counterAmount: existing.counterAmount?.toNumber() ?? null,
            notes: existing.notes,
          },
          after: {
            offerId,
            response,
            counterAmount,
            ...(update.notes !== undefined ? { notes: update.notes } : {}),
          },
        },
        tx
      )
      return offer
    })
    return {
      offer: toOfferDto(saved),
      offers: await this.offersOf(listingId),
      currentStatus: listing.status,
      suggestedStatus: suggestedStatusAfterOffer(listing.status, response),
    }
  }

  private async offersOf(listingId: string): Promise<Offer[]> {
    const rows = await this.prisma.offer.findMany({
      where: { listingId },
      orderBy: { madeAt: 'desc' },
    })
    return rows.map(toOfferDto)
  }

  private async ensureListing(
    member: Member,
    listingId: string
  ): Promise<{ id: string; status: ListingStatus }> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, workspaceId: member.workspaceId },
      select: { id: true, status: true },
    })
    if (!listing) throw new NotFoundException('Annonce introuvable')
    return listing
  }
}
