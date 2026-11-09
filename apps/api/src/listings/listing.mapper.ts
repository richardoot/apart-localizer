import {
  ListingCheckChangeSchema,
  ListingCheckSchema,
  ListingLinkSchema,
  CriteriaFitCheckSchema,
  CriteriaFitOriginSchema,
  ListingOpenDataContextSchema,
  ListingPlacementSchema,
  ListingQuestionFieldSchema,
  ListingSchema,
  OfferSchema,
  PointSchema,
  PriceEventSchema,
  TaskSchema,
} from '@apart/contracts'
import type {
  CheckedLink,
  CriteriaFitEntry,
  CriteriaMatch,
  ListingCriteriaFit,
  FieldProvenanceMap,
  LinkedListing,
  ListingLink as ListingLinkDto,
  ListingCheck as ListingCheckDto,
  ListingCheckSummary,
  ListingRepublication,
  Listing as ListingDto,
  ListingPlacement,
  Offer as OfferDto,
  Point,
  PriceEvent as PriceEventDto,
  Task as TaskDto,
} from '@apart/contracts'
import { listingCriteriaFit, orderLinks, primaryLink } from '@apart/domain'
import type { LinkState } from '@apart/domain'
import type {
  ListingCheck,
  ListingLink,
  Offer,
  PriceEvent,
  Prisma,
  Task,
} from '../generated/prisma'

/** Les visites prévues d'une annonce (lot 14 : elles la gardent dans la liste). */
export function plannedVisitCount(row: {
  visits: readonly { status: string }[]
}): number {
  return row.visits.filter(v => v.status === 'planned').length
}

/** Une annonce liée, en quelques champs (republication, vérification). */
const linkedSelect = { id: true, title: true, status: true } as const

