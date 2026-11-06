import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TASK_FIELD_BY_LABEL } from '@apart/contracts'
import type { EvaluatedListing, Task as TaskDto } from '@apart/contracts'
import { Prisma } from '../generated/prisma'
import type { AgencyRequest, ListingContact } from '../generated/prisma'
import {
  answersOf,
  questionTask,
  requestLike,
  toAgencyRequestDto,
  toListingContactDto,
} from './agency-requests.mapper'
import {
  answerPatchData,
  answerableOf,
  withAgencyProvenance,
} from './agency-requests.service'

const ID = '11111111-1111-4111-8111-111111111111'
const WS = '22222222-2222-4222-8222-222222222222'
const REQ = '33333333-3333-4333-8333-333333333333'
const TASK = '44444444-4444-4444-8444-444444444444'
const NOW = new Date('2026-11-20T10:00:00.000Z')

const row = (over: Partial<AgencyRequest> = {}): AgencyRequest => ({
  id: REQ,
  workspaceId: WS,
  listingId: ID,
  status: 'sent',
  channel: 'email',
  recipientName: 'Agence [Exemple]',
  subject: 'Objet',
  body: 'Texte',
  taskIds: [TASK, '55555555-5555-4555-8555-555555555555'],
  createdById: null,
  createdVia: 'mcp',
  createdAt: new Date('2026-11-02T09:00:00.000Z'),
  updatedAt: new Date('2026-11-02T09:00:00.000Z'),
  approvedAt: null,
  approvedVia: null,
  approvedById: null,
  sentAt: new Date('2026-11-05T09:00:00.000Z'),
  sentById: null,
  threadRef: null,
  answeredAt: null,
  answers: [],
  closedAt: null,
  followUpOfId: null,
  ...over,
})

const task = (over: Partial<TaskDto> = {}): TaskDto => ({
  id: TASK,
  listingId: ID,
  label: 'Demander le montant de la taxe foncière',
  done: false,
  doneAt: null,
  assigneeId: null,
  origin: 'default',
  field: 'propertyTax',
  position: 0,
  createdAt: '2026-11-01T09:00:00.000Z',
  requestedAt: null,
  requestId: null,
  answeredAt: null,
  ...over,
})

const listing = {
  id: ID,
  title: 'T2 fictif',
  status: 'to_study' as const,
  url: null,
}

