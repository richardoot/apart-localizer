import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  IRIS_WFS_URL,
  SOURCE_LABELS,
  buildNeighbourhoods,
} from '../lib/neighbourhoods.js'
import {
  OVERPASS_URL,
  fetchJson,
  fetchOverpass,
  metersBetween,
  metropoleArea,
  osmAddress,
  osmDisplayName,
  overpassQuery,
  parseOverpass,
} from '../lib/osm.js'
import {
  OSM_FITNESS_QUERY,
  OSM_TRACKS_QUERY,
  RES_EXPORT_URL,
  buildFitnessParks,
  buildOsmTracks,
  buildResTracks,
  resRecords,
} from '../lib/sports.js'
import { SUPERMARKETS_QUERY, buildDrives } from '../lib/supermarkets.js'

/** Toutes les fixtures sont inventées : aucun nom ni aucune position réels. */
const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8')
  )

describe('OpenStreetMap (Overpass)', () => {
  it('lit une réponse : points, centres, objets sans position écartés', () => {
    const result = parseOverpass(fixture('osm-pistes-fictives.json'))
    expect(result.timestamp).toBe('2030-01-01T00:00:00Z')
    expect(result.withoutPosition).toBe(1)
    expect(result.elements).toHaveLength(5)
    expect(result.elements[2]).toMatchObject({
      type: 'relation',
      id: 3,
      longitude: -0.5,
      latitude: 44.9,
    })
    expect(() => parseOverpass({})).toThrow('elements')
    expect(
      parseOverpass({ elements: [{ type: 'node', id: 1, lat: 1, lon: 2 }] })
    ).toMatchObject({ timestamp: null, elements: [{ tags: {} }] })
  })

  it('requête sur les 28 communes, nom, adresse, distance', () => {
    expect(metropoleArea()).toContain('33063')
    expect(metropoleArea()).toContain('33550')
    const query = overpassQuery(['nwr["shop"]'])
    expect(query).toContain('nwr["shop"](area.bm);')
    expect(query).toContain('out center tags;')
    expect(SUPERMARKETS_QUERY).toContain('service"="drive-through')
    expect(OSM_TRACKS_QUERY).toContain('"leisure"="track"')
    expect(OSM_FITNESS_QUERY).toContain('Q102351191')
    expect(osmDisplayName({ name: 'Fitness Park', branch: 'Ville' })).toBe(
      'Fitness Park – Ville'
    )
    expect(osmDisplayName({ name: 'Carrefour Drive', branch: 'Drive' })).toBe(
      'Carrefour Drive'
    )
    expect(osmDisplayName({ brand: 'Enseigne' })).toBe('Enseigne')
    expect(osmDisplayName({})).toBeNull()
    expect(
      osmAddress({
        'addr:housenumber': '3',
        'addr:street': 'Rue Fictive',
        'addr:postcode': '33000',
        'addr:city': 'Bordeaux',
      })
    ).toBe('3 Rue Fictive, 33000 Bordeaux')
    expect(osmAddress({ 'addr:street': 'Rue Fictive' })).toBe('Rue Fictive')
    expect(osmAddress({ 'addr:city': 'Bordeaux' })).toBeNull()
    expect(metersBetween([-0.58, 44.84], [-0.58, 44.85])).toBeCloseTo(1105, 0)
  })

  it('téléchargements : POST Overpass sans donnée personnelle, erreurs lisibles', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ elements: [] }),
      })
    ) as unknown as typeof fetch
    await fetchOverpass('[out:json];', fetchImpl)
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, RequestInit]
    expect(url).toBe(OVERPASS_URL)
    expect(init.method).toBe('POST')
    expect(String(init.body)).toBe('data=%5Bout%3Ajson%5D%3B')
    expect(JSON.stringify(init.headers)).not.toContain('@')
    const failing = (() =>
      Promise.resolve({ ok: false, status: 429 })) as unknown as typeof fetch
    await expect(fetchOverpass('x', failing)).rejects.toThrow('429')
    await expect(
      fetchJson('https://exemple.invalid/x', failing)
    ).rejects.toThrow('429')
    await expect(
      fetchJson('https://exemple.invalid/x', fetchImpl)
    ).resolves.toEqual({
      elements: [],
    })
  })
})

