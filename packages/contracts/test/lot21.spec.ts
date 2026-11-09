/**
 * Lot 21, suivre ses annonces : étapes et statuts, entrées des décisions
 * (raison obligatoire pour écarter, clés inconnues refusées, bornes),
 * réglage de l'espace, notifications et journal, export. Données fictives.
 */
import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_KIND_LABELS,
  DECISION_REASON_MAX,
  DECISION_STATE_LABELS,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DISCARD_QUICK_REASONS,
  DecisionChoiceSchema,
  DecisionInputSchema,
  DecisionRespondSchema,
  DecisionResultSchema,
  DecisionSettingsUpdateSchema,
  DecisionSettleSchema,
  DecisionStateSchema,
  EvaluatedListingSchema,
  ExportDocumentSchema,
  ListingDraftAcceptResultSchema,
  ListingDraftBatchAcceptResultSchema,
  ListingDraftSchema,
  ListingStatusSchema,
  NOTIFICATION_TYPE_LABELS,
  NotificationTypeSchema,
  OPEN_DECISION_STATES,
  STAGE_STATUSES,
  TRIAGE_STAGES,
  WORKFLOW_STAGES,
  WORKFLOW_STAGE_INTROS,
  WORKFLOW_STAGE_LABELS,
  WORKFLOW_STAGE_QUESTIONS,
  WorkflowOverviewSchema,
  WorkspaceSchema,
  activityKindOf,
} from '../src/index.js'

const ID = '11111111-1111-4111-8111-111111111111'
const LISTING = { kind: 'listing', id: ID } as const
const DRAFT = { kind: 'draft', id: ID } as const

