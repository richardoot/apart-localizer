import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  LISTING_LINKS_MAX,
  LISTING_LINK_EVIDENCE_MAX,
  LISTING_PORTAL_LABELS,
} from '@apart/contracts'
import type {
  ActivityChannel,
  EvaluatedListing,
  FichePriceProposal,
  ListingLinkOrigin,
  ListingLinkPatch,
  ListingLinkReading,
  ListingLinkWriteResult,
  ListingLinksResult,
  ListingObserved,
} from '@apart/contracts'
import {
  detectLinkPortal,
  fichePriceDecision,
  fichePriceProposal,
  linkAddedDiff,
  linkCountText,
  linkKey,
  listingCheckSummary,
  lowestOnlinePrice,
  priceTrigger,
  sanitizeEvidence,
  sellerContradiction,
} from '@apart/domain'
import type { LinkState } from '@apart/domain'
import { ActivityService } from '../activity/activity.service'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'
import type { Member } from '../generated/prisma'
import { ListingEnrichmentService } from './enrichment.service'
import {
  assertLinkFree,
  priceEventData,
  syncPrimaryLink,
  withListingProvenance,
  writeCheckFacts,
} from './link-writes'
import {
  factsOf,
  linkStatesOf,
  ListingChecksService,
} from './listing-checks.service'
import { toListingCheckDto } from './listing.mapper'
import { ListingsService } from './listings.service'

/** Qui écrit : un membre, ou le système (alerte e-mail, `id` null). */
export type LinkActor = Pick<Member, 'workspaceId'> & { id: string | null }

/** Ce qui a été lu sur la page d'un lien à son ajout, avec son URL. */
export type LinkAddInput = ListingLinkReading & {
  url: string
  expectedUpdatedAt?: string | undefined
  /**
   * Les autres faits lus sur la page (surface, pièces, DPE, charges, taxe) :
   * une brouillon reconnu, une annonce rattachée d'office. Ils suivent les
   * règles d'une vérification (lot 15).
   */
  facts?: Omit<
    ListingObserved,
    'url' | 'online' | 'price' | 'sellerType' | 'sellerName' | 'reference'
  >
}

export interface LinkAddOptions {
  channel: ActivityChannel
  origin: ListingLinkOrigin
  /** Rattaché d'office (même agence, même référence) par une exploration ou une alerte. */
  auto?: boolean
  /** Le brouillon qui portait ce lien (exploration, alerte, « C'est la même »). */
  draftId?: string | null
  /**
   * Vrai pour Claude et les rattachements d'office : un vendeur, une agence
   * ou une référence qui contredisent la fiche font refuser le lien (ce
   * n'est peut-être pas la même annonce). Faux quand un membre a tranché :
   * la contradiction est seulement proposée.
   */
  strictSeller?: boolean
}

const LINK_SELECT = { id: true, portal: true, url: true } as const
const LINKED_SELECT = { id: true, title: true, status: true } as const

/** Le membre qu'attendent les lectures d'annonce (le système n'a pas d'identifiant). */
function asMember(actor: LinkActor): Member {
  return actor as Member
}

/**
 * Les liens d'une annonce (lot 18, ADR 0028) : lister, ajouter (avec ce qui
 * a été lu sur la page : prix affiché, en ligne, vendeur et référence),
 * relever un prix ou un état (une vérification du lot 15 sur ce lien),
 * corriger le portail ou l'identifiant, retirer (jamais le dernier lien),
 * détacher un lien rattaché d'office. Le prix de la fiche devient le plus bas
 * des liens en ligne (proposé quand il a été saisi à la main), un écart entre
 * portails est noté dans « Mises à jour ». Chaque écriture est journalisée
 * dans sa transaction ; le serveur ne joint jamais un portail.
 */