/** Une annonce avec tout ce que l'API renvoie. */
export const listingInclude = {
  renovation: { include: { items: { orderBy: { position: 'asc' } } } },
  rentalPlan: true,
  views: true,
  // Lot 20 : les notes par critère, et les « Voir quand même ».
  opinions: { include: { scores: true }, orderBy: { createdAt: 'asc' } },
  opinionReveals: { select: { memberId: true } },
  tasks: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
  priceEvents: { orderBy: { occurredAt: 'desc' } },
  offers: { orderBy: { madeAt: 'desc' } },
  // Lot 14 : l'adéquation à chaque critère actif, dans l'ordre de création
  // des critères (hors critères compris).
  criteriaMatches: {
    where: { criteria: { active: true } },
    include: { criteria: { select: { name: true } } },
    orderBy: { criteria: { createdAt: 'asc' } },
  },
  // Lot 15 : le dernier résultat et les liens de republication.
  checks: { orderBy: { checkedAt: 'desc' }, take: 1 },
  republishedFrom: { select: linkedSelect },
  republishedAs: { select: linkedSelect },
  // Lot 14 : une visite prévue garde une annonce hors critères dans la liste ;
  // lot 20 : une visite faite avec un membre marque son avis « après visite ».
  visits: {
    select: { id: true, status: true, visitedAt: true, participantIds: true },
    orderBy: { visitedAt: 'asc' },
  },
  // Lot 18 : les liens de l'annonce sur les portails.
  links: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.ListingInclude

export type ListingRow = Prisma.ListingGetPayload<{
  include: typeof listingInclude
}>

/** Decimal Prisma → nombre ; null reste null. */
export function num(value: Prisma.Decimal | null | undefined): number | null {
  return value == null ? null : Number(value)
}

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

function pointOf(row: ListingRow): Point | null {
  const parsed = PointSchema.safeParse(row.locationGeoJson)
  if (parsed.success) return parsed.data
  if (row.longitude !== null && row.latitude !== null) {
    return { type: 'Point', coordinates: [row.longitude, row.latitude] }
  }
  return null
}

export function toTaskDto(task: Task): TaskDto {
  // Lot 17 : un champ inconnu (colonne texte) se lit comme « aucun champ ».
  const field = ListingQuestionFieldSchema.safeParse(task.field)
  return TaskSchema.parse({
    id: task.id,
    listingId: task.listingId,
    label: task.label,
    done: task.done,
    doneAt: task.doneAt?.toISOString() ?? null,
    assigneeId: task.assigneeId,
    origin: task.origin,
    position: task.position,
    createdAt: task.createdAt.toISOString(),
    field: field.success ? field.data : null,
    requestedAt: task.requestedAt?.toISOString() ?? null,
    requestId: task.requestId,
    answeredAt: task.answeredAt?.toISOString() ?? null,
    details: task.details,
  })
}

export function toPriceEventDto(event: PriceEvent): PriceEventDto {
  return PriceEventSchema.parse({
    id: event.id,
    listingId: event.listingId,
    occurredAt: event.occurredAt.toISOString(),
    oldPrice: num(event.oldPrice),
    newPrice: Number(event.newPrice),
    source: event.source,
  })
}

export function toOfferDto(offer: Offer): OfferDto {
  return OfferSchema.parse({
    id: offer.id,
    listingId: offer.listingId,
    madeAt: offer.madeAt.toISOString(),
    amount: Number(offer.amount),
    channel: offer.channel,
    response: offer.response,
    counterAmount: num(offer.counterAmount),
    respondedAt: offer.respondedAt?.toISOString() ?? null,
    notes: offer.notes,
    createdById: offer.createdById,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  })
}

/**
 * La ligne Prisma devient l'objet du contrat `Listing` : décimaux en nombres,
 * dates en ISO 8601, point reconstruit, sous-objets travaux et phase 2. Le
 * résultat repasse par le schéma pour que toute dérive casse ici, en tests.
 */
export function toListingDto(row: ListingRow): ListingDto {
  const dto = {
    id: row.id,
    workspaceId: row.workspaceId,
    source: row.source,
    sourceLabel: row.sourceLabel,
    url: row.url,
    externalId: row.externalId,
    title: row.title,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
    description: row.description,
    notes: row.notes,
    price: Number(row.price),
    feesAmount: num(row.feesAmount),
    feesPercent: row.feesPercent,
    feesPayer: row.feesPayer,
    surface: num(row.surface),
    surfaceTotal: num(row.surfaceTotal),
    rooms: row.rooms,
    bedrooms: row.bedrooms,
    floor: row.floor,
    floorsTotal: row.floorsTotal,
    floorLabel: row.floorLabel,
    elevator: row.elevator,
    constructionYear: row.constructionYear,
    constructionPeriod: row.constructionPeriod,
    dpeClass: row.dpeClass,
    dpeConsumption: row.dpeConsumption,
    gesClass: row.gesClass,
    dpeDate: isoDate(row.dpeDate),
    dpeNumber: row.dpeNumber,
    heatingType: row.heatingType,
    heatingCollective: row.heatingCollective,
    outdoor: row.outdoor,
    parking: row.parking,
    cellar: row.cellar,
    orientation: row.orientation,
    condition: row.condition,
    annualCharges: num(row.annualCharges),
    nonRecoverableChargesMonthly: num(row.nonRecoverableChargesMonthly),
    lotsCount: row.lotsCount,
    proceedings: row.proceedings,
    votedWorks: row.votedWorks,
    syndic: row.syndic,
    propertyTax: num(row.propertyTax),
    furnitureValue: num(row.furnitureValue),
    location: {
      addressRaw: row.addressRaw,
      addressNormalized: row.addressNormalized,
      banId: row.banId,
      commune: row.commune,
      inseeCode: row.inseeCode,
      district: row.district,
      point: pointOf(row),
      precision: row.locationPrecision,
      placement: placementOf(row.locationPlacement),
    },
    status: row.status,
    discardReason: row.discardReason,
    discardedAt: row.discardedAt?.toISOString() ?? null,
    renovation: row.renovation
      ? {
          active: row.renovation.active,
          level: row.renovation.level,
          durationMonths: row.renovation.durationMonths,
          notes: row.renovation.notes,
          items: row.renovation.items.map(item => ({
            id: item.id,
            label: item.label,
            amount: num(item.amount),
            position: item.position,
          })),
        }
      : null,
    // Lot 19 : `rental_plans.year` et `lease_type` ne sont plus lus (année
    // et type de location de l'espace, dans les hypothèses).
    rentalPlan: row.rentalPlan
      ? {
          rentControl: row.rentalPlan.rentControl,
          referenceRentPerM2: num(row.rentalPlan.referenceRentPerM2),
          targetRent: num(row.rentalPlan.targetRent),
          marketRent: num(row.rentalPlan.marketRent),

          demand: row.rentalPlan.demand,
          coOwnershipAllowsRental: row.rentalPlan.coOwnershipAllowsRental,
          decencyCompliant: row.rentalPlan.decencyCompliant,
          rentalPermitRequired: row.rentalPlan.rentalPermitRequired,
          notes: row.rentalPlan.notes,
        }
      : null,
    // Lot 19 : `listings.assumptions_override` n'est plus lu.
    fieldSources: (row.fieldSources ?? {}) as FieldProvenanceMap,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    views: row.views.map(view => ({
      memberId: view.memberId,
      seenAt: view.seenAt.toISOString(),
    })),
    openDataContext: openDataContextOf(row.openDataContext),
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastSeenOnlineAt: row.lastSeenOnlineAt?.toISOString() ?? null,
    republishedFromId: row.republishedFromId,
    // Lot 18 : le vendeur.
    sellerType: row.sellerType,
    sellerName: row.sellerName,
    sellerReference: row.sellerReference,
    sellerReferenceKey: row.sellerReferenceKey,
  }
  return ListingSchema.parse(dto)
}

/** Ce que les règles de `domain` lisent d'un lien enregistré (lot 18). */
export function linkStateOf(link: ListingLink): LinkState {
  return {
    id: link.id,
    portal: link.portal,
    url: link.url,
    normalizedUrl: link.normalizedUrl,
    externalId: link.externalId,
    price: num(link.price),
    priceAt: link.priceAt?.toISOString() ?? null,
    online: link.offlineSince === null,
    offlineSince: link.offlineSince?.toISOString() ?? null,
    lastSeenOnlineAt: link.lastSeenOnlineAt?.toISOString() ?? null,
    lastCheckedAt: link.lastCheckedAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
    origin: link.origin,
    readSellerName: link.readSellerName,
    readReference: link.readReference,
  }
}

/** Un lien (lot 18) ; `primary` dit si c'est le lien principal. */
export function toListingLinkDto(
  link: ListingLink,
  primary: boolean
): ListingLinkDto {
  return ListingLinkSchema.parse({
    id: link.id,
    listingId: link.listingId,
    portal: link.portal,
    url: link.url,
    normalizedUrl: link.normalizedUrl,
    externalId: link.externalId,
    price: num(link.price),
    priceAt: link.priceAt?.toISOString() ?? null,
    firstSeenAt: link.firstSeenAt?.toISOString() ?? null,
    lastSeenOnlineAt: link.lastSeenOnlineAt?.toISOString() ?? null,
    lastCheckedAt: link.lastCheckedAt?.toISOString() ?? null,
    offlineSince: link.offlineSince?.toISOString() ?? null,
    online: link.offlineSince === null,
    primary,
    origin: link.origin,
    readSellerName: link.readSellerName,
    readReference: link.readReference,
    evidence: link.evidence,
    addedById: link.addedById,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  })
}

/** Les liens d'une annonce, le principal d'abord, puis du plus ancien au plus récent. */
export function toListingLinkDtos(
  links: readonly ListingLink[]
): ListingLinkDto[] {
  const states = links.map(link => ({ link, state: linkStateOf(link) }))
  const primary = primaryLink(states.map(s => s.state))
  const byId = new Map(states.map(s => [s.state.id, s.link]))
  return orderLinks(states.map(s => s.state)).map(state =>
    toListingLinkDto(
      byId.get(state.id) as ListingLink,
      state.id === primary?.id
    )
  )
}

/** Un lien vérifié, en quelques champs. */
function checkedLinkOf(
  link: Pick<ListingLink, 'id' | 'portal' | 'url'> | null | undefined
): CheckedLink | null {
  return link ? { id: link.id, portal: link.portal, url: link.url } : null
}

/** Une vérification (lot 15) ; des écarts illisibles (version antérieure) sont omis. */
export function toListingCheckDto(
  check: ListingCheck & {
    linkedListing?: LinkedListing | null
    link?: Pick<ListingLink, 'id' | 'portal' | 'url'> | null
  }
): ListingCheckDto {
  const changes = Array.isArray(check.changes)
    ? check.changes.flatMap(change => {
        const parsed = ListingCheckChangeSchema.safeParse(change)
        return parsed.success ? [parsed.data] : []
      })
    : []
  return ListingCheckSchema.parse({
    id: check.id,
    listingId: check.listingId,
    checkedAt: check.checkedAt.toISOString(),
    authorId: check.authorId,
    channel:
      check.channel === 'mcp'
        ? 'mcp'
        : check.channel === 'system'
          ? 'system'
          : 'web',
    outcome: check.outcome,
    changes,
    summary: check.summary,
    evidence: check.evidence,
    checkedUrl: check.checkedUrl,
    linkedListing: check.linkedListing ?? null,
    suggestedStatus: check.suggestedStatus,
    link: checkedLinkOf(check.link),
  })
}

/** Le dernier résultat d'une annonce, pour la liste. */
export function toLastCheck(row: ListingRow): ListingCheckSummary | null {
  const last = row.checks[0]
  return last
    ? {
        id: last.id,
        checkedAt: last.checkedAt.toISOString(),
        channel:
          last.channel === 'mcp'
            ? 'mcp'
            : last.channel === 'system'
              ? 'system'
              : 'web',
        authorId: last.authorId,
        outcome: last.outcome,
        summary: last.summary,
      }
    : null
}

/** Les liens de republication d'une annonce. */
export function toRepublication(row: ListingRow): ListingRepublication {
  return {
    from: row.republishedFrom ?? null,
    to: row.republishedAs ?? null,
  }
}

/** Le placement du repère (lot 12) ; absent ou illisible : null. */
export function placementOf(value: unknown): ListingPlacement | null {
  if (value === null || value === undefined) return null
  const parsed = ListingPlacementSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** L'instantané open data enregistré ; un JSON d'une version antérieure illisible vaut null. */
function openDataContextOf(value: unknown): ListingDto['openDataContext'] {
  if (value === null || value === undefined) return null
  const parsed = ListingOpenDataContextSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** Les critères qui gardent l'annonce (dans, à confirmer, à la marge), de l'entrée la plus récente à la plus ancienne. */
export function toCriteriaMatchDtos(row: ListingRow): CriteriaMatch[] {
  return row.criteriaMatches
    .filter(match => match.level !== 'out')
    .sort((a, b) => b.matchedAt.getTime() - a.matchedAt.getTime())
    .map(match => ({
      criteriaId: match.criteriaId,
      name: match.criteria.name,
      matchedAt: match.matchedAt.toISOString(),
      approximate: match.approximate,
      level: match.level,
      reasons: stringsOf(match.reasons),
    }))
}

function originOf(value: unknown): ListingCriteriaFit['origin'] {
  const parsed = CriteriaFitOriginSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : []
}

/** Le détail de l'adéquation par critère actif (lot 14). */
export function toCriteriaFitEntries(row: ListingRow): CriteriaFitEntry[] {
  return row.criteriaMatches.map(match => {
    const checks = CriteriaFitCheckSchema.array().safeParse(match.checks)
    return {
      criteriaId: match.criteriaId,
      name: match.criteria.name,
      level: match.level,
      reasons: stringsOf(match.reasons),
      checks: checks.success ? checks.data : [],
      locationPending: match.approximate,
      since: match.levelChangedAt.toISOString(),
    }
  })
}

/** L'adéquation enregistrée de l'annonce : meilleur niveau, détail, « depuis », gardée. */
export function toListingCriteriaFit(row: ListingRow): ListingCriteriaFit {
  return listingCriteriaFit({
    entries: toCriteriaFitEntries(row),
    since: row.criteriaFitChangedAt?.toISOString() ?? null,
    origin: originOf(row.criteriaFitOrigin),
    status: row.status,
    plannedVisits: plannedVisitCount(row),
  })
}
