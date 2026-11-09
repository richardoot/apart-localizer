import { describe, expect, it } from 'vitest'
import type { ActivityEntry, ListingCheck, PriceEvent } from '@apart/contracts'
import { MEMBERS, fakeLink, fakeListing } from '@/test/fixtures'
import {
  TIMELINE_FILTERS,
  aiFieldCount,
  checkText,
  filterTimeline,
  historyFooter,
  journalKind,
  journalWho,
  listingOrigin,
  listingTimeline,
  priceEventText,
  timelineCounts,
  timelineDay,
} from './listing-timeline'

/** Espaces fines et insécables des montants ramenées à des espaces. */
const n = (value: string): string => value.replace(/[\u202f\u00a0]/g, ' ')
const LISTING = '11111111-1111-4111-8111-111111111111'

function journal(over: Partial<ActivityEntry>): ActivityEntry {
  return {
    id: crypto.randomUUID(),
    createdAt: '2026-11-02T10:00:00.000Z',
    action: 'listing.updated',
    kind: 'listing',
    channel: 'web',
    channelLabel: 'Web',
    actor: {
      id: MEMBERS[0]?.id ?? '',
      handle: 'richard',
      displayName: 'Richard',
    },
    listing: { id: LISTING, title: 'T2 fictif' },
    summary: 'a modifié l’annonce',
    changes: [],
    ...over,
  } as ActivityEntry
}

function check(over: Partial<ListingCheck>): ListingCheck {
  return {
    id: crypto.randomUUID(),
    listingId: LISTING,
    checkedAt: '2026-11-06T09:00:00.000Z',
    authorId: MEMBERS[0]?.id ?? null,
    channel: 'mcp',
    outcome: 'unchanged',
    changes: [],
    summary: 'Inchangée',
    evidence: null,
    checkedUrl: null,
    linkedListing: null,
    suggestedStatus: null,
    link: null,
    ...over,
  }
}

function price(over: Partial<PriceEvent>): PriceEvent {
  return {
    id: crypto.randomUUID(),
    listingId: LISTING,
    occurredAt: '2026-10-12T09:00:00.000Z',
    oldPrice: 220_000,
    newPrice: 214_000,
    source: 'listing',
    ...over,
  }
}

const names = new Map(MEMBERS.map(m => [m.id, { displayName: m.displayName }]))

