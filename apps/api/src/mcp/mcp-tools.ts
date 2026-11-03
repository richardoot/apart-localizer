import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  LISTING_STATUS_LABELS,
  MCP_SCOPE_WRITE,
  McpAddOpinionInputSchema,
  McpAddTaskInputSchema,
  McpCompleteTaskInputSchema,
  McpCreateListingInputSchema,
  McpEvaluateListingInputSchema,
  McpGetListingInputSchema,
  McpListListingsInputSchema,
  McpSetListingStatusInputSchema,
  McpUpdateListingInputSchema,
  RENTAL_VERDICT_LABELS,
  VERDICT_LABELS,
} from '@apart/contracts'
import type {
  EvaluatedListing,
  ListingEvaluation,
  McpScope,
} from '@apart/contracts'
import { formatEuros, formatPercent } from '@apart/domain'
import type { Member } from '../generated/prisma'
import type { ListingsService } from '../listings/listings.service'
import type { AssumptionsService } from '../assumptions/assumptions.service'
import type { OpinionsService } from '../opinions/opinions.service'
import type { TasksService } from '../tasks/tasks.service'
import type { WorkspaceService } from '../workspace/workspace.service'
import { hasScope } from './mcp-scopes'
import { answer, dataResult, refusal } from './tool-results'
import type { ToolResult } from './tool-results'

/** Ce dont les outils ont besoin : le membre, ses portées, les services métier. */
export interface McpToolContext {
  member: Member
  scopes: McpScope[]
  listings: ListingsService
  assumptions: AssumptionsService
  opinions: OpinionsService
  tasks: TasksService
  workspace: WorkspaceService
}

const CHANNEL = 'mcp' as const

/** Les noms des outils du lot 1, dans l'ordre de la feuille de route. */
export const MCP_TOOL_NAMES = [
  'list_listings',
  'get_listing',
  'get_assumptions',
  'evaluate_listing',
  'create_listing',
  'update_listing',
  'set_listing_status',
  'add_opinion',
  'add_task',
  'complete_task',
] as const

/** Une ligne lisible par annonce : titre, prix, surface, brut, effort, verdict. */
export function describeListing(item: EvaluatedListing): string {
  const m = item.evaluation.metrics
  const surface = item.listing.surface
    ? `${item.listing.surface} m²`
    : 'surface inconnue'
  const effort =
    m.effort < 0 ? `effort ${formatEuros(-m.effort)}/mois` : 'aucun effort'
  const parts = [
    `${item.listing.title} (${LISTING_STATUS_LABELS[item.listing.status]})`,
    formatEuros(item.listing.price),
    surface,
    `brut ${formatPercent(m.grossYield)}`,
    effort,
    `verdict ${VERDICT_LABELS[m.verdict]}`,
    `location ${RENTAL_VERDICT_LABELS[item.evaluation.rental.verdict]}`,
  ]
  if (item.isNewForMe) parts.push('nouvelle pour vous')
  if (item.distanceMeters !== null)
    parts.push(`à ${Math.round(item.distanceMeters)} m`)
  return parts.join(' · ')
}

export function describeEvaluation(evaluation: ListingEvaluation): string {
  const m = evaluation.metrics
  const target = evaluation.targetPrice.targetPrice
  return [
    `coût total ${formatEuros(m.totalCost)}`,
    `mensualité ${formatEuros(m.monthlyPayment)}`,
    `brut ${formatPercent(m.grossYield)}`,
    `net ${formatPercent(m.netYield)}`,
    `effort ${m.effort < 0 ? formatEuros(-m.effort) + '/mois' : 'aucun'}`,
    `verdict ${VERDICT_LABELS[m.verdict]}`,
    `location ${RENTAL_VERDICT_LABELS[evaluation.rental.verdict]}`,
    target !== null
      ? `prix cible ${formatEuros(target)}`
      : 'prix cible non calculable',
  ].join(' · ')
}

function writeRefusal(ctx: McpToolContext): ToolResult | null {
  if (hasScope(ctx.scopes, MCP_SCOPE_WRITE)) return null
  return refusal(
    `Refusé : le jeton ne porte pas la portée « ${MCP_SCOPE_WRITE} » ; reconnectez le connecteur en accordant l'écriture.`
  )
}

/**
 * Déclare les outils du lot 1 sur un serveur MCP, pour un membre donné. Les
 * schémas d'entrée viennent de `contracts` ; les calculs de `domain` à
 * travers les services ; chaque écriture est journalisée avec le canal `mcp`.
 * Aucun outil de suppression.
 */
