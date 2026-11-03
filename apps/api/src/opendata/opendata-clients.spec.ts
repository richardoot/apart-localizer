import { describe, expect, it, vi } from 'vitest'
import {
  ADEME_DPE_ENDPOINT,
  candidateOfLine,
  dpeSearchParams,
  searchAdemeDpe,
} from './ademe-dpe'
import {
  CYCLING_APPROXIMATION,
  closeRing,
  fetchIsochrone,
  isochroneProviderParams,
  isochroneUrl,
  polygonOfResponse,
  ringArea,
} from './isochrone'
import type { FetchLike } from './geoplateforme'

const ok = (body: unknown): ReturnType<FetchLike> =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
const origin = {
  type: 'Point' as const,
  coordinates: [-0.59, 44.8] as [number, number],
}
const square = [
  [-0.6, 44.8],
  [-0.59, 44.8],
  [-0.59, 44.81],
  [-0.6, 44.81],
  [-0.6, 44.8],
]

describe('isochrones Géoplateforme', () => {
  it('à pied et en voiture : durée en minutes ; à vélo : isodistance à 15 km/h', () => {
    expect(isochroneProviderParams('walking', 15).provider).toEqual({
      service: 'https://data.geopf.fr/navigation/isochrone',
      resource: 'bdtopo-valhalla',
      profile: 'pedestrian',
      costType: 'time',
      costValue: 15,
      unit: 'minute',
    })
    expect(isochroneProviderParams('driving', 5).provider.profile).toBe('car')
    const cycling = isochroneProviderParams('cycling', 10)
    expect(cycling.provider).toMatchObject({
      profile: 'pedestrian',
      costType: 'distance',
      costValue: 2500,
      unit: 'meter',
    })
    expect(cycling.approximation).toBe(CYCLING_APPROXIMATION)
  })

  it("l'URL porte les paramètres documentés", () => {
    const url = new URL(
      isochroneUrl(origin, isochroneProviderParams('walking', 15).provider)
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      resource: 'bdtopo-valhalla',
      point: '-0.59,44.8',
      costType: 'time',
      costValue: '15',
      profile: 'pedestrian',
      direction: 'departure',
      geometryFormat: 'geojson',
      crs: 'EPSG:4326',
      timeUnit: 'minute',
    })
    const bike = new URL(
      isochroneUrl(origin, isochroneProviderParams('cycling', 4).provider)
    )
    expect(bike.searchParams.get('distanceUnit')).toBe('meter')
    expect(bike.searchParams.get('timeUnit')).toBeNull()
  })

  it('polygone : anneau fermé ; MultiPolygon réduit au plus grand morceau', () => {
    expect(
      polygonOfResponse({
        geometry: { type: 'Polygon', coordinates: [square] },
      })
    ).toEqual({
      polygon: { type: 'Polygon', coordinates: [square] },
      warnings: [],
    })
    const small = [
      [-0.5, 44.8],
      [-0.499, 44.8],
      [-0.499, 44.801],
      [-0.5, 44.8],
    ]
    const multi = polygonOfResponse({
      geometry: {
        type: 'MultiPolygon',
        coordinates: [[small], [square.slice(0, 4)]],
      },
    })
    expect(multi.polygon.coordinates[0]).toEqual(square)
    expect(multi.warnings[0]).toContain('2 morceaux')
    expect(() => polygonOfResponse({ nope: true })).toThrow('inexploitable')
    expect(() =>
      polygonOfResponse({ geometry: { type: 'MultiPolygon', coordinates: [] } })
    ).toThrow('vide')
    expect(closeRing([])).toEqual([])
    expect(ringArea(square as [number, number][])).toBeCloseTo(0.0001, 8)
  })

  it('un appel ; une erreur HTTP lance', async () => {
    const fetchImpl = vi.fn(() =>
      ok({ geometry: { type: 'Polygon', coordinates: [square] } })
    )
    const result = await fetchIsochrone(fetchImpl, origin, 'walking', 10)
    expect(result.provider.costValue).toBe(10)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await expect(
      fetchIsochrone(
        () =>
          Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
          }),
        origin,
        'walking',
        10
      )
    ).rejects.toThrow('HTTP 500')
  })
})

