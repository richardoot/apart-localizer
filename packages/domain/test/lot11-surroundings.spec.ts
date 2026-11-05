import { describe, expect, it } from 'vitest'
import { SurroundingsSchema } from '@apart/contracts'
import type { NearbyAmenity, Point } from '@apart/contracts'
import {
  FITNESS_PARK_WIKIDATA,
  amenityLookup,
  brandRank,
  driveSignalOfTags,
  foldText,
  isFitnessPark,
  isPreferredBrand,
  nearestDrive,
  neighbourhoodLookup,
  supermarketBrandGroup,
  supermarketsLookup,
  surroundingsDigest,
  surroundingsOf,
} from '../src/index.js'
import type { NeighbourhoodHit } from '../src/index.js'

/** Données inventées : aucun nom ni aucune position ne vient d'une source réelle. */
const POINT: Point = { type: 'Point', coordinates: [-0.58, 44.84] }

function amenity(over: Partial<NearbyAmenity> = {}): NearbyAmenity {
  return {
    kind: 'supermarket_drive',
    name: 'Magasin fictif',
    brand: null,
    brandGroup: 'other',
    drive: 'yes',
    address: null,
    commune: 'Commune fictive',
    distanceMeters: 1000,
    point: POINT,
    source: 'osm',
    externalId: `node/${Math.random()}`,
    details: {
      facilityType: null,
      covered: null,
      lengthMeters: null,
      lanes: null,
      surfaceType: null,
      access: [],
      driveEvidence: null,
      sourceUrl: null,
    },
    ...over,
  }
}

function hit(over: Partial<NeighbourhoodHit> = {}): NeighbourhoodHit {
  return {
    name: 'Quartier fictif A',
    kind: 'quartier',
    code: 'A',
    parent: null,
    commune: 'Commune fictive',
    inseeCode: '33999',
    source: 'source fictive',
    distanceMeters: 0,
    ...over,
  }
}

describe('enseignes de supermarché', () => {
  it('reconnaît Carrefour, Auchan, Intermarché quelle que soit la déclinaison', () => {
    expect(foldText('  Intermarché  SUPER ')).toBe('intermarche super')
    expect(supermarketBrandGroup('Carrefour Market')).toBe('carrefour')
    expect(supermarketBrandGroup('Carrefour City')).toBe('carrefour')
    expect(supermarketBrandGroup(null, 'Drive Carrefour Contact')).toBe(
      'carrefour'
    )
    expect(supermarketBrandGroup('Auchan Supermarché')).toBe('auchan')
    expect(supermarketBrandGroup('Auchan Piéton')).toBe('auchan')
    expect(supermarketBrandGroup('Intermarché Hyper')).toBe('intermarche')
    expect(supermarketBrandGroup(undefined, 'Drive Intermarché')).toBe(
      'intermarche'
    )
    expect(supermarketBrandGroup('E.Leclerc Drive')).toBe('other')
    expect(supermarketBrandGroup('Lidl', 'Lidl fictif')).toBe('other')
    expect(supermarketBrandGroup()).toBe('other')
    // Un mot qui contient l'enseigne sans la nommer ne compte pas.
    expect(supermarketBrandGroup('Carrefourville')).toBe('other')
    // L'enseigne déclarée l'emporte sur le nom.
    expect(supermarketBrandGroup('Auchan', 'Ancien Carrefour')).toBe('auchan')
  })

  it('enseignes préférées et rang d’affichage', () => {
    expect(isPreferredBrand('carrefour')).toBe(true)
    expect(isPreferredBrand('intermarche')).toBe(true)
    expect(isPreferredBrand('other')).toBe(false)
    expect(isPreferredBrand(null)).toBe(false)
    expect(isPreferredBrand(undefined)).toBe(false)
    expect(brandRank('carrefour')).toBe(0)
    expect(brandRank('auchan')).toBe(1)
    expect(brandRank('intermarche')).toBe(2)
    expect(brandRank('other')).toBe(3)
    expect(brandRank(null)).toBe(3)
  })
})

