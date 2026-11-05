/**
 * Lot 17 : questions aux agences. Contact de l'annonceur (saisie, complément
 * MCP sans effacement), valeurs d'une réponse (clés inconnues refusées),
 * tâches liées à un champ et rattrapage par libellé, entrées des outils MCP,
 * export version 1 rétrocompatible, préférences de notification. Fictif.
 */
import { describe, expect, it } from 'vitest'
import {
  ACTIVE_AGENCY_REQUEST_STATUSES,
  AGENCY_ANSWER_VALUE_FIELD,
  AgencyAnswerInputSchema,
  AgencyAnswerValueKeySchema,
  AgencyAnswerValuesSchema,
  AgencyRequestDraftInputSchema,
  AgencyRequestUpdateSchema,
  AgencySettingsUpdateSchema,
  DEFAULT_FOLLOW_UP_BUSINESS_DAYS,
  DEFAULT_TASKS,
  FOLLOW_UP_RULE_DATE,
  FieldSourceSchema,
  LISTING_QUESTION_FIELD_LABELS,
  LISTING_QUESTION_TEXTS,
  ListingContactInputSchema,
  ListingContactPatchSchema,
  ListingQuestionFieldSchema,
  McpPrepareAgencyRequestsInputSchema,
  McpRecordRequestSentInputSchema,
  REQUIRED_LISTING_FIELDS,
  TASK_FIELD_BY_LABEL,
  TaskSchema,
  resolveNotificationPreferences,
  taskFieldForLabel,
} from '../src/index.js'

const ID = '11111111-1111-4111-8111-111111111111'

