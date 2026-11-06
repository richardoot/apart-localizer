import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  ACTIVE_LISTING_STATUSES,
  DEFAULT_FOLLOW_UP_BUSINESS_DAYS,
} from '@apart/contracts'
import type {
  ActivityChannel,
  AgencyAnswer,
  AgencyAnswerChange,
  AgencyAnswerInput,
  AgencyAnswerResult,
  AgencyApplyProposed,
  AgencyApplyResult,
  AgencyRequest as AgencyRequestDto,
  AgencyRequestDraftInput,
  AgencyRequestListing,
  AgencyRequestSent,
  AgencyRequestStatus,
  AgencyRequestUpdate,
  AgencySettings,
  AgencySettingsUpdate,
  EvaluatedListing,
  FieldProvenanceMap,
  ListingContact as ListingContactDto,
  ListingContactInput,
  ListingContactPatch,
  ListingExchanges,
  OpenQuestionsReport,
  PendingAgencyRequests,
  Task as TaskDto,
} from '@apart/contracts'
import {
  applyProposed,
  defaultAgencyMessage,
  defaultSignature,
  normalizeSeller,
  openQuestions,
  planAgencyAnswer,
  preferredAgencyChannel,
  questionText,
  recipientDisplayName,
  resolveDraftQuestions,
  resolveSignature,
  sanitizeAnswerExcerpt,
  transitionProblem,
} from '@apart/domain'
import type { AgencyAnswerPatch, AnswerableListing } from '@apart/domain'
import { ActivityService } from '../activity/activity.service'
import { PrismaService } from '../prisma/prisma.service'
import { ListingEnrichmentService } from '../listings/enrichment.service'
import { ListingsService } from '../listings/listings.service'
import { toTaskDto } from '../listings/listing.mapper'
import { MEMBER_ORDER } from '../workspace/member-order'
import { Prisma } from '../generated/prisma'
import type { AgencyRequest, ListingContact, Member } from '../generated/prisma'
import {
  answersOf,
  questionTask,
  requestLike,
  toAgencyRequestDto,
  toListingContactDto,
} from './agency-requests.mapper'

type WriteChannel = Extract<ActivityChannel, 'web' | 'mcp'>