export function registerTools(server: McpServer, ctx: McpToolContext): void {
  server.registerTool(
    'list_listings',
    {
      title: 'Lister les annonces',
      description:
        "Annonces de l'espace, filtrées (statut, commune, DPE, verdict, prix, surface, pièces, « nouvelles pour moi », recherche texte, point et rayon en mètres), " +
        'triées et paginées (50 par page par défaut), chacune avec ses indicateurs calculés (coût, mensualité, rendements, effort, verdict, prix cible), ' +
        'son verdict de louabilité, ses avis et ses tâches. Sans filtre de statut : les annonces actives (à étudier, à visiter, visité, offre faite, offre acceptée). ' +
        'Avec `near`, chaque annonce porte sa distance au point.',
      inputSchema: McpListListingsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async filters =>
      answer(async () => {
        const page = await ctx.listings.list(ctx.member, filters)
        const lines = page.items.map(
          item => `- ${describeListing(item)} [id ${item.listing.id}]`
        )
        const summary =
          `${page.total} annonce(s), page ${page.page}/${Math.max(page.pageCount, 1)}` +
          (lines.length ? `\n${lines.join('\n')}` : '')
        return dataResult(summary, page)
      })
  )

  server.registerTool(
    'get_listing',
    {
      title: 'Lire une annonce',
      description:
        'Une annonce complète : tous ses champs et leur provenance, ses indicateurs calculés, le détail des contrôles de louabilité (phase 2), ' +
        "le prix cible par critère, les avis des membres, les tâches (avec leurs identifiants) et l'historique des prix.",
      inputSchema: McpGetListingInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ listingId }) =>
      answer(async () => {
        const item = await ctx.listings.get(ctx.member, listingId)
        const checks = item.evaluation.rental.checks
          .map(c => `  - [${c.level}] ${c.message}`)
          .join('\n')
        return dataResult(
          `${describeListing(item)}\nContrôles de louabilité :\n${checks}`,
          item
        )
      })
  )

  server.registerTool(
    'get_assumptions',
    {
      title: 'Lire les hypothèses',
      description:
        "Hypothèses de financement et d'exploitation en vigueur dans l'espace : apport, taux, durée, assurance, notaire, vacance, frais fixes, seuils de rendement et d'effort, marges, année de mise en location. Les taux sont des fractions (0,0365 = 3,65 %).",
      inputSchema: undefined,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      answer(async () => {
        const version = await ctx.assumptions.current(ctx.member.workspaceId)
        const v = version.values
        return dataResult(
          `Hypothèses « ${version.label ?? 'sans libellé'} » : apport ${formatEuros(v.downPayment)}, taux ${formatPercent(v.interestRate)}, ${v.durationYears} ans, seuil brut ${formatPercent(v.grossYieldThreshold)}, effort max ${formatEuros(v.maxMonthlyEffort)}/mois`,
          version
        )
      })
  )

  server.registerTool(
    'evaluate_listing',
    {
      title: 'Évaluer sans enregistrer',
      description:
        "Calcule les indicateurs d'une annonce hypothétique (`listing` : prix, surface, loyer visé, DPE, commune, travaux...) ou d'une annonce enregistrée (`listingId`) avec des champs surchargés (`overrides` : prix négocié, loyer...), " +
        'avec un scénario d’hypothèses facultatif (`assumptions` : taux, apport, durée...). Rien n’est enregistré. Répond : « à quel prix ce bien entre-t-il dans la cible ? », « et si le taux descend à 3,2 % ? ».',
      inputSchema: McpEvaluateListingInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async request =>
      answer(async () => {
        const result = await ctx.listings.evaluate(ctx.member, request)
        return dataResult(
          `Évaluation (non enregistrée) : ${describeEvaluation(result.evaluation)}`,
          result
        )
      })
  )

  server.registerTool(
    'create_listing',
    {
      title: 'Créer une annonce',
      description:
        "Enregistre une annonce normalisée dans l'espace, avec la checklist par défaut et un premier événement de prix. Elle apparaît « nouvelle » pour les autres membres. " +
        "Donnez tout ce que l'annonce dit (prix FAI, surface Carrez, pièces, étage, DPE, charges annuelles, taxe foncière, adresse, commune, quartier, loyer visé dans rentalPlan, point GeoJSON [lng, lat] si connu). " +
        '`provenance` : « ai » si Claude a lu la page, « user » si le membre a dicté les valeurs. Portée listings:write.',
      inputSchema: McpCreateListingInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ listing, provenance }) =>
      answer(async () => {
        const denied = writeRefusal(ctx)
        if (denied) return denied
        const item = await ctx.listings.create(ctx.member, listing, {
          channel: CHANNEL,
          provenance,
        })
        return dataResult(
          `Annonce créée : ${describeListing(item)} [id ${item.listing.id}]`,
          item
        )
      })
  )

  server.registerTool(
    'update_listing',
    {
      title: 'Modifier une annonce',
      description:
        'Mise à jour partielle : seuls les champs de `patch` changent ; un sous-objet fourni (travaux, phase 2, localisation) remplace l’existant. ' +
        'Garde-fous optimistes : `expectedUpdatedAt` (le `updatedAt` lu) et `expectedPrice` ; si l’annonce a changé entre-temps, rien n’est écrit et la réponse l’explique. ' +
        'Un nouveau prix ajoute une ligne à l’historique. Portée listings:write.',
      inputSchema: McpUpdateListingInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({
      listingId,
      patch,
      expectedUpdatedAt,
      expectedPrice,
      provenance,
    }) =>
      answer(async () => {
        const denied = writeRefusal(ctx)
        if (denied) return denied
        const guards = {
          ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
          ...(expectedPrice !== undefined ? { expectedPrice } : {}),
        }
        const item = await ctx.listings.update(
          ctx.member,
          listingId,
          patch,
          guards,
          {
            channel: CHANNEL,
            provenance,
          }
        )
        return dataResult(
          `Annonce modifiée (${Object.keys(patch).join(', ')}) : ${describeListing(item)}`,
          item
        )
      })
  )

  server.registerTool(
    'set_listing_status',
    {
      title: 'Changer le statut',
      description:
        'Statuts : to_study, to_visit, visited, offer_made, offer_accepted, offer_refused, discarded (raison obligatoire), sold_or_withdrawn. ' +
        '`expectedStatus` est le garde-fou optimiste : refus si le statut actuel diffère. Portée listings:write.',
      inputSchema: McpSetListingStatusInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ listingId, status, reason, expectedStatus }) =>
      answer(async () => {
        const denied = writeRefusal(ctx)
        if (denied) return denied
        const item = await ctx.listings.setStatus(
          ctx.member,
          listingId,
          { status, reason, ...(expectedStatus ? { expectedStatus } : {}) },
          CHANNEL
        )
        return dataResult(
          `Statut : ${LISTING_STATUS_LABELS[item.listing.status]}${reason ? ` (${reason})` : ''} — ${describeListing(item)}`,
          item
        )
      })
  )

  server.registerTool(
    'add_opinion',
    {
      title: 'Donner mon avis',
      description:
        'Enregistre ou remplace l’avis du membre connecté sur une annonce : note sur 5 (0 = pas de note) et texte. Un seul avis par membre et par annonce ; l’avis de l’autre membre n’est pas touché. Portée listings:write.',
      inputSchema: McpAddOpinionInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ listingId, rating, text }) =>
      answer(async () => {
        const denied = writeRefusal(ctx)
        if (denied) return denied
        const opinion = await ctx.opinions.upsert(
          ctx.member,
          listingId,
          { rating, text },
          CHANNEL
        )
        return dataResult(
          `Avis de ${ctx.member.displayName} enregistré : ${rating > 0 ? `${rating}/5` : 'sans note'}${text ? ` — ${text}` : ''}`,
          { opinion }
        )
      })
  )

  server.registerTool(
    'add_task',
    {
      title: 'Ajouter une tâche',
      description:
        "Ajoute une tâche à la checklist d'une annonce (« demander la taxe foncière », « appeler l'agence »), assignable à un membre par son identifiant court. Portée listings:write.",
      inputSchema: McpAddTaskInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ listingId, label, assigneeHandle }) =>
      answer(async () => {
        const denied = writeRefusal(ctx)
        if (denied) return denied
        let assigneeId: string | null = null
        if (assigneeHandle) {
          const members = await ctx.workspace.members(ctx.member.workspaceId)
          const assignee = members.find(
            m => m.handle.toLowerCase() === assigneeHandle.toLowerCase()
          )
          if (!assignee) {
            return refusal(
              `Refusé : aucun membre « ${assigneeHandle} » dans l'espace (membres : ${members.map(m => m.handle).join(', ')}).`
            )
          }
          assigneeId = assignee.id
        }
        const task = await ctx.tasks.create(
          ctx.member,
          listingId,
          { label, assigneeId, origin: 'manual' },
          CHANNEL
        )
        return dataResult(`Tâche ajoutée : ${task.label} [id ${task.id}]`, {
          task,
        })
      })
  )

  server.registerTool(
    'complete_task',
    {
      title: 'Cocher une tâche',
      description:
        'Coche (ou décoche avec `done: false`) une tâche d’une annonce. Les identifiants des tâches viennent de get_listing. Aucune suppression possible par le MCP. Portée listings:write.',
      inputSchema: McpCompleteTaskInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ listingId, taskId, done }) =>
      answer(async () => {
        const denied = writeRefusal(ctx)
        if (denied) return denied
        const task = await ctx.tasks.update(
          ctx.member,
          listingId,
          taskId,
          { done },
          CHANNEL
        )
        return dataResult(
          `Tâche ${done ? 'cochée' : 'décochée'} : ${task.label}`,
          { task }
        )
      })
  )
}
