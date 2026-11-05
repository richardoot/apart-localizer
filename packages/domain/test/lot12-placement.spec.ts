import { describe, expect, it } from 'vitest'
import { ListingPlacementSchema } from '@apart/contracts'
import type { ListingPlacement, Point } from '@apart/contracts'
import {
  DISJOINT_OVERLAP,
  NESTED_OVERLAP,
  addressPlacement,
  approximateAreaLabel,
  approximationReason,
  areaWording,
  candidateAreasOf,
  chooseDistrictArea,
  choosePlace,
  communePlacement,
  districtFragments,
  districtPlacement,
  foldPlaceText,
  irisBaseName,
  isAddressPrecision,
  locationApproximation,
  manualPlacement,
  matchDistrict,
  matchStrength,
  placePlacement,
  placeTokens,
  placementAreaName,
  placementImproves,
  precisionBadge,
} from '../src/index.js'
import type {
  AreaOverlap,
  CandidateArea,
  NeighbourhoodRef,
  PlaceRef,
} from '../src/index.js'

/**
 * Lot 12 : placement du repère d'une annonce. Les noms de quartiers sont
 * des noms publics des jeux ouverts (secteurs de vie de Bordeaux, IRIS) ;
 * les textes « quartier » sont inventés, les surfaces et recouvrements
 * fictifs.
 */
const AT = '2026-11-05T10:00:00.000Z'
const POINT: Point = { type: 'Point', coordinates: [-0.62, 44.85] }

const SOURCE = 'Ville de Bordeaux, « Secteurs de vie » (fictif)'
const ROWS: NeighbourhoodRef[] = [
  {
    kind: 'quartier',
    code: 'S-NIEL',
    name: 'Queyries, Niel',
    parent: 'La Bastide',
    commune: 'Bordeaux',
    inseeCode: '33063',
    source: SOURCE,
  },
  {
    kind: 'quartier',
    code: 'S-GALIN',
    name: 'Cœur de Bastide, Galin',
    parent: 'La Bastide',
    commune: 'Bordeaux',
    inseeCode: '33063',
    source: SOURCE,
  },
  {
    kind: 'quartier',
    code: 'S-NANSOUTY',
    name: 'Nansouty',
    parent: 'Nansouty / Saint-Genès',
    commune: 'Bordeaux',
    inseeCode: '33063',
    source: SOURCE,
  },
  {
    kind: 'quartier',
    code: 'S-GARE',
    name: 'Sainte-Croix, Gare, Sacré Cœur',
    parent: 'Bordeaux Sud',
    commune: 'Bordeaux',
    inseeCode: '33063',
    source: SOURCE,
  },
  {
    kind: 'iris',
    code: '330630801',
    name: 'IRIS Thiers-Stalingrad 1',
    parent: null,
    commune: 'Bordeaux',
    inseeCode: '33063',
    source: 'IRIS (fictif)',
  },
  {
    kind: 'iris',
    code: '330630802',
    name: 'IRIS Thiers-Stalingrad 2',
    parent: null,
    commune: 'Bordeaux',
    inseeCode: '33063',
    source: 'IRIS (fictif)',
  },
  {
    kind: 'iris',
    code: '330630701',
    name: 'IRIS Bastide-Deschamps 1',
    parent: null,
    commune: 'Bordeaux',
    inseeCode: '33063',
    source: 'IRIS (fictif)',
  },
  {
    kind: 'commune',
    code: '330040000',
    name: 'Ambès',
    parent: null,
    commune: 'Ambès',
    inseeCode: '33004',
    source: 'IRIS (fictif)',
  },
]
const AREAS = candidateAreasOf(ROWS)
const key = (name: string): string => {
  const found = AREAS.find(a => a.name === name)
  if (!found) throw new Error(`zone ${name} absente`)
  return found.key
}
const SURFACES: Record<string, number> = {
  'Queyries, Niel': 2_900_000,
  'Cœur de Bastide, Galin': 2_800_000,
  Nansouty: 1_300_000,
  'Sainte-Croix, Gare, Sacré Cœur': 1_700_000,
  'La Bastide': 5_700_000,
  'Nansouty / Saint-Genès': 3_300_000,
  'Bordeaux Sud': 4_600_000,
  'IRIS Thiers-Stalingrad': 4_800_000,
  'IRIS Bastide-Deschamps': 2_900_000,
}
const FACTS = AREAS.map(a => ({
  key: a.key,
  areaSquareMeters: SURFACES[a.name] ?? 1,
}))
/** Recouvrements fictifs : secteurs de La Bastide dans La Bastide, IRIS dedans aussi. */
function overlaps(): AreaOverlap[] {
  const pairs: [string, string, number][] = [
    ['Queyries, Niel', 'La Bastide', 1],
    ['Cœur de Bastide, Galin', 'La Bastide', 1],
    ['IRIS Thiers-Stalingrad', 'La Bastide', 0.98],
    ['IRIS Thiers-Stalingrad', 'Queyries, Niel', 0.6],
    ['IRIS Bastide-Deschamps', 'La Bastide', 1],
    ['IRIS Bastide-Deschamps', 'Cœur de Bastide, Galin', 0.7],
    ['Nansouty', 'Nansouty / Saint-Genès', 1],
    ['Sainte-Croix, Gare, Sacré Cœur', 'Bordeaux Sud', 1],
  ]
  return pairs.map(([a, b, ratio]) => ({ a: key(a), b: key(b), ratio }))
}

