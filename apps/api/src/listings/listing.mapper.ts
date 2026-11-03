import { ListingSchema, PointSchema } from '@apart/contracts'
import type {
  FieldProvenanceMap,
  Listing as ListingDto,
  Point,
  RentComparable,
} from '@apart/contracts'
import type { Prisma } from '../generated/prisma'

/** Une annonce avec tout ce que l'API renvoie. */
export const listingInclude = {
  renovation: { include: { items: { orderBy: { position: 'asc' } } } },
  rentalPlan: true,
  views: true,
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
          comparables: (row.rentalPlan.comparables ?? []) as RentComparable[],
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
  }
  return ListingSchema.parse(dto)
}