describe('drive : signalé, à vérifier, jamais supposé', () => {
  it('le nom ou l’enseigne disent « drive »', () => {
    expect(driveSignalOfTags({ name: 'Carrefour Drive Fictif' })).toEqual({
      status: 'yes',
      evidence: 'name=Carrefour Drive Fictif',
    })
    expect(driveSignalOfTags({ brand: 'Chronodrive' }).status).toBe('yes')
    expect(driveSignalOfTags({ official_name: 'Drive Intermarché' })).toEqual({
      status: 'yes',
      evidence: 'official_name=Drive Intermarché',
    })
    expect(driveSignalOfTags({ short_name: 'DRIVE' }).status).toBe('yes')
  })

  it('drive_through=only : point de retrait, drive signalé', () => {
    expect(
      driveSignalOfTags({
        shop: 'outpost',
        name: 'Relais fictif',
        drive_through: 'only',
      })
    ).toEqual({ status: 'yes', evidence: 'drive_through=only' })
  })

  it('drive_through=yes, click_and_collect, branch=Drive, shop=outpost : ambigus, à vérifier', () => {
    expect(
      driveSignalOfTags({ name: 'Auchan fictif', drive_through: 'yes' })
    ).toEqual({ status: 'to_verify', evidence: 'drive_through=yes' })
    expect(driveSignalOfTags({ click_and_collect: 'Yes ' })).toEqual({
      status: 'to_verify',
      evidence: 'click_and_collect=Yes ',
    })
    expect(driveSignalOfTags({ click_and_collect: 'only' }).status).toBe(
      'to_verify'
    )
    expect(
      driveSignalOfTags({ name: 'Super fictif', branch: 'Drive' })
    ).toEqual({ status: 'to_verify', evidence: 'branch=Drive' })
    expect(
      driveSignalOfTags({ shop: 'outpost', name: 'Retrait fictif' })
    ).toEqual({ status: 'to_verify', evidence: 'shop=outpost' })
    expect(driveSignalOfTags({ drive_through: 'no' }).status).toBeNull()
    expect(
      driveSignalOfTags({ branch: 'Centre', shop: 'supermarket' }).status
    ).toBeNull()
  })

  it('rien de tout cela : pas de drive, quelle que soit l’enseigne', () => {
    expect(
      driveSignalOfTags({ name: 'Carrefour Market', brand: 'Carrefour Market' })
    ).toEqual({ status: null, evidence: null })
    expect(driveSignalOfTags({})).toEqual({ status: null, evidence: null })
  })
})

describe('Fitness Park', () => {
  it('marque ou nom, et un identifiant Wikidata cohérent', () => {
    expect(FITNESS_PARK_WIKIDATA).toBe('Q102351191')
    expect(isFitnessPark({ brand: 'Fitness Park' })).toBe(true)
    expect(isFitnessPark({ operator: 'Fitness Park' })).toBe(true)
    expect(isFitnessPark({ name: 'FITNESS PARK Fictif' })).toBe(true)
    expect(isFitnessPark({ name: 'FitnessPark' })).toBe(true)
    expect(isFitnessPark({ 'brand:wikidata': FITNESS_PARK_WIKIDATA })).toBe(
      true
    )
    expect(
      isFitnessPark({ name: 'Fitness Park', 'brand:wikidata': 'Q1' })
    ).toBe(false)
    expect(isFitnessPark({ name: 'Basic-Fit' })).toBe(false)
    expect(isFitnessPark({ name: 'Le Park Fitness' })).toBe(false)
    expect(isFitnessPark({})).toBe(false)
  })
})

