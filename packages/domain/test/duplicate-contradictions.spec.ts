/**
 * ADR 0041 : un doublon probable se juge sur tous les faits connus des deux
 * côtés. Les cas reprennent la forme de ceux vus dans un espace réel (trois
 * lots d'un même immeuble chez la même agence, deux annonces placées au
 * centre du même quartier, le même bien sur trois portails, deux T3 où tout
 * concorde mais à 2 km l'un de l'autre) ; les données sont fictives.
 */
import { describe, expect, it } from 'vitest'
import { DUPLICATE_SCORES } from '@apart/contracts'
import {
  assessDuplicate,
  blockingDuplicateOf,
  duplicateContradictions,
  duplicateDifferences,
  duplicateReasons,
  formatEuros,
  linkIdentity,
  matchDuplicates,
  measurableZone,
  rowLinkKeys,
} from '../src/index.js'
import type { DuplicateRow } from '../src/index.js'

const row = (over: Partial<DuplicateRow> = {}): DuplicateRow => ({
  id: 'bbbbbbbb-0000-4000-8000-000000000001',
  title: '[Exemple] T3 Caudéran',
  status: 'to_study',
  price: 199_000,
  surface: 62,
  commune: 'Bordeaux',
  url: null,
  addressRaw: null,
  addressNormalized: null,
  rooms: 3,
  floor: 2,
  dpeClass: 'D',
  constructionYear: 1975,
  locationPrecision: 'district',
  ...over,
})

const probe = {
  commune: 'Bordeaux',
  price: 199_000,
  surface: 62,
  rooms: 3,
  floor: 2,
  dpeClass: 'D' as const,
  constructionYear: 1975,
}

describe('duplicateContradictions', () => {
  it('pièces, étage, surface, DPE, année : chaque fait connu des deux côtés', () => {
    expect(duplicateContradictions(probe, row())).toEqual([])
    expect(duplicateContradictions({ ...probe, rooms: 4 }, row())).toEqual([
      '3 pièces contre 4',
    ])
    expect(duplicateContradictions({ ...probe, floor: 0 }, row())).toEqual([
      'Au 2e étage, pas au rez-de-chaussée',
    ])
    expect(duplicateContradictions(probe, row({ floor: 1, rooms: 1 }))).toEqual(
      ['1 pièce contre 3', 'Au 1er étage, pas au 2e étage']
    )
    expect(duplicateContradictions({ ...probe, surface: 66 }, row())).toEqual([
      '62 m² contre 66 m²',
    ])
    // 5 % d'écart au plus : la même surface, mesurée autrement.
    expect(duplicateContradictions({ ...probe, surface: 64 }, row())).toEqual(
      []
    )
    expect(duplicateContradictions({ ...probe, dpeClass: 'F' }, row())).toEqual(
      ['DPE D contre F']
    )
    expect(duplicateContradictions({ ...probe, dpeClass: 'C' }, row())).toEqual(
      []
    )
    expect(
      duplicateContradictions({ ...probe, constructionYear: 1990 }, row())
    ).toEqual(['Construit en 1975, pas en 1990'])
    expect(
      duplicateContradictions({ ...probe, constructionYear: 1977 }, row())
    ).toEqual([])
  })

  it('un fait inconnu d’un côté ne contredit rien', () => {
    expect(
      duplicateContradictions(
        { commune: 'Bordeaux', price: 199_000, surface: 62 },
        row()
      )
    ).toEqual([])
    expect(
      duplicateContradictions(
        probe,
        row({
          rooms: null,
          floor: null,
          dpeClass: null,
          constructionYear: null,
          surface: null,
        })
      )
    ).toEqual([])
  })

  it('même agence, autre référence : deux mandats, deux biens', () => {
    const tracked = row({
      sellerType: 'agency',
      sellerName: '[Exemple] Pierres Claires',
      sellerReference: 'EX-1102',
    })
    expect(
      duplicateContradictions(
        {
          ...probe,
          sellerName: 'Pierres Claires',
          reference: 'EX-1104',
          sellerType: 'agency',
        },
        tracked
      )
    ).toEqual([
      'Même agence (« [Exemple] Pierres Claires »), autre référence : EX-1102 contre EX-1104',
    ])
    // La même référence chez une autre de ses agences : pas de contradiction.
    expect(
      duplicateContradictions(
        { ...probe, sellerName: 'Agence du Lac', reference: 'L-4410' },
        {
          ...tracked,
          otherSellers: [
            {
              sellerName: '[Exemple] Agence du Lac',
              sellerReference: 'L 4410',
            },
            { sellerName: '[Exemple] Agence du Lac', sellerReference: 'L-9' },
          ],
        }
      )
    ).toEqual([])
    // Une autre agence, ou une référence absente, ne dit rien.
    expect(
      duplicateContradictions(
        { ...probe, sellerName: 'Agence du Lac', reference: 'L-4410' },
        tracked
      )
    ).toEqual([])
    expect(
      duplicateContradictions(
        { ...probe, sellerName: 'Pierres Claires' },
        tracked
      )
    ).toEqual([])
    expect(
      duplicateContradictions(
        { ...probe, sellerName: 'Pierres Claires', reference: 'EX-1104' },
        { ...tracked, sellerReference: null }
      )
    ).toEqual([])
    expect(
      duplicateContradictions(
        {
          ...probe,
          sellerName: 'Pierres Claires',
          reference: 'EX-1104',
          sellerType: 'private',
        },
        tracked
      )
    ).toEqual([])
    expect(
      duplicateContradictions(
        { ...probe, sellerName: 'Pierres Claires', reference: 'EX-1104' },
        { ...tracked, sellerType: 'private' }
      )
    ).toEqual([])
  })
})