describe('pistes d’athlétisme', () => {
  it('le recensement : pistes de la métropole, nature, longueur, publics', () => {
    const { rows, athletics, stats } = buildResTracks(
      fixture('res-athletisme-fictif.json')
    )
    expect(stats).toEqual({
      read: 6,
      outsideMetropole: 1,
      otherTypes: 1,
      withoutPosition: 1,
      kept: 3,
      byType: {
        'Stade d’athlétisme': 1,
        "Piste d'athlétisme isolée": 1,
        "Piste d'athlétisme 2 à 4 couloirs": 1,
      },
    })
    expect(athletics.map(a => a.externalId)).toEqual([
      'E001I330630001',
      'E002I335220002',
      'E003I330630003',
      'E006I330630006',
    ])
    const [stade, couverte, couloirs] = rows
    expect(stade).toMatchObject({
      externalId: 'E001I330630001',
      name: 'STADE FICTIF DU NORD',
      address: '1 allée Fictive, 33000 Bordeaux',
      commune: 'Bordeaux',
      inseeCode: '33063',
      sourceUpdatedAt: null,
      details: {
        facilityType: 'Stade d’athlétisme',
        covered: false,
        lengthMeters: 400,
        lanes: null,
        surfaceType: 'Synthétique (hors gazon)',
        access: [
          'Scolaires, universités',
          'Clubs sportifs, comités, ligues, fédérations',
        ],
      },
    })
    expect(couverte).toMatchObject({
      name: 'PISTE COUVERTE FICTIVE',
      address: '33400 Talence',
      sourceUpdatedAt: '2025-06-01',
      details: {
        covered: true,
        lengthMeters: 120,
        lanes: 4,
        access: ['Accès libre', 'Individuel(s), famille(s)'],
      },
    })
    expect(couloirs?.details).toMatchObject({ covered: null, access: [] })
  })

  it('un export GeoJSON se lit comme le JSON ; un format inconnu est refusé', () => {
    const records = resRecords({
      type: 'FeatureCollection',
      features: [
        {
          properties: { equip_numero: 'E9' },
          geometry: { type: 'Point', coordinates: [-0.5, 44.9] },
        },
        { properties: { equip_numero: 'E10' }, geometry: null },
      ],
    })
    expect(records[0]).toEqual({
      equip_numero: 'E9',
      equip_coordonnees: { lon: -0.5, lat: 44.9 },
    })
    expect(records[1]).toEqual({ equip_numero: 'E10' })
    expect(() => resRecords({})).toThrow('illisible')
    expect(decodeURIComponent(RES_EXPORT_URL)).toContain(
      `where=epci_code='243300316' and equip_type_famille="Equipement d'athlétisme"`
    )
  })

  it('OpenStreetMap en complément : sans les pistes déjà au recensement', () => {
    const res = buildResTracks(fixture('res-athletisme-fictif.json'))
    const { rows, stats } = buildOsmTracks(
      parseOverpass(fixture('osm-pistes-fictives.json')).elements,
      { athletics: res.athletics, tracks: res.rows }
    )
    expect(stats).toEqual({
      read: 5,
      tracks: 4,
      knownByReference: 1,
      nearResEquipment: 1,
      kept: 2,
    })
    expect(rows[0]).toMatchObject({
      externalId: 'relation/3',
      name: 'Piste fictive du Parc',
      commune: 'Commune fictive',
      details: {
        facilityType: 'Piste (OpenStreetMap)',
        covered: null,
        lengthMeters: 400,
        lanes: 6,
        surfaceType: 'tartan',
        access: ['Accès libre'],
        sourceUrl: 'https://www.openstreetmap.org/relation/3',
      },
    })
    expect(rows[1]).toMatchObject({
      name: 'Piste d’athlétisme sans nom',
      details: { covered: true, access: ['access=school_only'] },
    })
  })
})

describe('supermarchés avec drive', () => {
  it('drive signalé, à vérifier, ou écarté ; jamais supposé', () => {
    const { rows, stats } = buildDrives(
      parseOverpass(fixture('osm-supermarches-fictifs.json')).elements
    )
    expect(stats).toEqual({
      read: 12,
      shops: 9,
      kept: 5,
      byStatus: { yes: 2, to_verify: 3 },
      byBrand: { carrefour: 1, auchan: 1, intermarche: 1, other: 2 },
      fromServiceRoad: 1,
      withoutSignal: 3,
      withoutName: 1,
    })
    const byId = Object.fromEntries(rows.map(r => [r.externalId, r]))
    expect(byId['node/10']).toMatchObject({
      name: 'E.Leclerc Drive – Relais fictif',
      brandGroup: 'other',
      drive: 'yes',
      details: {
        facilityType: 'shop=outpost',
        driveEvidence: 'drive_through=only',
      },
    })
    expect(byId['way/11']).toMatchObject({
      brandGroup: 'auchan',
      drive: 'yes',
      address: '3 Rue Fictive, 33000 Bordeaux',
      commune: 'Bordeaux',
    })
    // La voie « Carrefour Drive » toute proche : à vérifier, pas confirmé.
    expect(byId['node/12']?.drive).toBe('to_verify')
    expect(byId['node/12']?.details.driveEvidence).toMatch(
      /^voie « Carrefour Drive » \(service=drive-through\) à \d+ m$/
    )
    expect(byId['way/15']).toMatchObject({
      brandGroup: 'intermarche',
      drive: 'to_verify',
    })
    expect(byId['node/17']?.details.driveEvidence).toBe('branch=Drive')
    // Ni la supérette Carrefour City à côté de la voie, ni un Lidl, ni un
    // Carrefour Market loin de toute voie, ni une boulangerie.
    for (const id of ['node/16', 'node/20', 'node/21', 'node/19']) {
      expect(byId[id]).toBeUndefined()
    }
  })
})