@Injectable()
export class ListingLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly listings: ListingsService,
    private readonly checks: ListingChecksService,
    private readonly enrichment: ListingEnrichmentService
  ) {}

  async list(member: Member, listingId: string): Promise<ListingLinksResult> {
    const item = await this.listings.get(member, listingId)
    return linksResultOf(item)
  }

  /**
   * Ajoute un lien de la même annonce sur un autre portail. Refusé si l'URL
   * est déjà celle d'une autre fiche (avec son nom), déjà sur cette fiche, ou
   * (pour Claude et les rattachements d'office) si le vendeur lu contredit la
   * fiche. Ce qui a été lu (prix, en ligne, vendeur) est une vérification du
   * lot 15 sur le nouveau lien, résultat « Lien ajouté » ; un lien collé sans
   * être ouvert ne vérifie rien.
   */
  async add(
    actor: LinkActor,
    listingId: string,
    input: LinkAddInput,
    options: LinkAddOptions
  ): Promise<ListingLinkWriteResult> {
    const member = asMember(actor)
    const item = await this.listings.get(member, listingId)
    if (input.expectedUpdatedAt !== undefined) {
      this.listings.checkGuards(item.listing, {
        expectedUpdatedAt: input.expectedUpdatedAt,
      })
    }
    const normalizedUrl = linkKey(input.url)
    if (!normalizedUrl) throw new BadRequestException('Lien vide')
    const own = item.links.find(l => l.normalizedUrl === normalizedUrl)
    if (own) {
      throw new ConflictException(
        `Ce lien est déjà sur cette fiche (${LISTING_PORTAL_LABELS[own.portal]}) [lien ${own.id}] : vérifiez-le plutôt (apply_listing_check avec linkId, ou « Vue en ligne aujourd’hui »)`
      )
    }
    if (item.links.length >= LISTING_LINKS_MAX) {
      throw new BadRequestException(
        `Une annonce a au plus ${LISTING_LINKS_MAX} liens`
      )
    }
    const seller = {
      sellerType: item.listing.sellerType,
      sellerName: item.listing.sellerName,
      sellerReference: item.listing.sellerReference,
    }
    const reading = {
      sellerType: input.sellerType,
      sellerName: input.sellerName,
      reference: input.reference,
    }
    if (options.strictSeller) {
      const problem = sellerContradiction(seller, reading)
      if (problem) {
        throw new ConflictException(
          `Ce n’est peut-être pas la même annonce : ${problem}. Rien n’est rattaché ; déposez-la dans « À valider » (record_exploration) ou demandez au membre.`
        )
      }
    }
    const now = new Date()
    const nowIso = now.toISOString()
    const portal = detectLinkPortal(input.url, input.portal ?? null)
    const id = randomUUID()
    const link: LinkState = {
      id,
      portal,
      url: input.url.trim(),
      normalizedUrl,
      externalId: input.externalId ?? null,
      price: null,
      priceAt: null,
      online: input.online !== false,
      offlineSince: input.online === false ? nowIso : null,
      lastSeenOnlineAt: null,
      lastCheckedAt: null,
      createdAt: nowIso,
      origin: options.origin,
    }
    const observed: ListingObserved = {
      ...(input.facts ?? {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.online !== undefined ? { online: input.online } : {}),
      ...(input.publishedAt !== undefined
        ? { publishedAt: input.publishedAt }
        : {}),
      ...(input.sellerType !== undefined
        ? { sellerType: input.sellerType }
        : {}),
      ...(input.sellerName !== undefined
        ? { sellerName: input.sellerName }
        : {}),
      ...(input.reference !== undefined ? { reference: input.reference } : {}),
    }
    const diff = linkAddedDiff({
      stored: item.listing,
      priceSource: item.listing.fieldSources.price?.source ?? null,
      seller,
      links: linkStatesOf(item),
      link,
      observed,
      now: nowIso,
    })
    const summary = listingCheckSummary('link_added', diff.changes)
    const checked = input.online !== undefined || input.price !== undefined
    const evidence = sanitizeEvidence(input.evidence, LISTING_LINK_EVIDENCE_MAX)
    const applied = diff.changes.filter(c => c.disposition === 'applied')
    const facts = applied.filter(c => c.field !== 'link')

    const check = await this.prisma.$transaction(async tx => {
      await assertLinkFree(tx, actor.workspaceId, normalizedUrl, listingId)
      await tx.listingLink.create({
        data: {
          id,
          workspaceId: actor.workspaceId,
          listingId,
          portal,
          url: link.url,
          normalizedUrl,
          externalId: link.externalId ?? null,
          firstSeenAt: now,
          offlineSince: link.offlineSince ? now : null,
          origin: options.origin,
          evidence,
          addedById: actor.id,
          createdAt: now,
        },
      })
      await writeCheckFacts(tx, {
        listingId,
        item,
        diff,
        applyFacts: true,
        seenOnline: input.online === true,
        now,
        channel: options.channel,
        linkId: id,
        portal,
        checked,
        alsoTouches: { updatedAt: now },
      })
      await syncPrimaryLink(tx, listingId)
      const created = await tx.listingCheck.create({
        data: {
          listingId,
          workspaceId: actor.workspaceId,
          checkedAt: now,
          authorId: actor.id,
          channel: options.channel,
          outcome: 'link_added',
          changes: diff.changes as unknown as Prisma.InputJsonValue,
          summary,
          evidence,
          checkedUrl: link.url,
          suggestedStatus: diff.suggestedStatus,
          linkId: id,
        },
        include: {
          linkedListing: { select: LINKED_SELECT },
          link: { select: LINK_SELECT },
        },
      })
      await this.activity.record(
        {
          workspaceId: actor.workspaceId,
          listingId,
          actorMemberId: actor.id,
          channel: options.channel,
          action: 'listing_link.added',
          before: facts.length ? { facts: factsOf(facts, 'before') } : null,
          after: {
            linkId: id,
            portal,
            url: link.url,
            origin: options.origin,
            auto: options.auto ?? false,
            ...(options.draftId ? { draftId: options.draftId } : {}),
            checkId: created.id,
            summary,
            ...(input.price !== undefined ? { linkPrice: input.price } : {}),
            ...(facts.length ? { facts: factsOf(facts, 'after') } : {}),
          },
        },
        tx
      )
      return created
    })

    if (diff.patch.surface !== undefined || diff.patch.rooms !== undefined) {
      await this.enrichment.enrich(member, listingId, {
        dpe: false,
        channel: options.channel,
      })
    }
    const listing = await this.listings.afterWrite(
      member,
      listingId,
      options.channel,
      diff.price ? priceTrigger(diff.price.from, diff.price.to) : 'updated'
    )
    return {
      link: listing.links.find(l => l.id === id) ?? null,
      check: toListingCheckDto(check),
      listing,
      priceProposal:
        diff.fichePrice.kind === 'propose' ? proposalOf(listing) : null,
      summary,
    }
  }

  /**
   * Le prix ou l'état d'un lien relevés à la main (une vérification du lot
   * 15 sur ce lien, canal web), ou son portail et son identifiant corrigés.
   */
  async patch(
    member: Member,
    listingId: string,
    linkId: string,
    patch: ListingLinkPatch
  ): Promise<ListingLinkWriteResult> {
    const item = await this.listings.get(member, listingId)
    const link = item.links.find(l => l.id === linkId)
    if (!link) throw new NotFoundException('Lien introuvable sur cette annonce')
    if (patch.expectedUpdatedAt !== undefined) {
      this.listings.checkGuards(item.listing, {
        expectedUpdatedAt: patch.expectedUpdatedAt,
      })
    }
    let current = item
    if (patch.portal !== undefined || patch.externalId !== undefined) {
      const next = {
        portal: detectLinkPortal(link.url, patch.portal ?? link.portal),
        externalId:
          patch.externalId === undefined
            ? link.externalId
            : patch.externalId || null,
      }
      if (next.portal !== link.portal || next.externalId !== link.externalId) {
        await this.prisma.$transaction(async tx => {
          await tx.listingLink.update({
            where: { id: linkId },
            data: next,
          })
          await syncPrimaryLink(tx, listingId)
          await this.activity.record(
            {
              workspaceId: member.workspaceId,
              listingId,
              actorMemberId: member.id,
              channel: 'web',
              action: 'listing_link.updated',
              before: {
                linkId,
                portal: link.portal,
                link: { portal: link.portal, externalId: link.externalId },
              },
              after: { linkId, portal: next.portal, link: next },
            },
            tx
          )
        })
        current = await this.listings.afterWrite(member, listingId, 'web')
      }
    }
    if (patch.price === undefined && patch.online === undefined) {
      return {
        link: current.links.find(l => l.id === linkId) ?? null,
        check: null,
        listing: current,
        priceProposal: proposalOf(current),
        summary: `Lien ${LISTING_PORTAL_LABELS[current.links.find(l => l.id === linkId)?.portal ?? link.portal]} modifié`,
      }
    }
    const result = await this.checks.apply(
      member,
      listingId,
      {
        observed: {
          ...(patch.price !== undefined ? { price: patch.price } : {}),
          ...(patch.online !== undefined ? { online: patch.online } : {}),
        },
        linkId,
        expectedUpdatedAt: current.listing.updatedAt,
      },
      'web'
    )
    return {
      link: result.listing.links.find(l => l.id === linkId) ?? null,
      check: result.check,
      listing: result.listing,
      priceProposal: result.check.changes.some(
        c => c.field === 'price' && c.disposition === 'proposed'
      )
        ? proposalOf(result.listing)
        : null,
      summary: result.check.summary,
    }
  }

  /** Retire un lien (un membre, dans l'application) ; jamais le dernier lien d'une annonce. */
  async remove(
    member: Member,
    listingId: string,
    linkId: string
  ): Promise<ListingLinkWriteResult> {
    const item = await this.listings.get(member, listingId)
    if (!item.links.some(l => l.id === linkId)) {
      throw new NotFoundException('Lien introuvable sur cette annonce')
    }
    if (item.links.length <= 1) {
      throw new ConflictException(
        'Le dernier lien d’une annonce ne se retire pas : il reste son lien d’origine (écartez l’annonce si elle n’est plus suivie)'
      )
    }
    return this.drop(member, item, linkId, 'listing_link.removed', 'web', null)
  }

  /**
   * « Ce n'est pas la même » : le lien rattaché d'office est retiré de la
   * fiche (même s'il était le seul), le prix de la fiche suit ses liens
   * restants. Le brouillon est remis « à valider » par l'appelant.
   */
  async detach(
    member: Member,
    listingId: string,
    linkId: string,
    draftId: string,
    /** Écrit dans la même transaction (le brouillon qui revient « à valider »). */
    inTx?: (tx: Prisma.TransactionClient) => Promise<void>
  ): Promise<ListingLinkWriteResult> {
    const item = await this.listings.get(member, listingId)
    if (!item.links.some(l => l.id === linkId)) {
      if (inTx) await this.prisma.$transaction(tx => inTx(tx))
      return {
        link: null,
        check: null,
        listing: item,
        priceProposal: proposalOf(item),
        summary: 'Lien déjà retiré de la fiche',
      }
    }
    return this.drop(
      member,
      item,
      linkId,
      'listing_link.detached',
      'web',
      draftId,
      inTx
    )
  }

  /** Retire un lien et fait suivre le prix de la fiche et le lien principal. */
  private async drop(
    member: Member,
    item: EvaluatedListing,
    linkId: string,
    action: 'listing_link.removed' | 'listing_link.detached',
    channel: ActivityChannel,
    draftId: string | null,
    inTx?: (tx: Prisma.TransactionClient) => Promise<void>
  ): Promise<ListingLinkWriteResult> {
    const listingId = item.listing.id
    const link = item.links.find(l => l.id === linkId)
    if (!link) throw new NotFoundException('Lien introuvable sur cette annonce')
    const before = linkStatesOf(item)
    const after = before.filter(l => l.id !== linkId)
    const decision = fichePriceDecision({
      fichePrice: item.listing.price,
      priceSource: item.listing.fieldSources.price?.source ?? null,
      before,
      after,
    })
    const now = new Date()
    await this.prisma.$transaction(async tx => {
      await tx.listingLink.delete({ where: { id: linkId } })
      if (decision.kind === 'apply') {
        await tx.listing.update({
          where: { id: listingId },
          data: {
            price: new Prisma.Decimal(decision.to),
            fieldSources: withListingProvenance(
              item.listing.fieldSources,
              ['price'],
              now
            ) as Prisma.InputJsonValue,
          },
        })
        await tx.priceEvent.create({
          data: priceEventData(
            listingId,
            decision.from,
            decision.to,
            'listing',
            now
          ),
        })
      }
      await syncPrimaryLink(tx, listingId)
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel,
          action,
          before: {
            linkId,
            portal: link.portal,
            url: link.url,
            ...(decision.kind === 'apply'
              ? { facts: { price: decision.from } }
              : {}),
          },
          after: {
            ...(draftId ? { draftId } : {}),
            ...(decision.kind === 'apply'
              ? { facts: { price: decision.to } }
              : {}),
          },
        },
        tx
      )
      if (inTx) await inTx(tx)
    })
    const listing = await this.listings.afterWrite(
      member,
      listingId,
      channel,
      decision.kind === 'apply'
        ? priceTrigger(decision.from, decision.to)
        : 'updated'
    )
    const label = LISTING_PORTAL_LABELS[link.portal]
    return {
      link: null,
      check: null,
      listing,
      priceProposal: proposalOf(listing),
      summary:
        action === 'listing_link.detached'
          ? `Lien ${label} détaché de la fiche`
          : `Lien ${label} retiré de la fiche`,
    }
  }
}

/** La proposition de prix visible sur la fiche (prix saisi à la main, ou liens changés). */
export function proposalOf(item: EvaluatedListing): FichePriceProposal | null {
  return fichePriceProposal({
    fichePrice: item.listing.price,
    priceSource: item.listing.fieldSources.price?.source ?? null,
    links: item.links,
  })
}

/** `GET /listings/:id/links`. */
export function linksResultOf(item: EvaluatedListing): ListingLinksResult {
  return {
    links: item.links,
    fichePrice: item.listing.price,
    lowestOnlinePrice: lowestOnlinePrice(item.links)?.price ?? null,
    priceProposal: proposalOf(item),
    summary: linkCountText(item.links),
  }
}
