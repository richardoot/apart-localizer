/**
 * Lot 16 : la colle de l'exploration côté API, sans base : lecture des
 * explorations enregistrées (JSON illisible → valeurs par défaut), ce que
 * l'adéquation lit d'une fiche pas enregistrée (verdict inconnu sans loyer
 * visé), faits d'un brouillon pour la vérification d'une annonce suivie.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_ASSUMPTIONS, ListingInputSchema } from '@apart/contracts'
import { EMPTY_EXPLORATION_COUNTS } from '@apart/domain'
import { Prisma } from '../generated/prisma'
import { observedFromDraft } from '../inbound/drafts.service'
import { candidateOf } from './candidate-fit.service'
import {
  toExplorationDetail,
  toExplorationLine,
  toExplorationSummary,
} from './exploration.mapper'
import type { ExplorationDetailRow } from './exploration.mapper'

const ID = '11111111-1111-4111-8111-111111111111'
const at = new Date('2026-11-05T17:40:00.000Z')

const row = (
  over: Partial<ExplorationDetailRow> = {}
): ExplorationDetailRow => ({
  id: ID,
  workspaceId: ID,
  authorId: ID,
  channel: 'mcp',
  runKey: 'run-0001',
  startedAt: at,
  finishedAt: at,
  criteria: [{ id: ID, name: '[Exemple] Caudéran' }],
  portals: [
    { portal: 'pap', status: 'blocked', count: 0, note: null, searchUrl: null },
  ],
  counts: { ...EMPTY_EXPLORATION_COUNTS, seen: 1, out: 1 },
  summary: '1 annonce vue : 1 hors critères',
  outDigest: 'prix au-delà de la marge (1)',
  notes: null,
  createdAt: at,
  author: { id: ID, displayName: 'Richard' },
  lines: [
    {
      id: ID,
      explorationId: ID,
      position: 0,
      url: 'https://www.pap.fr/annonces/r1',
      normalizedUrl: 'https://pap.fr/annonces/r1',
      portal: 'pap',
      title: '[Exemple] T4',
      price: new Prisma.Decimal(289_000),
      surface: null,
      rooms: 4,
      commune: 'Bordeaux',
      district: null,
      outcome: 'out',
      why: 'Prix +31 %',
      reasons: ['Prix +31 %'],
      level: 'out',
      listingId: null,
      draftId: null,
      excerpt: null,
      listing: null,
    },
  ],
  ...over,
})

describe('lecture des explorations', () => {
  it('une exploration et son compte rendu', () => {
    const detail = toExplorationDetail(row())
    expect(detail.author).toEqual({ id: ID, displayName: 'Richard' })
    expect(detail.lines[0]).toMatchObject({
      price: 289_000,
      surface: null,
      outcome: 'out',
    })
    expect(detail.bilan).toEqual([
      expect.objectContaining({
        portal: 'pap',
        count: 'arrêté',
        blocked: true,
      }),
    ])
    expect(detail.outDigest).toBe('prix au-delà de la marge (1)')
  })

  it('un JSON illisible prend les valeurs par défaut', () => {
    const summary = toExplorationSummary(
      row({ criteria: 'x', portals: null, counts: 3, author: null })
    )
    expect(summary).toMatchObject({
      author: null,
      criteria: [],
      portals: [],
      counts: EMPTY_EXPLORATION_COUNTS,
    })
    const line = toExplorationLine({
      ...row().lines[0],
      reasons: { bad: true },
    } as never)
    expect(line.reasons).toEqual([])
  })
})

describe('adéquation d’une fiche pas enregistrée', () => {
  it('sans loyer visé, le verdict est inconnu ; avec, il se calcule', () => {
    const listing = ListingInputSchema.parse({
      title: '[Exemple] T3',
      price: 214_000,
      surface: 72,
      rooms: 3,
      dpeClass: 'C',
      location: { commune: 'Bordeaux' },
    })
    expect(candidateOf(listing, DEFAULT_ASSUMPTIONS)).toEqual({
      price: 214_000,
      surface: 72,
      rooms: 3,
      dpeClass: 'C',
      commune: 'Bordeaux',
      verdict: null,
    })
    const rented = candidateOf(
      {
        ...listing,
        rentalPlan: {
          ...ListingInputSchema.shape.rentalPlan.parse(null),
          targetRent: 900,
        } as never,
      },
      DEFAULT_ASSUMPTIONS
    )
    expect(rented.verdict).not.toBeNull()
  })
})

describe('faits d’un brouillon', () => {
  it('seuls les champs lus sur la page', () => {
    const input = ListingInputSchema.parse({
      title: '[Exemple] T3',
      price: 210_000,
      surface: 66,
      rooms: 3,
      dpeClass: 'C',
      annualCharges: 1_680,
      propertyTax: 900,
      fieldSources: {
        price: { source: 'listing' },
        surface: { source: 'listing' },
        rooms: { source: 'listing' },
        dpeClass: { source: 'listing' },
        annualCharges: { source: 'listing' },
        propertyTax: { source: 'listing' },
      },
    })
    expect(observedFromDraft(input)).toEqual({
      price: 210_000,
      surface: 66,
      rooms: 3,
      dpeClass: 'C',
      annualCharges: 1_680,
      propertyTax: 900,
    })
    expect(observedFromDraft({ ...input, fieldSources: {} })).toEqual({})
    expect(
      observedFromDraft({
        ...input,
        price: 0,
        surface: null,
        rooms: null,
        dpeClass: null,
        annualCharges: null,
        propertyTax: null,
      })
    ).toEqual({})
  })
})
