import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ServiceUnavailableException } from '@nestjs/common'
import { z } from 'zod'
import {
  AssumptionsSchema,
  DISCOUNT_CLASS_LABELS,
  DUPLICATE_REASON_LABELS,
  INDICATOR_GLOSSARY,
  LISTING_STATUS_LABELS,
  ListingCreateSchema,
  McpAddOpinionInputSchema,
  McpAddTaskInputSchema,
  McpAnalyzeListingPromptArgsSchema,
  McpCompareListingsInputSchema,
  McpCompleteTaskInputSchema,
  McpCreateListingInputSchema,
  McpCreateSearchCriteriaInputSchema,
  McpGetMarketContextInputSchema,
  McpListSearchCriteriaInputSchema,
  McpUpdateSearchCriteriaInputSchema,
  ISOCHRONE_MODE_LABELS,
  OPEN_DATA_STATUS_LABELS,
  PERIMETER_TYPE_LABELS,
  RENT_EPOCH_LABELS,
  McpEvaluateListingInputSchema,
  McpExtractListingInputSchema,
  McpFindDuplicatesInputSchema,
  McpGetListingInputSchema,
  McpGetTargetPriceInputSchema,
  McpListListingsInputSchema,
  McpRecordOfferInputSchema,
  McpRecordPriceChangeInputSchema,
  McpSetAssumptionsInputSchema,
  McpSetListingStatusInputSchema,
  McpUpdateListingInputSchema,
  OFFER_RESPONSE_LABELS,
  OfferInputSchema,
  OfferUpdateSchema,
  RENTAL_VERDICT_LABELS,
  TARGET_CRITERION_LABELS,
  VERDICT_LABELS,
  splitListingCreate,
} from '@apart/contracts'
import type {
  AssumptionsImpact,
  CompareResult,
  CriteriaMatchChanges,
  ListingContext,
  MarketContext,
  MarketContextReport,
  RentControlLookup,
  SearchCriteriaSummary,
  TransitContext,
  DuplicateCandidate,
  EvaluatedListing,
  ListingEvaluation,
  McpScope,
  MissingField,
  OfferWriteResult,
  TargetPriceReport,
} from '@apart/contracts'
import { formatEuros, formatPercent, mergeAssumptions } from '@apart/domain'
import type { Member } from '../generated/prisma'
import type { DuplicatesService } from '../listings/duplicates.service'
import type { ExtractionService } from '../listings/extraction.service'
import type { ListingsService } from '../listings/listings.service'
import type { TargetPriceService } from '../listings/target-price.service'
import type { ListingEnrichmentService } from '../listings/enrichment.service'
import type { SearchCriteriaService } from '../search-criteria/search-criteria.service'
import type { AssumptionsService } from '../assumptions/assumptions.service'
import type { OffersService } from '../offers/offers.service'
import type { OpinionsService } from '../opinions/opinions.service'
import type { TasksService } from '../tasks/tasks.service'
import type { WorkspaceService } from '../workspace/workspace.service'
import { answer, dataResult, refusal, writeRefusal } from './tool-results'

/** Ce dont les outils ont besoin : le membre, ses portées, les services métier. */
export interface McpToolContext {
  member: Member
  scopes: McpScope[]
  listings: ListingsService
  extraction: ExtractionService
  duplicates: DuplicatesService
  assumptions: AssumptionsService
  opinions: OpinionsService
  tasks: TasksService
  workspace: WorkspaceService
  offers: OffersService
  targetPrice: TargetPriceService
  criteria: SearchCriteriaService
  enrichment: ListingEnrichmentService
}

const CHANNEL = 'mcp' as const

/**
 * Les noms des outils, dans l'ordre de la feuille de route : lot 1, lot 2
 * (extraction et doublons), lot 3 (prix cible, offres, prix, comparaison,
 * hypothèses), lot 4 (critères de recherche, contexte de marché).
 */
export const MCP_TOOL_NAMES = [
  'list_listings',
  'get_listing',
  'get_assumptions',
  'evaluate_listing',
  'extract_listing',
  'find_duplicates',
  'get_target_price',
  'compare_listings',
  'create_listing',
  'update_listing',
  'set_listing_status',
  'add_opinion',
  'add_task',
  'complete_task',
  'record_price_change',
  'record_offer',
  'set_assumptions',
  'list_search_criteria',
  'get_market_context',
  'create_search_criteria',
  'update_search_criteria',
] as const

/** Les prompts du connecteur. */
export const MCP_PROMPT_NAMES = ['analyze_listing'] as const

