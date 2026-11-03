import {
  ListingOpenDataContextSchema,
  ListingSchema,
  OfferSchema,
  OpinionSchema,
  PointSchema,
  PriceEventSchema,
  TaskSchema,
} from '@apart/contracts'
import type {
  CriteriaMatch,
  FieldProvenanceMap,
  Listing as ListingDto,
  Offer as OfferDto,
  Opinion as OpinionDto,
  Point,
  PriceEvent as PriceEventDto,
  Task as TaskDto,
} from '@apart/contracts'
import type {
  Offer,
  Opinion,
  PriceEvent,
  Prisma,
  Task,
} from '../generated/prisma'

/** Une annonce avec tout ce que l'API renvoie. */
export const listingInclude = {
  renovation: { include: { items: { orderBy: { position: 'asc' } } } },
  rentalPlan: true,
  views: true,
  opinions: { orderBy: { createdAt: 'asc' } },
  tasks: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
  priceEvents: { orderBy: { occurredAt: 'desc' } },
  offers: { orderBy: { madeAt: 'desc' } },
  criteriaMatches: {
    where: { criteria: { active: true } },
    include: { criteria: { select: { name: true } } },
    orderBy: { matchedAt: 'desc' },
  },
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

export function toOpinionDto(opinion: Opinion): OpinionDto {
  return OpinionSchema.parse({
    id: opinion.id,
    listingId: opinion.listingId,
    memberId: opinion.memberId,
    rating: opinion.rating,
    text: opinion.text,
    createdAt: opinion.createdAt.toISOString(),
    updatedAt: opinion.updatedAt.toISOString(),
  })
}

export function toTaskDto(task: Task): TaskDto {
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
    rentalPlan: row.rentalPlan
      ? {
          year: row.rentalPlan.year,
          leaseType: row.rentalPlan.leaseType,
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
    assumptionsOverride:
      row.assumptionsOverride as ListingDto['assumptionsOverride'],
    fieldSources: (row.fieldSources ?? {}) as FieldProvenanceMap,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    views: row.views.map(view => ({
      memberId: view.memberId,
      seenAt: view.seenAt.toISOString(),
    })),
    openDataContext: openDataContextOf(row.openDataContext),
  }
  return ListingSchema.parse(dto)
}

/** L'instantané open data enregistré ; un JSON d'une version antérieure illisible vaut null. */
function openDataContextOf(value: unknown): ListingDto['openDataContext'] {
  if (value === null || value === undefined) return null
  const parsed = ListingOpenDataContextSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** Les critères dans lesquels l'annonce est entrée (alertes). */
export function toCriteriaMatchDtos(row: ListingRow): CriteriaMatch[] {
  return row.criteriaMatches.map(match => ({
    criteriaId: match.criteriaId,
    name: match.criteria.name,
    matchedAt: match.matchedAt.toISOString(),
    approximate: match.approximate,
  }))
}
