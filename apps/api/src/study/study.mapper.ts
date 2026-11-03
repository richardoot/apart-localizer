import {
  RentComparableSchema,
  ScenarioOverridesSchema,
  ScenarioSchema,
} from '@apart/contracts'
import type {
  RentComparable as RentComparableDto,
  Scenario as ScenarioDto,
} from '@apart/contracts'
import type { RentComparable, Scenario } from '../generated/prisma'

/** Un scénario enregistré ; des surcharges illisibles (version antérieure) valent aucune surcharge. */
export function toScenarioDto(row: Scenario): ScenarioDto {
  const overrides = ScenarioOverridesSchema.safeParse(row.overrides)
  return ScenarioSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    listingId: row.listingId,
    name: row.name,
    overrides: overrides.success ? overrides.data : {},
    notes: row.notes,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

export function toRentComparableDto(row: RentComparable): RentComparableDto {
  return RentComparableSchema.parse({
    id: row.id,
    listingId: row.listingId,
    rent: Number(row.rent),
    surface: Number(row.surface),
    furnished: row.furnished,
    rooms: row.rooms,
    observedAt: row.observedAt
      ? row.observedAt.toISOString().slice(0, 10)
      : null,
    source: row.source,
    sourceLabel: row.sourceLabel,
    url: row.url,
    address: row.address,
    note: row.note,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}