describe('lot 17 : contrats des questions aux agences', () => {
  it('règle de relance datée et sources', () => {
    expect(DEFAULT_FOLLOW_UP_BUSINESS_DAYS).toBe(5)
    expect(FOLLOW_UP_RULE_DATE).toBe('2026-11-05')
    expect(FieldSourceSchema.options).toContain('agency')
    expect(ACTIVE_AGENCY_REQUEST_STATUSES).toEqual([
      'draft',
      'approved',
      'sent',
    ])
  })

  it('chaque champ a un libellé et une question ; chaque valeur répond à une question', () => {
    for (const field of ListingQuestionFieldSchema.options) {
      expect(LISTING_QUESTION_FIELD_LABELS[field]).toBeTruthy()
      expect(LISTING_QUESTION_TEXTS[field]).toMatch(/^(le|la|l'|les)/)
    }
    for (const key of AgencyAnswerValueKeySchema.options) {
      expect(ListingQuestionFieldSchema.options).toContain(
        AGENCY_ANSWER_VALUE_FIELD[key]
      )
    }
  })

  it('tâches liées par libellé exact : checklist et champs manquants', () => {
    expect(taskFieldForLabel(DEFAULT_TASKS[0] as string)).toBe('annualCharges')
    expect(taskFieldForLabel(DEFAULT_TASKS[1] as string)).toBe('propertyTax')
    expect(taskFieldForLabel(DEFAULT_TASKS[2] as string)).toBe('proceedings')
    expect(taskFieldForLabel(DEFAULT_TASKS[3] as string)).toBeNull()
    const required = REQUIRED_LISTING_FIELDS.filter(r =>
      (ListingQuestionFieldSchema.options as readonly string[]).includes(
        r.provenanceKey
      )
    )
    for (const r of required) {
      expect(TASK_FIELD_BY_LABEL[r.taskLabel]).toBe(r.provenanceKey)
    }
    expect(Object.keys(TASK_FIELD_BY_LABEL)).toHaveLength(8)
    expect(Object.isFrozen(TASK_FIELD_BY_LABEL)).toBe(true)
  })

  it('une tâche antérieure au lot 17 se lit encore (défauts)', () => {
    const task = TaskSchema.parse({
      id: ID,
      listingId: ID,
      label: 'Appeler',
      assigneeId: null,
      origin: 'manual',
      done: false,
      doneAt: null,
      position: 0,
      createdAt: '2026-11-01T00:00:00.000Z',
    })
    expect(task).toMatchObject({
      field: null,
      requestedAt: null,
      requestId: null,
      answeredAt: null,
    })
  })

  it('contact : au moins un champ, e-mail et téléphone vérifiés ; le MCP complète sans vider', () => {
    expect(() => ListingContactInputSchema.parse({})).toThrow(
      /Au moins un champ/
    )
    expect(
      ListingContactInputSchema.parse({ agencyName: ' Agence [Exemple] ' })
    ).toEqual({
      agencyName: 'Agence [Exemple]',
      contactName: null,
      email: null,
      phone: null,
      portalMessageUrl: null,
      preferredChannel: null,
    })
    expect(() =>
      ListingContactInputSchema.parse({ email: 'pas-une-adresse' })
    ).toThrow()
    expect(() =>
      ListingContactInputSchema.parse({ phone: 'appelez-moi' })
    ).toThrow(/Numéro de téléphone illisible/)
    expect(
      ListingContactInputSchema.parse({ phone: '+33 5 00 00 00 00' }).phone
    ).toBe('+33 5 00 00 00 00')
    expect(() => ListingContactPatchSchema.parse({ email: null })).toThrow()
    expect(() => ListingContactPatchSchema.parse({ notes: 'x' })).toThrow()
    expect(
      ListingContactPatchSchema.parse({ agencyName: 'Agence [Exemple]' })
    ).toEqual({
      agencyName: 'Agence [Exemple]',
    })
  })

  it('réponse : clés inconnues refusées, garde-fou obligatoire, défauts', () => {
    expect(() => AgencyAnswerValuesSchema.parse({ charges: 1 })).toThrow()
    expect(() =>
      AgencyAnswerInputSchema.parse({ excerpt: 'Charges 1 680 €' })
    ).toThrow()
    const parsed = AgencyAnswerInputSchema.parse({
      excerpt: 'Charges 1 680 €',
      expectedUpdatedAt: '2026-11-05T10:00:00.000Z',
    })
    expect(parsed.values).toEqual({})
    expect(parsed.answeredTaskIds).toEqual([])
    expect(() =>
      AgencyAnswerValuesSchema.parse({ dpeDate: '01/03/2023' })
    ).toThrow()
  })

  it('brouillon, modification, signature', () => {
    expect(AgencyRequestDraftInputSchema.parse({})).toEqual({})
    expect(() => AgencyRequestDraftInputSchema.parse({ taskIds: [] })).toThrow()
    expect(() => AgencyRequestUpdateSchema.parse({})).toThrow(
      /Au moins un champ/
    )
    expect(AgencyRequestUpdateSchema.parse({ recipientName: null })).toEqual({
      recipientName: null,
    })
    expect(AgencySettingsUpdateSchema.parse({ signature: null })).toEqual({
      signature: null,
    })
    expect(() => AgencySettingsUpdateSchema.parse({ signature: '' })).toThrow()
  })

  it('entrées MCP : un brouillon par annonce, accord dans la conversation explicite', () => {
    const parsed = McpPrepareAgencyRequestsInputSchema.parse({
      requests: [
        { listingId: ID, contact: { email: 'contact@agence.exemple.invalid' } },
      ],
    })
    expect(parsed.requests[0]?.contact?.email).toBe(
      'contact@agence.exemple.invalid'
    )
    expect(() =>
      McpPrepareAgencyRequestsInputSchema.parse({ requests: [] })
    ).toThrow()
    const sent = McpRecordRequestSentInputSchema.parse({ requestId: ID })
    expect(sent.approvedInChat).toBeUndefined()
  })

  it('notification « réponse de l’agence » active par défaut', () => {
    expect(resolveNotificationPreferences({}).agency_answer).toEqual({
      in_app: true,
      push: true,
      email: false,
    })
  })
})