function choose(text: string, commune = 'Bordeaux') {
  const fragments = districtFragments(text, commune)
  const matches = matchDistrict(fragments, AREAS, commune)
  return chooseDistrictArea({
    fragments,
    areas: AREAS,
    matches,
    facts: FACTS,
    overlaps: overlaps(),
    commune,
  })
}

describe('lecture du champ « quartier »', () => {
  it('normalise accents, ligatures et ponctuation', () => {
    expect(foldPlaceText('Sacré Cœur — l’Église')).toBe('sacre coeur l eglise')
    expect(placeTokens('Les Aubiers')).toEqual(['aubiers'])
    expect(irisBaseName('IRIS Thiers-Stalingrad 3')).toBe('Thiers-Stalingrad')
  })

  it('découpe, retire parenthèses, transports, distances, résidences et la commune seule', () => {
    const fragments = districtFragments(
      'La Bastide sud, près du square X (bus 9) / Niel - Galin ; tram A et B à 300 m, Résidence Les Pins, Bordeaux',
      'Bordeaux'
    )
    expect(fragments.map(f => f.tokens)).toEqual([
      ['bastide', 'sud'],
      ['square', 'x'],
      ['niel'],
      ['galin'],
    ])
    expect(fragments.map(f => f.near)).toEqual([false, true, false, false])
    expect(fragments[1]?.raw).toBe('près du square X')
  })

  it('rend un tableau vide sans texte, et lit les tournures « face au », « à côté de »', () => {
    expect(districtFragments(null)).toEqual([])
    expect(districtFragments('   ')).toEqual([])
    expect(districtFragments('Le Bouscat [à préciser]', 'Le Bouscat')).toEqual(
      []
    )
    expect(
      districtFragments('face au jardin Galin').map(f => [f.near, f.tokens])
    ).toEqual([[true, ['jardin', 'galin']]])
    expect(districtFragments('à côté de la gare')[0]?.near).toBe(true)
    expect(districtFragments('bus ligne 4 et 5')).toEqual([])
  })
})