/** Une annonce avec ce que les échanges lisent. */
const exchangeInclude = {
  tasks: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
  contact: true,
  agencyRequests: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.ListingInclude

type ExchangeListing = Prisma.ListingGetPayload<{
  include: typeof exchangeInclude
}>

/** Un brouillon prêt à écrire. */
interface DraftPlan {
  listing: ExchangeListing
  taskIds: string[]
  channel: AgencyRequest['channel']
  recipientName: string | null
  subject: string
  body: string
  followUpOfId: string | null
  contactPatch: ListingContactPatch | null
  /** Le message pas encore envoyé que ce brouillon remplace (annulé). */
  replacesId: string | null
}

/** Un brouillon demandé : par le web, ou par le MCP (contact lu, message remplacé). */
type DraftItem = AgencyRequestDraftInput & {
  listingId: string
  contact?: ListingContactPatch | undefined
  replaces?: string | undefined
}

/** Les champs de contact, dans l'ordre. */
const CONTACT_KEYS = [
  'agencyName',
  'contactName',
  'email',
  'phone',
  'portalMessageUrl',
  'preferredChannel',
] as const

/** Les valeurs de la fiche dont un changement relance le plafond, le marché et l'arrêt. */
const ENRICHMENT_KEYS = ['surface', 'floor', 'constructionYear'] as const

/**
 * Lot 17 : les questions aux agences (ADR 0027). Le contact de l'annonceur,
 * les demandes (brouillon, validation par lot, envoi, réponse, « pas de
 * réponse », annulation), les valeurs proposées appliquées, la signature de
 * l'espace. **Ce service n'envoie jamais de message** : il garde la trace de
 * ce que Claude (avec les outils de l'utilisateur) ou un membre a envoyé.
 * `domain` décide (questions, texte, transitions, relances, application
 * d'une réponse) ; chaque écriture est journalisée dans sa transaction.
 */
@Injectable()
export class AgencyRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly listings: ListingsService,
    private readonly enrichment: ListingEnrichmentService
  ) {}

  // -------------------------------------------------------------------------
  // Contact
  // -------------------------------------------------------------------------

  async getContact(
    member: Member,
    listingId: string
  ): Promise<ListingContactDto | null> {
    const listing = await this.loadListing(member, listingId)
    return listing.contact
      ? toListingContactDto(listing.contact, listing.sellerName)
      : null
  }

  /** Remplace le contact (REST) ; un champ à null est vidé. */
  async putContact(
    member: Member,
    listingId: string,
    input: ListingContactInput
  ): Promise<ListingContactDto> {
    const listing = await this.loadListing(member, listingId)
    const before = listing.contact
    // Lot 18 : le nom de l'agence est celui de l'annonce (une seule source).
    const current = (key: (typeof CONTACT_KEYS)[number]) =>
      key === 'agencyName' ? listing.sellerName : (before?.[key] ?? null)
    const changed = CONTACT_KEYS.filter(key => current(key) !== input[key])
    const { agencyName, ...contact } = input
    const row = await this.prisma.$transaction(async tx => {
      if (agencyName !== listing.sellerName) {
        await this.writeSellerName(tx, listing, agencyName, 'user')
      }
      const saved = await tx.listingContact.upsert({
        where: { listingId },
        create: {
          listingId,
          workspaceId: member.workspaceId,
          ...contact,
          agencyName: null,
          updatedById: member.id,
        },
        update: { ...contact, agencyName: null, updatedById: member.id },
      })
      if (changed.length > 0) {
        await this.activity.record(
          {
            workspaceId: member.workspaceId,
            listingId,
            actorMemberId: member.id,
            channel: 'web',
            action: 'contact.updated',
            // Jamais les valeurs : un contact effacé doit l'être vraiment.
            before: { state: before ? 'some' : 'none' },
            after: { fields: changed },
          },
          tx
        )
      }
      return saved
    })
    const after = await this.loadListing(member, listingId)
    return toListingContactDto(row, after.sellerName)
  }

  /**
   * Lot 18 : le nom de l'agence du contact est celui de l'annonce
   * (`seller_name`), normalisé ; un particulier n'en a pas. Provenance du
   * champ comme les autres.
   */
  private async writeSellerName(
    tx: Prisma.TransactionClient,
    listing: ExchangeListing,
    name: string | null,
    source: 'user' | 'ai'
  ): Promise<void> {
    const next = normalizeSeller({
      sellerType: listing.sellerType,
      sellerName: name,
      sellerReference: listing.sellerReference,
    })
    if (next.sellerName === listing.sellerName) return
    const sources = (listing.fieldSources ?? {}) as FieldProvenanceMap
    await tx.listing.update({
      where: { id: listing.id },
      data: {
        sellerName: next.sellerName,
        fieldSources: {
          ...sources,
          sellerName: { source, recordedAt: new Date().toISOString() },
        } as Prisma.InputJsonValue,
      },
    })
  }

  /** Efface le contact de l'annonceur (REST seulement ; jamais par le MCP). */
  async clearContact(member: Member, listingId: string): Promise<void> {
    const listing = await this.loadListing(member, listingId)
    if (!listing.contact) return
    await this.prisma.$transaction(async tx => {
      await tx.listingContact.delete({ where: { listingId } })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel: 'web',
          action: 'contact.cleared',
        },
        tx
      )
    })
  }

  // -------------------------------------------------------------------------
  // Signature
  // -------------------------------------------------------------------------

  async settings(member: Member): Promise<AgencySettings> {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: member.workspaceId },
      select: { agencySignature: true },
    })
    const names = await this.memberNames(member.workspaceId)
    return {
      signature: resolveSignature(workspace.agencySignature, names),
      custom: Boolean(workspace.agencySignature?.trim()),
      defaultSignature: defaultSignature(names),
      followUpBusinessDays: DEFAULT_FOLLOW_UP_BUSINESS_DAYS,
    }
  }

  async updateSettings(
    member: Member,
    update: AgencySettingsUpdate
  ): Promise<AgencySettings> {
    await this.prisma.$transaction(async tx => {
      await tx.workspace.update({
        where: { id: member.workspaceId },
        data: { agencySignature: update.signature },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          actorMemberId: member.id,
          channel: 'web',
          action: 'agency_request.signature_changed',
          after: { signature: update.signature },
        },
        tx
      )
    })
    return this.settings(member)
  }

  // -------------------------------------------------------------------------
  // Lectures
  // -------------------------------------------------------------------------

  /** L'onglet « Échanges » d'une annonce. */
  async exchanges(
    member: Member,
    listingId: string
  ): Promise<ListingExchanges> {
    const listing = await this.loadListing(member, listingId)
    const signature = await this.signature(member.workspaceId)
    return this.exchangesOf(listing, signature, new Date())
  }

  /**
   * `list_open_questions` : par annonce, les questions posables, le contact,
   * les demandes en cours (closes et annulées omises). Sans liste, les
   * annonces actives qui ont une question ouverte ou une demande en cours.
   */
  async openQuestionsReport(
    member: Member,
    listingIds?: readonly string[]
  ): Promise<OpenQuestionsReport> {
    const rows = await this.prisma.listing.findMany({
      where: {
        workspaceId: member.workspaceId,
        ...(listingIds?.length
          ? { id: { in: [...listingIds] } }
          : { status: { in: [...ACTIVE_LISTING_STATUSES] } }),
      },
      include: exchangeInclude,
      orderBy: { createdAt: 'asc' },
    })
    if (listingIds?.length && rows.length !== new Set(listingIds).size) {
      throw new NotFoundException('Annonce introuvable dans l’espace')
    }
    const signature = await this.signature(member.workspaceId)
    const now = new Date()
    const listings = rows
      .map(row => this.exchangesOf(row, signature, now))
      .map(view => ({
        ...view,
        requests: view.requests.filter(
          r =>
            r.status === 'draft' ||
            r.status === 'approved' ||
            r.status === 'sent' ||
            (r.status === 'answered' && r.questions.some(q => !q.done)) ||
            r.followUpDue
        ),
      }))
      .filter(
        view =>
          Boolean(listingIds?.length) ||
          view.openQuestions.length > 0 ||
          view.requests.length > 0
      )
    return {
      listings,
      signature,
      followUpBusinessDays: DEFAULT_FOLLOW_UP_BUSINESS_DAYS,
    }
  }

  /** Ce qui attend un membre, toutes annonces confondues (Synthèse). */
  async pending(member: Member): Promise<PendingAgencyRequests> {
    const rows = await this.prisma.agencyRequest.findMany({
      where: {
        workspaceId: member.workspaceId,
        status: { in: ['draft', 'approved', 'sent', 'answered'] },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            status: true,
            url: true,
            tasks: true,
            agencyRequests: { select: { followUpOfId: true, status: true } },
          },
        },
      },
    })
    const now = new Date()
    const dtos = rows.map(row =>
      toAgencyRequestDto(row, {
        listing: listingSummary(row.listing),
        tasks: row.listing.tasks.map(toTaskDto),
        siblings: row.listing.agencyRequests,
        now,
      })
    )
    return {
      toApprove: dtos.filter(r => r.status === 'draft'),
      toSend: dtos.filter(r => r.status === 'approved'),
      followUpsDue: dtos.filter(r => r.followUpDue),
    }
  }

  /** Les contacts et demandes des annonces exportées. */
  async forExport(
    member: Member,
    items: readonly EvaluatedListing[]
  ): Promise<{
    contacts: Map<string, ListingContactDto>
    requests: Map<string, AgencyRequestDto[]>
  }> {
    const ids = items.map(i => i.listing.id)
    const [contacts, requests] = await Promise.all([
      this.prisma.listingContact.findMany({
        where: { workspaceId: member.workspaceId, listingId: { in: ids } },
      }),
      this.prisma.agencyRequest.findMany({
        where: { workspaceId: member.workspaceId, listingId: { in: ids } },
        orderBy: { createdAt: 'desc' },
      }),
    ])
    const now = new Date()
    const byListing = new Map(items.map(i => [i.listing.id, i]))
    const sellerNames = new Map(
      items.map(i => [i.listing.id, i.listing.sellerName])
    )
    const result = new Map<string, AgencyRequestDto[]>()
    for (const row of requests) {
      const item = byListing.get(row.listingId)
      if (!item) continue
      const dto = toAgencyRequestDto(row, {
        listing: listingSummary(item.listing),
        tasks: item.tasks,
        siblings: requests.filter(r => r.listingId === row.listingId),
        now,
      })
      result.set(row.listingId, [...(result.get(row.listingId) ?? []), dto])
    }
    return {
      contacts: new Map(
        contacts.map(c => [
          c.listingId,
          toListingContactDto(c, sellerNames.get(c.listingId) ?? null),
        ])
      ),
      requests: result,
    }
  }

  // -------------------------------------------------------------------------
  // Brouillons, validation, annulation
  // -------------------------------------------------------------------------

  /**
   * Crée des brouillons (un par annonce et destinataire), à montrer au
   * membre : tâches posées (par défaut toutes les questions ouvertes), canal
   * et destinataire du contact, texte par défaut de `domain`. Tout ou rien.
   * Au MCP, `contact` complète le contact de l'annonceur sans rien effacer.
   */
  async createDrafts(
    member: Member,
    items: readonly DraftItem[],
    channel: WriteChannel
  ): Promise<AgencyRequestDto[]> {
    const signature = await this.signature(member.workspaceId)
    const plans: DraftPlan[] = []
    for (const item of items) {
      plans.push(await this.planDraft(member, item, signature, plans))
    }
    const createdIds = await this.prisma.$transaction(async tx => {
      const ids: string[] = []
      for (const plan of plans) {
        if (plan.contactPatch) {
          await this.writeContactPatch(
            tx,
            member,
            plan.listing,
            plan.contactPatch,
            channel
          )
        }
        const row = await tx.agencyRequest.create({
          data: {
            workspaceId: member.workspaceId,
            listingId: plan.listing.id,
            status: 'draft',
            channel: plan.channel,
            recipientName: plan.recipientName,
            subject: plan.subject,
            body: plan.body,
            taskIds: plan.taskIds,
            createdById: member.id,
            createdVia: channel,
            followUpOfId: plan.followUpOfId,
          },
        })
        await this.activity.record(
          {
            workspaceId: member.workspaceId,
            listingId: plan.listing.id,
            actorMemberId: member.id,
            channel,
            action: 'agency_request.drafted',
            after: {
              requestId: row.id,
              channel: plan.channel,
              taskIds: plan.taskIds,
              ...(plan.followUpOfId ? { followUpOf: plan.followUpOfId } : {}),
            },
          },
          tx
        )
        if (plan.replacesId) {
          const replaced = await tx.agencyRequest.update({
            where: { id: plan.replacesId },
            data: { status: 'cancelled', closedAt: new Date() },
          })
          await this.activity.record(
            {
              workspaceId: member.workspaceId,
              listingId: plan.listing.id,
              actorMemberId: member.id,
              channel,
              action: 'agency_request.cancelled',
              before: { requestId: replaced.id },
              after: {
                requestId: replaced.id,
                status: 'cancelled',
                replacedBy: row.id,
              },
            },
            tx
          )
        }
        ids.push(row.id)
      }
      return ids
    })
    return Promise.all(createdIds.map(id => this.dto(member, id)))
  }

  /** Modifie un message avant l'envoi ; un message validé repasse « à valider ». */
  async update(
    member: Member,
    requestId: string,
    update: AgencyRequestUpdate
  ): Promise<AgencyRequestDto> {
    const row = await this.loadRequest(member, requestId)
    if (row.status !== 'draft') {
      const problem = transitionProblem(row.status, 'draft')
      if (problem) throw new BadRequestException(problem)
    }
    const fields = (
      ['subject', 'body', 'channel', 'recipientName'] as const
    ).filter(key => update[key] !== undefined && update[key] !== row[key])
    await this.prisma.$transaction(async tx => {
      await tx.agencyRequest.update({
        where: { id: row.id },
        data: {
          ...(update.subject !== undefined ? { subject: update.subject } : {}),
          ...(update.body !== undefined ? { body: update.body } : {}),
          ...(update.channel !== undefined ? { channel: update.channel } : {}),
          ...(update.recipientName !== undefined
            ? { recipientName: update.recipientName }
            : {}),
          // Une validation porte sur un texte précis : le changer la retire.
          ...(row.status === 'approved'
            ? {
                status: 'draft',
                approvedAt: null,
                approvedVia: null,
                approvedById: null,
              }
            : {}),
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: row.listingId,
          actorMemberId: member.id,
          channel: 'web',
          action: 'agency_request.updated',
          before: { requestId: row.id, status: row.status },
          after: { requestId: row.id, fields },
        },
        tx
      )
    })
    return this.dto(member, row.id)
  }

  /**
   * Validation par lot (bouton « Valider l'envoi », ou accord dans la
   * conversation) : tous les messages doivent être « à valider », sinon rien
   * n'est validé.
   */
  async approve(
    member: Member,
    requestIds: readonly string[],
    via: 'app' | 'chat',
    channel: WriteChannel
  ): Promise<AgencyRequestDto[]> {
    const ids = [...new Set(requestIds)]
    const rows = await this.prisma.agencyRequest.findMany({
      where: { id: { in: ids }, workspaceId: member.workspaceId },
    })
    if (rows.length !== ids.length) {
      throw new NotFoundException('Demande introuvable dans l’espace')
    }
    for (const row of rows) {
      const problem = transitionProblem(row.status, 'approved')
      if (problem) throw new BadRequestException(problem)
    }
    const now = new Date()
    await this.prisma.$transaction(async tx => {
      for (const row of rows) {
        await this.approveRow(tx, member, row, via, channel, now)
      }
    })
    return Promise.all(ids.map(id => this.dto(member, id)))
  }

  async cancel(
    member: Member,
    requestId: string,
    channel: WriteChannel = 'web'
  ): Promise<AgencyRequestDto> {
    const row = await this.loadRequest(member, requestId)
    await this.close(member, row, 'cancelled', channel)
    return this.dto(member, row.id)
  }

  /** « Pas de réponse » : la demande envoyée est close, ses questions se reposent. */
  async noAnswer(
    member: Member,
    requestId: string,
    channel: WriteChannel = 'web'
  ): Promise<AgencyRequestDto> {
    const row = await this.loadRequest(member, requestId)
    await this.close(member, row, 'no_answer', channel)
    return this.dto(member, row.id)
  }

  // -------------------------------------------------------------------------
  // Envoi
  // -------------------------------------------------------------------------

  /**
   * Enregistre l'envoi d'un message validé, fait par Claude avec les outils
   * de l'utilisateur (Gmail, messagerie du portail) ou par un membre. Le
   * serveur n'envoie rien. Un brouillon n'est accepté qu'avec l'accord
   * explicite du membre dans la conversation (`approvedInChat`, MCP), noté
   * comme validation « dans la conversation ». Les tâches passent
   * « demandées » ; la demande relancée, s'il y en a une, est close.
   */
  async markSent(
    member: Member,
    requestId: string,
    input: AgencyRequestSent & { approvedInChat?: boolean | undefined },
    channel: WriteChannel
  ): Promise<AgencyRequestDto> {
    const row = await this.loadRequest(member, requestId)
    const viaChat =
      row.status === 'draft' &&
      input.approvedInChat === true &&
      channel === 'mcp'
    if (!viaChat) {
      const problem = transitionProblem(row.status, 'sent')
      if (problem) throw new BadRequestException(problem)
    }
    const now = new Date()
    const sentAt = input.sentAt ? new Date(input.sentAt) : now
    await this.prisma.$transaction(async tx => {
      if (viaChat) await this.approveRow(tx, member, row, 'chat', channel, now)
      await tx.agencyRequest.update({
        where: { id: row.id },
        data: {
          status: 'sent',
          sentAt,
          sentById: member.id,
          ...(input.channel ? { channel: input.channel } : {}),
          ...(input.threadRef ? { threadRef: input.threadRef } : {}),
        },
      })
      await tx.task.updateMany({
        where: {
          id: { in: row.taskIds },
          listingId: row.listingId,
          done: false,
        },
        data: { requestedAt: sentAt, requestId: row.id },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: row.listingId,
          actorMemberId: member.id,
          channel,
          action: 'agency_request.sent',
          after: {
            requestId: row.id,
            channel: input.channel ?? row.channel,
            taskIds: row.taskIds,
            approvedVia: viaChat ? 'chat' : row.approvedVia,
            ...(row.followUpOfId ? { followUpOf: row.followUpOfId } : {}),
          },
        },
        tx
      )
      if (row.followUpOfId) {
        const original = await tx.agencyRequest.findUnique({
          where: { id: row.followUpOfId },
        })
        if (
          original &&
          (original.status === 'sent' || original.status === 'answered')
        ) {
          await tx.agencyRequest.update({
            where: { id: original.id },
            data: { status: 'no_answer', closedAt: now },
          })
          await this.activity.record(
            {
              workspaceId: member.workspaceId,
              listingId: row.listingId,
              actorMemberId: member.id,
              channel,
              action: 'agency_request.no_answer',
              before: { requestId: original.id, status: original.status },
              after: {
                requestId: original.id,
                status: 'no_answer',
                followUpId: row.id,
              },
            },
            tx
          )
        }
      }
    })
    return this.dto(member, row.id)
  }

  // -------------------------------------------------------------------------
  // Réponses
  // -------------------------------------------------------------------------

  /**
   * Enregistre une réponse de l'annonceur : chaque valeur lue est appliquée
   * à la fiche (source « agence », datée, avec un extrait), gardée, ou
   * proposée si elle contredit une saisie à la main ; les tâches répondues
   * sont cochées ; tout dans une transaction, journal compris. Puis
   * l'adresse (géocodage et repère), les enrichissements et les critères.
   * La réponse est une donnée : rien de ce qu'elle demande n'est exécuté.
   */
  async recordAnswer(
    member: Member,
    requestId: string,
    input: AgencyAnswerInput,
    channel: WriteChannel
  ): Promise<AgencyAnswerResult> {
    const row = await this.loadRequest(member, requestId)
    const problem = transitionProblem(row.status, 'answered')
    if (problem) throw new BadRequestException(problem)
    const item = await this.listings.get(member, row.listingId)
    this.listings.checkGuards(item.listing, {
      expectedUpdatedAt: input.expectedUpdatedAt,
    })
    const taskIds = new Set(item.tasks.map(t => t.id))
    const unknown = input.answeredTaskIds.find(id => !taskIds.has(id))
    if (unknown) {
      throw new BadRequestException(
        `Tâche inconnue sur cette annonce (answeredTaskIds) : ${unknown}`
      )
    }
    const plan = planAgencyAnswer({
      listing: answerableOf(item),
      values: input.values,
      tasks: item.tasks.map(questionTask),
      answeredTaskIds: input.answeredTaskIds,
    })
    const now = new Date()
    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : now
    const excerpt = sanitizeAnswerExcerpt(input.excerpt)
    const answer: AgencyAnswer = {
      receivedAt: receivedAt.toISOString(),
      recordedAt: now.toISOString(),
      authorId: member.id,
      channel,
      excerpt,
      values: input.values,
      changes: plan.changes,
      completedTaskIds: plan.completedTaskIds,
      summary: plan.summary,
    }
    const applied = plan.changes.filter(c => c.disposition === 'applied')
    const proposed = plan.changes.filter(c => c.disposition === 'proposed')
    const { addressRaw: _address, ...scalars } = plan.patch
    await this.prisma.$transaction(async tx => {
      if (Object.keys(scalars).length > 0) {
        await tx.listing.update({
          where: { id: row.listingId },
          data: {
            ...answerPatchData(scalars),
            fieldSources: withAgencyProvenance(
              item.listing.fieldSources,
              Object.keys(scalars),
              receivedAt,
              excerpt
            ) as Prisma.InputJsonValue,
          },
        })
      }
      if (plan.completedTaskIds.length > 0) {
        await tx.task.updateMany({
          where: {
            id: { in: plan.completedTaskIds },
            listingId: row.listingId,
          },
          data: { done: true, doneAt: receivedAt, answeredAt: receivedAt },
        })
        // La demande qui les porte, si l'envoi ne l'avait pas déjà notée.
        await tx.task.updateMany({
          where: { id: { in: plan.completedTaskIds }, requestId: null },
          data: { requestId: row.id },
        })
      }
      const previous = answersOf(row)
      const lastAnswer = [
        ...previous.map(a => Date.parse(a.receivedAt)),
        receivedAt.getTime(),
      ].reduce((a, b) => Math.max(a, b))
      await tx.agencyRequest.update({
        where: { id: row.id },
        data: {
          status: 'answered',
          answeredAt: new Date(lastAnswer),
          answers: [...previous, answer] as unknown as Prisma.InputJsonValue,
          ...(input.threadRef && !row.threadRef
            ? { threadRef: input.threadRef }
            : {}),
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: row.listingId,
          actorMemberId: member.id,
          channel,
          action: 'agency_request.answered',
          before: applied.length
            ? { facts: Object.fromEntries(applied.map(c => [c.key, c.before])) }
            : null,
          after: {
            requestId: row.id,
            summary: plan.summary,
            ...(applied.length
              ? {
                  facts: Object.fromEntries(applied.map(c => [c.key, c.after])),
                }
              : {}),
            proposed: proposed.map(c => c.key),
            completedTasks: item.tasks
              .filter(t => plan.completedTaskIds.includes(t.id))
              .map(t => t.label),
          },
        },
        tx
      )
    })
    const listing = await this.afterFacts(member, item, plan.patch, channel)
    const request = await this.dto(member, row.id)
    return {
      request,
      answer,
      listing,
      applied,
      proposed,
      completedTasks: listing.tasks.filter(t =>
        plan.completedTaskIds.includes(t.id)
      ),
    }
  }

  /** Applique des valeurs proposées (le membre retient la réponse de l'annonceur). */
  async applyProposed(
    member: Member,
    requestId: string,
    input: AgencyApplyProposed,
    channel: WriteChannel = 'web'
  ): Promise<AgencyApplyResult> {
    const row = await this.loadRequest(member, requestId)
    const item = await this.listings.get(member, row.listingId)
    this.listings.checkGuards(item.listing, {
      expectedUpdatedAt: input.expectedUpdatedAt,
    })
    const now = new Date()
    const patch: AgencyAnswerPatch = {}
    const applied: AgencyAnswerChange[] = []
    // De la plus récente à la plus ancienne : la dernière réponse l'emporte.
    const answers = answersOf(row)
    const remaining = new Set(input.keys)
    const next = [...answers]
      .reverse()
      .map(answer => {
        const result = applyProposed(answer.changes, [...remaining], now)
        for (const change of result.applied) remaining.delete(change.key)
        Object.assign(patch, result.patch)
        applied.push(...result.applied)
        return { ...answer, changes: result.changes }
      })
      .reverse()
    if (applied.length === 0) {
      throw new BadRequestException(
        'Aucune de ces valeurs n’est proposée par cette demande.'
      )
    }
    const { addressRaw: _address, ...scalars } = patch
    const answer = answers.at(-1)
    await this.prisma.$transaction(async tx => {
      if (Object.keys(scalars).length > 0) {
        await tx.listing.update({
          where: { id: row.listingId },
          data: {
            ...answerPatchData(scalars),
            fieldSources: withAgencyProvenance(
              item.listing.fieldSources,
              Object.keys(scalars),
              answer ? new Date(answer.receivedAt) : now,
              answer?.excerpt ?? null
            ) as Prisma.InputJsonValue,
          },
        })
      }
      await tx.agencyRequest.update({
        where: { id: row.id },
        data: { answers: next as unknown as Prisma.InputJsonValue },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: row.listingId,
          actorMemberId: member.id,
          channel,
          action: 'agency_request.value_applied',
          before: {
            facts: Object.fromEntries(applied.map(c => [c.key, c.before])),
          },
          after: {
            requestId: row.id,
            facts: Object.fromEntries(applied.map(c => [c.key, c.after])),
          },
        },
        tx
      )
    })
    const listing = await this.afterFacts(member, item, patch, channel)
    return { request: await this.dto(member, row.id), listing, applied }
  }

  // -------------------------------------------------------------------------
  // Interne
  // -------------------------------------------------------------------------

  private async afterFacts(
    member: Member,
    item: EvaluatedListing,
    patch: AgencyAnswerPatch,
    channel: WriteChannel
  ): Promise<EvaluatedListing> {
    if (typeof patch.addressRaw === 'string') {
      // L'adresse passe par l'écriture des annonces : géocodage, repère,
      // données ouvertes et critères (lot 12) ; provenance « agence ».
      const { placement: _placement, ...location } = item.listing.location
      return this.listings.update(
        member,
        item.listing.id,
        { location: { ...location, addressRaw: patch.addressRaw } },
        {},
        { channel, provenance: 'agency' }
      )
    }
    if (ENRICHMENT_KEYS.some(key => key in patch)) {
      await this.enrichment.enrich(member, item.listing.id, {
        dpe: false,
        channel,
      })
    }
    return this.listings.afterWrite(member, item.listing.id, channel)
  }

  private async planDraft(
    member: Member,
    item: DraftItem,
    signature: string,
    earlier: readonly DraftPlan[]
  ): Promise<DraftPlan> {
    const listing = await this.loadListing(member, item.listingId)
    const tasks = listing.tasks.map(toTaskDto)
    const replaced = item.replaces
      ? listing.agencyRequests.find(r => r.id === item.replaces)
      : undefined
    if (item.replaces && !replaced) {
      throw new NotFoundException(
        'Message à remplacer (replaces) introuvable sur cette annonce'
      )
    }
    if (
      replaced &&
      replaced.status !== 'draft' &&
      replaced.status !== 'approved'
    ) {
      throw new BadRequestException(
        `Seul un message pas encore envoyé se remplace ; celui-ci est « ${replaced.status} ».`
      )
    }
    const open = new Set(tasks.filter(t => !t.done).map(t => t.id))
    // Les brouillons déjà prévus dans le même appel comptent comme en cours ;
    // le message remplacé, non.
    const requests = [
      ...listing.agencyRequests
        .filter(r => r.id !== replaced?.id)
        .map(requestLike),
      ...earlier
        .filter(p => p.listing.id === listing.id)
        .map((p, index) => ({
          id: `planned-${index}`,
          status: 'draft' as AgencyRequestStatus,
          taskIds: p.taskIds,
          createdAt: new Date().toISOString(),
          sentAt: null,
          answeredAt: null,
          followUpOfId: p.followUpOfId,
        })),
    ]
    const followUpOf = item.followUpOf ?? replaced?.followUpOfId ?? undefined
    const followUp = followUpOf
      ? listing.agencyRequests.find(r => r.id === followUpOf)
      : undefined
    if (followUpOf && !followUp) {
      throw new NotFoundException(
        'Demande à relancer (followUpOf) introuvable sur cette annonce'
      )
    }
    const resolved = resolveDraftQuestions({
      tasks: tasks.map(questionTask),
      requests,
      taskIds:
        item.taskIds ??
        replaced?.taskIds.filter(id => open.has(id)) ??
        undefined,
      followUpOf: followUp ? requestLike(followUp) : null,
    })
    if (!resolved.ok) throw new BadRequestException(resolved.problem)
    const contact = mergeContact(
      listing.contact,
      item.contact ?? null,
      listing.sellerName
    )
    const byId = new Map(tasks.map(t => [t.id, t]))
    const message = defaultAgencyMessage({
      listing: {
        title: listing.title,
        url: listing.url,
        // Lot 18 : la référence de l'agence, à défaut l'identifiant du portail.
        externalId: listing.sellerReference ?? listing.externalId,
        commune: listing.commune,
        price: Number(listing.price),
      },
      contactName: contact?.contactName ?? null,
      questions: resolved.taskIds.map(id =>
        questionText(byId.get(id) as TaskDto)
      ),
      signature,
      followUpOf: followUp
        ? { sentAt: followUp.sentAt?.toISOString() ?? null }
        : null,
    })
    return {
      listing,
      taskIds: resolved.taskIds,
      channel:
        item.channel ??
        followUp?.channel ??
        preferredAgencyChannel(contact, Boolean(listing.url)),
      recipientName:
        item.recipientName ??
        followUp?.recipientName ??
        recipientDisplayName(contact),
      subject: item.subject ?? message.subject,
      body: item.body ?? message.body,
      followUpOfId: followUp?.id ?? null,
      contactPatch:
        item.contact && Object.keys(item.contact).length > 0
          ? item.contact
          : null,
      replacesId: replaced?.id ?? null,
    }
  }

  /** Complète le contact (MCP) : seules les valeurs données s'écrivent ; rien n'est vidé. */
  private async writeContactPatch(
    tx: Prisma.TransactionClient,
    member: Member,
    listing: ExchangeListing,
    patch: ListingContactPatch,
    channel: WriteChannel
  ): Promise<void> {
    const before = listing.contact
    // Lot 18 : le nom de l'agence va à l'annonce, seulement s'il était
    // inconnu (un nom qui contredit la fiche n'est pas écrasé).
    const nameRead =
      patch.agencyName !== undefined && listing.sellerName === null
    if (nameRead) {
      await this.writeSellerName(tx, listing, patch.agencyName ?? null, 'ai')
    }
    const changed = CONTACT_KEYS.filter(
      key =>
        key !== 'agencyName' &&
        patch[key] !== undefined &&
        patch[key] !== (before?.[key] ?? null)
    )
    if (changed.length === 0 && !nameRead) return
    const data = Object.fromEntries(changed.map(key => [key, patch[key]]))
    if (changed.length === 0) {
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: listing.id,
          actorMemberId: member.id,
          channel,
          action: 'contact.updated',
          before: { state: before ? 'some' : 'none' },
          after: { fields: ['agencyName'] },
        },
        tx
      )
      return
    }
    // Lot 18 : le nom de l'agence est celui de l'annonce ; la colonne du
    // contact, gelée, est vidée à chaque écriture.
    await tx.listingContact.upsert({
      where: { listingId: listing.id },
      create: {
        listingId: listing.id,
        workspaceId: member.workspaceId,
        ...data,
        agencyName: null,
        updatedById: member.id,
      },
      update: { ...data, agencyName: null, updatedById: member.id },
    })
    await this.activity.record(
      {
        workspaceId: member.workspaceId,
        listingId: listing.id,
        actorMemberId: member.id,
        channel,
        action: 'contact.updated',
        before: { state: before ? 'some' : 'none' },
        after: { fields: nameRead ? ['agencyName', ...changed] : changed },
      },
      tx
    )
  }

  private async approveRow(
    tx: Prisma.TransactionClient,
    member: Member,
    row: AgencyRequest,
    via: 'app' | 'chat',
    channel: WriteChannel,
    now: Date
  ): Promise<void> {
    await tx.agencyRequest.update({
      where: { id: row.id },
      data: {
        status: 'approved',
        approvedAt: now,
        approvedVia: via,
        approvedById: member.id,
      },
    })
    await this.activity.record(
      {
        workspaceId: member.workspaceId,
        listingId: row.listingId,
        actorMemberId: member.id,
        channel,
        action: 'agency_request.approved',
        after: { requestId: row.id, approvedVia: via },
      },
      tx
    )
  }

  private async close(
    member: Member,
    row: AgencyRequest,
    status: 'cancelled' | 'no_answer',
    channel: WriteChannel
  ): Promise<void> {
    const problem = transitionProblem(row.status, status)
    if (problem) throw new BadRequestException(problem)
    await this.prisma.$transaction(async tx => {
      await tx.agencyRequest.update({
        where: { id: row.id },
        data: { status, closedAt: new Date() },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: row.listingId,
          actorMemberId: member.id,
          channel,
          action:
            status === 'cancelled'
              ? 'agency_request.cancelled'
              : 'agency_request.no_answer',
          before: { requestId: row.id, status: row.status },
          after: { requestId: row.id, status },
        },
        tx
      )
    })
  }

  private exchangesOf(
    listing: ExchangeListing,
    signature: string,
    now: Date
  ): ListingExchanges {
    const tasks = listing.tasks.map(toTaskDto)
    const summary = listingSummary(listing)
    return {
      listingId: listing.id,
      listing: summary,
      expectedUpdatedAt: listing.updatedAt.toISOString(),
      contact: listing.contact
        ? toListingContactDto(listing.contact, listing.sellerName)
        : null,
      requests: listing.agencyRequests.map(row =>
        toAgencyRequestDto(row, {
          listing: summary,
          tasks,
          siblings: listing.agencyRequests,
          now,
        })
      ),
      openQuestions: openQuestions(
        tasks.map(questionTask),
        listing.agencyRequests.map(requestLike)
      ),
      signature,
      followUpBusinessDays: DEFAULT_FOLLOW_UP_BUSINESS_DAYS,
    }
  }

  private async dto(
    member: Member,
    requestId: string
  ): Promise<AgencyRequestDto> {
    const row = await this.loadRequest(member, requestId)
    const listing = await this.loadListing(member, row.listingId)
    return toAgencyRequestDto(row, {
      listing: listingSummary(listing),
      tasks: listing.tasks.map(toTaskDto),
      siblings: listing.agencyRequests,
      now: new Date(),
    })
  }

  private async loadListing(
    member: Member,
    listingId: string
  ): Promise<ExchangeListing> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, workspaceId: member.workspaceId },
      include: exchangeInclude,
    })
    if (!listing) throw new NotFoundException('Annonce introuvable')
    return listing
  }

  private async loadRequest(
    member: Member,
    requestId: string
  ): Promise<AgencyRequest> {
    const row = await this.prisma.agencyRequest.findFirst({
      where: { id: requestId, workspaceId: member.workspaceId },
    })
    if (!row) throw new NotFoundException('Demande introuvable')
    return row
  }

  private async memberNames(workspaceId: string): Promise<string[]> {
    const members = await this.prisma.member.findMany({
      where: { workspaceId, status: 'active' },
      orderBy: MEMBER_ORDER,
      select: { displayName: true },
    })
    return members.map(m => m.displayName)
  }

  private async signature(workspaceId: string): Promise<string> {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { agencySignature: true },
    })
    return resolveSignature(
      workspace.agencySignature,
      await this.memberNames(workspaceId)
    )
  }
}

