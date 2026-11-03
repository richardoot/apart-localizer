import { describe, expect, it } from 'vitest'
import { parserDraft } from './inbound.service'

describe('analyseur simple des alertes', () => {
  it('fait une fiche avec ce que dit le texte, en provenance « annonce »', () => {
    const { input, warnings } = parserDraft(
      {
        url: 'https://www.pap.fr/annonces/appartement-bordeaux-r412345678',
        source: 'pap',
        snippet: 'T2 Bordeaux 38 m² 172 000 €',
        title: 'T2 Bordeaux 38 m²',
        price: 172_000,
        surface: 38,
        rooms: 2,
        commune: 'Bordeaux',
      },
      'Alerte PAP'
    )
    expect(input).toMatchObject({
      title: 'T2 Bordeaux 38 m²',
      source: 'pap',
      price: 172_000,
      surface: 38,
      rooms: 2,
      location: { commune: 'Bordeaux' },
      sourceText: 'T2 Bordeaux 38 m² 172 000 €',
    })
    expect(Object.keys(input.fieldSources).sort()).toEqual([
      'commune',
      'price',
      'rooms',
      'surface',
    ])
    expect(warnings).toHaveLength(1)
  })

  it('signale un prix à compléter et prend le sujet faute de titre', () => {
    const { input, warnings } = parserDraft(
      {
        url: 'https://www.seloger.com/annonces/123456789.htm',
        source: 'seloger',
        snippet: '',
        title: null,
        price: null,
        surface: null,
        rooms: null,
        commune: null,
      },
      'Nouvelle annonce'
    )
    expect(input.title).toBe('Nouvelle annonce')
    expect(input.price).toBe(0)
    expect(input.fieldSources).toEqual({})
    expect(warnings).toContain('Prix à compléter.')
    expect(
      parserDraft(
        {
          url: 'https://www.seloger.com/annonces/123456789.htm',
          source: 'seloger',
          snippet: '',
          title: null,
          price: null,
          surface: null,
          rooms: null,
          commune: null,
        },
        '  '
      ).input.title
    ).toBe('Annonce seloger')
  })
})