describe('zones candidates', () => {
  it('reprend secteurs, quartiers regroupant des secteurs et noms d’IRIS', () => {
    const parent = AREAS.find(
      a => a.level === 'parent' && a.name === 'La Bastide'
    )
    expect(parent?.codes).toEqual(['S-NIEL', 'S-GALIN'])
    const iris = AREAS.find(a => a.name === 'IRIS Thiers-Stalingrad')
    expect(iris?.codes).toEqual(['330630801', '330630802'])
    expect(iris?.level).toBe('iris')
    expect(AREAS.find(a => a.name === 'Ambès')).toBeUndefined()
    const sector = AREAS.find(a => a.name === 'Sainte-Croix, Gare, Sacré Cœur')
    expect(sector?.aliases).toEqual([
      ['sainte', 'croix', 'gare', 'sacre', 'coeur'],
      ['sainte', 'croix'],
      ['gare'],
      ['sacre', 'coeur'],
    ])
    const official = candidateAreasOf([
      {
        kind: 'quartier',
        code: 'Q1',
        name: 'Le Vallon-Les Echoppes',
        parent: null,
        commune: 'Pessac',
        inseeCode: '33318',
        source: 'Quartiers (fictif)',
      },
    ])
    expect(official[0]?.level).toBe('quartier')
  })

  it('rapproche un morceau d’un nom : identique, contenu, ou contenu dans le nom', () => {
    expect(matchStrength(['bastide'], ['bastide'])).toBe('exact')
    expect(matchStrength(['jardin', 'galin'], ['galin'])).toBe('contained')
    expect(matchStrength(['stalingrad'], ['thiers', 'stalingrad'])).toBe(
      'partial'
    )
    // Mots courants seuls, commune, mots trop courts : rien.
    expect(matchStrength(['parc', 'x'], ['parc'])).toBeNull()
    expect(matchStrength(['gare'], ['gare', 'saint', 'jean'])).toBeNull()
    expect(
      matchStrength(['bordeaux'], ['bordeaux', 'sud'], new Set(['bordeaux']))
    ).toBeNull()
    expect(matchStrength(['bel'], ['bel', 'air'])).toBeNull()
    expect(matchStrength(['gare'], ['gare'])).toBe('exact')
  })

  it('garde pour un morceau ses meilleurs rapprochements', () => {
    const fragments = districtFragments('La Bastide', 'Bordeaux')
    const matches = matchDistrict(fragments, AREAS, 'Bordeaux')
    expect(matches.map(m => m.key)).toEqual([key('La Bastide')])
  })
})

describe('choix de la zone', () => {
  it('prend le secteur confirmé par le quartier cité', () => {
    const choice = choose('La Bastide, secteur Niel')
    expect(choice?.area.name).toBe('Queyries, Niel')
    expect(choice?.area.level).toBe('sector')
    expect(choice?.toVerify).toBe(false)
    expect(choice?.matchedText).toBe('secteur Niel')
    expect(choice?.reasons[0]).toBe(
      'Secteur « Queyries, Niel » reconnu dans « secteur Niel ».'
    )
  })

  it('retient le quartier qui regroupe des secteurs quand il est seul cité', () => {
    const choice = choose('La Bastide est')
    expect(choice?.area.level).toBe('parent')
    expect(choice?.area.codes).toEqual(['S-NIEL', 'S-GALIN'])
    expect(choice?.reasons[0]).toContain('(union de ses secteurs)')
  })

  it('préfère un IRIS confirmé au quartier qui regroupe des secteurs', () => {
    const choice = choose('La Bastide, Stalingrad (bus 16)')
    expect(choice?.area.name).toBe('IRIS Thiers-Stalingrad')
    expect(choice?.toVerify).toBe(false)
  })

  it('« près de » confirmé : retenu, mais à vérifier', () => {
    const choice = choose('La Bastide, à deux pas, près du jardin Galin')
    expect(choice?.area.name).toBe('Cœur de Bastide, Galin')
    expect(choice?.toVerify).toBe(true)
    expect(choice?.reasons.join(' ')).toContain('quartier voisin')
  })

  it('« près de » seul : retenu faute de mieux, à vérifier', () => {
    const choice = choose('Rue fictive, près de Nansouty')
    expect(choice?.area.name).toBe('Nansouty')
    expect(choice?.toVerify).toBe(true)
  })

  it('deux zones distinctes citées : la mieux confirmée, à vérifier', () => {
    const choice = choose('Nansouty / Niel')
    expect(choice?.toVerify).toBe(true)
    expect(choice?.reasons.some(r => r.includes('distinct'))).toBe(true)
  })

  it('un même morceau qui désigne deux zones distinctes est à vérifier', () => {
    const areas: CandidateArea[] = [
      {
        key: 'a',
        level: 'iris',
        name: 'IRIS Gare Nord',
        codes: ['A'],
        commune: 'X',
        inseeCode: '33999',
        source: 's',
        aliases: [['fictive']],
      },
      {
        key: 'b',
        level: 'iris',
        name: 'IRIS Gare Sud',
        codes: ['B'],
        commune: 'X',
        inseeCode: '33999',
        source: 's',
        aliases: [['fictive']],
      },
    ]
    const fragments = districtFragments('Fictive')
    const choice = chooseDistrictArea({
      fragments,
      areas,
      matches: matchDistrict(fragments, areas),
      facts: [
        { key: 'a', areaSquareMeters: 10 },
        { key: 'b', areaSquareMeters: 20 },
      ],
      overlaps: [{ a: 'a', b: 'b', ratio: 0 }],
    })
    expect(choice?.area.name).toBe('IRIS Gare Nord')
    expect(choice?.toVerify).toBe(true)
    expect(choice?.reasons[1]).toContain('désigne aussi')
  })

  it('signale les noms non reconnus, sans rien mettre à vérifier', () => {
    const choice = choose('La Bastide, Inventé-Village')
    expect(choice?.area.name).toBe('La Bastide')
    expect(choice?.toVerify).toBe(false)
    expect(choice?.reasons[1]).toBe(
      '« Inventé-Village » : aucun quartier de ce nom dans les contours importés de Bordeaux.'
    )
  })

  it('rien de reconnu, ou une zone sans surface : null', () => {
    expect(choose('Inventé')).toBeNull()
    const fragments = districtFragments('Nansouty')
    expect(
      chooseDistrictArea({
        fragments,
        areas: AREAS,
        matches: matchDistrict(fragments, AREAS),
        facts: [],
        overlaps: [],
      })
    ).toBeNull()
  })

  it('les seuils de recouvrement sont ordonnés', () => {
    expect(DISJOINT_OVERLAP).toBeLessThan(NESTED_OVERLAP)
  })
})

