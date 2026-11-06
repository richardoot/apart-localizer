import { EMPTY_FIT_COUNTS } from '@apart/contracts'
import type { CriteriaFitCounts, Point } from '@apart/contracts'
import {
  activityActorName,
  bestFit,
  normalizeListingUrl,
  notificationsForActivity,
} from '@apart/domain'
import { Prisma } from '../../../apps/api/src/generated/prisma/index.js'
import type { PrismaClient } from '../../../apps/api/src/generated/prisma/index.js'
import { ActivityService } from '../../../apps/api/src/activity/activity.service.js'
import { GeoService } from '../../../apps/api/src/geo/geo.service.js'
import {
  CriteriaMatchService,
  fitRuleOf,
} from '../../../apps/api/src/listings/criteria-match.service.js'
import { NotificationQueueService } from '../../../apps/api/src/notifications/notification-queue.service.js'
import type { PrismaService } from '../../../apps/api/src/prisma/prisma.service.js'
import { currentAssumptions } from './dataset.js'
import type {
  DemoActivity,
  DemoDataset,
  DemoHandle,
  DemoListing,
} from './dataset.js'
import { demoId } from './ids.js'

/**
 * Écrit le jeu de démonstration dans la base, en une transaction :
 *
 * 1. photographie les AUTRES espaces (annonces, membres, journal) ;
 * 2. supprime l'espace « Démo » par son identifiant fixe (cascade) et
 *    seulement lui ;
 * 3. le recrée à l'identique : membres reliés à leurs comptes GoTrue,
 *    hypothèses, annonces et tout ce qui s'y rattache, points et périmètre
 *    par le module geo de l'API (le SQL géographique n'est écrit que là),
 *    adéquation aux critères (lot 14 : mesures PostGIS et décision de
 *    `domain` par le service de l'API, dans la transaction), lot 16 :
 *    explorations fictives, leurs brouillons et les lignes de leur compte
 *    rendu, journal et notifications (règles de `domain`) ; lot 18 : les
 *    liens de chaque annonce sur les portails, le vendeur, le lien
 *    rattaché d'office par une exploration ;
 * 4. vérifie que les autres espaces n'ont pas bougé, sinon annule tout.
 */

export type AuthUserIds = Record<DemoHandle, string>

export interface DemoSeedReport {
  workspaceId: string
  listings: number
  members: number
  tasks: number
  offers: number
  visits: number
  opinions: number
  criteria: number
  /** Entrées : lignes d'adéquation qui ne sont pas « hors critères ». */
  criteriaMatches: number
  /** Lot 14 : lignes d'adéquation par niveau (critère × annonce). */
  criteriaFit: CriteriaFitCounts
  /** Lot 16 : explorations fictives, et brouillons « À valider » (e-mail et explorations). */
  explorations: number
  drafts: number
  activity: number
  notifications: number
  /** Les autres espaces, avant et après (identiques, sinon la transaction est annulée). */
  otherWorkspaces: OtherWorkspace[]
  /** Lot 17 : demandes aux annonceurs. */
  agencyRequests: number
  /** Lot 18 : liens des annonces sur les portails. */
  links: number
}

export interface OtherWorkspace {
  id: string
  name: string
  listings: number
  members: number
  activity: number
}

export class DemoSeedConflict extends Error {}

type Tx = Prisma.TransactionClient

const dec = (value: number | null | undefined): Prisma.Decimal | null =>
  value == null ? null : new Prisma.Decimal(value)
const json = (value: unknown): Prisma.InputJsonValue =>
  value as Prisma.InputJsonValue
const jsonOrNull = (value: unknown) =>
  value === null || value === undefined ? Prisma.DbNull : json(value)

