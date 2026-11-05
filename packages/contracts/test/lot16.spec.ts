/**
 * Lot 16 : exploration par les critères. Annonce lue (lien et portail
 * obligatoires, clés inconnues refusées), enregistrement d'une exploration
 * (runKey, portails), brouillons (origine exploration, état merged, raison
 * d'écart), portails cochés d'un critère, modèles de recherche datés,
 * export et MCP. Données fictives.
 */
import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_KIND_LABELS,
  CriteriaPortalsSchema,
  EXPLORATION_MAX_CANDIDATES,
  EXPLORATION_OUTCOME_LABELS,
  EXPLORATION_PORTAL_LABELS,
  ExplorationCandidateSchema,
  ExplorationRecordSchema,
  ExportDocumentSchema,
  ListingDraftDecisionSchema,
  ListingDraftMergeSchema,
  ListingDraftSchema,
  McpExploreListingsPromptArgsSchema,
  McpGetSearchBriefInputSchema,
  McpRecordExplorationInputSchema,
  McpTriageCandidatesInputSchema,
  NOTIFICATION_TYPE_LABELS,
  PORTAL_LISTING_SOURCE,
  PORTAL_SEARCH_TEMPLATES,
  PORTAL_SEARCH_TEMPLATES_SOURCE,
  SEARCH_PORTALS,
  SearchCriteriaInputSchema,
  SearchCriteriaSchema,
  SearchCriteriaUpdateSchema,
  activityKindOf,
  criteriaPortalsOf,
} from '../src/index.js'

const ID = '11111111-1111-4111-8111-111111111111'
const candidate = {
  url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/2800000001',
  portal: 'leboncoin',
}

describe('lot 16 : annonce lue', () => {
  it('seuls le lien et le portail sont obligatoires', () => {
    expect(ExplorationCandidateSchema.parse(candidate)).toEqual(candidate)
    expect(
      ExplorationCandidateSchema.parse({
        ...candidate,
        title: '[Exemple] T3',
        price: 214_000,
        surface: 68,
        rooms: 3,
        dpeClass: 'C',
        commune: 'Bordeaux',
        inseeCode: '33063',
        district: 'Caudéran',
        publishedAt: '2026-11-04',
        excerpt: 'Exemple fictif',
      }).price
    ).toBe(214_000)
    expect(
      ExplorationCandidateSchema.safeParse({ portal: 'pap' }).success
    ).toBe(false)
    expect(
      ExplorationCandidateSchema.safeParse({ ...candidate, portal: 'figaro' })
        .success
    ).toBe(false)
  })

  it('refuse une clé inconnue, un extrait trop long, un code INSEE mal formé', () => {
    expect(
      ExplorationCandidateSchema.safeParse({ ...candidate, prix: 1 }).success
    ).toBe(false)
    expect(
      ExplorationCandidateSchema.safeParse({
        ...candidate,
        excerpt: 'x'.repeat(2001),
      }).success
    ).toBe(false)
    expect(
      ExplorationCandidateSchema.safeParse({ ...candidate, inseeCode: '3306' })
        .success
    ).toBe(false)
    expect(
      ExplorationCandidateSchema.safeParse({ ...candidate, inseeCode: '2A004' })
        .success
    ).toBe(true)
  })
})

describe('lot 16 : exploration enregistrée', () => {
  it('runKey obligatoire, portails au moins un, 50 annonces au plus', () => {
    const parsed = ExplorationRecordSchema.parse({
      runKey: '0f8c1b8e-2d7a-4c55-9a51-6c3c1d1f0e01',
      portals: [{ portal: 'logicimmo', status: 'blocked' }],
    })
    expect(parsed.candidates).toEqual([])
    expect(parsed.criteriaIds).toEqual([])
    expect(parsed.portals[0]).toEqual({
      portal: 'logicimmo',
      status: 'blocked',
      count: 0,
      note: null,
      searchUrl: null,
    })
    expect(
      ExplorationRecordSchema.safeParse({
        runKey: 'court',
        portals: parsed.portals,
      }).success
    ).toBe(false)
    expect(
      ExplorationRecordSchema.safeParse({
        runKey: 'avec espace !',
        portals: parsed.portals,
      }).success
    ).toBe(false)
    expect(
      ExplorationRecordSchema.safeParse({ runKey: 'run-0001', portals: [] })
        .success
    ).toBe(false)
    expect(
      ExplorationRecordSchema.safeParse({
        runKey: 'run-0001',
        portals: parsed.portals,
        candidates: Array.from(
          { length: EXPLORATION_MAX_CANDIDATES + 1 },
          () => candidate
        ),
      }).success
    ).toBe(false)
    expect(
      ExplorationRecordSchema.safeParse({
        runKey: 'run-0001',
        portals: [{ portal: 'pap', status: 'read', inconnu: true }],
      }).success
    ).toBe(false)
  })

  it('libellés, sources et modèles datés', () => {
    expect(EXPLORATION_OUTCOME_LABELS.out).toBe('Hors critères')
    expect(EXPLORATION_PORTAL_LABELS.bienici).toBe('Bien’ici')
    expect(PORTAL_LISTING_SOURCE.logicimmo).toEqual({
      source: 'autre',
      sourceLabel: 'Logic-Immo',
    })
    expect(SEARCH_PORTALS).toEqual([
      'leboncoin',
      'seloger',
      'bienici',
      'pap',
      'logicimmo',
    ])
    expect(PORTAL_SEARCH_TEMPLATES.leboncoin.mode).toBe('parameters')
    for (const portal of ['seloger', 'bienici', 'pap', 'logicimmo'] as const) {
      expect(PORTAL_SEARCH_TEMPLATES[portal].mode).toBe('manual')
      expect(PORTAL_SEARCH_TEMPLATES[portal].note).toContain('Filtres à saisir')
    }
    expect(PORTAL_SEARCH_TEMPLATES_SOURCE.asOf).toBe('2026-11-05')
    expect(NOTIFICATION_TYPE_LABELS.drafts_received).toContain('exploration')
    expect(activityKindOf('exploration.recorded')).toBe('exploration')
    expect(ACTIVITY_KIND_LABELS.exploration).toBe('Exploration')
  })
})