describe('quartier d’un point', () => {
  const base = { point: POINT, precision: 'exact' as const, imported: 3 }

  it('sans point, sans import, hors des contours', () => {
    expect(neighbourhoodLookup({ ...base, point: null, hits: [] }).status).toBe(
      'not_applicable'
    )
    const none = neighbourhoodLookup({ ...base, imported: 0, hits: [hit()] })
    expect(none.status).toBe('unavailable')
    expect(none.reasons[0]).toContain('non disponible')
    const outside = neighbourhoodLookup({
      ...base,
      hits: [hit({ distanceMeters: 12 })],
    })
    expect(outside.status).toBe('not_applicable')
    expect(outside.value).toBeNull()
  })

  it('le contour qui contient le point, quartier officiel d’abord', () => {
    // Un quartier officiel et l'IRIS qui le recouvre : le quartier, sans réserve.
    const found = neighbourhoodLookup({
      ...base,
      hits: [
        hit({ kind: 'iris', name: 'IRIS fictif', code: 'I' }),
        hit({ parent: 'Grand quartier fictif' }),
        hit({ kind: 'commune', name: 'Commune fictive', code: 'C' }),
      ],
    })
    expect(found.status).toBe('ok')
    expect(found.value?.kind).toBe('quartier')
    expect(found.value?.parent).toBe('Grand quartier fictif')
    // À défaut de quartier officiel (interstice) : l'IRIS.
    const gap = neighbourhoodLookup({
      ...base,
      hits: [hit({ kind: 'iris', name: 'IRIS fictif', code: 'I' })],
    })
    expect(gap.value?.kind).toBe('iris')
    // Deux contours de même nature contiennent le point : à vérifier.
    const overlap = neighbourhoodLookup({
      ...base,
      hits: [hit(), hit({ code: 'B', name: 'Quartier fictif B' })],
    })
    expect(overlap.status).toBe('to_verify')
    expect(overlap.reasons[0]).toContain('plusieurs contours')
    const single = neighbourhoodLookup({
      ...base,
      hits: [hit(), hit({ code: 'B', name: 'Voisin', distanceMeters: 8 })],
    })
    expect(single).toEqual({
      status: 'ok',
      value: {
        name: 'Quartier fictif A',
        kind: 'quartier',
        code: 'A',
        parent: null,
        commune: 'Commune fictive',
        inseeCode: '33999',
        source: 'source fictive',
      },
      reasons: [],
    })
    const tie = neighbourhoodLookup({
      ...base,
      hits: [
        hit({ kind: 'iris', name: 'Zeta', code: 'Z' }),
        hit({ kind: 'iris', name: 'Alpha' }),
      ],
    })
    expect(tie.value?.name).toBe('Alpha')
    expect(tie.status).toBe('to_verify')
  })

  it('localisation approchée ou adresse à la rue en limite : à vérifier', () => {
    const commune = neighbourhoodLookup({
      ...base,
      precision: 'commune',
      hits: [hit()],
    })
    expect(commune.status).toBe('to_verify')
    expect(commune.reasons[0]).toContain('centre de la commune')
    const district = neighbourhoodLookup({
      ...base,
      precision: 'district',
      hits: [hit()],
    })
    expect(district.reasons[0]).toContain('quartier par le géocodeur')
    const street = neighbourhoodLookup({
      ...base,
      precision: 'street',
      hits: [hit(), hit({ code: 'B', name: 'Voisin', distanceMeters: 20 })],
    })
    expect(street.status).toBe('to_verify')
    expect(street.reasons[0]).toContain('« Voisin »')
    const far = neighbourhoodLookup({
      ...base,
      precision: 'street',
      hits: [hit(), hit({ code: 'B', name: 'Voisin', distanceMeters: 31 })],
    })
    expect(far.status).toBe('ok')
    // Un IRIS voisin ne compte pas quand le point est dans un quartier officiel.
    const irisNear = neighbourhoodLookup({
      ...base,
      precision: 'street',
      hits: [hit(), hit({ kind: 'iris', code: 'I', distanceMeters: 5 })],
    })
    expect(irisNear.status).toBe('ok')
  })
})