/** Les ressources du connecteur : schéma d'annonce et glossaire. */
export const MCP_RESOURCE_URIS = [
  'apart://schema/listing',
  'apart://glossaire',
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

/** Une ligne par doublon probable : titre, statut, motifs. */
export function describeDuplicates(duplicates: DuplicateCandidate[]): string {
  if (duplicates.length === 0) return 'Aucun doublon probable.'
  return [
    `${duplicates.length} doublon(s) probable(s) :`,
    ...duplicates.map(
      d =>
        `- ${d.title} (${LISTING_STATUS_LABELS[d.status]}, ${formatEuros(d.price)}) [id ${d.listingId}] : ${d.reasons
          .map(r => DUPLICATE_REASON_LABELS[r.kind])
          .join(', ')} (score ${d.score})`
    ),
  ].join('\n')
}

/** Les champs indispensables manquants ou douteux, en une ligne. */
export function describeMissing(missing: MissingField[]): string {
  if (missing.length === 0) return 'Aucun champ indispensable manquant.'
  return `Champs manquants ou douteux : ${missing
    .map(m =>
      m.reason === 'doubtful'
        ? `${m.label} (confiance ${Math.round((m.confidence ?? 0) * 100)} %)`
        : m.label
    )
    .join(', ')}.`
}

/** Le rapport « à partir de quel prix ? » en quelques lignes lisibles. */
export function describeTargetPrice(report: TargetPriceReport): string {
  const t = report.targetPrice
  const n = report.negotiation
  const head = [
    `${report.title} : prix affiché ${formatEuros(report.price)}`,
    t.targetPrice !== null
      ? `prix cible ${formatEuros(t.targetPrice)} (critère liant : ${t.bindingCriterion ? TARGET_CRITERION_LABELS[t.bindingCriterion] : '—'})`
      : 'prix cible non calculable (loyer visé manquant ?)',
    t.discount !== null && t.discountClass
      ? `décote nécessaire ${formatPercent(t.discount)} (${DISCOUNT_CLASS_LABELS[t.discountClass]})`
      : null,
    n.suggestedOffer !== null
      ? `offre suggérée ${formatEuros(n.suggestedOffer)} (marge ${formatEuros(n.marginToTarget ?? 0)} sous le prix cible)`
      : null,
    report.rank
      ? `rang ${report.rank.position}/${report.rank.total} des annonces actives par décote`
      : null,
    `frais de notaire ≈ ${formatEuros(report.notaryFees.total)} (${report.notaryFees.mode === 'scale' ? 'barème' : 'taux forfaitaire'})`,
  ]
    .filter(Boolean)
    .join(' · ')
  const criteria = t.criteria
    .filter(c => c.maxPrice !== null)
    .map(
      c =>
        `- ${TARGET_CRITERION_LABELS[c.criterion]}${c.active ? '' : ' (non retenu)'} : prix maximal ${formatEuros(c.maxPrice as number)}${c.discount !== null ? `, décote ${formatPercent(c.discount)}` : ''}`
    )
  const args = n.arguments.map(a => `- ${a.text}`)
  return [
    head,
    criteria.length ? `Par critère :\n${criteria.join('\n')}` : null,
    args.length ? `Arguments de négociation :\n${args.join('\n')}` : null,
    report.sensitivity
      ? `Tableau de sensibilité ${report.sensitivity.rows.length} × ${report.sensitivity.cols.length} joint dans les données.`
      : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Une offre écrite : montant, réponse, statut actuel et statut proposé (jamais appliqué d'office). */
export function describeOffer(result: OfferWriteResult): string {
  const o = result.offer
  const parts = [
    `Offre de ${formatEuros(o.amount)} : ${OFFER_RESPONSE_LABELS[o.response]}${o.counterAmount !== null ? ` à ${formatEuros(o.counterAmount)}` : ''} [id ${o.id}]`,
    `statut de l'annonce : ${LISTING_STATUS_LABELS[result.currentStatus]}`,
  ]
  if (result.suggestedStatus) {
    parts.push(
      `statut proposé : « ${LISTING_STATUS_LABELS[result.suggestedStatus]} » (non appliqué : demandez au membre, puis set_listing_status avec expectedStatus « ${result.currentStatus} »)`
    )
  }
  return parts.join(' · ')
}

/** La comparaison en une ligne par annonce, puis la meilleure par indicateur. */
export function describeCompare(result: CompareResult): string {
  const lines = result.items.map(item => {
    const m = item.evaluation.metrics
    const t = item.evaluation.targetPrice
    return `- ${describeListing(item)} · prix cible ${t.targetPrice !== null ? formatEuros(t.targetPrice) : '—'} · décote ${t.discount !== null ? formatPercent(t.discount) : '—'} · €/m² ${Number.isFinite(m.pricePerM2) ? formatEuros(m.pricePerM2) : '—'} · rangs : score ${item.ranks.score ?? '—'}, brut ${item.ranks.grossYield ?? '—'}, effort ${item.ranks.effort ?? '—'}, décote ${item.ranks.discount ?? '—'} [id ${item.listing.id}]`
  })
  const title = (id: string | null): string =>
    result.items.find(i => i.listing.id === id)?.listing.title ?? '—'
  return [
    `${result.items.length} annonces comparées :`,
    ...lines,
    `Meilleure par indicateur : score ${title(result.best.score)} · brut ${title(result.best.grossYield)} · net ${title(result.best.netYield)} · effort ${title(result.best.effort)} · €/m² ${title(result.best.pricePerM2)} · décote ${title(result.best.discount)}`,
  ].join('\n')
}

/** L'impact d'un changement d'hypothèses : verdicts qui changent. */
export function describeImpact(impact: AssumptionsImpact): string {
  if (impact.changedVerdicts === 0) {
    return `Impact : aucun changement de verdict sur ${impact.total} annonce(s) active(s).`
  }
  return [
    `Impact : ${impact.changedVerdicts} annonce(s) sur ${impact.total} changent de verdict (cible ${impact.byVerdictBefore.target} → ${impact.byVerdictAfter.target}, à creuser ${impact.byVerdictBefore.to_dig} → ${impact.byVerdictAfter.to_dig}, hors cible ${impact.byVerdictBefore.off_target} → ${impact.byVerdictAfter.off_target}) :`,
    ...impact.changes.map(
      c =>
        `- ${c.title} : ${VERDICT_LABELS[c.before]} → ${VERDICT_LABELS[c.after]}${c.targetPriceAfter !== null ? `, prix cible ${formatEuros(c.targetPriceAfter)}` : ''}`
    ),
  ].join('\n')
}

/** Les critères dans lesquels une annonce entre ou dont elle sort, en une ligne. */
export function describeCriteriaChanges(
  changes: CriteriaMatchChanges | null
): string | null {
  if (!changes) return null
  const parts: string[] = []
  for (const m of changes.entered) {
    parts.push(
      `Entre dans le critère « ${m.name} »${m.approximate ? ' (sous réserve : localisation imprécise)' : ''}.`
    )
  }
  for (const m of changes.left) parts.push(`Sort du critère « ${m.name} ».`)
  return parts.length ? parts.join(' ') : null
}

/** La desserte en une ligne. */
export function describeTransit(transit: TransitContext): string {
  const tram = transit.nearestTram
  return tram
    ? `Tram le plus proche : ${tram.name}${tram.lines.length ? ` (ligne ${tram.lines.join(', ')})` : ''} à ${tram.distanceMeters} m`
    : 'Aucun arrêt de tram à moins de 2 km (ou arrêts TBM non importés)'
}

/** Le plafond d'encadrement en une ligne. */
export function describeRentControl(rent: RentControlLookup): string {
  if (rent.status === 'not_applicable')
    return 'Encadrement des loyers : sans objet (hors Bordeaux)'
  if (rent.status === 'unavailable') {
    return `Encadrement des loyers : ${rent.reasons.join(' ')}`
  }
  const value =
    rent.referenceRentPerM2 !== null
      ? `loyer de référence majoré ${rent.referenceRentPerM2} €/m²${rent.monthlyCap !== null ? `, plafond ${formatEuros(rent.monthlyCap)}/mois HC` : ''} (zone ${rent.zone?.zone ?? '?'}, ${rent.rooms === 4 ? '4 pièces et plus' : `${rent.rooms ?? '?'} pièce(s)`}, ${rent.epoch ? RENT_EPOCH_LABELS[rent.epoch].toLowerCase() : 'époque ?'}, ${rent.furnished ? 'meublé' : 'vide'}, arrêté du ${rent.decree?.decreeDate ?? '?'})`
      : 'plafond non déterminé'
  return `Encadrement des loyers (${OPEN_DATA_STATUS_LABELS[rent.status]}) : ${value}${rent.reasons.length ? ` — ${rent.reasons.join(' ')}` : ''}`
}

/** Les comparables DVF en une ligne. */
export function describeMarket(market: MarketContext): string {
  if (!market.stats) {
    return `Marché DVF (${OPEN_DATA_STATUS_LABELS[market.status]}) : ${market.reasons.join(' ') || 'aucune vente comparable'}`
  }
  const s = market.stats
  return [
    `Marché DVF (${OPEN_DATA_STATUS_LABELS[market.status]}) : médiane ${formatEuros(s.medianPricePerM2)}/m² sur ${s.count} vente(s) d'appartements à ${market.radiusMeters} m (${market.period.from} → ${market.period.to}${market.surfaceRange ? `, ${Math.round(market.surfaceRange[0])} à ${Math.round(market.surfaceRange[1])} m²` : ''}), quartiles ${formatEuros(s.p25PricePerM2)} à ${formatEuros(s.p75PricePerM2)}/m²`,
    market.marketPrice !== null
      ? `prix de marché estimé ≈ ${formatEuros(market.marketPrice)}`
      : null,
    market.gapToMarket !== null
      ? `prix affiché ${market.gapToMarket >= 0 ? '+' : '−'}${formatPercent(Math.abs(market.gapToMarket))} par rapport à la médiane`
      : null,
    market.reasons.length ? market.reasons.join(' ') : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Le bloc « Contexte » d'une fiche en quelques lignes. */
export function describeContext(context: ListingContext): string {
  return [
    `Contexte (données ouvertes) :`,
    `  - ${describeTransit(context.transit)}`,
    `  - ${describeRentControl(context.rentControl)}`,
    `  - DPE ${context.dpe.verified ? 'vérifié auprès de l’ADEME' : 'non vérifié'} : ${context.dpe.validity.messages.join(' ')}${context.dpe.search && !context.dpe.verified && context.dpe.search.candidates.length ? ` (${context.dpe.search.candidates.length} DPE candidat(s) à l'ADEME, à valider dans l'application)` : ''}`,
    `  - ${describeMarket(context.market)}`,
  ].join('\n')
}

/** Le contexte de marché d'une adresse ou d'un point. */
export function describeMarketReport(report: MarketContextReport): string {
  const where =
    report.location.label ??
    (report.location.point
      ? report.location.point.coordinates.join(', ')
      : 'lieu inconnu')
  return [
    `Contexte de marché pour ${where}${report.location.commune ? ` (${report.location.commune})` : ''} :`,
    `  - ${describeMarket(report.market)}`,
    `  - ${describeRentControl(report.rentControl)}`,
    `  - ${describeTransit(report.transit)}`,
  ].join('\n')
}

/** Un critère en une ligne : périmètre, filtres, compteurs. */
export function describeCriteria(c: SearchCriteriaSummary): string {
  const f = c.filters
  const perimeter = c.perimeter
    ? c.perimeter.type === 'point_radius'
      ? `${PERIMETER_TYPE_LABELS.point_radius} ${c.perimeter.radiusMeters} m`
      : c.perimeter.type === 'isochrone'
        ? `isochrone ${c.perimeter.params.durationMinutes} min ${ISOCHRONE_MODE_LABELS[c.perimeter.params.mode].toLowerCase()}`
        : PERIMETER_TYPE_LABELS.polygon
    : 'sans périmètre'
  const filters = [
    f.priceMax !== null ? `≤ ${formatEuros(f.priceMax)}` : null,
    f.priceMin !== null ? `≥ ${formatEuros(f.priceMin)}` : null,
    f.surfaceMin !== null ? `≥ ${f.surfaceMin} m²` : null,
    f.roomsMin !== null ? `${f.roomsMin} pièce(s) ou plus` : null,
    f.dpeMax !== null ? `DPE ${f.dpeMax} au plus` : null,
    f.maxTramDistanceMeters !== null
      ? `tram à ${f.maxTramDistanceMeters} m au plus`
      : null,
    f.communes.length ? f.communes.join(', ') : null,
    f.verdicts.length
      ? f.verdicts.map(v => VERDICT_LABELS[v]).join(', ')
      : null,
    f.statuses.length
      ? f.statuses.map(st => LISTING_STATUS_LABELS[st]).join(', ')
      : null,
  ].filter(Boolean)
  return `« ${c.name} »${c.active ? '' : ' (archivé)'} : ${perimeter}${filters.length ? `, ${filters.join(', ')}` : ''} — ${c.listingCount} annonce(s), ${c.newCount} nouvelle(s) pour vous${c.approximateCount ? `, ${c.approximateCount} sous réserve` : ''} [id ${c.id}, modifié ${c.updatedAt}]`
}

/** Un service open data en panne (isochrones) : refus lisible plutôt qu'erreur de transport. */
async function openDataAnswer(
  body: () => Promise<ReturnType<typeof dataResult>>
): Promise<ReturnType<typeof dataResult>> {
  try {
    return await body()
  } catch (error) {
    if (error instanceof ServiceUnavailableException) {
      return refusal(`Refusé : ${error.message}`)
    }
    throw error
  }
}

/** Le schéma JSON d'une annonce à créer, descriptions comprises (ressource `apart://schema/listing`). */
export function listingJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(ListingCreateSchema, {
    io: 'input',
    unrepresentable: 'any',
  }) as Record<string, unknown>
}

/** Le glossaire des indicateurs en Markdown (ressource `apart://glossaire`). */
export function glossaryMarkdown(): string {
  return [
    '# Glossaire des indicateurs',
    '',
    "Définitions du modèle de calcul d'apart-localizer. Les taux sont des fractions dans les données (0,055 = 5,5 %), les montants en euros.",
    '',
    ...INDICATOR_GLOSSARY.map(e => `## ${e.term}\n\n${e.definition}\n`),
  ].join('\n')
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
        "Annonces de l'espace, filtrées (statut, commune, DPE, verdict, prix, surface, pièces, « nouvelles pour moi », recherche texte, point et rayon en mètres, critère enregistré `criteriaId` : son périmètre et ses filtres, exactement comme dans l'application), " +
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
        "le prix cible par critère, les avis des membres, les tâches (avec leurs identifiants), l'historique des prix, les critères de recherche dans lesquels elle est entrée, " +
        "et son contexte de données ouvertes (`context`) : arrêt de tram le plus proche (distance, ligne), plafond d'encadrement (Bordeaux), DPE vérifié auprès de l'ADEME et sa validité, comparables DVF datés.",
      inputSchema: McpGetListingInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ listingId }) =>
      answer(async () => {
        const item = await ctx.listings.get(ctx.member, listingId)
        const context = await ctx.enrichment.context(ctx.member, listingId)
        const checks = item.evaluation.rental.checks
          .map(c => `  - [${c.level}] ${c.message}`)
          .join('\n')
        const criteria = item.criteriaMatches.length
          ? `\nCritères : ${item.criteriaMatches.map(m => `« ${m.name} »${m.approximate ? ' (sous réserve)' : ''}`).join(', ')}`
          : ''
        return dataResult(
          `${describeListing(item)}${criteria}\nContrôles de louabilité :\n${checks}\n${describeContext(context)}`,
          { ...item, context }
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
    'extract_listing',
    {
      title: 'Extraire une annonce (IA, sans enregistrer)',
      description:
        "Lit le texte d'une annonce (page lue dans le navigateur, mail d'agence) et/ou des captures d'écran (base64) par le modèle d'extraction côté serveur, et rend une fiche normalisée pré-remplie : " +
        'pour chaque champ la valeur, la provenance « ai », la confiance (0 à 1) et l’extrait justificatif dans `listing.fieldSources` ; les champs indispensables manquants ou douteux ; les doublons probables déjà dans l’espace ; l’adresse géocodée si possible ; le coût de l’appel. ' +
        "Rien n'est enregistré : présentez la fiche au membre, laissez-le corriger, puis appelez create_listing avec `listing` tel que rendu (fieldSources compris). Répond 503 si l'IA n'est pas configurée côté serveur.",
      inputSchema: McpExtractListingInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async request =>
      answer(async () => {
        const result = await ctx.extraction.extract(
          ctx.member,
          request,
          CHANNEL
        )
        const l = result.listing
        const summary = [
          `Fiche extraite (non enregistrée) : ${l.title}, ${formatEuros(l.price)}, ${l.surface ? `${l.surface} m²` : 'surface inconnue'}, ${l.location.commune ?? 'commune inconnue'}${result.geocoded ? ', adresse géocodée' : ''}.`,
          describeMissing(result.missingFields),
          describeDuplicates(result.duplicates),
          result.warnings.length
            ? `Remarques : ${result.warnings.join(' ')}`
            : null,
          `Coût : ${result.usage.model}, ${result.usage.inputTokens} jetons en entrée, ${result.usage.outputTokens} en sortie${result.usage.estimatedCostUsd !== null ? `, ≈ ${result.usage.estimatedCostUsd} $` : ''}.`,
        ]
          .filter(Boolean)
          .join('\n')
        return dataResult(summary, result)
      })
  )

  server.registerTool(
    'find_duplicates',
    {
      title: 'Chercher des doublons',
      description:
        "Annonces de l'espace qui ressemblent à une annonce donnée par son lien (`url`), son adresse (`address`), son point GeoJSON (`point`, à moins de 50 m), le trio `commune` + `price` + `surface` (surface à ±3 %, prix à ±5 %), ou par l'identifiant d'une annonce enregistrée (`listingId`, exclue des résultats). " +
        'Chaque candidat porte ses motifs et un score de 0 à 1. Toutes les étapes sont comparées, y compris les annonces écartées.',
      inputSchema: McpFindDuplicatesInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async probe =>
      answer(async () => {
        const duplicates = await ctx.duplicates.find(ctx.member, probe)
        return dataResult(describeDuplicates(duplicates), { duplicates })
      })
  )

  server.registerTool(
    'create_listing',
    {
      title: 'Créer une annonce',
      description:
        "Enregistre une annonce normalisée dans l'espace, avec la checklist par défaut et un premier événement de prix. Elle apparaît « nouvelle » pour les autres membres. " +
        "Donnez tout ce que l'annonce dit (prix FAI, surface Carrez, pièces, étage, DPE, charges annuelles, taxe foncière, adresse, commune, quartier, loyer visé dans rentalPlan, point GeoJSON [lng, lat] si connu) ; sans point, l'adresse est géocodée côté serveur. " +
        'Passez la fiche rendue par extract_listing telle quelle (fieldSources : provenance, confiance et extrait par champ ; mettez `user` sur les champs que le membre a corrigés). ' +
        'La réponse liste les doublons probables (la création n’est pas bloquée ; `ignoreDuplicates: true` quand le membre a vu l’alerte et confirme), les tâches créées pour les champs indispensables manquants, ' +
        'les critères de recherche dans lesquels l’annonce entre (`criteriaChanges`), et les enrichissements open data faits côté serveur (arrêt de tram, plafond d’encadrement, prix médian DVF, DPE vérifié à l’ADEME). ' +
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
        const denied = writeRefusal(ctx.scopes)
        if (denied) return denied
        const { input, ignoreDuplicates } = splitListingCreate(listing)
        const item = await ctx.listings.create(ctx.member, input, {
          channel: CHANNEL,
          provenance,
          ignoreDuplicates,
        })
        const lines = [
          `Annonce créée : ${describeListing(item)} [id ${item.listing.id}]`,
          describeCriteriaChanges(item.criteriaChanges),
          describeDuplicates(item.duplicates),
          item.createdTasks.length
            ? `Tâches créées pour les champs manquants : ${item.createdTasks.map(t => t.label).join(' ; ')}.`
            : null,
        ].filter(Boolean)
        return dataResult(lines.join('\n'), item)
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
        const denied = writeRefusal(ctx.scopes)
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
          [
            `Annonce modifiée (${Object.keys(patch).join(', ')}) : ${describeListing(item)}`,
            describeCriteriaChanges(item.criteriaChanges),
          ]
            .filter(Boolean)
            .join('\n'),
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
        const denied = writeRefusal(ctx.scopes)
        if (denied) return denied
        const item = await ctx.listings.setStatus(
          ctx.member,
          listingId,
          { status, reason, ...(expectedStatus ? { expectedStatus } : {}) },
          CHANNEL
        )
        return dataResult(
          [
            `Statut : ${LISTING_STATUS_LABELS[item.listing.status]}${reason ? ` (${reason})` : ''} — ${describeListing(item)}`,
            describeCriteriaChanges(item.criteriaChanges),
          ]
            .filter(Boolean)
            .join('\n'),
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
        const denied = writeRefusal(ctx.scopes)
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
        const denied = writeRefusal(ctx.scopes)
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
        const denied = writeRefusal(ctx.scopes)
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

  server.registerTool(
    'get_target_price',
    {
      title: 'À partir de quel prix ?',
      description:
        "Prix cible d'une annonce enregistrée (`listingId`) ou hypothétique (`listing`) : prix maximal pour chaque critère (rendement brut, rendement net, effort, repère 220 × loyer), critère liant, décote nécessaire et sa classe (dans la cible, négociable, tendu, hors de portée), " +
        "rang parmi les annonces actives de l'espace, brief de négociation (offre suggérée au millier inférieur, marge, durée en ligne, baisses passées, dernière offre, arguments factuels) et détail des frais de notaire. " +
        '`assumptions` : scénario (taux, apport…) pour ce calcul seulement (le rang est alors omis). `sensitivity` : ajoute un tableau à deux entrées (axes prix, loyer, taux, apport, durée). Rien n’est enregistré.',
      inputSchema: McpGetTargetPriceInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ listingId, listing, assumptions, sensitivity }) =>
      answer(async () => {
        const report = listingId
          ? await ctx.targetPrice.report(ctx.member, listingId, {
              ...(sensitivity ? { sensitivity } : {}),
              ...(assumptions ? { scenario: assumptions } : {}),
            })
          : await ctx.targetPrice.reportForHypothetical(
              ctx.member,
              listing as NonNullable<typeof listing>,
              assumptions,
              sensitivity
            )
        return dataResult(describeTargetPrice(report), report)
      })
  )

  server.registerTool(
    'compare_listings',
    {
      title: 'Comparer des annonces',
      description:
        "Compare 2 à 6 annonces de l'espace côte à côte : indicateurs (coût, mensualité, rendements, effort, prix au m²), verdicts, prix cibles et décotes, rang de chacune par indicateur (1 = meilleure) et meilleure annonce par indicateur. Répond : « laquelle visiter en premier ? ».",
      inputSchema: McpCompareListingsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ listingIds }) =>
      answer(async () => {
        const result = await ctx.targetPrice.compare(ctx.member, listingIds)
        return dataResult(describeCompare(result), result)
      })
  )

  server.registerTool(
    'record_price_change',
    {
      title: 'Enregistrer un changement de prix',
      description:
        "Baisse ou hausse constatée sur l'annonce source : met le prix affiché à jour, ajoute une ligne à l'historique des prix (levier de négociation) et journalise. `expectedPrice` est le garde-fou optimiste : refus si le prix actuel diffère. `source` : « listing » quand le portail affiche le nouveau prix, « user » si le membre le dicte. Portée listings:write.",
      inputSchema: McpRecordPriceChangeInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ listingId, newPrice, occurredAt, source, expectedPrice }) =>
      answer(async () => {
        const denied = writeRefusal(ctx.scopes)
        if (denied) return denied
        const item = await ctx.listings.recordPriceChange(
          ctx.member,
          listingId,
          {
            newPrice,
            source,
            ...(occurredAt ? { occurredAt } : {}),
            ...(expectedPrice !== undefined ? { expectedPrice } : {}),
          },
          CHANNEL
        )
        const previous = item.priceEvents[0]?.oldPrice ?? null
        const delta =
          previous !== null && previous > 0
            ? ` (${newPrice < previous ? '−' : '+'}${formatEuros(Math.abs(newPrice - previous))}, ${formatPercent(Math.abs(newPrice - previous) / previous)})`
            : ''
        return dataResult(
          [
            `Prix ${previous !== null ? `${formatEuros(previous)} → ` : ''}${formatEuros(newPrice)}${delta} enregistré · ${describeListing(item)}`,
            describeCriteriaChanges(item.criteriaChanges),
          ]
            .filter(Boolean)
            .join('\n'),
          item
        )
      })
  )

  server.registerTool(
    'record_offer',
    {
      title: 'Enregistrer une offre',
      description:
        "Nouvelle offre d'achat (`amount`, `madeAt`, `channel`, `response` si déjà connue, `counterAmount`, `notes`) ou réponse du vendeur à une offre existante (`offerId` avec `response`, `counterAmount`, `notes` ; garde-fou `expectedResponse`). " +
        "La réponse indique le statut que l'offre suggère pour l'annonce (offre faite, acceptée, refusée) : il n'est jamais appliqué d'office, proposez-le au membre puis utilisez set_listing_status. Aucune suppression. Portée listings:write.",
      inputSchema: McpRecordOfferInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({
      listingId,
      offerId,
      amount,
      madeAt,
      channel,
      response,
      counterAmount,
      notes,
      expectedResponse,
    }) =>
      answer(async () => {
        const denied = writeRefusal(ctx.scopes)
        if (denied) return denied
        let result: OfferWriteResult
        if (offerId) {
          if (amount !== undefined) {
            return refusal(
              "Refusé : le montant d'une offre existante ne se modifie pas ; enregistrez une nouvelle offre (sans offerId)."
            )
          }
          result = await ctx.offers.update(
            ctx.member,
            listingId,
            offerId,
            OfferUpdateSchema.parse({
              response,
              counterAmount,
              notes,
              expectedResponse,
            }),
            CHANNEL
          )
        } else {
          result = await ctx.offers.create(
            ctx.member,
            listingId,
            OfferInputSchema.parse({
              amount,
              madeAt,
              channel,
              response,
              counterAmount,
              notes,
            }),
            CHANNEL
          )
        }
        return dataResult(
          `${offerId ? 'Réponse enregistrée' : 'Offre enregistrée'} · ${describeOffer(result)}`,
          result
        )
      })
  )

  server.registerTool(
    'set_assumptions',
    {
      title: 'Modifier les hypothèses',
      description:
        "Enregistre une nouvelle version des hypothèses de l'espace à partir des champs modifiés seulement (`values` : taux en fractions, apport en euros, seuils, marges, critères du prix cible, seuils de décote, mode et barème des frais de notaire…) ; les autres champs gardent leur valeur en vigueur. " +
        '`expectedVersion` (identifiant rendu par get_assumptions) est le garde-fou optimiste : refus si une autre version a été enregistrée depuis. La réponse donne l’impact : annonces actives dont le verdict change. Journalisé. Portée listings:write.',
      inputSchema: McpSetAssumptionsInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ values, label, expectedVersion }) =>
      answer(async () => {
        const denied = writeRefusal(ctx.scopes)
        if (denied) return denied
        const changed = Object.entries(values)
          .filter(([, value]) => value !== undefined)
          .map(([key]) => key)
        if (changed.length === 0) {
          return refusal(
            'Refusé : aucun champ à modifier dans `values` (exemples : interestRate, downPayment, grossYieldThreshold, notaryMode).'
          )
        }
        const current = await ctx.assumptions.current(ctx.member.workspaceId)
        const merged = AssumptionsSchema.parse(
          mergeAssumptions(current.values, values)
        )
        const result = await ctx.assumptions.update(
          ctx.member,
          {
            values: merged,
            ...(label !== undefined ? { label } : {}),
            ...(expectedVersion !== undefined ? { expectedVersion } : {}),
          },
          CHANNEL
        )
        return dataResult(
          `Hypothèses enregistrées (version ${result.id}${result.label ? `, « ${result.label} »` : ''}) : ${changed.join(', ')}.\n${describeImpact(result.impact)}`,
          result
        )
      })
  )
  server.registerTool(
    'list_search_criteria',
    {
      title: 'Lister les critères de recherche',
      description:
        "Critères de recherche enregistrés et partagés dans l'espace : nom, filtres (prix, surface, pièces, DPE, verdict, statuts, distance au tram), périmètre (point et rayon, polygone, isochrone), " +
        "nombre d'annonces qui le satisfont, nouveautés pour le membre connecté, annonces incluses sous réserve (localisation imprécise). Les identifiants servent à list_listings (`criteriaId`) et à update_search_criteria.",
      inputSchema: McpListSearchCriteriaInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ includeArchived }) =>
      answer(async () => {
        const criteria = await ctx.criteria.list(ctx.member, {
          includeArchived,
        })
        const summary = criteria.length
          ? `${criteria.length} critère(s) :\n${criteria.map(c => `- ${describeCriteria(c)}`).join('\n')}`
          : 'Aucun critère de recherche enregistré.'
        return dataResult(summary, { criteria })
      })
  )

  server.registerTool(
    'get_market_context',
    {
      title: 'Contexte de marché',
      description:
        "Pour une annonce (`listingId`), une adresse (`address`, géocodée) ou un point GeoJSON : ventes DVF d'appartements comparables (500 m, élargi à 1 000 puis 2 000 m faute de ventes, surface ±25 % si `surface`, trois dernières années) avec prix médian au m², quartiles, dispersion et liste datée ; " +
        "plafond d'encadrement des loyers (Bordeaux seulement : zone, loyer de référence majoré selon `rooms`, `constructionYear`, `furnished`) ; arrêt de tram et arrêt le plus proches. Données ouvertes importées (DVF, TBM, arrêté préfectoral), rien n'est inventé : un doute rend « à vérifier ».",
      inputSchema: McpGetMarketContextInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async request =>
      answer(async () => {
        const report = await ctx.enrichment.marketReport(ctx.member, request)
        return dataResult(describeMarketReport(report), report)
      })
  )

  server.registerTool(
    'create_search_criteria',
    {
      title: 'Créer un critère de recherche',
      description:
        "Enregistre un critère partagé dans l'espace : `name`, `filters` (priceMax, priceMin, surfaceMin, roomsMin, dpeMax, verdicts, statuses, communes, maxTramDistanceMeters) et `perimeter` : " +
        "{ type: 'point_radius', longitude, latitude, radiusMeters }, { type: 'polygon', polygon: GeoJSON [lng, lat] fermé }, ou { type: 'isochrone', origin (point) ou address, mode : walking, cycling (approché), driving, durationMinutes } calculée par la Géoplateforme et figée en polygone. " +
        'La réponse donne le nombre d’annonces qui le satisfont ; les annonces créées ensuite y sont confrontées (alerte « entre dans le critère »). Portée listings:write.',
      inputSchema: McpCreateSearchCriteriaInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async input =>
      answer(() =>
        openDataAnswer(async () => {
          const denied = writeRefusal(ctx.scopes)
          if (denied) return denied
          const created = await ctx.criteria.create(ctx.member, input, CHANNEL)
          return dataResult(`Critère créé : ${describeCriteria(created)}`, {
            criteria: created,
          })
        })
      )
  )

  server.registerTool(
    'update_search_criteria',
    {
      title: 'Modifier un critère de recherche',
      description:
        'Modifie un critère : `name`, `filters` (fusionnés avec les filtres enregistrés), `perimeter` (remplacé ; null = aucun), `active: false` pour l’archiver (aucune suppression par le MCP). ' +
        '`expectedUpdatedAt` (le `updatedAt` lu avec list_search_criteria) est le garde-fou optimiste : refus si le critère a changé depuis. Portée listings:write.',
      inputSchema: McpUpdateSearchCriteriaInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ criteriaId, ...patch }) =>
      answer(() =>
        openDataAnswer(async () => {
          const denied = writeRefusal(ctx.scopes)
          if (denied) return denied
          const updated = await ctx.criteria.update(
            ctx.member,
            criteriaId,
            patch,
            CHANNEL
          )
          return dataResult(`Critère modifié : ${describeCriteria(updated)}`, {
            criteria: updated,
          })
        })
      )
  )
}

/**
 * Les ressources du connecteur : le schéma JSON d'une annonce (ce que
 * create_listing accepte, descriptions et unités comprises) et le glossaire
 * des indicateurs. Lecture seule, sans accès à la base.
 */
export function registerResources(server: McpServer): void {
  server.registerResource(
    'listing_schema',
    'apart://schema/listing',
    {
      title: "Schéma d'une annonce",
      description:
        "Schéma JSON de la fiche d'annonce normalisée acceptée par create_listing : champs, unités, énumérations et descriptions en français.",
      mimeType: 'application/schema+json',
    },
    uri => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/schema+json',
          text: JSON.stringify(listingJsonSchema(), null, 2),
        },
      ],
    })
  )
  server.registerResource(
    'glossary',
    'apart://glossaire',
    {
      title: 'Glossaire des indicateurs',
      description:
        'Définitions : coût total, frais de notaire, mensualité, rendements brut et net, effort, repère 220 × loyer, verdict, prix cible, critère liant, décote et ses classes, offre suggérée, louabilité, provenance.',
      mimeType: 'text/markdown',
    },
    uri => ({
      contents: [
        { uri: uri.href, mimeType: 'text/markdown', text: glossaryMarkdown() },
      ],
    })
  )
}

/**
 * Le prompt « analyser cette annonce » : guide Claude de la lecture de la
 * page à la création, en passant par extract_listing, la présentation de la
 * fiche au membre et sa confirmation explicite avant toute écriture.
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'analyze_listing',
    {
      title: 'Analyser cette annonce',
      description:
        "À partir du texte d'une page d'annonce (et de captures jointes), extrait la fiche normalisée par l'IA, montre provenance, confiance, champs manquants et doublons, demande confirmation, puis crée l'annonce et l'évalue.",
      argsSchema: McpAnalyzeListingPromptArgsSchema.shape,
    },
    ({ pageText, url, notes }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: analyzeListingPrompt({ pageText, url, notes }),
          },
        },
      ],
    })
  )
}

/** Le texte du prompt, pur, pour les tests. */
export function analyzeListingPrompt(args: {
  pageText: string
  url?: string | undefined
  notes?: string | undefined
}): string {
  return [
    "Analyse cette annonce immobilière pour l'espace apart-localizer, en suivant ces étapes dans l'ordre :",
    '',
    `1. Appelle l'outil extract_listing avec le texte ci-dessous dans \`text\`${args.url ? `, l'URL \`${args.url}\` dans \`url\`` : ''} et, si des captures d'écran sont jointes à la conversation, chacune dans \`images\` (base64, type MIME). N'invente aucune valeur toi-même : c'est le modèle d'extraction côté serveur qui lit.`,
    "2. Présente la fiche rendue au membre en français : prix, surface, pièces, étage, DPE, charges, taxe foncière, adresse et commune, travaux évoqués ; pour chaque valeur, sa confiance et l'extrait justificatif (listing.fieldSources) ; la liste des champs indispensables manquants ou douteux ; les doublons probables avec leur motif.",
    "3. S'il y a un doublon probable, demande au membre s'il s'agit de la même annonce (dans ce cas n'enregistre rien et propose update_listing ou get_listing sur l'existante) ou s'il veut créer quand même (ignoreDuplicates: true).",
    "4. Attends la confirmation explicite du membre avant d'écrire. Applique ses corrections dans la fiche et marque chaque champ corrigé avec la provenance « user » dans fieldSources.",
    "5. Après confirmation seulement, appelle create_listing avec « listing » = la fiche rendue par extract_listing (corrections comprises, fieldSources conservé, sourceText conservé) et « provenance: ai ». Rapporte l'identifiant, les indicateurs (coût total, mensualité, rendement brut, effort, verdict), le verdict de louabilité et les tâches créées pour les champs manquants.",
    '',
    args.notes ? `Consignes du membre : ${args.notes}\n` : null,
    '<annonce_source>',
    args.pageText,
    '</annonce_source>',
  ]
    .filter(line => line !== null)
    .join('\n')
}