/** Une annonce en quelques champs. */
function listingSummary(listing: {
  id: string
  title: string
  status: AgencyRequestListing['status']
  url: string | null
}): AgencyRequestListing {
  return {
    id: listing.id,
    title: listing.title,
    status: listing.status,
    url: listing.url,
  }
}

/** Le contact enregistré, complété des valeurs lues par Claude. */
function mergeContact(
  stored: ListingContact | null,
  patch: ListingContactPatch | null,
  sellerName: string | null
) {
  if (!stored && !patch && !sellerName) return null
  return {
    // Lot 18 : le nom de l'agence est celui de l'annonce.
    agencyName: sellerName ?? patch?.agencyName ?? null,
    contactName: patch?.contactName ?? stored?.contactName ?? null,
    email: patch?.email ?? stored?.email ?? null,
    phone: patch?.phone ?? stored?.phone ?? null,
    portalMessageUrl:
      patch?.portalMessageUrl ?? stored?.portalMessageUrl ?? null,
    preferredChannel:
      patch?.preferredChannel ?? stored?.preferredChannel ?? null,
  }
}

/** Ce que la réponse lit de la fiche. */
export function answerableOf(item: EvaluatedListing): AnswerableListing {
  const l = item.listing
  return {
    addressRaw: l.location.addressRaw,
    surface: l.surface,
    annualCharges: l.annualCharges,
    propertyTax: l.propertyTax,
    dpeClass: l.dpeClass,
    dpeConsumption: l.dpeConsumption,
    gesClass: l.gesClass,
    dpeDate: l.dpeDate,
    floor: l.floor,
    elevator: l.elevator,
    constructionYear: l.constructionYear,
    lotsCount: l.lotsCount,
    votedWorks: l.votedWorks,
    proceedings: l.proceedings,
    heatingType: l.heatingType,
    fieldSources: l.fieldSources,
  }
}