describe('lieux-dits', () => {
  const place = (name: string, id = name): PlaceRef => ({
    externalId: `osm:node/${id}`,
    name,
    commune: 'Commune fictive',
    inseeCode: '33999',
    source: 'OSM (fictif)',
    point: POINT,
  })

  it('reconnaît un lieu-dit nommé ou contenu dans un morceau', () => {
    const choice = choosePlace({
      fragments: districtFragments('Hameau-Fictif est', 'Commune fictive'),
      places: [place('Le Hameau-Fictif'), place('Les Hameaux')],
      commune: 'Commune fictive',
    })
    expect(choice?.place.name).toBe('Le Hameau-Fictif')
    expect(choice?.toVerify).toBe(false)
  })

  it('« près de » ou plusieurs lieux-dits : à vérifier ; un morceau dans un nom ne suffit pas', () => {
    const near = choosePlace({
      fragments: districtFragments('près de Lieu-Un'),
      places: [place('Lieu-Un')],
    })
    expect(near?.toVerify).toBe(true)
    const many = choosePlace({
      fragments: districtFragments('Lieu-Un / Lieu-Deux'),
      places: [place('Lieu-Un'), place('Lieu-Deux')],
    })
    expect(many?.toVerify).toBe(true)
    expect(many?.reasons[1]).toContain('« Lieu-Deux »')
    expect(
      choosePlace({
        fragments: districtFragments('Grandval'),
        places: [place('Grandval-les-Bois')],
      })
    ).toBeNull()
  })
})

