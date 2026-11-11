import {
  LISTING_STATUS_LABELS,
  LOCATION_PRECISION_LABELS,
  OPINIONS_FILTER_LABELS,
  VERDICT_LABELS,
  WORKFLOW_STAGE_LABELS,
} from '@apart/contracts'
import type {
  CriteriaFitKept,
  CriteriaFitLevel,
  DecisionProposal,
  ListingFilters,
  ListingStatus,
  SellerType,
  WorkflowStage,
  WorkflowStageCount,
} from '@apart/contracts'
import { stageOfStatus } from './decisions.js'
import { joinFrench } from './exploration.js'
import { formatEuros, plural } from './format.js'
import { formatDistance } from './listing-overview.js'
import { isFoldedOut } from './workflow.js'

/**
 * Lot 26 (ADR 0036) : les filtres de la page Annonces se voient. Une puce
 * par filtre actif, qu'on retire d'un geste ; les compteurs des étapes
 * suivent les filtres (« 1 sur 4 ») ; une étape vide sous des filtres dit
 * lesquels et combien d'annonces ils cachent. Pur, sans E/S.
 */

/** Ce que la page manipule des filtres (sans tri ni pagination). */
export type FilterValues = Partial<
  Omit<ListingFilters, 'page' | 'limit' | 'sort' | 'order'>
>

/** Le nom de chaque puce ; une puce retire un ou plusieurs champs. */
export type FilterChipKey =
  | 'search'
  | 'commune'
  | 'criteriaId'
  | 'verdict'
  | 'dpe'
  | 'price'
  | 'surface'
  | 'rooms'
  | 'precision'
  | 'newForMe'
  | 'staleDays'
  | 'near'
  | 'sellerType'
  | 'multiPortal'
  | 'reference'
  | 'opinions'
  | 'status'

export interface FilterChip {
  key: FilterChipKey
  /** « Commune : Mérignac », « Rentabilité : Cible », « Autour d'un point · 1 km ». */
  label: string
  /** Les champs que retirer la puce efface. */
  clears: (keyof FilterValues)[]
}

export interface FilterChipContext {
  /** Le nom d'un critère enregistré, s'il est connu. */
  criteriaName?: (id: string) => string | null | undefined
}