describe('les étapes', () => {
  it('six étapes, dans l’ordre de la barre, chacune sa question et son intro', () => {
    expect(WORKFLOW_STAGES).toEqual([
      'a-valider',
      'a-etudier',
      'a-visiter',
      'visitees',
      'offres',
      'archives',
    ])
    for (const stage of WORKFLOW_STAGES) {
      expect(WORKFLOW_STAGE_LABELS[stage]).toBeTruthy()
      expect(WORKFLOW_STAGE_QUESTIONS[stage]).toBeTruthy()
      expect(WORKFLOW_STAGE_INTROS[stage]).toBeTruthy()
    }
    expect(WORKFLOW_STAGE_QUESTIONS['a-valider']).toBe('On la garde ?')
    expect(TRIAGE_STAGES).toEqual(['a-valider', 'a-etudier'])
  })

  it('chaque statut d’annonce est dans une étape et une seule', () => {
    const all = Object.values(STAGE_STATUSES).flat()
    expect([...all].sort()).toEqual([...ListingStatusSchema.options].sort())
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('les entrées d’une décision', () => {
  it('écarter demande une raison, à tout niveau', () => {
    expect(
      DecisionInputSchema.safeParse({ target: LISTING, choice: 'discard' })
        .success
    ).toBe(false)
    expect(
      DecisionInputSchema.safeParse({
        target: LISTING,
        choice: 'discard',
        reason: '   ',
      }).success
    ).toBe(false)
    expect(
      DecisionInputSchema.safeParse({
        target: LISTING,
        choice: 'discard',
        reason: 'Trop cher',
      }).success
    ).toBe(true)
  })

  it('un brouillon se garde ou s’écarte ; une annonce passe À visiter ou s’écarte', () => {
    expect(
      DecisionInputSchema.safeParse({ target: DRAFT, choice: 'keep' }).success
    ).toBe(true)
    expect(
      DecisionInputSchema.safeParse({ target: DRAFT, choice: 'to_visit' })
        .success
    ).toBe(false)
    expect(
      DecisionInputSchema.safeParse({ target: LISTING, choice: 'to_visit' })
        .success
    ).toBe(true)
    expect(
      DecisionInputSchema.safeParse({ target: LISTING, choice: 'keep' }).success
    ).toBe(false)
  })

  it('borne la raison et refuse les clés inconnues', () => {
    expect(
      DecisionInputSchema.safeParse({
        target: LISTING,
        choice: 'discard',
        reason: 'x'.repeat(DECISION_REASON_MAX + 1),
      }).success
    ).toBe(false)
    expect(
      DecisionInputSchema.safeParse({
        target: LISTING,
        choice: 'to_visit',
        force: true,
      }).success
    ).toBe(false)
    expect(
      DecisionInputSchema.safeParse({
        target: { ...LISTING, extra: 1 },
        choice: 'to_visit',
      }).success
    ).toBe(false)
    expect(
      DecisionInputSchema.safeParse({
        target: LISTING,
        choice: 'to_visit',
        sessionId: 'pas-un-uuid',
      }).success
    ).toBe(false)
    expect(
      DecisionInputSchema.safeParse({
        target: LISTING,
        choice: 'to_visit',
        expectedStatus: 'to_study',
        sessionId: ID,
      }).success
    ).toBe(true)
  })

  it('répondre : d’accord, ou non avec un autre choix', () => {
    expect(DecisionRespondSchema.safeParse({ agree: true }).success).toBe(true)
    expect(DecisionRespondSchema.safeParse({ agree: false }).success).toBe(
      false
    )
    expect(
      DecisionRespondSchema.safeParse({ agree: false, choice: 'keep' }).success
    ).toBe(true)
    expect(
      DecisionRespondSchema.safeParse({ agree: false, choice: 'discard' })
        .success
    ).toBe(false)
    expect(
      DecisionRespondSchema.safeParse({
        agree: false,
        choice: 'discard',
        reason: 'Quartier',
      }).success
    ).toBe(true)
    expect(
      DecisionRespondSchema.safeParse({ agree: true, confirmFor: 'chloe' })
        .success
    ).toBe(false)
  })

  it('trancher et le réglage sont stricts', () => {
    expect(DecisionSettleSchema.safeParse({ choice: 'discard' }).success).toBe(
      true
    )
    expect(
      DecisionSettleSchema.safeParse({ choice: 'discard', x: 1 }).success
    ).toBe(false)
    expect(DecisionSettleSchema.safeParse({ choice: 'non' }).success).toBe(
      false
    )
    expect(
      DecisionSettingsUpdateSchema.safeParse({ decideTogether: false }).success
    ).toBe(true)
    expect(DecisionSettingsUpdateSchema.safeParse({}).success).toBe(false)
    expect(
      DecisionSettingsUpdateSchema.safeParse({
        decideTogether: true,
        other: 1,
      }).success
    ).toBe(false)
  })

  it('les valeurs connues', () => {
    expect(DecisionChoiceSchema.options).toEqual([
      'keep',
      'to_visit',
      'discard',
    ])
    expect(DecisionStateSchema.options).toEqual([
      'open',
      'to_settle',
      'applied',
      'withdrawn',
      'stale',
    ])
    expect(OPEN_DECISION_STATES).toEqual(['open', 'to_settle'])
    for (const state of DecisionStateSchema.options) {
      expect(DECISION_STATE_LABELS[state]).toBeTruthy()
    }
    expect(DISCARD_QUICK_REASONS).toContain('Trop de travaux')
  })
})

describe('les réponses', () => {
  it('le résultat d’une décision', () => {
    expect(
      DecisionResultSchema.safeParse({
        outcome: 'proposed',
        message: 'C’est proposé.',
        proposal: null,
        listingId: ID,
        draftId: null,
        createdListing: false,
        undoable: true,
      }).success
    ).toBe(true)
    expect(
      DecisionResultSchema.safeParse({ outcome: 'inconnu', message: '' })
        .success
    ).toBe(false)
  })

  it('une vue vide des compteurs', () => {
    expect(
      WorkflowOverviewSchema.safeParse({
        decideTogether: true,
        agreementRequired: false,
        others: [],
        stages: [],
        agenda: [],
        proposals: [],
      }).success
    ).toBe(true)
  })

  it('un espace décide à plusieurs par défaut', () => {
    const parsed = WorkspaceSchema.parse({
      id: ID,
      name: 'Espace',
      createdAt: '2026-11-01T10:00:00.000Z',
      members: [],
      invitations: [],
    })
    expect(parsed.decideTogether).toBe(true)
  })

  it('les annonces et brouillons existants n’ont pas de proposition', () => {
    expect(EvaluatedListingSchema.shape.decision.parse(undefined)).toBeNull()
    expect(ListingDraftSchema.shape.decision.parse(undefined)).toBeNull()
    expect(ListingDraftSchema.shape.evaluation.parse(undefined)).toBeNull()
    expect(ListingDraftSchema.shape.located.parse(undefined)).toBeNull()
  })

  it('un ajout direct peut attendre l’accord', () => {
    expect(
      ListingDraftAcceptResultSchema.shape.listingId.safeParse(null).success
    ).toBe(true)
    expect(
      ListingDraftBatchAcceptResultSchema.shape.proposed.parse(undefined)
    ).toBe(0)
  })
})

describe('notifications, journal, export', () => {
  it('deux types réglables, comme les autres', () => {
    for (const type of ['decision_proposed', 'decision_resolved'] as const) {
      expect(NotificationTypeSchema.options).toContain(type)
      expect(NOTIFICATION_TYPE_LABELS[type]).toBeTruthy()
      expect(DEFAULT_NOTIFICATION_PREFERENCES[type]).toEqual({
        in_app: true,
        push: true,
        email: false,
      })
    }
  })

  it('les lignes du journal sont rangées à part', () => {
    expect(activityKindOf('decision.proposed')).toBe('decision')
    expect(activityKindOf('listing.status_changed')).toBe('status')
    expect(ACTIVITY_KIND_LABELS.decision).toBe('Décisions à plusieurs')
  })

  it('l’export reste au format 1 ; un export antérieur se relit', () => {
    expect(ExportDocumentSchema.shape.decisions.parse(undefined)).toEqual([])
    expect(ExportDocumentSchema.shape.decideTogether.parse(undefined)).toBe(
      true
    )
    expect(ExportDocumentSchema.shape.version.value).toBe(1)
  })
})