describe('placements', () => {
  it('quartier reconnu, lieu-dit, adresse, commune, point saisi', () => {
    const choice = choose('Nansouty')
    if (!choice) throw new Error('choix attendu')
    const district = districtPlacement(choice, AT)
    expect(ListingPlacementSchema.parse(district)).toEqual(district)
    expect(district).toMatchObject({
      method: 'neighbourhood_match',
      precision: 'district',
      matchedText: 'Nansouty',
      area: {
        level: 'sector',
        codes: ['S-NANSOUTY'],
        areaSquareMeters: 1_300_000,
      },
    })
    const placed = placePlacement(
      {
        place: {
          externalId: 'osm:node/1',
          name: 'Lieu-Un',
          commune: null,
          inseeCode: null,
          source: 'OSM',
          point: POINT,
        },
        matchedText: 'Lieu-Un',
        toVerify: false,
        reasons: ['r'],
      },
      AT
    )
    expect(placed.area).toMatchObject({ level: 'place', codes: [] })
    expect(addressPlacement('exact', '1 rue X', AT).reasons[0]).toBe(
      'Adresse trouvée au numéro : 1 rue X.'
    )
    expect(addressPlacement('street', null, AT).reasons[0]).toBe(
      'Adresse trouvée à la rue, sans numéro.'
    )
    expect(addressPlacement('district', 'Lieu', AT).reasons[0]).toContain(
      'lieu-dit : Lieu'
    )
    const commune = communePlacement({
      commune: 'Bordeaux',
      inseeCode: '33063',
      district: 'Inventé',
      reasons: ['« Inventé » : aucun quartier.'],
      computedAt: AT,
    })
    expect(commune.reasons[0]).toBe(
      'Aucun quartier reconnu dans « Inventé » : repère au centre de la commune.'
    )
    expect(commune.area?.source).toBe(
      'Géoplateforme IGN (centre de la commune)'
    )
    const bare = communePlacement({
      commune: null,
      inseeCode: null,
      source: 'Contours',
      computedAt: AT,
    })
    expect(bare.area).toMatchObject({ name: 'Commune', source: 'Contours' })
    expect(bare.reasons[0]).toContain('Ni adresse au numéro ni quartier')
    expect(manualPlacement(null, AT).precision).toBe('exact')
    expect(manualPlacement('district', AT).method).toBe('manual')
  })

  it('ne remplace jamais un repère à l’adresse ou saisi, ni par moins précis', () => {
    const district = districtPlacement(choose('Nansouty') as never, AT)
    const next = {
      point: POINT,
      precision: 'district' as const,
      placement: district,
    }
    expect(
      placementImproves({ point: null, precision: null, placement: null }, next)
    ).toBe(true)
    expect(
      placementImproves(
        { point: POINT, precision: 'exact', placement: null },
        next
      )
    ).toBe(false)
    expect(
      placementImproves(
        { point: POINT, precision: 'street', placement: null },
        next
      )
    ).toBe(false)
    expect(
      placementImproves(
        {
          point: POINT,
          precision: 'district',
          placement: manualPlacement('district', AT),
        },
        next
      )
    ).toBe(false)
    expect(
      placementImproves(
        { point: POINT, precision: 'commune', placement: null },
        next
      )
    ).toBe(true)
    const commune = communePlacement({
      commune: 'Bordeaux',
      inseeCode: '33063',
      computedAt: AT,
    })
    expect(
      placementImproves(
        { point: POINT, precision: 'district', placement: district },
        { point: POINT, precision: 'commune', placement: commune }
      )
    ).toBe(false)
    // Même précision : seulement si le point ou la zone change.
    expect(
      placementImproves(
        { point: POINT, precision: 'district', placement: district },
        next
      )
    ).toBe(false)
    expect(
      placementImproves(
        { point: POINT, precision: 'district', placement: district },
        { ...next, point: { type: 'Point', coordinates: [-0.6, 44.8] } }
      )
    ).toBe(true)
    expect(
      placementImproves(
        { point: POINT, precision: 'commune', placement: null },
        { point: POINT, precision: 'commune', placement: commune }
      )
    ).toBe(true)
    expect(
      placementImproves(
        { point: POINT, precision: 'commune', placement: commune },
        { point: POINT, precision: 'commune', placement: commune }
      )
    ).toBe(false)
    expect(isAddressPrecision('street')).toBe(true)
    expect(isAddressPrecision(null)).toBe(false)
  })
})

