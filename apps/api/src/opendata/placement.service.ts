import { Injectable } from '@nestjs/common'
import {
  BORDEAUX_METROPOLE_COMMUNES,
  NEIGHBOURHOOD_TERRITORY,
  OSM_PLACES_SOURCE_LABEL,
} from '@apart/contracts'
import type {
  ListingPlacement,
  LocationPrecision,
  Point,
} from '@apart/contracts'
import {
  candidateAreasOf,
  chooseDistrictArea,
  choosePlace,
  districtFragments,
  districtPlacement,
  foldPlaceText,
  matchDistrict,
  placePlacement,
} from '@apart/domain'
import { GeoService } from '../geo/geo.service'
import type { ListingAreaRef } from '../geo/geo.service'

/** Une annonce placée au quartier (ou sur un lieu-dit) d'après son champ « quartier ». */
export interface DistrictLocated {
  point: Point
  placement: ListingPlacement
  /** La zone à écrire avec le point (contours du quartier retenu) ; null pour un lieu-dit. */
  area: ListingAreaRef | null
  commune: string | null
  inseeCode: string
}

/** Le résultat de la lecture du quartier : placé, ou ce qui n'a pas servi. */
export interface DistrictLookup {
  located: DistrictLocated | null
  /** Pourquoi rien n'a été retenu (noms non reconnus), pour le placement à la commune. */
  reasons: string[]
  /** Le code INSEE de la commune, s'il a pu être déterminé. */
  inseeCode: string | null
}

/**
 * La zone d'une annonce au repère approché, d'après son placement : les
 * contours du quartier retenu, ou la commune entière ; null pour un repère
 * à l'adresse, un lieu-dit (sans contour) ou une annonce antérieure au
 * lot 12 sans placement.
 */
export function listingAreaRef(location: {
  precision: LocationPrecision | null
  inseeCode: string | null
  placement: ListingPlacement | null
}): ListingAreaRef | null {
  const area = location.placement?.area
  if (location.precision === 'district') {
    return area && area.codes.length
      ? {
          kind: 'codes',
          territory: NEIGHBOURHOOD_TERRITORY,
          codes: area.codes,
        }
      : null
  }
  if (location.precision === 'commune') {
    const inseeCode = area?.inseeCode ?? location.inseeCode
    return inseeCode
      ? { kind: 'commune', territory: NEIGHBOURHOOD_TERRITORY, inseeCode }
      : null
  }
  return null
}

/** Le code INSEE d'une commune de la métropole d'après son nom (sans réseau). */
export function metropoleInseeOf(
  commune: string | null | undefined
): string | null {
  const folded = commune ? foldPlaceText(commune) : ''
  if (!folded) return null
  return (
    BORDEAUX_METROPOLE_COMMUNES.find(c => foldPlaceText(c.name) === folded)
      ?.inseeCode ?? null
  )
}

/**
 * Placement au quartier (lot 12, ADR 0022) : le champ « quartier » de
 * l'annonce lu par `domain` (morceaux, noms reconnus, choix du plus précis
 * cohérent), les contours et les lieux-dits de sa commune lus dans le module
 * geo (surfaces, recouvrements, point intérieur). Sans réseau ; ne lance
 * jamais pour un texte illisible (rien de reconnu = null).
 */
@Injectable()
export class PlacementService {
  constructor(private readonly geo: GeoService) {}

  async locateDistrict(
    input: {
      district: string | null | undefined
      commune: string | null | undefined
      inseeCode?: string | null | undefined
    },
    at: Date = new Date()
  ): Promise<DistrictLookup> {
    const inseeCode = input.inseeCode ?? metropoleInseeOf(input.commune)
    const fragments = districtFragments(input.district, input.commune)
    if (!inseeCode || fragments.length === 0) {
      return { located: null, reasons: [], inseeCode }
    }
    const computedAt = at.toISOString()
    const rows = await this.geo.neighbourhoodsOfCommune(
      NEIGHBOURHOOD_TERRITORY,
      inseeCode
    )
    const commune = input.commune?.trim() || rows[0]?.commune || null
    const areas = candidateAreasOf(
      rows.map(row => ({
        kind: row.kind,
        code: row.code,
        name: row.name,
        parent: row.parent,
        commune: row.commune,
        inseeCode: row.insee_code,
        source: row.source,
      }))
    )
    const matches = matchDistrict(fragments, areas, commune)
    if (matches.length > 0) {
      const keys = new Set(matches.map(m => m.key))
      const matched = areas.filter(a => keys.has(a.key))
      const { facts, overlaps } = await this.geo.placementAreaFacts(
        NEIGHBOURHOOD_TERRITORY,
        matched
      )
      const choice = chooseDistrictArea({
        fragments,
        areas: matched,
        matches,
        facts: facts.map(f => ({
          key: f.key,
          areaSquareMeters: f.area_square_meters,
        })),
        overlaps,
        commune,
      })
      const fact = choice && facts.find(f => f.key === choice.area.key)
      if (choice && fact) {
        return {
          located: {
            point: {
              type: 'Point',
              coordinates: [fact.longitude, fact.latitude],
            },
            placement: districtPlacement(choice, computedAt),
            area: {
              kind: 'codes',
              territory: NEIGHBOURHOOD_TERRITORY,
              codes: choice.area.codes,
            },
            commune: choice.area.commune,
            inseeCode,
          },
          reasons: [],
          inseeCode,
        }
      }
    }
    const places = await this.geo.placesOfCommune(inseeCode)
    const place = choosePlace({
      fragments,
      places: places.map(p => ({
        externalId: `${p.source}:${p.external_id}`,
        name: p.name,
        commune: p.commune,
        inseeCode: p.insee_code,
        source: OSM_SOURCE,
        point: { type: 'Point', coordinates: [p.longitude, p.latitude] },
      })),
      commune,
    })
    if (place) {
      return {
        located: {
          point: place.place.point,
          placement: placePlacement(place, computedAt),
          area: null,
          commune: place.place.commune ?? commune,
          inseeCode,
        },
        reasons: [],
        inseeCode,
      }
    }
    return {
      located: null,
      reasons: fragments
        .filter(f => f.tokens.some(t => t.length >= 3))
        .map(
          f =>
            `« ${f.raw} » : aucun quartier ni lieu-dit de ce nom${commune ? ` à ${commune}` : ''}.`
        ),
      inseeCode,
    }
  }
}

const OSM_SOURCE = OSM_PLACES_SOURCE_LABEL