describe('lieux éloignés', () => {
  it('measurableZone : une adresse ou une rue par son point, un quartier ou une commune par son contour', () => {
    expect(measurableZone('exact', false)).toBe(true)
    expect(measurableZone('street', false)).toBe(true)
    expect(measurableZone('district', true)).toBe(true)
    expect(measurableZone('commune', true)).toBe(true)
    // Le centre d'un quartier sans contour ne dit pas où est le bien.
    expect(measurableZone('district', false)).toBe(false)
    expect(measurableZone('commune', false)).toBe(false)
    expect(measurableZone(null, true)).toBe(false)
    expect(measurableZone(undefined, false)).toBe(false)
  })

  it('plus de 500 m entre les deux lieux : ce n’est pas le même bien', () => {
    expect(duplicateContradictions(probe, row(), 500)).toEqual([])
    expect(duplicateContradictions(probe, row(), 0)).toEqual([])
    expect(duplicateContradictions(probe, row(), 734)).toEqual([
      'Au moins 730 m entre les deux lieux',
    ])
    expect(duplicateContradictions(probe, row(), 2_440)).toEqual([
      'Au moins 2,4 km entre les deux lieux',
    ])
  })

  it('matchDuplicates lit l’écart de chaque annonce ; sans écart mesuré, rien ne change', () => {
    const near = row()
    const far = row({ id: 'bbbbbbbb-0000-4000-8000-000000000002' })
    const found = matchDuplicates(
      probe,
      [near, far],
      new Map(),
      new Map([
        [near.id, 0],
        [far.id, 1_800],
      ])
    )
    expect(found.map(c => c.listingId)).toEqual([near.id])
    expect(matchDuplicates(probe, [near, far])).toHaveLength(2)
  })

  it('un doublon certain (même lien) le reste, l’écart est dit', () => {
    const url = 'https://www.leboncoin.fr/ad/ventes_immobilieres/3100000002'
    const [candidate] = matchDuplicates(
      { url },
      [row({ url })],
      new Map(),
      new Map([[row().id, 900]])
    )
    expect(candidate?.certain).toBe(true)
    expect(candidate?.differences).toEqual([
      'Au moins 900 m entre les deux lieux',
    ])
  })
})

describe('duplicateDifferences', () => {
  it('un DPE voisin et un prix à plus de 5 % baissent le score', () => {
    expect(duplicateDifferences(probe, row())).toEqual([])
    expect(
      duplicateDifferences({ ...probe, dpeClass: 'E', price: 179_000 }, row())
    ).toEqual([
      { text: 'DPE D contre E', penalty: 0.15 },
      {
        text: `${formatEuros(199_000)} contre ${formatEuros(179_000)}`,
        penalty: 0.15,
      },
    ])
    expect(duplicateDifferences({ ...probe, price: 0 }, row())).toEqual([])
  })
})