describe('lot 16 : brouillons', () => {
  it('origine exploration, état merged, champs par défaut', () => {
    const draft = ListingDraftSchema.parse({
      id: ID,
      workspaceId: ID,
      origin: 'exploration',
      status: 'merged',
      extractedBy: 'parser',
      listing: { title: '[Exemple] T3', price: 210_000 },
      duplicates: [],
      warnings: [],
      url: null,
      emailSubject: null,
      emailFrom: null,
      receivedAt: '2026-11-05T17:40:00.000Z',
      decidedAt: null,
      decidedById: null,
      listingId: null,
      createdAt: '2026-11-05T17:40:00.000Z',
    })
    expect(draft).toMatchObject({
      explorationId: null,
      portal: null,
      excerpt: null,
      dismissReason: null,
      distinct: false,
      merge: null,
      fit: null,
    })
  })

  it('écarter avec une raison, annuler, accepter avec l’annonce', () => {
    expect(
      ListingDraftDecisionSchema.parse({
        status: 'dismissed',
        reason: '  rez-de-chaussée  ',
      }).reason
    ).toBe('rez-de-chaussée')
    expect(
      ListingDraftDecisionSchema.safeParse({ status: 'pending' }).success
    ).toBe(true)
    expect(
      ListingDraftDecisionSchema.safeParse({ status: 'accepted' }).success
    ).toBe(false)
    expect(
      ListingDraftDecisionSchema.safeParse({
        status: 'dismissed',
        reason: 'x'.repeat(501),
      }).success
    ).toBe(false)
    expect(ListingDraftMergeSchema.safeParse({ listingId: 'x' }).success).toBe(
      false
    )
  })
})

describe('lot 16 : portails d’un critère', () => {
  it('null = tous ; sans doublon ; une liste lue garde l’ordre du brief', () => {
    expect(SearchCriteriaInputSchema.parse({ name: 'C' }).portals).toBeNull()
    expect(
      SearchCriteriaInputSchema.safeParse({
        name: 'C',
        portals: ['pap', 'pap'],
      }).success
    ).toBe(false)
    expect(CriteriaPortalsSchema.safeParse(['figaro']).success).toBe(false)
    expect(
      SearchCriteriaUpdateSchema.parse({ portals: ['pap'] }).portals
    ).toEqual(['pap'])
    expect(SearchCriteriaUpdateSchema.parse({}).portals).toBeUndefined()
    expect(criteriaPortalsOf(null)).toEqual([...SEARCH_PORTALS])
    expect(criteriaPortalsOf([])).toEqual([...SEARCH_PORTALS])
    expect(criteriaPortalsOf(['pap', 'leboncoin'])).toEqual([
      'leboncoin',
      'pap',
    ])
    expect(criteriaPortalsOf('illisible')).toEqual([...SEARCH_PORTALS])
    const criteria = SearchCriteriaSchema.parse({
      id: ID,
      workspaceId: ID,
      createdById: null,
      name: 'C',
      active: true,
      filters: {},
      tolerance: {},
      perimeterType: null,
      perimeter: null,
      createdAt: '2026-11-05T17:40:00.000Z',
      updatedAt: '2026-11-05T17:40:00.000Z',
    })
    expect(criteria.portals).toEqual([...SEARCH_PORTALS])
  })
})

describe('lot 16 : export et MCP', () => {
  it('l’export garde la version 1 : explorations vide par défaut', () => {
    const shape = ExportDocumentSchema.shape.explorations
    expect(shape.parse(undefined)).toEqual([])
  })

  it('les entrées MCP reprennent les schémas', () => {
    expect(McpGetSearchBriefInputSchema.parse({})).toEqual({})
    expect(
      McpGetSearchBriefInputSchema.safeParse({ criteriaId: 'x' }).success
    ).toBe(false)
    expect(
      McpTriageCandidatesInputSchema.safeParse({ candidates: [] }).success
    ).toBe(false)
    expect(
      McpTriageCandidatesInputSchema.parse({ candidates: [candidate] })
        .candidates
    ).toHaveLength(1)
    expect(
      McpRecordExplorationInputSchema.safeParse({
        runKey: 'run-0001',
        portals: [{ portal: 'pap', status: 'read', count: 3 }],
        candidates: [candidate],
      }).success
    ).toBe(true)
    expect(
      Object.keys(McpExploreListingsPromptArgsSchema.shape).sort()
    ).toEqual(['criteriaId', 'notes', 'portals'])
  })
})