/** Les valeurs d'une réponse en colonnes Prisma (l'adresse passe par l'écriture des annonces). */
export function answerPatchData(
  patch: Omit<AgencyAnswerPatch, 'addressRaw'>
): Prisma.ListingUncheckedUpdateInput {
  const data: Prisma.ListingUncheckedUpdateInput = {}
  const decimal = (value: unknown) => new Prisma.Decimal(Number(value))
  if (patch.surface !== undefined) data.surface = decimal(patch.surface)
  if (patch.annualCharges !== undefined)
    data.annualCharges = decimal(patch.annualCharges)
  if (patch.propertyTax !== undefined)
    data.propertyTax = decimal(patch.propertyTax)
  if (patch.dpeClass !== undefined)
    data.dpeClass =
      patch.dpeClass as Prisma.ListingUncheckedUpdateInput['dpeClass']
  if (patch.gesClass !== undefined)
    data.gesClass =
      patch.gesClass as Prisma.ListingUncheckedUpdateInput['gesClass']
  if (patch.dpeConsumption !== undefined)
    data.dpeConsumption = Number(patch.dpeConsumption)
  if (patch.dpeDate !== undefined)
    data.dpeDate = new Date(
      `${String(patch.dpeDate).slice(0, 10)}T00:00:00.000Z`
    )
  if (patch.floor !== undefined) data.floor = Number(patch.floor)
  if (patch.elevator !== undefined) data.elevator = Boolean(patch.elevator)
  if (patch.constructionYear !== undefined)
    data.constructionYear = Number(patch.constructionYear)
  if (patch.lotsCount !== undefined) data.lotsCount = Number(patch.lotsCount)
  if (patch.votedWorks !== undefined) data.votedWorks = String(patch.votedWorks)
  if (patch.proceedings !== undefined)
    data.proceedings = String(patch.proceedings)
  if (patch.heatingType !== undefined)
    data.heatingType = String(patch.heatingType)
  return data
}

/**
 * Les champs remplis par une réponse prennent la provenance « agence »,
 * datée du jour de la réponse, avec un extrait court (déjà masqué).
 */
export function withAgencyProvenance(
  existing: FieldProvenanceMap,
  keys: readonly string[],
  receivedAt: Date,
  excerpt: string | null
): FieldProvenanceMap {
  const result: FieldProvenanceMap = { ...existing }
  const evidence = excerpt ? excerpt.slice(0, 300) : undefined
  for (const key of keys) {
    result[key] = {
      source: 'agency',
      recordedAt: receivedAt.toISOString(),
      ...(evidence ? { evidence } : {}),
    }
  }
  return result
}