/** « Agence ou mandataire », « Particulier », « À relever » : les choix du filtre Vendeur. */
function sellerText(types: readonly SellerType[]): string {
  const words: string[] = []
  if (types.includes('agency') || types.includes('mandatary')) {
    words.push('agence ou mandataire')
  }
  if (types.includes('private')) words.push('particulier')
  if (types.includes('unknown')) words.push('à relever')
  const text = joinFrench(words)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** « 150 000 € à 250 000 € », « jusqu'à 250 000 € », « dès 150 000 € ». */
function rangeText(
  min: number | null | undefined,
  max: number | null | undefined,
  format: (value: number) => string
): string {
  if (min != null && max != null) return `${format(min)} à ${format(max)}`
  if (max != null) return `jusqu’à ${format(max)}`
  return `dès ${format(min ?? 0)}`
}

const m2 = (value: number): string =>
  `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m²`

/**
 * Les filtres actifs, une puce chacun, dans l'ordre du panneau « Filtres ».
 * Le tri n'est pas un filtre : il ne cache rien. Leur nombre est celui de
 * « Filtres (n) ».
 */
export function activeFilterChips(
  filters: FilterValues,
  context: FilterChipContext = {}
): FilterChip[] {
  const chips: FilterChip[] = []
  const add = (
    key: FilterChipKey,
    label: string,
    clears: (keyof FilterValues)[] = [key as keyof FilterValues]
  ) => chips.push({ key, label, clears })
  const f = filters
  if (f.search) add('search', `« ${f.search} »`)
  if (f.commune?.length) add('commune', `Commune : ${joinFrench(f.commune)}`)
  if (f.criteriaId) {
    const name = context.criteriaName?.(f.criteriaId)
    add('criteriaId', name ? `Critère : ${name}` : 'Un critère enregistré')
  }
  if (f.verdict?.length) {
    add(
      'verdict',
      `Rentabilité : ${joinFrench(f.verdict.map(v => VERDICT_LABELS[v]))}`
    )
  }
  if (f.dpe?.length) add('dpe', `DPE ${f.dpe.join(', ')}`)
  if (f.priceMin != null || f.priceMax != null) {
    add('price', `Prix ${rangeText(f.priceMin, f.priceMax, formatEuros)}`, [
      'priceMin',
      'priceMax',
    ])
  }
  if (f.surfaceMin != null || f.surfaceMax != null) {
    add('surface', `Surface ${rangeText(f.surfaceMin, f.surfaceMax, m2)}`, [
      'surfaceMin',
      'surfaceMax',
    ])
  }
  if (f.roomsMin != null) {
    add('rooms', `${plural(f.roomsMin, 'pièce')} ou plus`, ['roomsMin'])
  }
  if (f.precision?.length) {
    add(
      'precision',
      `Repère : ${joinFrench(f.precision.map(p => LOCATION_PRECISION_LABELS[p].toLowerCase()))}`
    )
  }
  if (f.newForMe) add('newForMe', 'Pas encore ouvertes')
  if (f.staleDays != null) {
    add('staleDays', `À revérifier (plus de ${f.staleDays} jours)`)
  }
  if (f.near) {
    add('near', `Autour d’un point · ${formatDistance(f.near.radiusMeters)}`)
  }
  if (f.sellerType?.length) {
    add('sellerType', `Vendeur : ${sellerText(f.sellerType)}`)
  }
  if (f.multiPortal) add('multiPortal', 'Sur plusieurs portails')
  if (f.reference) add('reference', `Réf. ${f.reference}`)
  if (f.opinions)
    add('opinions', `Avis : ${OPINIONS_FILTER_LABELS[f.opinions]}`)
  if (f.status?.length) {
    add(
      'status',
      `Statut : ${joinFrench(f.status.map(s => LISTING_STATUS_LABELS[s].toLowerCase()))}`
    )
  }
  return chips
}

/** Les filtres sans les champs d'une puce. */
export function withoutChip(
  filters: FilterValues,
  chip: Pick<FilterChip, 'clears'>
): FilterValues {
  const next = { ...filters }
  for (const key of chip.clears) delete next[key]
  return next
}

// ---------------------------------------------------------------------------
// Les compteurs des étapes sous des filtres
// ---------------------------------------------------------------------------

interface FoldFacts {
  decision: DecisionProposal | null
}

/** Une annonce suivie qui passe les filtres. */
export interface FilteredListingFacts extends FoldFacts {
  status: ListingStatus
  fit: { level: CriteriaFitLevel; kept: CriteriaFitKept | null } | null
}

/** Un brouillon (à valider ou écarté) qui passe les filtres. */
export interface FilteredDraftFacts extends FoldFacts {
  fit: { level: CriteriaFitLevel; kept: CriteriaFitKept | null } | null
}

/** Le compteur d'une étape : ce qui est affiché, et le total de l'étape. */
export interface StageCountView extends WorkflowStageCount {
  /** Le total de l'étape sans les filtres (celui de « Ce qui t'attend »). */
  total: number
  /** Vrai si des filtres sont actifs : le compteur dit « count sur total ». */
  filtered: boolean
}

/**
 * Les compteurs de la barre des étapes. Sans filtre, ceux de l'aperçu
 * (`workflowOverview`). Sous des filtres, **les compteurs suivent les
 * filtres** : chaque étape compte ce qui passe les filtres, selon la même
 * règle que l'aperçu (une annonce hors critères non gardée est repliée, pas
 * comptée ; les brouillons écartés comptent aux archives), et garde son
 * total pour dire « 1 sur 4 ». `listings` et `drafts` sont null tant que la
 * lecture filtrée n'est pas arrivée : les compteurs restent ceux de
 * l'aperçu, sans « sur ».
 */
export function stageCountsUnderFilters(input: {
  stages: readonly WorkflowStageCount[]
  filtered: boolean
  listings: readonly FilteredListingFacts[] | null
  drafts: readonly FilteredDraftFacts[] | null
  /** Les brouillons écartés qui passent les filtres ; null s'ils ne sont pas lus. */
  dismissedDrafts?: number | null
}): StageCountView[] {
  const base = (s: WorkflowStageCount): StageCountView => ({
    ...s,
    total: s.count,
    filtered: false,
  })
  if (!input.filtered || input.listings === null || input.drafts === null) {
    return input.stages.map(base)
  }
  const shown = new Map<WorkflowStage, number>()
  const bump = (stage: WorkflowStage) =>
    shown.set(stage, (shown.get(stage) ?? 0) + 1)
  for (const listing of input.listings) {
    if (!isFoldedOut(listing.fit, listing.decision)) {
      bump(stageOfStatus(listing.status))
    }
  }
  for (const draft of input.drafts) {
    if (!isFoldedOut(draft.fit, draft.decision)) bump('a-valider')
  }
  return input.stages.map(s => {
    const archivesExtra =
      s.stage === 'archives' ? (input.dismissedDrafts ?? 0) : 0
    return {
      ...s,
      count: (shown.get(s.stage) ?? 0) + archivesExtra,
      total: s.count,
      filtered: true,
    }
  })
}

/** « 1 sur 4 » sous des filtres, sinon « 4 » ; pour le lecteur d'écran, la phrase entière. */
export function stageCountText(count: StageCountView): {
  short: string
  spoken: string
} {
  if (!count.filtered) {
    return {
      short: String(count.count),
      spoken: plural(count.count, 'annonce'),
    }
  }
  return {
    short: `${count.count}/${count.total}`,
    spoken: `${count.count} sur ${plural(count.total, 'annonce')}, avec les filtres`,
  }
}

/**
 * Pourquoi une étape paraît vide sous des filtres : « Les filtres cachent
 * les 2 annonces de l'étape À visiter : Commune : Mérignac et Rentabilité :
 * Cible. » ; null si l'étape n'a rien à cacher ou s'il n'y a pas de filtre.
 */
export function hiddenByFiltersText(
  count: StageCountView,
  chips: readonly FilterChip[]
): string | null {
  if (!count.filtered || chips.length === 0) return null
  const hidden = count.total - count.count
  if (hidden <= 0) return null
  const stage = WORKFLOW_STAGE_LABELS[count.stage]
  const what =
    count.count === 0
      ? hidden > 1
        ? `les ${hidden} annonces de l’étape ${stage}`
        : `la seule annonce de l’étape ${stage}`
      : `${plural(hidden, 'annonce')} de l’étape ${stage}`
  return `Les filtres cachent ${what} : ${joinFrench(chips.map(c => c.label))}.`
}
