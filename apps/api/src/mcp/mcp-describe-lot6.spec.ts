import { describe, expect, it } from 'vitest'
import type { Visit, WhatsNewReport } from '@apart/contracts'
import { MCP_TOOL_NAMES, describeVisits, describeWhatsNew } from './mcp-tools'

const visit: Visit = {
  id: '11111111-1111-4111-8111-111111111111',
  listingId: '22222222-2222-4222-8222-222222222222',
  visitedAt: '2026-11-12T17:30:00.000Z',
  status: 'done',
  participantIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'inconnu'],
  report: 'Lumineux',
  pros: 'Sud',
  cons: 'Bruit',
  rating: 4,
  prepTaskId: null,
  createdById: null,
  createdAt: '2026-11-12T19:00:00.000Z',
  updatedAt: '2026-11-12T19:00:00.000Z',
  photoCount: 2,
  photos: [],
}

describe('MCP lot 6', () => {
  it('déclare les trois outils du lot 6', () => {
    const start = MCP_TOOL_NAMES.indexOf('add_visit')
    expect(MCP_TOOL_NAMES.slice(start, start + 3)).toEqual([
      'add_visit',
      'list_visits',
      'whats_new',
    ])
  })

  it('décrit les visites en une ligne chacune', () => {
    const text = describeVisits(
      [visit],
      new Map([['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Richard']])
    )
    expect(text).toContain('Faite le 12 novembre 2026')
    expect(text).toContain('4/5')
    expect(text).toContain('avec Richard, un membre')
    expect(text).toContain("2 photo(s) dans l'application")
    expect(text).toContain('compte rendu : Lumineux')
    expect(text).toContain('+ Sud')
    expect(text).toContain('− Bruit')
    expect(describeVisits([], new Map())).toBe('Aucune visite enregistrée.')
    expect(
      describeVisits(
        [
          {
            ...visit,
            rating: 0,
            participantIds: [],
            photoCount: 0,
            report: null,
            pros: null,
            cons: null,
            status: 'planned',
          },
        ],
        new Map()
      )
    ).toMatch(/^- Planifiée le .* · \[id /)
  })

  it('résume « ce qui a changé »', () => {
    const report: WhatsNewReport = {
      since: '2026-11-02T20:00:00.000Z',
      sinceSource: 'previous_visit',
      generatedAt: '2026-11-03T08:00:00.000Z',
      total: 1,
      counts: {
        new_listing: 0,
        price_change: 1,
        status_change: 0,
        opinion: 0,
        task: 0,
        criteria_match: 0,
        listing_check: 0,
        criteria_exit: 0,
        agency_answer: 0,
      },
      items: [
        {
          kind: 'price_change',
          listingId: visit.listingId,
          listingTitle: 'T2',
          at: '2026-11-03T07:00:00.000Z',
          actor: null,
          channel: 'web',
          summary: 'Prix : 200 000 € → 190 000 € (Chloé)',
          before: '200 000 €',
          after: '190 000 €',
        },
      ],
      listings: [],
    }
    const text = describeWhatsNew(report)
    expect(text).toContain('1 nouveauté(s) (Changements de prix : 1)')
    expect(text).toContain('- T2 — Prix : 200 000 € → 190 000 € (Chloé)')
    expect(describeWhatsNew({ ...report, total: 0, items: [] })).toMatch(
      /^Rien de nouveau depuis le 2 novembre 2026/
    )
  })
})
