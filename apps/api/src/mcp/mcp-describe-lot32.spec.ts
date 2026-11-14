/**
 * Lot 32 (ADR 0047) au connecteur : l'exploration ouvre la page des
 * annonces gardées et relève tout, les brouillons disent ce qui n'a pas été
 * relevé. Données fictives.
 */
import { describe, expect, it } from 'vitest'
import { ListingDraftSchema, ListingInputSchema } from '@apart/contracts'
import type { ListingDraft } from '@apart/contracts'
import { PAGE_READING_SUMMARY } from '@apart/domain'
import { draftReadingGaps } from './mcp-drafts'
import { exploreListingsPrompt } from './mcp-exploration'

const ID = '11111111-1111-4111-8111-111111111111'
const WS = '22222222-2222-4222-8222-222222222222'
const AT = '2026-11-14T10:00:00.000Z'

const draft = (
  over: Partial<ListingDraft> = {},
  listing: Record<string, unknown> = {}
): ListingDraft =>
  ListingDraftSchema.parse({
    id: ID,
    workspaceId: WS,
    origin: 'exploration',
    status: 'pending',
    extractedBy: 'claude',
    listing: ListingInputSchema.parse({
      title: '[Exemple] T3 Bacalan 62 m²',
      price: 172_000,
      surface: 62,
      rooms: 3,
      floor: 2,
      dpeClass: 'C',
      heatingType: 'gaz',
      constructionYear: 1975,
      feesPayer: 'seller',
      lotsCount: 20,
      description: 'Appartement fictif.',
      location: { commune: 'Bordeaux', district: 'Bacalan' },
      ...listing,
    }),
    duplicates: [],
    warnings: [],
    url: 'https://www.bienici.com/annonce/exemple-9900201',
    emailSubject: null,
    emailFrom: null,
    receivedAt: AT,
    decidedAt: null,
    decidedById: null,
    listingId: null,
    createdAt: AT,
    portal: 'bienici',
    updatedAt: AT,
    ...over,
  })

describe('MCP lot 32 : tout relever sur la page', () => {
  it('le prompt d’exploration ouvre la page des annonces gardées, après le tri', () => {
    const text = exploreListingsPrompt({})
    const triage = text.indexOf('5. Appelle triage_candidates')
    const open = text.indexOf('6. Ouvre ensuite')
    const record = text.indexOf('7. Appelle record_exploration')
    expect(triage).toBeGreaterThan(0)
    expect(open).toBeGreaterThan(triage)
    expect(record).toBeGreaterThan(open)
    expect(text).toContain(PAGE_READING_SUMMARY)
    expect(text).toContain('`opened: true`')
    expect(text).toContain('9. À la fin')
    expect(text).toContain('charges ou taxe foncière inconnus')
  })

  it('un brouillon à valider dit ce qui manque, à compléter par update_draft', () => {
    const line = draftReadingGaps(draft())
    expect(line).toContain(
      'Non relevé : charges de copropriété, taxe foncière et photos.'
    )
    expect(line).toContain('update_draft')
  })

  it('rien à dire pour un brouillon complet, validé ou reconnu', () => {
    const full = {
      annualCharges: 1200,
      propertyTax: 900,
      portalPhotos: ['https://img.example.test/1.jpg'],
    }
    expect(draftReadingGaps(draft({}, full))).toBeNull()
    expect(draftReadingGaps(draft({ status: 'accepted' }))).toBeNull()
    expect(draftReadingGaps(draft({ status: 'merged' }))).toBeNull()
    expect(draftReadingGaps(draft({ status: 'dismissed' }))).not.toBeNull()
  })
})
