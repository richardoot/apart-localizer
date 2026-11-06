/**
 * Reconnaître la même annonce (lot 2, déplacé de l'API dans domain au lot
 * 18) : même lien, même adresse, même commune avec surface et prix proches,
 * voisinage à 50 m. Les motifs du lot 18 (référence, tous les liens) sont
 * dans lot18-listing-links.spec.ts. Données fictives.
 */
import { describe, expect, it } from 'vitest'
import { addressKey, duplicateReasons, matchDuplicates } from '../src/index.js'
import type { DuplicateRow } from '../src/index.js'

const row = (over: Partial<DuplicateRow> = {}): DuplicateRow => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  title: 'T2 Forum',
  status: 'to_study',
  price: 189_000,
  surface: 45,
  commune: 'Talence',
  url: 'https://www.exemple.invalid/annonce/1?utm_source=x',
  addressRaw: '12 rue du Forum',
  addressNormalized: '12 Rue du Forum 33400 Talence',
  ...over,
})

describe('duplicateReasons', () => {
  it('même lien, à la normalisation près', () => {
    const reasons = duplicateReasons(
      { url: 'https://exemple.invalid/annonce/1/' },
      row(),
      undefined
    )
    expect(reasons).toEqual([
      {
        kind: 'same_url',
        score: 1,
        detail: 'Même lien : https://exemple.invalid/annonce/1',
      },
    ])
  })

  it('même adresse, écrite autrement, sauf si les communes diffèrent', () => {
    expect(
      duplicateReasons(
        { address: 'Talence, 12 R. du Forum' },
        row(),
        undefined
      ).map(r => r.kind)
    ).toEqual(['same_address'])
    expect(
      duplicateReasons(
        { address: '12 rue du Forum 33400 Talence', commune: 'Talence' },
        row({ addressRaw: null }),
        undefined
      ).map(r => r.kind)
    ).toEqual(['same_address'])
    expect(
      duplicateReasons(
        { address: '12 rue du Forum', commune: 'Pessac' },
        row(),
        undefined
      )
    ).toEqual([])
  })

  it('même commune, surface à ±3 % et prix à ±5 %', () => {
    const match = duplicateReasons(
      { commune: 'talence', price: 195_000, surface: 46 },
      row(),
      undefined
    )
    expect(match.map(r => r.kind)).toEqual(['same_commune_price_surface'])
    expect(match[0]?.detail).toContain('Talence')
    expect(
      duplicateReasons(
        { commune: 'Talence', price: 195_000, surface: 48 },
        row(),
        undefined
      )
    ).toEqual([])
    expect(
      duplicateReasons(
        { commune: 'Talence', price: 210_000, surface: 45 },
        row(),
        undefined
      )
    ).toEqual([])
  })

  it('voisinage à moins de 50 m avec surface proche', () => {
    expect(
      duplicateReasons(
        { surface: 44, point: { type: 'Point', coordinates: [0, 0] } },
        row(),
        32
      ).map(r => r.kind)
    ).toEqual(['nearby_similar'])
    expect(duplicateReasons({ surface: 44 }, row(), 80)).toEqual([])
    expect(duplicateReasons({ surface: 60 }, row(), 10)).toEqual([])
    expect(
      duplicateReasons({ surface: 44 }, row({ surface: null }), 10)
    ).toEqual([])
  })
})

describe('addressKey', () => {
  it('les mots de la commune ne comptent pas', () => {
    expect(addressKey('12 rue du Forum, 33400 Talence', 'Talence')).toBe(
      addressKey('12 rue du Forum', null)
    )
    expect(addressKey('Talence', 'Talence')).toBeNull()
    expect(addressKey(null, 'Talence')).toBeNull()
  })
})

describe('matchDuplicates', () => {
  it('un candidat par annonce, tous ses motifs, trié par score, l’annonce sondée exclue', () => {
    const rows = [
      row(),
      row({
        id: 'aaaaaaaa-0000-4000-8000-000000000002',
        title: 'T2 voisin',
        url: null,
        addressRaw: null,
        addressNormalized: null,
        price: 192_000,
        surface: 45.5,
      }),
      row({
        id: 'aaaaaaaa-0000-4000-8000-000000000003',
        title: 'Lui-même',
      }),
    ]
    const candidates = matchDuplicates(
      {
        listingId: 'aaaaaaaa-0000-4000-8000-000000000003',
        url: 'https://exemple.invalid/annonce/1',
        address: '12 rue du Forum',
        commune: 'Talence',
        price: 189_000,
        surface: 45,
      },
      rows,
      new Map([['aaaaaaaa-0000-4000-8000-000000000002', 20]])
    )
    expect(candidates.map(c => c.title)).toEqual(['T2 Forum', 'T2 voisin'])
    expect(candidates[0]?.score).toBe(1)
    expect(candidates[0]?.reasons.map(r => r.kind)).toEqual([
      'same_url',
      'same_address',
      'same_commune_price_surface',
    ])
    expect(candidates[1]?.score).toBe(0.8)
    expect(candidates[1]?.reasons.map(r => r.kind)).toEqual([
      'same_commune_price_surface',
      'nearby_similar',
    ])
  })

  it('rien quand rien ne ressemble', () => {
    expect(
      matchDuplicates({ url: 'https://autre.invalid/x' }, [row()])
    ).toEqual([])
  })
})
