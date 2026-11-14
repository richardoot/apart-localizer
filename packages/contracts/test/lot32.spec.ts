/**
 * Lot 32 (ADR 0047) : photos du portail (liens https, trente au plus), et
 * tout ce que la page de l'annonce donne, relevé à l'exploration. Données
 * fictives.
 */
import { describe, expect, it } from 'vitest'
import {
  CANDIDATE_PAGE_FIELDS,
  EXPLORATION_DESCRIPTION_MAX,
  ExplorationCandidateSchema,
  LISTING_FIELD_LABELS,
  ListingInputSchema,
  ListingUpdateSchema,
  PORTAL_PHOTOS_MAX,
  PortalPhotosSchema,
} from '../src/index.js'

const photo = (n: number) => `https://img.example.test/annonce/${n}.jpg`

describe('photos du portail', () => {
  it('accepte des liens https, dans l’ordre', () => {
    expect(PortalPhotosSchema.parse([photo(1), photo(2)])).toEqual([
      photo(1),
      photo(2),
    ])
  })

  it('refuse un lien http, un texte et plus de trente photos', () => {
    expect(
      PortalPhotosSchema.safeParse(['http://img.example.test/1.jpg']).success
    ).toBe(false)
    expect(PortalPhotosSchema.safeParse(['pas un lien']).success).toBe(false)
    const many = Array.from({ length: PORTAL_PHOTOS_MAX + 1 }, (_, i) =>
      photo(i)
    )
    expect(PortalPhotosSchema.safeParse(many).success).toBe(false)
  })

  it('une fiche sans photo en a une liste vide ; la mise à jour ne la touche pas', () => {
    const input = ListingInputSchema.parse({ title: 'T2 fictif', price: 1 })
    expect(input.portalPhotos).toEqual([])
    expect(ListingUpdateSchema.parse({ title: 'x' })).not.toHaveProperty(
      'portalPhotos'
    )
    expect(
      ListingUpdateSchema.parse({ portalPhotos: [photo(1)] }).portalPhotos
    ).toEqual([photo(1)])
    expect(LISTING_FIELD_LABELS.portalPhotos).toBe('Photos du portail')
  })
})

describe('annonce lue sur sa page (exploration)', () => {
  const base = {
    url: 'https://www.example.test/annonce/1',
    portal: 'leboncoin' as const,
  }

  it('reprend les champs de la fiche, chacun facultatif', () => {
    const parsed = ExplorationCandidateSchema.parse({
      ...base,
      opened: true,
      description: 'Bel appartement fictif.',
      photos: [photo(1)],
      floor: 3,
      floorsTotal: 5,
      elevator: true,
      heatingType: 'gaz',
      heatingCollective: false,
      constructionYear: 1975,
      gesClass: 'D',
      dpeConsumption: 180,
      lotsCount: 40,
      feesPercent: 0.04,
      feesPayer: 'buyer',
    })
    expect(parsed.floor).toBe(3)
    expect(parsed.photos).toEqual([photo(1)])
    expect(ExplorationCandidateSchema.parse(base)).not.toHaveProperty('floor')
    expect(CANDIDATE_PAGE_FIELDS).toContain('lotsCount')
  })

  it('refuse une description trop longue et les clés inconnues', () => {
    expect(
      ExplorationCandidateSchema.safeParse({
        ...base,
        description: 'x'.repeat(EXPLORATION_DESCRIPTION_MAX + 1),
      }).success
    ).toBe(false)
    expect(
      ExplorationCandidateSchema.safeParse({ ...base, photoCount: 3 }).success
    ).toBe(false)
  })
})