describe('Fitness Park', () => {
  it('chaque club est vérifié ; une autre marque est écartée', () => {
    const { rows, stats } = buildFitnessParks(
      parseOverpass(fixture('osm-fitness-fictifs.json')).elements
    )
    expect(stats).toEqual({
      read: 3,
      kept: 2,
      rejected: ['Fitness Park Imitation'],
    })
    expect(rows[0]).toMatchObject({
      externalId: 'node/30',
      name: 'Fitness Park – Ville fictive',
      brand: 'Fitness Park',
      address: '9 Avenue Fictive',
      details: { facilityType: 'leisure=fitness_centre' },
    })
    expect(rows[1]).toMatchObject({
      name: 'Fitness Park Quartier fictif',
      brand: null,
    })
    expect(
      buildFitnessParks([
        {
          type: 'node',
          id: 1,
          longitude: 0,
          latitude: 0,
          tags: { 'brand:wikidata': 'Q102351191' },
        },
      ]).stats.rejected
    ).toEqual(['node/1'])
  })
})

describe('quartiers de la métropole', () => {
  it('secteurs de vie à Bordeaux, quartiers officiels, IRIS, communes entières', () => {
    const { rows, stats } = buildNeighbourhoods({
      quartiers: fixture('quartiers-fictifs.geojson'),
      secteurs: fixture('secteurs-fictifs.geojson'),
      iris: fixture('iris-fictifs.geojson'),
      irisEdition: '2030',
    })
    expect(stats).toMatchObject({
      quartiers: 1,
      secteurs: 1,
      iris: 3,
      communes: 1,
      invalid: 3,
      outsideMetropole: 1,
      withoutGeometry: 2,
    })
    const byCode = Object.fromEntries(rows.map(r => [r.code, r]))
    expect(byCode['se_quartvie_s:7']).toMatchObject({
      kind: 'quartier',
      name: 'Secteur fictif des Quais',
      parent: 'Quartier fictif de Bordeaux',
      commune: 'Bordeaux',
      source: SOURCE_LABELS.secteurs,
    })
    // Bordeaux a ses secteurs de vie : son quartier n'est pas repris.
    expect(byCode['se_quart_s:1']).toBeUndefined()
    expect(byCode['se_quart_s:2']).toMatchObject({
      name: 'Quartier fictif de Talence',
      inseeCode: '33522',
      commune: 'Talence',
      source: SOURCE_LABELS.quartiers,
    })
    expect(byCode['335220101']).toMatchObject({
      kind: 'iris',
      name: 'IRIS Fictif Talence',
      source:
        'IGN et INSEE, Contours IRIS édition 2030 (Géoplateforme), Licence Ouverte',
    })
    expect(byCode['330040000']).toMatchObject({
      kind: 'commune',
      name: 'Ambès',
    })
    expect(byCode['330320102']).toMatchObject({
      kind: 'iris',
      name: 'IRIS Fictif Bassens',
      commune: 'Bassens',
      inseeCode: '33032',
    })
    const rule = (insee: string) => stats.rules.find(r => r.inseeCode === insee)
    expect(rule('33063')).toMatchObject({ rule: 'secteurs', quartiers: 1 })
    expect(rule('33522')).toMatchObject({
      rule: 'quartiers',
      quartiers: 1,
      iris: 1,
    })
    expect(rule('33003')).toMatchObject({ rule: 'iris', iris: 1 })
    expect(rule('33004')).toMatchObject({ rule: 'commune' })
    expect(rule('33013')).toMatchObject({ rule: 'absente' })
  })

  it('sans secteurs de vie : les quartiers de Bordeaux ; GeoJSON illisible refusé', () => {
    const { rows } = buildNeighbourhoods({
      quartiers: fixture('quartiers-fictifs.geojson'),
      secteurs: null,
      iris: { type: 'FeatureCollection', features: [] },
      irisEdition: '2030',
    })
    expect(rows.map(r => r.code)).toEqual(['se_quart_s:1', 'se_quart_s:2'])
    expect(() =>
      buildNeighbourhoods({
        quartiers: null,
        secteurs: null,
        iris: {},
        irisEdition: '2030',
      })
    ).toThrow('IRIS : GeoJSON illisible')
    expect(decodeURIComponent(IRIS_WFS_URL)).toContain(
      "code_insee IN ('33003',"
    )
  })
})