describe('pastille de précision et réserves « ≈ »', () => {
  const district = districtPlacement(
    choose('La Bastide, près du jardin Galin') as never,
    AT
  )
  const place: ListingPlacement = {
    method: 'osm_place',
    precision: 'district',
    matchedText: 'Lieu-Un',
    area: {
      level: 'place',
      name: 'Lieu-Un',
      codes: [],
      commune: 'X',
      inseeCode: null,
      source: 'OSM',
      areaSquareMeters: null,
    },
    toVerify: false,
    reasons: [],
    computedAt: AT,
  }

  it('dit d’où vient le repère', () => {
    expect(precisionBadge({ precision: null, point: null })).toMatchObject({
      tone: 'none',
      label: 'Non localisée',
    })
    expect(
      precisionBadge({ precision: 'exact', point: POINT }).title
    ).toContain('au numéro')
    expect(
      precisionBadge({
        precision: 'exact',
        point: POINT,
        placement: manualPlacement('exact', AT),
      }).title
    ).toContain('Point saisi')
    expect(precisionBadge({ precision: 'street', point: POINT }).label).toBe(
      'À la rue'
    )
    const badge = precisionBadge({
      precision: 'district',
      point: POINT,
      placement: district,
      district: 'La Bastide, près du jardin Galin',
    })
    expect(badge.label).toBe('Au quartier (Cœur de Bastide, Galin)')
    expect(badge.title).toContain('repère au centre du secteur')
    expect(badge.title).toContain('À vérifier')
    expect(
      precisionBadge({ precision: 'district', point: POINT, placement: place })
        .title
    ).toContain('lieu-dit « Lieu-Un »')
    expect(precisionBadge({ precision: 'district', point: POINT })).toEqual({
      tone: 'district',
      label: 'Au quartier',
      title: expect.stringContaining('géocodeur') as unknown as string,
    })
    expect(
      precisionBadge({
        precision: 'commune',
        point: POINT,
        commune: 'Bordeaux',
        district: 'Inventé',
      }).title
    ).toBe(
      'Ni adresse au numéro ni quartier reconnu dans « Inventé » : repère au centre de la commune (Bordeaux). Distances, quartier et zone d’encadrement indicatifs ; précisez l’adresse ou le quartier.'
    )
    expect(precisionBadge({ precision: 'commune', point: POINT }).label).toBe(
      'Commune seulement'
    )
  })

  it('les distances partent du centre du quartier, du lieu-dit ou de la commune', () => {
    expect(locationApproximation({ precision: 'exact', point: POINT })).toEqual(
      { approximate: false, origin: null, note: null }
    )
    expect(
      locationApproximation({ precision: null, point: null }).approximate
    ).toBe(false)
    expect(
      locationApproximation({
        precision: 'district',
        point: POINT,
        placement: district,
      }).origin
    ).toBe('centre du secteur « Cœur de Bastide, Galin »')
    expect(
      locationApproximation({
        precision: 'district',
        point: POINT,
        placement: place,
      }).origin
    ).toBe('lieu-dit « Lieu-Un »')
    expect(
      locationApproximation({ precision: 'district', point: POINT }).origin
    ).toBe('centre du quartier')
    const commune = locationApproximation({
      precision: 'commune',
      point: POINT,
      commune: 'Bordeaux',
    })
    expect(commune.note).toBe(
      'Repère approché : distances mesurées depuis le centre de la commune (Bordeaux), à lire « ≈ ». Précisez l’adresse pour les fiabiliser.'
    )
    expect(approximationReason('transit', commune)).toContain('Desserte')
    expect(approximationReason('market', commune)).toContain(
      'médiane indicative'
    )
    expect(approximationReason('amenities', commune)).toContain('« ≈ »')
    expect(
      approximationReason('transit', {
        approximate: false,
        origin: null,
        note: null,
      })
    ).toBeNull()
  })

  it('nomme la zone d’un repère approché, avec ses articles', () => {
    expect(areaWording({ level: 'iris', name: 'IRIS X' })).toEqual({
      bare: 'IRIS X',
      the: 'l’IRIS X',
      of: 'de l’IRIS X',
    })
    expect(areaWording({ level: 'commune', name: 'Bordeaux' }).of).toBe(
      'de la commune de Bordeaux'
    )
    expect(areaWording({ level: 'parent', name: 'La Bastide' }).the).toBe(
      'le quartier « La Bastide »'
    )
    expect(
      approximateAreaLabel({
        precision: 'district',
        point: POINT,
        placement: district,
      })
    ).toBe('le secteur « Cœur de Bastide, Galin »')
    expect(
      approximateAreaLabel({
        precision: 'district',
        point: POINT,
        placement: place,
      })
    ).toBeNull()
    expect(
      approximateAreaLabel({ precision: 'exact', point: POINT })
    ).toBeNull()
    expect(
      approximateAreaLabel({
        precision: 'commune',
        point: POINT,
        commune: 'Bègles',
      })
    ).toBe('la commune de Bègles')
    expect(approximateAreaLabel({ precision: 'commune', point: POINT })).toBe(
      'la commune'
    )
    expect(
      placementAreaName({ precision: 'district', placement: district })
    ).toBe('Cœur de Bastide, Galin')
    expect(
      placementAreaName({
        precision: 'commune',
        placement: communePlacement({
          commune: 'Bordeaux',
          inseeCode: null,
          computedAt: AT,
        }),
      })
    ).toBeNull()
  })
})
