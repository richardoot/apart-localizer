import { describe, expect, it } from 'vitest'
import {
  JUDGEMENT_DESCRIPTIONS,
  JUDGEMENT_KEYS,
  JUDGEMENT_LABELS,
  JUDGEMENT_SHORT_LABELS,
  LISTING_COVERS_MAX,
  ListingCoverInputSchema,
  ListingCoverSchema,
  ListingCoversQuerySchema,
  glossaryEntry,
} from '../src/index.js'

const ID = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'

describe('Lot 25 : trois jugements étiquetés', () => {
  it('toujours dans le même ordre : rentabilité, recherche, location', () => {
    expect(JUDGEMENT_KEYS).toEqual(['profitability', 'search', 'rental'])
    expect(JUDGEMENT_KEYS.map(k => JUDGEMENT_LABELS[k])).toEqual([
      'Rentabilité',
      'Recherche',
      'Location',
    ])
  })

  it('une forme courte et une description pour chacun', () => {
    for (const key of JUDGEMENT_KEYS) {
      expect(JUDGEMENT_SHORT_LABELS[key].length).toBeLessThan(
        JUDGEMENT_LABELS[key].length
      )
      expect(JUDGEMENT_DESCRIPTIONS[key]).toMatch(
        new RegExp(`^${JUDGEMENT_LABELS[key]} : `)
      )
    }
  })
})

describe('Lot 25 : la photo de couverture', () => {
  it('lit les identifiants séparés par des virgules', () => {
    expect(ListingCoversQuerySchema.parse({ ids: `${ID}, ${ID2},` })).toEqual({
      ids: [ID, ID2],
    })
  })

  it('refuse un identifiant illisible et plus de 200 annonces', () => {
    expect(() => ListingCoversQuerySchema.parse({ ids: 'abc' })).toThrow()
    const many = Array.from({ length: LISTING_COVERS_MAX + 1 }, () => ID)
    expect(() =>
      ListingCoversQuerySchema.parse({ ids: many.join(',') })
    ).toThrow()
  })

  it('choisir une photo ou revenir à la première', () => {
    expect(ListingCoverInputSchema.parse({ photoId: ID })).toEqual({
      photoId: ID,
    })
    expect(ListingCoverInputSchema.parse({ photoId: null })).toEqual({
      photoId: null,
    })
    expect(() => ListingCoverInputSchema.parse({})).toThrow()
  })

  it('une couverture sans URL quand le stockage ne répond pas', () => {
    expect(
      ListingCoverSchema.parse({
        listingId: ID,
        photoId: ID2,
        visitId: ID,
        thumbnailUrl: null,
        urlExpiresAt: null,
        chosen: false,
      }).thumbnailUrl
    ).toBeNull()
  })
})

describe('Lot 25 : TRI, VAN et cash-flow ont leur définition courte', () => {
  it.each(['irr', 'npv', 'cash_flow_after_tax'])('%s', key => {
    expect(glossaryEntry(key)?.short).toBeTruthy()
  })
})