describe('Historique (lot 19) : une seule chronologie', () => {
  it('fusionne journal, vérifications, prix et adéquation ; retire les doublons ; du plus récent au plus ancien', () => {
    const linkAdded = check({
      outcome: 'link_added',
      checkedAt: '2026-11-03T10:00:00.000Z',
      summary: 'Lien SeLoger ajouté : 219 000 €',
      link: {
        id: 'ffffffff-ffff-4fff-8fff-ffffffffff02',
        portal: 'seloger',
        url: 'https://www.seloger.com/annonces/0000000202.htm',
      },
    })
    const entries = listingTimeline({
      journal: [
        journal({
          action: 'agency_request.sent',
          kind: 'agency',
          createdAt: '2026-11-04T09:00:00.000Z',
          summary: 'a noté l’envoi du message à l’annonceur',
        }),
        // Remplacé par la vérification détaillée.
        journal({
          action: 'listing.checked',
          kind: 'check',
          createdAt: '2026-11-06T09:00:00.000Z',
        }),
        // Remplacé par l'historique des prix.
        journal({
          action: 'listing.price_changed',
          kind: 'price',
          createdAt: '2026-10-12T09:00:00.000Z',
        }),
        // Remplacé par l'historique de l'adéquation.
        journal({
          action: 'criteria.matched',
          kind: 'criteria',
          createdAt: '2026-10-09T09:00:00.000Z',
        }),
        // Déjà dit par la vérification « Lien ajouté ».
        journal({
          action: 'listing_link.added',
          kind: 'link',
          createdAt: '2026-11-03T10:00:20.000Z',
        }),
        journal({
          action: 'offer.created',
          kind: 'offer',
          createdAt: '2026-11-05T09:00:00.000Z',
          summary: 'a enregistré une offre',
          channel: 'mcp',
          channelLabel: 'MCP (Claude)',
        }),
        journal({
          action: 'listing.created',
          kind: 'listing',
          createdAt: '2026-10-08T09:00:00.000Z',
          summary: 'a ajouté l’annonce',
          changes: [
            {
              field: 'status',
              label: 'Statut',
              before: null,
              after: 'À étudier',
            },
          ],
        }),
      ],
      checks: [check({ checkedAt: '2026-11-06T09:00:00.000Z' }), linkAdded],
      priceEvents: [
        price({}),
        price({
          occurredAt: '2026-09-20T09:00:00.000Z',
          oldPrice: null,
          newPrice: 220_000,
        }),
      ],
      fitHistory: [
        {
          at: '2026-10-09T09:00:00.000Z',
          what: 'Entrée dans « [Exemple] Caudéran T3 »',
          why: '',
        },
        { at: '2026-10-08T09:00:00.000Z', what: 'Enregistrée', why: '' },
      ],
      memberNames: names,
    })
    expect(entries.map(e => [e.source, e.kind, e.at.slice(0, 10)])).toEqual([
      ['check', 'check', '2026-11-06'],
      ['journal', 'price', '2026-11-05'],
      ['journal', 'talk', '2026-11-04'],
      ['check', 'check', '2026-11-03'],
      ['price', 'price', '2026-10-12'],
      ['fit', 'edit', '2026-10-09'],
      ['journal', 'edit', '2026-10-08'],
      ['price', 'price', '2026-09-20'],
    ])
    expect(entries[0]).toMatchObject({
      text: 'Inchangée',
      who: 'Claude (MCP, pour Richard)',
    })
    expect(entries[1]).toMatchObject({
      text: 'Claude pour Richard a enregistré une offre',
      who: 'MCP (Claude)',
    })
    expect(entries[3]?.who).toBe('Claude (MCP, pour Richard) · sur SeLoger')
    expect(n(entries[4]?.text ?? '')).toBe(
      'Baisse de prix : 220 000 € → 214 000 € (−6 000 €)'
    )
    expect(entries[4]?.who).toBe('lu sur l’annonce')
    expect(entries[5]).toMatchObject({
      text: 'Entrée dans « [Exemple] Caudéran T3 »',
      who: 'calcul automatique de l’adéquation',
    })
    expect(entries[6]?.text).toBe('Richard a ajouté l’annonce')
    expect(n(entries[7]?.text ?? '')).toBe('Premier prix : 220 000 €')
  })

  it('un lien ajouté sans vérification reste ; un doublon de clé ne compte qu’une fois', () => {
    const entry = journal({
      action: 'listing_link.added',
      kind: 'link',
      summary: 'a ajouté un lien',
    })
    const entries = listingTimeline({
      journal: [entry, entry],
      checks: [],
      priceEvents: [],
      fitHistory: [],
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.kind).toBe('check')
  })

  it('types, filtres et comptes', () => {
    expect(journalKind({ kind: 'offer' })).toBe('price')
    expect(journalKind({ kind: 'price' })).toBe('price')
    expect(journalKind({ kind: 'link' })).toBe('check')
    expect(journalKind({ kind: 'check' })).toBe('check')
    expect(journalKind({ kind: 'agency' })).toBe('talk')
    expect(journalKind({ kind: 'status' })).toBe('edit')
    expect(journalKind({ kind: 'visit' })).toBe('edit')
    // Lot 20 : les avis ont leur type et leur filtre.
    expect(journalKind({ kind: 'opinion' })).toBe('opinion')
    expect(TIMELINE_FILTERS.map(f => f.label)).toEqual([
      'Tout',
      'Prix',
      'Vérifications',
      'Échanges',
      'Avis',
      'Fiche',
    ])
    const entries = listingTimeline({
      journal: [
        journal({ kind: 'agency', action: 'contact.updated' }),
        journal({
          id: '99999999-9999-4999-8999-999999999901',
          kind: 'opinion',
          action: 'opinion.created',
          summary:
            'a donné son avis : 3/5, 7 critères. Deux désaccords avec Richard : calme, on s’y voit.',
        }),
      ],
      checks: [check({})],
      priceEvents: [price({})],
      fitHistory: [],
    })
    expect(timelineCounts(entries)).toEqual({
      all: 4,
      price: 1,
      check: 1,
      talk: 1,
      opinion: 1,
      edit: 0,
    })
    expect(filterTimeline(entries, 'talk')).toHaveLength(1)
    expect(filterTimeline(entries, 'opinion').map(e => e.text)).toEqual([
      expect.stringContaining(
        'a donné son avis : 3/5, 7 critères. Deux désaccords avec Richard'
      ),
    ])
    expect(filterTimeline(entries, 'edit')).toEqual([])
    expect(filterTimeline(entries, 'all')).toHaveLength(4)
  })

  it('qui, textes des prix et des vérifications', () => {
    expect(journalWho(journal({ channel: 'mcp', actor: null }))).toBe('Claude')
    expect(
      journalWho(
        journal({ channel: 'import', channelLabel: 'Import', actor: null })
      )
    ).toBe('Import')
    expect(n(priceEventText({ oldPrice: 200_000, newPrice: 205_000 }))).toBe(
      'Hausse de prix : 200 000 € → 205 000 € (+5 000 €)'
    )
    expect(n(priceEventText({ oldPrice: 200_000, newPrice: 200_000 }))).toBe(
      'Prix confirmé : 200 000 € → 200 000 €'
    )
    expect(
      checkText({
        summary: 'Mise à jour',
        changes: [
          {
            field: 'price',
            label: 'Prix',
            before: 1,
            after: 2,
            disposition: 'applied',
            text: 'Prix 215 000 € → 205 000 €',
          },
          {
            field: 'annualCharges',
            label: 'Charges',
            before: 1,
            after: 2,
            disposition: 'applied',
            text: 'Charges 1 320 € → 1 440 €',
          },
        ],
      })
    ).toBe('Prix 215 000 € → 205 000 € · Charges 1 320 € → 1 440 €')
    expect(
      timelineDay('2026-11-06T09:00:00.000Z', new Date('2026-11-07'))
    ).toBe('6 nov.')
    expect(
      timelineDay('2025-10-28T09:00:00.000Z', new Date('2026-11-07'))
    ).toBe('28 oct. 2025')
  })

  it('le pied : ajout, origine, champs lus par l’IA, modification', () => {
    const listing = fakeListing({
      createdAt: '2026-10-08T09:00:00.000Z',
      updatedAt: '2026-11-06T09:00:00.000Z',
      source: 'leboncoin',
      fieldSources: {
        price: {
          source: 'ai',
          confidence: 0.95,
          recordedAt: '2026-10-08T09:00:00.000Z',
        },
        surface: {
          source: 'ai',
          confidence: 0.9,
          recordedAt: '2026-10-08T09:00:00.000Z',
        },
        notes: { source: 'user', recordedAt: '2026-10-08T09:00:00.000Z' },
      },
    })
    expect(historyFooter(listing, [fakeLink()])).toBe(
      'Ajoutée le 8 oct. 2026 depuis Leboncoin, 2 champs lus par l’IA · modifiée le 6 nov. 2026 · l’export CSV et JSON reste dans la liste.'
    )
    expect(
      historyFooter({
        ...listing,
        source: 'autre',
        sourceLabel: null,
        fieldSources: {},
      })
    ).toBe(
      'Ajoutée le 8 oct. 2026 · modifiée le 6 nov. 2026 · l’export CSV et JSON reste dans la liste.'
    )
    expect(
      historyFooter({
        ...listing,
        fieldSources: {
          price: { source: 'ai', recordedAt: '2026-10-08T09:00:00.000Z' },
        },
      })
    ).toContain('1 champ lu par l’IA')
    expect(
      listingOrigin({ source: 'agence', sourceLabel: '[Exemple] Agence' })
    ).toBe('[Exemple] Agence')
    expect(listingOrigin({ source: 'pap', sourceLabel: null })).toBe('PAP')
    expect(
      listingOrigin({ source: 'autre', sourceLabel: null }, [
        fakeLink({ portal: 'agence' }),
      ])
    ).toBeNull()
    expect(aiFieldCount(null)).toBe(0)
  })
})