export async function writeDemoDataset(
  prisma: PrismaClient,
  dataset: DemoDataset,
  authUserIds: AuthUserIds,
  now: Date = new Date()
): Promise<DemoSeedReport> {
  const workspaceId = dataset.workspace.id
  return prisma.$transaction(
    async tx => {
      const before = await otherWorkspaces(tx, workspaceId)
      await refuseStolenIdentities(tx, workspaceId, authUserIds)

      await tx.workspace.deleteMany({ where: { id: workspaceId } })
      await tx.workspace.create({
        data: {
          id: workspaceId,
          name: dataset.workspace.name,
          createdAt: new Date(dataset.workspace.createdAt),
        },
      })
      const memberIds = new Map(dataset.members.map(m => [m.handle, m.id]))
      const idOf = (handle: DemoHandle): string =>
        memberIds.get(handle) as string
      await tx.member.createMany({
        data: dataset.members.map(m => ({
          id: m.id,
          workspaceId,
          handle: m.handle,
          displayName: m.displayName,
          email: m.email,
          authUserId: authUserIds[m.handle],
          role: m.role,
          createdAt: new Date(m.createdAt),
          lastVisitAt: new Date(m.whatsNewSince),
          whatsNewSince: new Date(m.whatsNewSince),
          whatsNewSource: 'previous_visit',
        })),
      })
      await tx.assumptionsVersion.createMany({
        data: dataset.assumptions.map(a => ({
          id: a.id,
          workspaceId,
          label: a.label,
          effectiveFrom: new Date(a.effectiveFrom),
          createdAt: new Date(a.effectiveFrom),
          values: json(a.values),
        })),
      })

      const geo = new GeoService(tx as unknown as PrismaService)
      let counts = { tasks: 0, offers: 0, visits: 0, opinions: 0 }
      for (const listing of dataset.listings) {
        await createListing(tx, workspaceId, listing, idOf)
        await geo.setListingPoint(
          listing.id,
          listing.input.location.point as Point,
          listing.input.location.precision
        )
        counts = {
          tasks: counts.tasks + listing.tasks.length,
          offers: counts.offers + listing.offers.length,
          visits: counts.visits + listing.visits.length,
          opinions: counts.opinions + listing.opinions.length,
        }
      }

      // Lot 18 : les liens des annonces (le lien d'origine en tête), avant
      // les vérifications qui les citent.
      await tx.listingLink.createMany({
        data: dataset.listings.flatMap(listing =>
          listing.links.map(link => ({
            id: link.id,
            workspaceId,
            listingId: listing.id,
            portal: link.portal,
            url: link.url,
            normalizedUrl: link.normalizedUrl,
            externalId: link.externalId,
            price: dec(link.price),
            priceAt: link.priceAt ? new Date(link.priceAt) : null,
            firstSeenAt: new Date(link.firstSeenAt),
            lastSeenOnlineAt: link.lastSeenOnlineAt
              ? new Date(link.lastSeenOnlineAt)
              : null,
            lastCheckedAt: link.lastCheckedAt
              ? new Date(link.lastCheckedAt)
              : null,
            offlineSince: link.offlineSince
              ? new Date(link.offlineSince)
              : null,
            origin: link.origin,
            readSellerName: link.readSellerName,
            readReference: link.readReference,
            evidence: link.evidence,
            addedById: link.addedBy ? idOf(link.addedBy) : null,
            createdAt: new Date(link.createdAt),
            updatedAt: new Date(link.updatedAt),
          }))
        ),
      })

      // Lot 15 : republications et vérifications, une fois toutes les annonces là.
      for (const listing of dataset.listings) {
        if (listing.republishedFromId) {
          await tx.listing.update({
            where: { id: listing.id },
            data: {
              republishedFromId: listing.republishedFromId,
              updatedAt: new Date(listing.updatedAt),
            },
          })
        }
      }
      await tx.listingCheck.createMany({
        data: dataset.listings.flatMap(listing =>
          listing.checks.map(c => ({
            id: c.id,
            listingId: listing.id,
            workspaceId,
            checkedAt: new Date(c.at),
            authorId: idOf(c.by),
            channel: c.channel,
            outcome: c.outcome,
            changes: json(c.changes),
            summary: c.summary,
            evidence: c.evidence,
            checkedUrl: c.checkedUrl,
            linkedListingId: c.linkedListingId,
            suggestedStatus: c.suggestedStatus,
            linkId: c.linkId,
          }))
        ),
      })

      // Lot 17 : contacts des annonceurs, demandes, puis les tâches qu'elles portent.
      await tx.listingContact.createMany({
        data: dataset.contacts.map(c => ({
          listingId: c.listingId,
          workspaceId,
          // Lot 18 : le nom de l'agence est celui de l'annonce (seller_name).
          agencyName: null,
          contactName: c.contactName,
          email: c.email,
          phone: c.phone,
          portalMessageUrl: c.portalMessageUrl,
          preferredChannel: c.preferredChannel,
          createdAt: new Date(c.at),
          updatedAt: new Date(c.at),
          updatedById: idOf(c.by),
        })),
      })
      await tx.agencyRequest.createMany({
        data: dataset.agencyRequests.map(r => ({
          id: r.id,
          workspaceId,
          listingId: r.listingId,
          status: r.status,
          channel: r.channel,
          recipientName: r.recipientName,
          subject: r.subject,
          body: r.body,
          taskIds: r.taskIds,
          createdById: idOf(r.by),
          createdVia: r.createdVia,
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(
            r.answeredAt ?? r.sentAt ?? r.approvedAt ?? r.createdAt
          ),
          approvedAt: r.approvedAt ? new Date(r.approvedAt) : null,
          approvedVia: r.approvedVia,
          approvedById: r.approvedBy ? idOf(r.approvedBy) : null,
          sentAt: r.sentAt ? new Date(r.sentAt) : null,
          sentById: r.sentBy ? idOf(r.sentBy) : null,
          threadRef: r.threadRef,
          answeredAt: r.answeredAt ? new Date(r.answeredAt) : null,
          answers: json(r.answers),
          closedAt: r.closedAt ? new Date(r.closedAt) : null,
          followUpOfId: r.followUpOfId,
        })),
      })
      for (const listing of dataset.listings) {
        for (const task of listing.tasks) {
          if (!task.requestId) continue
          await tx.task.update({
            where: { id: task.id },
            data: { requestId: task.requestId },
          })
        }
      }

      for (const c of dataset.criteria) {
        const perimeter = c.input.perimeter
        await tx.searchCriteria.create({
          data: {
            id: c.id,
            workspaceId,
            createdById: idOf(c.by),
            name: c.input.name,
            active: c.input.active,
            filters: json(c.input.filters),
            tolerance: json(c.input.tolerance),
            perimeterType: perimeter?.type ?? null,
            centerLatitude:
              perimeter?.type === 'point_radius' ? perimeter.latitude : null,
            centerLongitude:
              perimeter?.type === 'point_radius' ? perimeter.longitude : null,
            radiusMeters:
              perimeter?.type === 'point_radius'
                ? perimeter.radiusMeters
                : null,
            createdAt: new Date(c.createdAt),
            updatedAt: new Date(c.createdAt),
          },
        })
        if (perimeter?.type === 'polygon') {
          await geo.setCriteriaPerimeter(c.id, perimeter.polygon, tx)
        }
      }

      // Adéquation aux critères (lot 14) : le service de l'API compare les
      // annonces aux critères dans la transaction (mesures PostGIS, décision
      // de `domain`) ; les lignes et le journal sont datés comme le jeu.
      const listingsById = new Map(dataset.listings.map(l => [l.id, l]))
      const criteriaRows = await tx.searchCriteria.findMany({
        where: { workspaceId, active: true },
        orderBy: { createdAt: 'asc' },
      })
      const rules = criteriaRows.map(fitRuleOf)
      const fitService = new CriteriaMatchService(
        tx as unknown as PrismaService,
        geo,
        new ActivityService(
          tx as unknown as PrismaService,
          new NotificationQueueService()
        )
      )
      const computed = await fitService.compute(workspaceId, {
        rules,
        base: currentAssumptions(dataset),
        client: tx,
        at: now,
      })
      const matchActivity: DemoActivity[] = []
      const criteriaFit = { ...EMPTY_FIT_COUNTS }
      let criteriaMatches = 0
      for (const { row, fits } of computed) {
        const listing = listingsById.get(row.id)
        if (!listing) continue
        let latest = new Date(listing.createdAt)
        for (const c of dataset.criteria) {
          const fit = fits.get(c.id)
          if (!fit) continue
          const at = new Date(
            Math.max(Date.parse(listing.createdAt), Date.parse(c.createdAt)) +
              5 * 60_000
          )
          if (at > latest) latest = at
          await tx.criteriaMatch.create({
            data: {
              criteriaId: c.id,
              listingId: listing.id,
              matchedAt: at,
              levelChangedAt: at,
              approximate: fit.locationPending,
              level: fit.level,
              reasons: json(fit.reasons),
              checks: json(fit.checks),
            },
          })
          criteriaFit[fit.level]++
          if (fit.level === 'out') continue
          criteriaMatches++
          if (listing.createdAt > c.createdAt) {
            matchActivity.push({
              id: demoId(`activity:match:${c.key}:${listing.key}`),
              at: at.toISOString(),
              actor: listing.createdBy,
              channel: listing.channel,
              action: 'criteria.matched',
              listingKey: listing.key,
              before: {
                criteria: [{ id: c.id, name: c.input.name, level: null }],
              },
              after: {
                cause: 'listing',
                trigger: 'created',
                criteriaName: null,
                criteria: [
                  {
                    id: c.id,
                    name: c.input.name,
                    before: null,
                    level: fit.level,
                    reasons: fit.reasons,
                    approximate: fit.locationPending,
                  },
                ],
              },
            })
          }
        }
        const best = bestFit(
          rules.map(r => fits.get(r.id)).filter(f => f !== undefined)
        )
        await tx.listing.update({
          where: { id: listing.id },
          data: {
            criteriaFitLevel: best?.level ?? 'in',
            criteriaFitChangedAt: latest,
            criteriaFitOrigin: json({
              cause: 'listing',
              trigger: 'created',
              criteriaName: null,
            }),
            updatedAt: row.updatedAt,
          },
        })
      }

      await tx.scenario.createMany({
        data: dataset.scenarios.map(s => ({
          id: s.id,
          workspaceId,
          listingId: s.input.listingId,
          name: s.input.name,
          overrides: json(s.input.overrides),
          notes: s.input.notes,
          createdById: idOf(s.by),
          createdAt: new Date(s.createdAt),
          updatedAt: new Date(s.createdAt),
        })),
      })
      await tx.listingDraft.createMany({
        data: dataset.drafts.map(d => ({
          id: d.id,
          workspaceId,
          origin: 'email' as const,
          status: 'pending' as const,
          extractedBy: 'parser' as const,
          input: json(d.input),
          duplicates: json([]),
          warnings: json([]),
          url: d.url,
          emailSubject: d.emailSubject,
          emailFrom: d.emailFrom,
          receivedAt: new Date(d.receivedAt),
          createdAt: new Date(d.receivedAt),
        })),
      })

      // Lot 16 : les explorations fictives, leurs brouillons et leurs lignes.
      await tx.exploration.createMany({
        data: dataset.explorations.map(e => ({
          id: e.id,
          workspaceId,
          authorId: idOf(e.by),
          channel: 'mcp' as const,
          runKey: e.runKey,
          startedAt: new Date(e.startedAt),
          finishedAt: new Date(e.finishedAt),
          criteria: json(e.criteria),
          portals: json(e.portals),
          counts: json(e.counts),
          summary: e.summary,
          outDigest: e.outDigest,
          createdAt: new Date(e.finishedAt),
        })),
      })
      await tx.listingDraft.createMany({
        data: dataset.explorationDrafts.map(d => ({
          id: d.id,
          workspaceId,
          origin: 'exploration' as const,
          status: d.status,
          extractedBy: 'claude' as const,
          input: json(d.input),
          duplicates: json(d.duplicates),
          warnings: json(d.warnings),
          url: d.url,
          receivedAt: new Date(d.receivedAt),
          createdAt: new Date(d.receivedAt),
          explorationId: d.explorationId,
          portal: d.portal,
          excerpt: d.excerpt,
          dismissReason: d.dismissReason,
          decidedById: d.decidedBy ? idOf(d.decidedBy) : null,
          decidedAt: d.decidedAt ? new Date(d.decidedAt) : null,
          // Lot 18 : reconnu et rattaché d'office à une annonce suivie.
          listingId: d.listingId,
          attachedLinkId: d.attachedLinkId,
          attachedAt: d.attachedAt ? new Date(d.attachedAt) : null,
          mergedCheckId: d.mergedCheckId,
        })),
      })
      const listingIdByKey = new Map(dataset.listings.map(l => [l.key, l.id]))
      await tx.explorationCandidate.createMany({
        data: dataset.explorations.flatMap(e =>
          e.lines.map(line => ({
            id: demoId(`exploration-line:${e.id}:${line.position}`),
            explorationId: e.id,
            position: line.position,
            url: line.url,
            normalizedUrl: normalizeListingUrl(line.url),
            portal: line.portal,
            title: line.title,
            price: dec(line.price),
            surface: dec(line.surface),
            rooms: line.rooms,
            commune: line.commune,
            district: line.district,
            outcome: line.outcome,
            why: line.why,
            reasons: json(line.reasons),
            level: line.level,
            listingId: line.listingKey
              ? (listingIdByKey.get(line.listingKey) ?? null)
              : null,
            draftId: line.draftId,
            excerpt: line.excerpt,
          }))
        ),
      })

      // Journal, puis les notifications qu'il fait naître (règles de `domain`).
      const activity = [...dataset.activity, ...matchActivity].sort(
        (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)
      )
      const listingIdOf = (key: string | null) =>
        key ? (dataset.listings.find(l => l.key === key)?.id ?? null) : null
      await tx.activityLog.createMany({
        data: activity.map(a => ({
          id: a.id,
          workspaceId,
          listingId: listingIdOf(a.listingKey),
          actorMemberId: a.actor ? idOf(a.actor) : null,
          channel: a.channel,
          action: a.action,
          before: jsonOrNull(a.before),
          after: jsonOrNull(a.after),
          createdAt: new Date(a.at),
        })),
      })
      const members = dataset.members.map(m => ({
        id: m.id,
        displayName: m.displayName,
      }))
      const names = new Map(
        members.map(m => [m.id, { displayName: m.displayName }])
      )
      const sinceOf = new Map(dataset.members.map(m => [m.id, m.whatsNewSince]))
      const notifications: Prisma.NotificationCreateManyInput[] = []
      for (const a of activity) {
        const listingId = listingIdOf(a.listingKey)
        const event = {
          action: a.action,
          channel: a.channel,
          actorMemberId: a.actor ? idOf(a.actor) : null,
          before: a.before,
          after: a.after,
          listingId,
        }
        const listingTitle = listingId
          ? (listingsById.get(listingId)?.input.title ?? null)
          : null
        for (const draft of notificationsForActivity(event, {
          members,
          listingTitle,
        })) {
          const since = sinceOf.get(draft.recipientId) ?? a.at
          notifications.push({
            id: demoId(`notification:${a.id}:${draft.recipientId}`),
            workspaceId,
            recipientId: draft.recipientId,
            type: draft.type,
            title: draft.title,
            body: draft.body,
            url: draft.url,
            listingId: draft.listingId,
            activityId: a.id,
            actorName: activityActorName(event, names),
            inApp: true,
            // L'historique du jeu ne part ni en push ni par e-mail.
            pushStatus: 'skipped',
            emailStatus: 'skipped',
            readAt: a.at < since ? new Date(since) : null,
            createdAt: new Date(a.at),
          })
        }
      }
      await tx.notification.createMany({ data: notifications })

      const after = await otherWorkspaces(tx, workspaceId)
      if (JSON.stringify(after) !== JSON.stringify(before)) {
        throw new Error(
          'Garde-fou : un autre espace a changé pendant le seed ; tout est annulé.'
        )
      }
      return {
        workspaceId,
        listings: dataset.listings.length,
        members: dataset.members.length,
        ...counts,
        criteria: dataset.criteria.length,
        criteriaMatches,
        criteriaFit,
        explorations: dataset.explorations.length,
        drafts: dataset.drafts.length + dataset.explorationDrafts.length,
        activity: activity.length,
        notifications: notifications.length,
        otherWorkspaces: after,
        agencyRequests: dataset.agencyRequests.length,
        links: dataset.listings.reduce((n, l) => n + l.links.length, 0),
      }
    },
    { timeout: 120_000, maxWait: 10_000 }
  )
}

