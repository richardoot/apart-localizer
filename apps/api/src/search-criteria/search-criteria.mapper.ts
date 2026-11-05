import {
  PerimeterSchema,
  SearchCriteriaSchema,
  criteriaToleranceOf,
} from '@apart/contracts'
import type { Perimeter, SearchCriteria } from '@apart/contracts'
import type { SearchCriteria as SearchCriteriaRow } from '../generated/prisma'
import { criteriaFiltersOf } from '../listings/criteria-match.service'

/** Le périmètre enregistré, reconstruit à partir des colonnes ; null s'il est incomplet. */
export function perimeterOf(row: SearchCriteriaRow): Perimeter | null {
  if (row.perimeterType === null) return null
  const candidate =
    row.perimeterType === 'point_radius'
      ? {
          type: 'point_radius',
          longitude: row.centerLongitude,
          latitude: row.centerLatitude,
          radiusMeters: row.radiusMeters,
        }
      : row.perimeterType === 'polygon'
        ? { type: 'polygon', polygon: row.perimeterGeoJson }
        : {
            type: 'isochrone',
            polygon: row.perimeterGeoJson,
            params: row.isochroneParams,
          }
  const parsed = PerimeterSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

export function toSearchCriteriaDto(row: SearchCriteriaRow): SearchCriteria {
  return SearchCriteriaSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    createdById: row.createdById,
    name: row.name,
    active: row.active,
    filters: criteriaFiltersOf(row.filters),
    tolerance: criteriaToleranceOf(row.tolerance),
    perimeterType: row.perimeterType,
    perimeter: perimeterOf(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}
