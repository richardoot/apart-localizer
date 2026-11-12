/**
 * Lot 31 (ADR 0044) : deux brouillons du même bien fusionnés (le gardé
 * l'emporte, ses vides se complètent), la recherche texte des brouillons et
 * les phrases du journal. Données fictives.
 */
import { describe, expect, it } from 'vitest'
import { ListingInputSchema } from '@apart/contracts'
import type { ListingInput } from '@apart/contracts'
import {
  describeActivity,
  draftMatchesSearch,
  draftMergePlan,
  mergedDraftReason,
} from '../src/index.js'

const input = (over: Record<string, unknown> = {}): ListingInput =>
  ListingInputSchema.parse({
    title: '[Exemple] T3 Bacalan 62 m²',
    price: 172_000,
    surface: 62,
    rooms: 3,
    location: { commune: 'Bordeaux', district: 'Bacalan' },
    ...over,
  })

type ActivityInput = Parameters<typeof describeActivity>[0]

describe('Lot 31 : fusionner deux brouillons', () => {
  it('le gardé l’emporte ; ses vides se complètent, avec la provenance de l’autre', () => {
    const keep = input({ floor: null, dpeClass: 'C' })
    const other = input({
      floor: 4,
      dpeClass: 'D',
      surface: 63,
      fieldSources: { floor: { source: 'ai', confidence: 0.9 } },
    })
    const plan = draftMergePlan(keep, other)
    expect(plan.input.floor).toBe(4)
    expect(plan.input.dpeClass).toBe('C')
    expect(plan.input.surface).toBe(62)
    expect(plan.input.fieldSources.floor).toMatchObject({ source: 'ai' })
    expect(plan.fills.map(f => f.field)).toEqual(['floor'])
    expect(plan.differences.map(f => f.field)).toEqual(
      expect.arrayContaining(['surface', 'dpeClass'])
    )
  })

  it('prix, localisation et vendeur seulement quand le gardé ne les connaît pas', () => {
    const keep = input({
      price: 0,
      location: { commune: null },
      sellerType: 'unknown',
    })
    const other = input({
      price: 169_000,
      location: { commune: 'Bordeaux', addressRaw: '1 rue Fictive' },
      sellerType: 'agency',
      sellerName: '[Exemple] Agence du Port',
      sellerReference: 'EX-3101',
    })
    const plan = draftMergePlan(keep, other)
    expect(plan.input.price).toBe(169_000)
    expect(plan.input.location.addressRaw).toBe('1 rue Fictive')
    expect(plan.input).toMatchObject({
      sellerType: 'agency',
      sellerName: '[Exemple] Agence du Port',
      sellerReference: 'EX-3101',
    })
    expect(plan.fills.map(f => f.field)).toEqual(
      expect.arrayContaining(['price', 'commune', 'sellerName'])
    )

    const known = draftMergePlan(input({ sellerType: 'private' }), other)
    expect(known.input.price).toBe(172_000)
    expect(known.input.location.commune).toBe('Bordeaux')
    expect(known.input.location.addressRaw).toBeNull()
    expect(known.input.sellerType).toBe('private')
  })

  it('la raison d’écart du brouillon absorbé', () => {
    expect(mergedDraftReason('[Exemple] T3 Bacalan')).toBe(
      'Doublon du brouillon « [Exemple] T3 Bacalan » (brouillons fusionnés)'
    )
  })
})

describe('Lot 31 : chercher un brouillon', () => {
  const draft = {
    listing: input({
      sellerName: '[Exemple] Agence du Port',
      sellerReference: 'EX-31 01',
    }),
    url: 'https://www.bienici.com/annonce/exemple-9900201',
    dismissReason: 'Trop loin du tram',
  }

  it('chaque mot dans le titre, la localisation, l’agence, la référence, le lien ou la raison', () => {
    expect(draftMatchesSearch(draft, null)).toBe(true)
    expect(draftMatchesSearch(draft, '  ')).toBe(true)
    expect(draftMatchesSearch(draft, 'bacalan TRAM')).toBe(true)
    expect(draftMatchesSearch(draft, 'agence port')).toBe(true)
    expect(draftMatchesSearch(draft, 'EX3101')).toBe(true)
    expect(draftMatchesSearch(draft, '9900201')).toBe(true)
    expect(draftMatchesSearch(draft, 'bacalan chartrons')).toBe(false)
  })

  it('sans accents ni casse', () => {
    expect(
      draftMatchesSearch(
        { ...draft, listing: input({ location: { commune: 'Mérignac' } }) },
        'merignac'
      )
    ).toBe(true)
  })
})

describe('Lot 31 : le journal des brouillons', () => {
  it('une correction dit les champs corrigés', () => {
    const line = describeActivity({
      action: 'draft.updated',
      before: null,
      after: {
        origin: 'exploration',
        title: '[Exemple] T3 Bacalan',
        fields: ['price', 'floor'],
      },
    } as ActivityInput)
    expect(line.summary).toBe(
      'a corrigé une annonce trouvée par Claude « [Exemple] T3 Bacalan » : Prix, Étage'
    )
    const bare = describeActivity({
      action: 'draft.updated',
      before: null,
      after: { origin: 'email' },
    } as ActivityInput)
    expect(bare.summary).toBe('a corrigé une annonce reçue par e-mail')
  })

  it('une fusion de brouillons nomme les deux', () => {
    const line = describeActivity({
      action: 'draft.absorbed',
      before: null,
      after: {
        origin: 'exploration',
        absorbedTitle: '[Exemple] Appartement 3 pièces',
        keptTitle: '[Exemple] T3 Bacalan',
      },
    } as ActivityInput)
    expect(line.summary).toBe(
      'a fusionné une annonce trouvée par Claude « [Exemple] Appartement 3 pièces » dans le brouillon « [Exemple] T3 Bacalan » (même bien)'
    )
  })
})