describe('lot 17 : mapper des demandes et du contact', () => {
  it('contact', () => {
    const contact: ListingContact = {
      listingId: ID,
      workspaceId: WS,
      agencyName: 'Agence [Exemple]',
      contactName: null,
      email: 'contact@agence.exemple.invalid',
      phone: null,
      portalMessageUrl: null,
      preferredChannel: 'email',
      createdAt: NOW,
      updatedAt: NOW,
      updatedById: null,
    }
    // Lot 18 : le nom de l'agence est celui de l'annonce.
    expect(toListingContactDto(contact, 'Agence [Exemple] du port')).toEqual({
      listingId: ID,
      agencyName: 'Agence [Exemple] du port',
      contactName: null,
      email: 'contact@agence.exemple.invalid',
      phone: null,
      portalMessageUrl: null,
      preferredChannel: 'email',
      updatedAt: NOW.toISOString(),
      updatedById: null,
    })
  })

  it('demande : questions de l’annonce (tâche supprimée omise), relance due, canal de création', () => {
    const dto = toAgencyRequestDto(row(), {
      listing,
      tasks: [task()],
      siblings: [],
      now: NOW,
    })
    expect(dto.questions).toEqual([
      {
        taskId: TASK,
        label: 'Demander le montant de la taxe foncière',
        field: 'propertyTax',
        question: 'le montant de la dernière taxe foncière',
        done: false,
      },
    ])
    expect(dto.createdChannel).toBe('mcp')
    expect(dto.followUpDueOn).toBe('2026-11-13')
    expect(dto.followUpDue).toBe(true)
    // Déjà relancée (relance non annulée) : plus rien n'est dû.
    const followed = toAgencyRequestDto(row({ createdVia: 'web' }), {
      listing,
      tasks: [task()],
      siblings: [
        { followUpOfId: REQ, status: 'draft' },
        { followUpOfId: 'autre', status: 'sent' },
      ],
      now: NOW,
      followUpBusinessDays: 3,
    })
    expect(followed.createdChannel).toBe('web')
    expect(followed.followUpDue).toBe(false)
    const cancelledFollowUp = toAgencyRequestDto(row(), {
      listing,
      tasks: [task({ done: true })],
      siblings: [{ followUpOfId: REQ, status: 'cancelled' }],
      now: NOW,
    })
    expect(cancelledFollowUp.followUpDue).toBe(false)
  })

  it('réponses illisibles : aucune ; vues de domain', () => {
    expect(answersOf({ answers: [{ nope: true }] })).toEqual([])
    expect(answersOf({ answers: 'x' })).toEqual([])
    expect(
      requestLike(row({ approvedAt: NOW, answeredAt: NOW }))
    ).toMatchObject({
      id: REQ,
      approvedAt: NOW.toISOString(),
      answeredAt: NOW.toISOString(),
      recipientName: 'Agence [Exemple]',
    })
    expect(requestLike(row({ sentAt: null }))).toMatchObject({ sentAt: null })
    expect(questionTask(task())).toMatchObject({
      id: TASK,
      field: 'propertyTax',
    })
  })

  it('valeurs d’une réponse en colonnes, provenance « agence »', () => {
    const data = answerPatchData({
      surface: 42.5,
      annualCharges: 1680,
      propertyTax: 950,
      dpeClass: 'C',
      gesClass: 'B',
      dpeConsumption: 180,
      dpeDate: '2023-03-01',
      floor: 3,
      elevator: true,
      constructionYear: 1965,
      lotsCount: 24,
      votedWorks: 'Aucun',
      proceedings: 'Aucune',
      heatingType: 'Gaz individuel',
    })
    expect(data.surface).toEqual(new Prisma.Decimal(42.5))
    expect(data.annualCharges).toEqual(new Prisma.Decimal(1680))
    expect(data.propertyTax).toEqual(new Prisma.Decimal(950))
    expect(data.dpeDate).toEqual(new Date('2023-03-01T00:00:00.000Z'))
    expect(data).toMatchObject({
      dpeClass: 'C',
      gesClass: 'B',
      dpeConsumption: 180,
      floor: 3,
      elevator: true,
      constructionYear: 1965,
      lotsCount: 24,
      votedWorks: 'Aucun',
      proceedings: 'Aucune',
      heatingType: 'Gaz individuel',
    })
    expect(answerPatchData({})).toEqual({})
    const sources = withAgencyProvenance(
      { surface: { source: 'user' } },
      ['annualCharges'],
      NOW,
      'x'.repeat(400)
    )
    expect(sources.surface).toEqual({ source: 'user' })
    expect(sources.annualCharges).toEqual({
      source: 'agency',
      recordedAt: NOW.toISOString(),
      evidence: 'x'.repeat(300),
    })
    expect(
      withAgencyProvenance({}, ['lotsCount'], NOW, null).lotsCount
    ).toEqual({
      source: 'agency',
      recordedAt: NOW.toISOString(),
    })
  })

  it('ce que la réponse lit de la fiche', () => {
    const item = {
      listing: {
        location: { addressRaw: '12 rue [Exemple]' },
        surface: 42,
        annualCharges: null,
        propertyTax: 900,
        dpeClass: 'C',
        dpeConsumption: null,
        gesClass: null,
        dpeDate: null,
        floor: 2,
        elevator: null,
        constructionYear: null,
        lotsCount: null,
        votedWorks: null,
        proceedings: null,
        heatingType: null,
        fieldSources: {},
      },
    } as unknown as EvaluatedListing
    expect(answerableOf(item)).toMatchObject({
      addressRaw: '12 rue [Exemple]',
      surface: 42,
      propertyTax: 900,
      floor: 2,
    })
  })
})

describe('lot 17 : rattrapage de la migration', () => {
  it('pose le champ de chaque libellé connu, exactement comme TASK_FIELD_BY_LABEL', () => {
    const sql = readFileSync(
      path.join(
        __dirname,
        '..',
        '..',
        'prisma',
        'migrations',
        '20261107110000_lot17_agency_requests',
        'migration.sql'
      ),
      'utf8'
    )
    const updates = [
      ...sql.matchAll(
        /UPDATE "app"\."tasks" SET "field" = '([A-Za-z]+)' WHERE "field" IS NULL AND "origin" <> 'visit' AND "label" = '((?:[^']|'')+)';/g
      ),
    ].map(m => [(m[2] as string).replace(/''/g, "'"), m[1]])
    expect(Object.fromEntries(updates)).toEqual(TASK_FIELD_BY_LABEL)
    // Purement additive : aucune colonne existante supprimée ni modifiée.
    expect(sql).not.toMatch(/DROP|ALTER COLUMN|RENAME/)
  })
})