async function otherWorkspaces(
  tx: Tx,
  demoWorkspaceId: string
): Promise<OtherWorkspace[]> {
  const rows = await tx.workspace.findMany({
    where: { id: { not: demoWorkspaceId } },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      name: true,
      _count: { select: { listings: true, members: true, activityLogs: true } },
    },
  })
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    listings: r._count.listings,
    members: r._count.members,
    activity: r._count.activityLogs,
  }))
}

/**
 * Un compte de démo déjà relié à un membre d'un AUTRE espace (connexion
 * faite avant le seed, qui a créé « Mon espace ») : le seed ne le lui prend
 * pas, il s'arrête et dit comment faire.
 */
async function refuseStolenIdentities(
  tx: Tx,
  workspaceId: string,
  ids: AuthUserIds
): Promise<void> {
  const holders = await tx.member.findMany({
    where: {
      authUserId: { in: Object.values(ids) },
      workspaceId: { not: workspaceId },
    },
    include: { workspace: { select: { name: true } } },
  })
  if (holders.length === 0) return
  throw new DemoSeedConflict(
    holders
      .map(
        h =>
          `Le compte ${h.email ?? h.handle} est déjà relié au membre « ${h.handle} » de l'espace « ${h.workspace.name} » ` +
          `(id ${h.workspaceId}), créé à une connexion faite avant le seed. Le seed ne touche pas aux autres espaces : ` +
          `supprimez cet espace s'il ne sert à rien (Studio, ou DELETE FROM app.workspaces WHERE id = '${h.workspaceId}'), puis relancez.`
      )
      .join('\n')
  )
}