describe('observatoire DPE ADEME', () => {
  it('requête par identifiant BAN, sinon par commune et surface', () => {
    const byBan = dpeSearchParams({
      method: 'ban_id',
      banId: '33063_1234_00012',
    })
    expect(byBan.get('qs')).toBe(
      'identifiant_ban:"33063_1234_00012" AND type_batiment:appartement'
    )
    expect(byBan.get('size')).toBe('30')
    expect(byBan.get('sort')).toBe('-date_etablissement_dpe')
    expect(byBan.get('select')).toContain('etiquette_dpe')
    const byCommune = dpeSearchParams({
      method: 'commune_surface',
      inseeCode: '33522',
      surface: 45,
    })
    expect(byCommune.get('qs')).toBe(
      'code_insee_ban:"33522" AND type_batiment:appartement AND surface_habitable_logement:[44 TO 46]'
    )
  })

  const line = {
    numero_dpe: '2633E0000001X',
    date_etablissement_dpe: '2025-02-03',
    date_fin_validite_dpe: '2035-02-02',
    etiquette_dpe: 'C',
    etiquette_ges: 'A',
    conso_5_usages_par_m2_ep: 150,
    emission_ges_5_usages_par_m2: 4,
    surface_habitable_logement: 40.5,
    numero_etage_appartement: 3,
    adresse_ban: '2 Rue Fictive 33400 Talence',
    complement_adresse_logement: 'porte 12',
    identifiant_ban: '33522_0000_00002',
    type_batiment: 'appartement',
  }

  it('une ligne devient un candidat ; une ligne illisible est ignorée', () => {
    expect(candidateOfLine(line)).toEqual({
      number: '2633E0000001X',
      issuedAt: '2025-02-03',
      validUntil: '2035-02-02',
      dpeClass: 'C',
      gesClass: 'A',
      consumption: 150,
      emissions: 4,
      surface: 40.5,
      floor: 3,
      address: '2 Rue Fictive 33400 Talence',
      complement: 'porte 12',
      banId: '33522_0000_00002',
      buildingType: 'appartement',
    })
    expect(candidateOfLine({ ...line, etiquette_dpe: 'H' })).toBeNull()
    expect(
      candidateOfLine({ ...line, date_etablissement_dpe: 'bientôt' })
    ).toBeNull()
    expect(candidateOfLine({ nope: 1 })).toBeNull()
    expect(
      candidateOfLine({
        ...line,
        etiquette_ges: null,
        numero_etage_appartement: 1.5,
        date_fin_validite_dpe: null,
      })
    ).toMatchObject({ gesClass: null, floor: null, validUntil: null })
  })

  it("interroge l'API data-fair et lance sur une panne", async () => {
    const fetchImpl = vi.fn((_url: string) =>
      ok({ total: 2, results: [line, { bad: true }] })
    )
    const found = await searchAdemeDpe(fetchImpl, {
      method: 'ban_id',
      banId: '33522_0000_00002',
    })
    expect(found.total).toBe(2)
    expect(found.candidates).toHaveLength(1)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(ADEME_DPE_ENDPOINT)
    await expect(
      searchAdemeDpe(
        () =>
          Promise.resolve({
            ok: false,
            status: 429,
            json: () => Promise.resolve({}),
          }),
        { method: 'ban_id', banId: 'x' }
      )
    ).rejects.toThrow('HTTP 429')
    await expect(
      searchAdemeDpe(() => ok({ unexpected: true }), {
        method: 'ban_id',
        banId: 'x',
      })
    ).rejects.toThrow('inexploitable')
  })
})
