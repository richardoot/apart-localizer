/**
 * Lot 31 : un brouillon et un brouillon ressemblant décrits en une ligne au
 * connecteur (statut, faits, origine, écart, fusion). Données fictives.
 */
import { describe, expect, it } from 'vitest'
import { ListingDraftSchema, ListingInputSchema } from '@apart/contracts'
import type { ListingDraft, SimilarDraft } from '@apart/contracts'
import { describeDraft, describeSimilarDraft } from './mcp-drafts'
import { MCP_TOOL_NAMES } from './mcp-tools'

const ID = '11111111-1111-4111-8111-111111111111'
const KEPT = '22222222-2222-4222-8222-222222222222'
const AT = '2026-11-12T10:00:00.000Z'

const draft = (over: Partial<ListingDraft> = {}): ListingDraft =>
  ListingDraftSchema.parse({
    id: ID,
    workspaceId: KEPT,
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
      sellerName: '[Exemple] Agence du Port',
      sellerReference: 'EX-3101',
      location: { commune: 'Bordeaux', district: 'Bacalan' },
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

describe('MCP lot 31 : les brouillons', () => {
  it('sept outils de plus, en fin de liste, aucun de suppression', () => {
    expect(MCP_TOOL_NAMES.slice(-7)).toEqual([
      'list_drafts',
      'get_draft',
      'find_similar_drafts',
      'update_draft',
      'set_draft_status',
      'merge_draft_into_listing',
      'merge_drafts',
    ])
    expect(MCP_TOOL_NAMES.some(name => /delete|remove/.test(name))).toBe(false)
  })

  it('décrit un brouillon à valider trouvé par Claude', () => {
    const n = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ')
    expect(n(describeDraft(draft()))).toBe(
      `« [Exemple] T3 Bacalan 62 m² » (À valider) : 172 000 €, 62 m², 3 p., étage 2, DPE C, Bordeaux, Bacalan, [Exemple] Agence du Port réf. EX-3101 — trouvée par Claude sur Bien’ici — https://www.bienici.com/annonce/exemple-9900201 [id ${ID}]`
    )
  })

  it('dit l’écart et la fusion d’un brouillon absorbé', () => {
    const text = describeDraft(
      draft({
        status: 'dismissed',
        origin: 'email',
        portal: null,
        dismissReason:
          'Doublon du brouillon « [Exemple] Gardé » (brouillons fusionnés)',
        mergedIntoDraftId: KEPT,
      })
    )
    expect(text).toContain('(Écarté)')
    expect(text).toContain('reçue par e-mail')
    expect(text).toContain(`fusionné dans le brouillon [id ${KEPT}]`)
  })

  it('décrit un brouillon ressemblant', () => {
    const item: SimilarDraft = {
      draftId: KEPT,
      status: 'dismissed',
      title: '[Exemple] Appartement 3 pièces',
      price: 172_000,
      surface: 62,
      rooms: 3,
      commune: 'Bordeaux',
      district: 'Bacalan',
      url: null,
      sellerName: null,
      sellerReference: null,
      updatedAt: AT,
      score: 0.9,
      level: 'very_close',
      matches: [{ kind: 'surface', text: 'Même surface (62 m²)' }],
      differences: [{ kind: 'floor', text: 'Au 4e étage, pas au 2e étage' }],
      dismissReason: 'Déjà vu',
    }
    const text = describeSimilarDraft(item)
    expect(text).toContain('concorde : Même surface (62 m²)')
    expect(text).toContain('diffère : Au 4e étage')
    expect(text).toContain('écarté : « Déjà vu »')
    expect(text).toContain(`[id ${KEPT}]`)
  })
})