async function createListing(
  tx: Tx,
  workspaceId: string,
  listing: DemoListing,
  idOf: (handle: DemoHandle) => string
): Promise<void> {
  const { input } = listing
  const discarded = listing.statuses.find(s => s.status === 'discarded')
  await tx.listing.create({
    data: {
      id: listing.id,
      workspaceId,
      createdById: idOf(listing.createdBy),
      source: input.source,
      sourceLabel: input.sourceLabel,
      url: input.url,
      externalId: input.externalId,
      // Lot 18 : le vendeur (inconnu par défaut, jamais deviné).
      sellerType: input.sellerType,
      sellerName: input.sellerName,
      sellerReference: input.sellerReference,
      sellerReferenceKey: listing.sellerReferenceKey,
      title: input.title,
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
      description: input.description,
      notes: input.notes,
      addressRaw: input.location.addressRaw,
      commune: input.location.commune,
      inseeCode: input.location.inseeCode,
      district: input.location.district,
      price: new Prisma.Decimal(input.price),
      feesPayer: input.feesPayer,
      surface: dec(input.surface),
      rooms: input.rooms,
      bedrooms: input.bedrooms,
      floor: input.floor,
      floorsTotal: input.floorsTotal,
      elevator: input.elevator,
      constructionYear: input.constructionYear,
      dpeClass: input.dpeClass,
      annualCharges: dec(input.annualCharges),
      propertyTax: dec(input.propertyTax),
      furnitureValue: dec(input.furnitureValue),
      fieldSources: json(input.fieldSources),
      status: input.status,
      discardReason: input.discardReason,
      discardedAt: discarded ? new Date(discarded.at) : null,
      createdAt: new Date(listing.createdAt),
      updatedAt: new Date(listing.updatedAt),
      // Lot 15 : dates de vérification (le lien de republication est posé
      // une fois toutes les annonces créées).
      lastCheckedAt: listing.lastCheckedAt
        ? new Date(listing.lastCheckedAt)
        : null,
      lastSeenOnlineAt: listing.lastSeenOnlineAt
        ? new Date(listing.lastSeenOnlineAt)
        : null,
      renovation: input.renovation
        ? {
            create: {
              active: input.renovation.active,
              level: input.renovation.level,
              durationMonths: input.renovation.durationMonths,
              notes: input.renovation.notes,
              items: {
                create: input.renovation.items.map((item, position) => ({
                  id: demoId(`renovation:${listing.key}:${position}`),
                  label: item.label,
                  amount: dec(item.amount),
                  position,
                })),
              },
            },
          }
        : undefined,
      rentalPlan: input.rentalPlan
        ? {
            create: {
              year: input.rentalPlan.year,
              leaseType: input.rentalPlan.leaseType,
              rentControl: input.rentalPlan.rentControl,
              referenceRentPerM2: dec(input.rentalPlan.referenceRentPerM2),
              targetRent: dec(input.rentalPlan.targetRent),
              marketRent: dec(input.rentalPlan.marketRent),
              demand: input.rentalPlan.demand,
              coOwnershipAllowsRental: input.rentalPlan.coOwnershipAllowsRental,
              decencyCompliant: input.rentalPlan.decencyCompliant,
              rentalPermitRequired: input.rentalPlan.rentalPermitRequired,
              notes: input.rentalPlan.notes,
            },
          }
        : undefined,
      tasks: {
        create: listing.tasks.map(t => ({
          id: t.id,
          label: t.label,
          done: t.done,
          doneAt: t.doneAt ? new Date(t.doneAt) : null,
          assigneeId: t.assignee ? idOf(t.assignee) : null,
          origin: t.origin,
          position: t.position,
          createdAt: new Date(t.createdAt),
          // Lot 17 : la demande qui porte la tâche est écrite après.
          field: t.field ?? null,
          requestedAt: t.requestedAt ? new Date(t.requestedAt) : null,
          answeredAt: t.answeredAt ? new Date(t.answeredAt) : null,
        })),
      },
      priceEvents: {
        create: listing.prices.map((p, index) => ({
          id: demoId(`price:${listing.key}:${index}`),
          occurredAt: new Date(p.at),
          oldPrice: index === 0 ? null : dec(listing.prices[index - 1]?.price),
          newPrice: new Prisma.Decimal(p.price),
          source:
            index === 0
              ? listing.channel === 'mcp'
                ? 'ai'
                : 'user'
              : 'listing',
        })),
      },
      offers: {
        create: listing.offers.map(o => ({
          id: o.id,
          madeAt: new Date(o.madeAt),
          amount: new Prisma.Decimal(o.amount),
          channel: o.channel,
          response: o.response,
          counterAmount: dec(o.counterAmount),
          respondedAt: o.respondedAt ? new Date(o.respondedAt) : null,
          notes: o.notes,
          createdById: idOf(o.by),
          createdAt: new Date(o.madeAt),
          updatedAt: new Date(o.respondedAt ?? o.madeAt),
        })),
      },
      opinions: {
        create: listing.opinions.map(o => ({
          id: demoId(`opinion:${listing.key}:${o.handle}`),
          memberId: idOf(o.handle),
          rating: o.rating,
          text: o.text,
          createdAt: new Date(o.at),
          updatedAt: new Date(o.at),
        })),
      },
      views: {
        create: listing.views.map(v => ({
          memberId: idOf(v.handle),
          seenAt: new Date(v.seenAt),
        })),
      },
      rentComparables: {
        create: listing.rentComparables.map(c => ({
          id: c.id,
          rent: new Prisma.Decimal(c.input.rent),
          surface: new Prisma.Decimal(c.input.surface),
          furnished: c.input.furnished,
          rooms: c.input.rooms,
          observedAt: c.input.observedAt ? new Date(c.input.observedAt) : null,
          source: c.input.source,
          sourceLabel: c.input.sourceLabel,
          url: c.input.url,
          address: c.input.address,
          note: c.input.note,
          createdById: idOf(c.by),
          createdAt: new Date(c.at),
          updatedAt: new Date(c.at),
        })),
      },
    },
  })
  for (const v of listing.visits) {
    await tx.visit.create({
      data: {
        id: v.id,
        listingId: listing.id,
        visitedAt: new Date(v.visitedAt),
        status: v.status,
        participantIds: v.participants.map(idOf),
        report: v.report,
        pros: v.pros,
        cons: v.cons,
        rating: v.rating,
        prepTaskId: v.prepTaskId,
        createdById: idOf(v.by),
        createdAt: new Date(v.createdAt),
        updatedAt: new Date(v.createdAt),
      },
    })
  }
}