describe('assessDuplicate', () => {
  it('une contradiction écarte un motif probable, et le dit', () => {
    const assessed = assessDuplicate({ ...probe, floor: 7 }, row(), undefined)
    expect(assessed.reasons).toEqual([])
    expect(assessed.contradictions).toEqual(['Au 2e étage, pas au 7e étage'])
    expect(matchDuplicates({ ...probe, floor: 7 }, [row()], new Map())).toEqual(
      []
    )
  })

  it('une petite différence baisse le score ; sous le minimum, rien', () => {
    const near = assessDuplicate({ ...probe, dpeClass: 'C' }, row(), undefined)
    expect(near.reasons.map(r => [r.kind, r.score])).toEqual([
      ['same_commune_price_surface', 0.65],
    ])
    expect(near.differences).toEqual(['DPE D contre C'])
    // DPE voisin et surface au bord de la tolérance : 0,8 − 0,1 − 0,15 − ε.
    const far = assessDuplicate(
      { ...probe, dpeClass: 'C', surface: 60.2, price: 190_000 },
      row(),
      undefined
    )
    expect(far.reasons).toEqual([])
    expect(far.differences).toEqual([])
  })

  it('un doublon certain le reste, ses contradictions sont dites', () => {
    const tracked = row({
      url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3100000001',
    })
    const assessed = assessDuplicate(
      {
        ...probe,
        rooms: 4,
        dpeClass: 'E',
        url: 'https://leboncoin.fr/ad/ventes_immobilieres/3100000001',
      },
      tracked,
      undefined
    )
    expect(assessed.reasons.map(r => r.kind)).toEqual([
      'same_url',
      'same_commune_price_surface',
    ])
    expect(assessed.differences).toEqual([
      '3 pièces contre 4',
      'DPE D contre E',
    ])
    const [candidate] = matchDuplicates(
      {
        url: 'https://leboncoin.fr/ad/ventes_immobilieres/3100000001',
        rooms: 4,
      },
      [tracked]
    )
    expect(candidate?.certain).toBe(true)
    expect(candidate?.differences).toEqual(['3 pièces contre 4'])
  })

  it('rien à juger sans motif', () => {
    expect(
      assessDuplicate(
        { commune: 'Pessac', price: 1, surface: 1 },
        row(),
        undefined
      )
    ).toEqual({ reasons: [], contradictions: [], differences: [] })
  })
})

describe('les cas d’un espace réel, en données fictives', () => {
  it('trois lots d’un même immeuble, même agence, trois références : aucun doublon', () => {
    const building = (ref: string, floor: number, price: number) =>
      row({
        id: `bbbbbbbb-0000-4000-8000-00000000010${floor}`,
        title: `[Exemple] T3 au ${floor}e`,
        addressRaw: '12 rue de l’Exemple, 33000 Bordeaux',
        locationPrecision: 'exact',
        surface: 57.4,
        price,
        floor,
        sellerType: 'agency',
        sellerName: '[Exemple] Pierres Claires',
        sellerReference: ref,
      })
    const rows = [
      building('EX-1102', 2, 151_000),
      building('EX-1104', 4, 168_000),
    ]
    expect(
      matchDuplicates(
        {
          address: '12 rue de l’Exemple',
          commune: 'Bordeaux',
          price: 166_000,
          surface: 57,
          floor: 8,
          rooms: 3,
          point: { type: 'Point', coordinates: [-0.6, 44.85] },
          precision: 'exact',
          sellerType: 'agency',
          sellerName: '[Exemple] Pierres Claires',
          reference: 'EX-1108',
        },
        rows,
        new Map(rows.map(r => [r.id, 0]))
      )
    ).toEqual([])
  })

  it('deux annonces au centre du même quartier, autres DPE : aucun doublon', () => {
    expect(
      duplicateReasons(
        {
          commune: 'Mérignac',
          price: 172_000,
          surface: 66,
          rooms: 3,
          dpeClass: 'E',
          point: { type: 'Point', coordinates: [-0.62, 44.83] },
          precision: 'district',
        },
        row({
          commune: 'Mérignac',
          price: 186_000,
          surface: 66.3,
          dpeClass: 'C',
          floor: null,
        }),
        0
      )
    ).toEqual([])
  })

  it('le même bien sur un autre portail, sans référence : bloqué à la création', () => {
    const tracked = row({
      commune: 'Mérignac',
      price: 205_000,
      surface: 61,
      floor: 1,
      dpeClass: 'C',
      constructionYear: null,
      locationPrecision: 'commune',
      sellerType: 'mandatary',
      sellerName: '[Exemple] Réseau Mandataires',
      sellerReference: '9900146',
    })
    const candidates = matchDuplicates(
      {
        commune: 'Mérignac',
        price: 205_000,
        surface: 61,
        rooms: 3,
        dpeClass: 'C',
        sellerType: 'agency',
        sellerName: '[Exemple] Agence du Parc',
        reference: 'EX-00990001',
        point: { type: 'Point', coordinates: [-0.62, 44.83] },
        precision: 'district',
      },
      [tracked]
    )
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.score).toBe(0.8)
    expect(candidates[0]?.certain).toBe(false)
    expect(blockingDuplicateOf(candidates)?.listingId).toBe(tracked.id)
  })
})