describe('équipements les plus proches', () => {
  const lookup = {
    point: POINT,
    imported: 4,
    noun: 'piste d’athlétisme',
    sourceLabel: 'Pistes d’athlétisme',
  }

  it('sans point, non importé, aucun dans le rayon, trouvé', () => {
    expect(
      amenityLookup({ ...lookup, point: null, nearest: null }).status
    ).toBe('not_applicable')
    const missing = amenityLookup({ ...lookup, imported: 0, nearest: null })
    expect(missing).toEqual({
      status: 'unavailable',
      nearest: null,
      approximate: false,
      reasons: ['Pistes d’athlétisme : source non importée, non disponible.'],
    })
    const none = amenityLookup({ ...lookup, nearest: null, radiusMeters: 1500 })
    expect(none.status).toBe('ok')
    expect(none.reasons[0]).toBe(
      'Aucune piste d’athlétisme à moins de 1,5 km à vol d’oiseau.'
    )
    const track = amenity({ kind: 'athletics_track' })
    expect(amenityLookup({ ...lookup, nearest: track })).toEqual({
      status: 'ok',
      nearest: track,
      approximate: false,
      reasons: [],
    })
  })

  it('drive le plus proche : signalé d’abord, « à vérifier » faute de mieux', () => {
    const near = amenity({ drive: 'to_verify', distanceMeters: 200 })
    const far = amenity({ drive: 'yes', distanceMeters: 900 })
    expect(nearestDrive([near, far])).toBe(far)
    expect(nearestDrive([near])).toBe(near)
    expect(nearestDrive([amenity({ drive: null })])).toBeNull()
    expect(nearestDrive([])).toBeNull()
    // À distance égale : enseigne préférée, puis nom.
    const a = amenity({ name: 'B', distanceMeters: 500 })
    const b = amenity({ name: 'A', distanceMeters: 500 })
    const c = amenity({ name: 'Z', brandGroup: 'auchan', distanceMeters: 500 })
    expect(nearestDrive([a, b, c])).toBe(c)
    expect(nearestDrive([a, b])).toBe(b)
  })

  it('le plus proche de chaque enseigne préférée, puis toutes enseignes', () => {
    const carrefourVerify = amenity({
      brandGroup: 'carrefour',
      drive: 'to_verify',
      distanceMeters: 300,
    })
    const carrefour = amenity({ brandGroup: 'carrefour', distanceMeters: 1200 })
    const intermarche = amenity({
      brandGroup: 'intermarche',
      distanceMeters: 2500,
    })
    const other = amenity({ brandGroup: 'other', distanceMeters: 800 })
    const tooFar = amenity({ brandGroup: 'auchan', distanceMeters: 30_000 })
    const result = supermarketsLookup({
      point: POINT,
      imported: 5,
      candidates: [carrefourVerify, carrefour, intermarche, other, tooFar],
    })
    expect(result.status).toBe('ok')
    expect(result.preferred.carrefour).toBe(carrefour)
    expect(result.preferred.auchan).toBeNull()
    expect(result.preferred.intermarche).toBe(intermarche)
    expect(result.nearest).toBe(other)
    expect(result.reasons).toEqual([
      'Aucun drive Auchan à moins de 20 km à vol d’oiseau.',
    ])
  })

  it('aucun drive, sans point, non importé', () => {
    const empty = supermarketsLookup({
      point: POINT,
      imported: 3,
      candidates: [],
      radiusMeters: 5000,
    })
    expect(empty.nearest).toBeNull()
    expect(empty.reasons).toHaveLength(4)
    expect(empty.reasons[3]).toContain('Aucun supermarché avec drive')
    expect(
      supermarketsLookup({ point: null, imported: 3, candidates: [] }).status
    ).toBe('not_applicable')
    expect(
      supermarketsLookup({ point: POINT, imported: 0, candidates: [] })
    ).toMatchObject({ status: 'unavailable', nearest: null })
  })
})

describe('tout ce qu’une annonce reçoit', () => {
  it('compose les lectures et suit le schéma du contrat', () => {
    const track = amenity({ kind: 'athletics_track', brandGroup: null })
    const fitness = amenity({ kind: 'fitness_park', brandGroup: null })
    const drive = amenity({ brandGroup: 'auchan' })
    const result = surroundingsOf({
      point: POINT,
      precision: 'exact',
      sources: {
        neighbourhoods: 2,
        athleticsTracks: 1,
        supermarketDrives: 1,
        fitnessParks: 1,
      },
      neighbourhoodHits: [hit()],
      nearestTrack: track,
      nearestFitnessPark: fitness,
      supermarketCandidates: [drive],
      computedAt: '2030-01-01T00:00:00.000Z',
    })
    expect(SurroundingsSchema.parse(result)).toEqual(result)
    expect(result.neighbourhood.value?.name).toBe('Quartier fictif A')
    expect(result.athleticsTrack.nearest).toBe(track)
    expect(result.fitnessPark.nearest).toBe(fitness)
    expect(result.supermarkets.preferred.auchan).toBe(drive)
    expect(result.searchRadiusMeters).toBe(20_000)
    const nothing = surroundingsOf({
      point: null,
      precision: null,
      sources: {
        neighbourhoods: 0,
        athleticsTracks: 0,
        supermarketDrives: 0,
        fitnessParks: 0,
      },
      neighbourhoodHits: [],
      nearestTrack: null,
      nearestFitnessPark: null,
      supermarketCandidates: [],
      computedAt: '2030-01-01T00:00:00.000Z',
      radiusMeters: 1000,
    })
    expect(nothing.fitnessPark.status).toBe('not_applicable')
    expect(nothing.searchRadiusMeters).toBe(1000)
    // Ce que le journal en garde.
    expect(surroundingsDigest(result)).toEqual({
      neighbourhood: 'Quartier fictif A',
      athleticsTrackMeters: 1000,
      nearestDrive: 'Magasin fictif',
      fitnessParkMeters: 1000,
    })
    expect(surroundingsDigest(nothing)).toEqual({
      neighbourhood: null,
      athleticsTrackMeters: null,
      nearestDrive: null,
      fitnessParkMeters: null,
    })
  })
})
