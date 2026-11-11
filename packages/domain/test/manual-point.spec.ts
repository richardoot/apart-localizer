/**
 * ADR 0040 : un point saisi garde sa place, l'adresse donne le code INSEE,
 * et l'identifiant BAN et l'adresse normalisée quand elle est près du point.
 * Adresses et identifiants fictifs.
 */
import { describe, expect, it } from 'vitest'
import { MANUAL_POINT_ADDRESS_TOLERANCE_METERS } from '@apart/contracts'
import type { Point } from '@apart/contracts'
import { addressFieldsForManualPoint } from '../src/index.js'
import type { GeocodedAddressFacts } from '../src/index.js'

const at = (lng: number, lat: number): Point => ({
  type: 'Point',
  coordinates: [lng, lat],
})

const POINT = at(-0.58, 44.84)

const located = (
  over: Partial<GeocodedAddressFacts> = {}
): GeocodedAddressFacts => ({
  point: at(-0.5801, 44.8401),
  precision: 'exact',
  addressNormalized: '1 Rue Fictive 33000 Bordeaux',
  banId: '33063_9999_00001',
  commune: 'Bordeaux',
  inseeCode: '33063',
  ...over,
})

describe('addressFieldsForManualPoint', () => {
  it('près du point, au numéro : BAN, adresse normalisée et INSEE', () => {
    expect(
      addressFieldsForManualPoint(
        { point: POINT, commune: 'Bordeaux' },
        located()
      )
    ).toEqual({
      fields: {
        addressNormalized: '1 Rue Fictive 33000 Bordeaux',
        banId: '33063_9999_00001',
        inseeCode: '33063',
        commune: 'Bordeaux',
      },
      keys: ['inseeCode', 'addressNormalized', 'banId'],
    })
  })

  it('à la rue, près du point : gardé aussi', () => {
    const result = addressFieldsForManualPoint(
      { point: POINT, commune: 'Bordeaux' },
      located({ precision: 'street' })
    )
    expect(result.fields.banId).toBe('33063_9999_00001')
  })

  it('loin du point : seul le code INSEE est gardé', () => {
    // ~800 m à l'est.
    const result = addressFieldsForManualPoint(
      { point: POINT, commune: 'Bordeaux' },
      located({ point: at(-0.57, 44.84) })
    )
    expect(result.fields).toEqual({
      addressNormalized: null,
      banId: null,
      inseeCode: '33063',
      commune: 'Bordeaux',
    })
    expect(result.keys).toEqual(['inseeCode'])
  })

  it('la limite est la tolérance nommée', () => {
    expect(MANUAL_POINT_ADDRESS_TOLERANCE_METERS).toBe(150)
    // ~111 m au nord : dedans à 150 m, dehors à 100 m.
    const north = located({ point: at(-0.58, 44.841) })
    expect(
      addressFieldsForManualPoint({ point: POINT, commune: null }, north).fields
        .banId
    ).toBe('33063_9999_00001')
    expect(
      addressFieldsForManualPoint({ point: POINT, commune: null }, north, 100)
        .fields.banId
    ).toBeNull()
  })

  it('au quartier ou à la commune : ni BAN ni adresse normalisée', () => {
    for (const precision of ['district', 'commune'] as const) {
      const result = addressFieldsForManualPoint(
        { point: POINT, commune: 'Bordeaux' },
        located({ precision, point: POINT })
      )
      expect(result.fields.banId).toBeNull()
      expect(result.fields.inseeCode).toBe('33063')
    }
  })

  it('complète la commune seulement si elle manquait', () => {
    const missing = addressFieldsForManualPoint(
      { point: POINT, commune: null },
      located()
    )
    expect(missing.fields.commune).toBe('Bordeaux')
    expect(missing.keys).toContain('commune')
    const given = addressFieldsForManualPoint(
      { point: POINT, commune: 'Talence' },
      located()
    )
    expect(given.fields.commune).toBe('Talence')
    expect(given.keys).not.toContain('commune')
  })

  it('sans réponse du géocodeur, ou sans point : tout vide, aucune clé', () => {
    const empty = {
      fields: {
        addressNormalized: null,
        banId: null,
        inseeCode: null,
        commune: 'Bordeaux',
      },
      keys: [],
    }
    expect(
      addressFieldsForManualPoint({ point: POINT, commune: 'Bordeaux' }, null)
    ).toEqual(empty)
    expect(
      addressFieldsForManualPoint(
        { point: null, commune: 'Bordeaux' },
        located()
      )
    ).toEqual(empty)
  })

  it('une réponse sans identifiant ne pose pas de clé vide', () => {
    const result = addressFieldsForManualPoint(
      { point: POINT, commune: 'Bordeaux' },
      located({ banId: null, addressNormalized: null, inseeCode: null })
    )
    expect(result.keys).toEqual([])
  })
})