describe('les cas d’un espace réel, en données fictives (suite)', () => {
  it('deux T3 où tout concorde, l’un au centre d’un quartier, l’autre dans une rue à 2 km : aucun doublon', () => {
    const district = row({
      title: '[Exemple] T3 au centre d’un quartier',
      price: 189_800,
      surface: 58.4,
      floor: 1,
      constructionYear: null,
      sellerType: 'agency',
      sellerName: '[Exemple] Agence A',
    })
    const street = {
      commune: 'Bordeaux',
      price: 189_500,
      surface: 58.2,
      rooms: 3,
      floor: 1,
      dpeClass: 'D' as const,
      constructionYear: 1955,
      address: 'Rue de l’Exemple, 33000 Bordeaux',
      point: {
        type: 'Point' as const,
        coordinates: [-0.59, 44.85] as [number, number],
      },
      precision: 'street' as const,
      sellerType: 'agency' as const,
      sellerName: '[Exemple] Agence B',
      reference: 'EX-7731',
    }
    // Sans l'écart des lieux, tout concorde : bloqué.
    expect(blockingDuplicateOf(matchDuplicates(street, [district]))).not.toBe(
      null
    )
    expect(
      matchDuplicates(
        street,
        [district],
        new Map(),
        new Map([[district.id, 2_100]])
      )
    ).toEqual([])
  })
})

describe('blockingDuplicateOf', () => {
  it('un doublon probable à partir du seuil, jamais un certain', () => {
    const at = (score: number, certain = false) => ({ score, certain })
    expect(blockingDuplicateOf([at(1, true), at(0.69)])).toBeNull()
    expect(blockingDuplicateOf([at(DUPLICATE_SCORES.blocking)])).toEqual(
      at(DUPLICATE_SCORES.blocking)
    )
    expect(blockingDuplicateOf([])).toBeNull()
  })
})

describe('linkIdentity', () => {
  it('les deux formes d’une page Bien’ici n’en font qu’une', () => {
    const short = 'https://www.bienici.com/annonce/exemple-1-9900146'
    const long =
      'https://www.bienici.com/annonce/vente/merignac/appartement/3pieces/exemple-1-9900146?q=x'
    expect(linkIdentity(long)).toBe(
      'https://bienici.com/annonce/exemple-1-9900146'
    )
    expect(linkIdentity(short)).toBe(linkIdentity(long))
    expect(
      rowLinkKeys({
        url: null,
        links: ['https://bienici.com/annonce/exemple-1-9900146'],
      }).has(linkIdentity(long) ?? '')
    ).toBe(true)
    expect(
      duplicateReasons({ url: long }, row({ url: short }), undefined).map(
        r => r.kind
      )
    ).toEqual(['same_url'])
  })

  it('ailleurs, la clé du lien telle quelle', () => {
    expect(linkIdentity('https://www.exemple.invalid/annonce/1/')).toBe(
      'https://exemple.invalid/annonce/1'
    )
    expect(
      linkIdentity('https://www.bienici.com/recherche/achat/bordeaux')
    ).toBe('https://bienici.com/recherche/achat/bordeaux')
    expect(linkIdentity('  ')).toBeNull()
    expect(linkIdentity(null)).toBeNull()
  })
})

describe('référence chez une autre agence', () => {
  it('une référence courte chez une autre agence n’est qu’une coïncidence', () => {
    const tracked = row({
      commune: 'Pessac',
      sellerType: 'agency',
      sellerName: '[Exemple] Agence A',
      sellerReference: '216',
    })
    expect(
      duplicateReasons(
        { sellerName: '[Exemple] Agence B', reference: '216' },
        tracked,
        undefined
      )
    ).toEqual([])
    expect(
      duplicateReasons(
        { sellerName: '[Exemple] Agence A', reference: '216' },
        tracked,
        undefined
      ).map(r => r.kind)
    ).toEqual(['same_reference'])
  })
})
