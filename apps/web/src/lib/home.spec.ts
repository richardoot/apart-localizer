/**
 * Lot 23 : où mène chaque ligne de « Ce qui t'attend » sur l'accueil, et
 * chaque étape de la mise en route.
 */
import { describe, expect, it } from 'vitest'
import type { WorkflowAgendaItem } from '@apart/contracts'
import { WorkflowAgendaKeySchema } from '@apart/contracts'
import {
  AGENDA_TONES,
  GETTING_STARTED_ACTIONS,
  GETTING_STARTED_TARGETS,
  MESSAGES_ANCHOR,
  agendaTarget,
} from './home'

const ID = '11111111-1111-4111-8111-111111111111'
const item = (over: Partial<WorkflowAgendaItem>): WorkflowAgendaItem => ({
  key: 'to_sort',
  count: 1,
  label: 'x',
  stage: null,
  detail: null,
  listingId: null,
  ...over,
})

describe('agendaTarget', () => {
  it('les décisions : le tri, la confirmation, « À trancher ensemble »', () => {
    expect(agendaTarget(item({ key: 'to_sort', stage: 'a-etudier' }))).toEqual({
      name: 'triage',
      query: { etape: 'a-etudier' },
    })
    expect(agendaTarget(item({ key: 'to_sort' }))).toEqual({
      name: 'triage',
      query: { etape: 'a-valider' },
    })
    expect(agendaTarget(item({ key: 'to_confirm' }))).toEqual({
      name: 'triage',
      query: { mode: 'confirmer' },
    })
    expect(agendaTarget(item({ key: 'to_settle' }))).toEqual({
      name: 'settle',
    })
  })

  it('une seule annonce visée : sa fiche au bon onglet ; sinon l’étape', () => {
    expect(
      agendaTarget(
        item({ key: 'upcoming_visits', stage: 'a-visiter', listingId: ID })
      )
    ).toEqual({
      name: 'listing',
      params: { id: ID },
      query: { onglet: 'a-faire' },
    })
    expect(
      agendaTarget(
        item({ key: 'opinions_to_give', stage: 'visitees', listingId: ID })
      )
    ).toEqual({ name: 'listing', params: { id: ID }, query: {} })
    expect(
      agendaTarget(item({ key: 'visits_to_plan', stage: 'a-visiter' }))
    ).toEqual({ name: 'listings', query: { etape: 'a-visiter' } })
    expect(agendaTarget(item({ key: 'ready', stage: null }))).toEqual({
      name: 'listings',
    })
  })

  it('lot 24 : la visite du jour ouvre le mode visite ; plusieurs, l’étape', () => {
    expect(
      agendaTarget(
        item({ key: 'visit_today', stage: 'a-visiter', listingId: ID })
      )
    ).toEqual({ name: 'visit-mode', params: { id: ID } })
    expect(
      agendaTarget(item({ key: 'visit_today', stage: 'a-visiter' }))
    ).toEqual({ name: 'listings', query: { etape: 'a-visiter' } })
    expect(AGENDA_TONES.visit_today).toBe('bg-good-soft text-good')
  })

  it('les messages : la fiche, ou le bloc de l’accueil ; les tâches : la vue en retard', () => {
    expect(agendaTarget(item({ key: 'messages_to_approve' }))).toEqual({
      name: 'home',
      hash: `#${MESSAGES_ANCHOR}`,
    })
    expect(
      agendaTarget(item({ key: 'follow_ups_due', listingId: ID }))
    ).toEqual({
      name: 'listing',
      params: { id: ID },
      query: { onglet: 'a-faire' },
    })
    expect(agendaTarget(item({ key: 'overdue_tasks', listingId: ID }))).toEqual(
      { name: 'tasks', query: { retard: '1' } }
    )
  })

  it('chaque ligne a sa teinte ; chaque étape de la mise en route son bouton', () => {
    for (const key of WorkflowAgendaKeySchema.options) {
      expect(AGENDA_TONES[key]).toMatch(/^bg-/)
    }
    expect(GETTING_STARTED_TARGETS.assumptions).toEqual({ name: 'assumptions' })
    expect(GETTING_STARTED_TARGETS.listing).toEqual({ name: 'listing-new' })
    // Lot 26 : l'étape Claude mène à la page « Claude ».
    expect(GETTING_STARTED_TARGETS.claude).toEqual({ name: 'claude' })
    expect(GETTING_STARTED_ACTIONS.claude).toBe('Brancher Claude')
  })
})
