import {
  CRITERIA_FIT_LEVEL_LABELS,
  DISCOUNT_CLASS_LABELS,
  JUDGEMENT_DESCRIPTIONS,
  JUDGEMENT_KEYS,
  JUDGEMENT_LABELS,
  JUDGEMENT_SHORT_LABELS,
  RENTAL_VERDICT_LABELS,
  VERDICT_LABELS,
  listingFieldLabel,
} from '@apart/contracts'
import type {
  ActivityChannel,
  CriteriaFitLevel,
  DiscountClass,
  JudgementKey,
  RentalVerdict,
  Verdict,
} from '@apart/contracts'
import { parisDay } from './agency-requests.js'
import { fitReasonsText } from './criteria-fit.js'
import { waitingLabel } from './decisions.js'
import { formatEuros } from './format.js'
import type { HighlightTab, NextStep } from './listing-overview.js'
import type { VerdictFailure, VerdictNearMiss } from './verdict.js'
import { listingRowKind } from './workflow.js'
import type { StageRowListing } from './workflow.js'

/**
 * Lot 25 (ADR 0035) : la fiche répond d'abord. Pur, sans E/S :
 * - les trois jugements d'une annonce, étiquetés et toujours dans le même
 *   ordre (« Rentabilité », « Recherche », « Location ») ;
 * - la réponse à « Faut-il y aller ? » en une phrase, tirée du verdict, de
 *   l'adéquation aux critères et du prix cible, qui dit ce qui manque ;
 * - l'action que l'étape demande (trier, planifier, mode visite, avis,
 *   offre, réponse à une proposition…) ;
 * - où mène chaque « prochaine étape » ;
 * - « Depuis ta dernière ouverture » en une ligne ;
 * - la photo de couverture (la choisie, sinon la première de la première
 *   visite ; jamais une image de portail).
 */

// ---------------------------------------------------------------------------
// Les trois jugements
// ---------------------------------------------------------------------------

/** Le sens d'un jugement, pour sa teinte et son symbole (jamais la couleur seule). */
export type JudgementSense = 'good' | 'mixed' | 'bad' | 'unknown'

export interface Judgement {
  key: JudgementKey
  /** « Rentabilité », « Recherche », « Location ». */
  label: string
  /** « Renta. », « Rech. », « Loc. ». */
  short: string
  /** Ce que juge ce jugement, en une phrase. */
  description: string
  /** « Cible », « Dans les critères », « Sous conditions », « À confirmer ». */
  value: string
  /** La valeur lue (verdict, niveau, louabilité) ; `unknown` si elle reste à confirmer. */
  code: Verdict | CriteriaFitLevel | RentalVerdict | 'unknown'
  sense: JudgementSense
}

export interface JudgementsInput {
  /** Le verdict ; null s'il reste à confirmer (brouillon sans loyer visé, lot 16). */
  verdict: Verdict | null
  /** L'adéquation ; null ou aucun critère actif : pas de jugement « Recherche ». */
  fit: { level: CriteriaFitLevel; activeCriteria: number } | null
  /** La louabilité de la phase 2 ; null : pas de jugement « Location ». */
  rental: RentalVerdict | null
}

const VERDICT_SENSE: Record<Verdict, JudgementSense> = {
  target: 'good',
  to_dig: 'mixed',
  off_target: 'bad',
}
const FIT_SENSE: Record<CriteriaFitLevel, JudgementSense> = {
  in: 'good',
  margin: 'mixed',
  to_confirm: 'unknown',
  out: 'bad',
}
const RENTAL_SENSE: Record<RentalVerdict, JudgementSense> = {
  compatible: 'good',
  conditional: 'mixed',
  incompatible: 'bad',
}

/** Le symbole d'un sens, lu avec la valeur : ✓, ~, ✗, ?. */
export const JUDGEMENT_SYMBOLS: Record<JudgementSense, string> = {
  good: '✓',
  mixed: '~',
  bad: '✗',
  unknown: '?',
}

/** La forme écrite d'un jugement : « Rentabilité : Cible ». */
export function judgementText(judgement: Judgement): string {
  return `${judgement.label} : ${judgement.value}`
}

/**
 * Les jugements d'une annonce, dans l'ordre de `JUDGEMENT_KEYS` ; ceux qui ne
 * s'appliquent pas (aucun critère actif, pas de louabilité) sont omis, sans
 * changer l'ordre des autres.
 */
export function listingJudgements(input: JudgementsInput): Judgement[] {
  const base = (key: JudgementKey) => ({
    key,
    label: JUDGEMENT_LABELS[key],
    short: JUDGEMENT_SHORT_LABELS[key],
    description: JUDGEMENT_DESCRIPTIONS[key],
  })
  const all: Record<JudgementKey, Judgement | null> = {
    profitability: input.verdict
      ? {
          ...base('profitability'),
          value: VERDICT_LABELS[input.verdict],
          code: input.verdict,
          sense: VERDICT_SENSE[input.verdict],
        }
      : {
          ...base('profitability'),
          value: 'À confirmer',
          code: 'unknown',
          sense: 'unknown',
        },
    search:
      input.fit && input.fit.activeCriteria > 0
        ? {
            ...base('search'),
            value: CRITERIA_FIT_LEVEL_LABELS[input.fit.level],
            code: input.fit.level,
            sense: FIT_SENSE[input.fit.level],
          }
        : null,
    rental: input.rental
      ? {
          ...base('rental'),
          value: RENTAL_VERDICT_LABELS[input.rental],
          code: input.rental,
          sense: RENTAL_SENSE[input.rental],
        }
      : null,
  }
  return JUDGEMENT_KEYS.flatMap(key => {
    const judgement = all[key]
    return judgement ? [judgement] : []
  })
}

/** Ce que les jugements lisent d'une annonce suivie. */
export interface JudgedListing {
  evaluation: {
    metrics: { verdict: Verdict }
    rental: { verdict: RentalVerdict } | null
  }
  criteriaFit: { level: CriteriaFitLevel; activeCriteria: number } | null
}

/** Les jugements d'une annonce suivie (liste, cartes, tableau, fiche, tri, accueil). */
export function judgementsOfListing(item: JudgedListing): Judgement[] {
  return listingJudgements({
    verdict: item.evaluation.metrics.verdict,
    fit: item.criteriaFit,
    rental: item.evaluation.rental?.verdict ?? null,
  })
}

/** Ce que les jugements lisent d'un brouillon à valider. */
export interface JudgedDraft {
  evaluation: JudgedListing['evaluation'] | null
  fit: { level: CriteriaFitLevel; activeCriteria: number } | null
  listing: { rentalPlan: { targetRent: number | null } | null }
}

/**
 * Les jugements d'un brouillon : sans loyer visé, la rentabilité reste « à
 * confirmer » (lot 16), quel que soit le verdict calculé.
 */
export function judgementsOfDraft(draft: JudgedDraft): Judgement[] {
  const hasRent = (draft.listing.rentalPlan?.targetRent ?? 0) > 0
  return listingJudgements({
    verdict: hasRent ? (draft.evaluation?.metrics.verdict ?? null) : null,
    fit: draft.fit,
    rental: draft.evaluation?.rental?.verdict ?? null,
  })
}

/**
 * Lot 26 : ce qu'une ligne de liste montre des jugements. Un jugement « à
 * confirmer » n'est pas un jugement : la ligne l'omet (un brouillon sans
 * loyer visé ne montre plus trois pastilles de bruit) et la fiche le dit en
 * entier. L'ordre des autres ne change pas.
 */
export function rowJudgements(judgements: readonly Judgement[]): Judgement[] {
  return judgements.filter(j => j.sense !== 'unknown')
}

/**
 * Lot 26 : ce que la ligne a omis, pour le lecteur d'écran et l'infobulle :
 * « Rentabilité et recherche à confirmer » ; null si rien n'est omis.
 */
export function pendingJudgementsText(
  judgements: readonly Judgement[]
): string | null {
  const pending = judgements.filter(j => j.sense === 'unknown')
  if (pending.length === 0) return null
  const names = pending.map((j, i) => (i ? j.label.toLowerCase() : j.label))
  const joined =
    names.length > 1
      ? `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`
      : names[0]
  return `${joined} à confirmer`
}

// ---------------------------------------------------------------------------
// « Faut-il y aller ? » en une phrase
// ---------------------------------------------------------------------------

/** Le sens de la réponse : oui, peut-être, non, pas encore. */
export type AnswerTone = 'go' | 'maybe' | 'no' | 'unknown'

export interface ListingAnswerInput {
  price: number
  /** Le loyer visé est saisi : sans lui, la rentabilité n'est pas jugée. */
  hasRent: boolean
  /**
   * ADR 0046 : le loyer visé est l'estimation de l'application (observatoire
   * des loyers) ; la raison de rentabilité le dit.
   */
  rentEstimated?: boolean
  verdict: Verdict
  failures: readonly VerdictFailure[]
  nearMisses: readonly VerdictNearMiss[]
  /** Lot 26 : la classe DPE lue, pour nommer un DPE qui échoue (« DPE F »). */
  dpeClass?: string | null
  fit: {
    level: CriteriaFitLevel
    activeCriteria: number
    reasons: readonly string[]
  } | null
  targetPrice: {
    targetPrice: number | null
    discount: number | null
    discountClass: DiscountClass | null
  } | null
}

export interface ListingAnswer {
  tone: AnswerTone
  /** « Oui », « Peut-être », « Pas à ce prix », « Plutôt non », « Pas encore de réponse ». */
  lead: string
  /**
   * Lot 26 : trois raisons courtes au plus, une phrase chacune, la décisive
   * d'abord (rentabilité, prix cible, recherche ; la recherche en tête quand
   * c'est elle qui dit non).
   */
  reasons: string[]
  /** La réponse et ses raisons, en texte suivi (« Plutôt non. Hors de… »). */
  sentence: string
  /** Ce qui manque pour répondre (« le loyer visé », « le prix »). */
  missing: string[]
}

/** Lot 26 : au plus trois raisons sous la réponse. */
export const ANSWER_REASONS_MAX = 3

const FAILURE_WORDS: Record<Exclude<VerdictFailure, 'dpe'>, string> = {
  gross_yield: 'rendement brut trop faible',
  effort: 'effort mensuel trop lourd',
}
const NEAR_MISS_WORDS: Record<VerdictNearMiss, string> = {
  gross_yield: 'rendement brut',
  effort: 'effort mensuel',
  dpe_unknown: 'DPE inconnu',
}

const LEADS: Record<AnswerTone | 'not_at_price', string> = {
  go: 'Oui',
  maybe: 'Peut-être',
  not_at_price: 'Pas à ce prix',
  no: 'Plutôt non',
  unknown: 'Pas encore de réponse',
}

/** La minuscule en tête, sauf pour un sigle (« DPE », « TRI »). */
const lowerFirst = (text: string): string =>
  /^\p{Lu}{2}/u.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1)

const upperFirst = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1)

/** « Tête : détail. », ou « Tête. » sans détail ; jamais de parenthèses imbriquées. */
const reason = (head: string, detail: readonly string[] = []): string =>
  detail.length ? `${head} : ${detail.join(', ')}.` : `${head}.`

/** « −9 % ». */
function discountText(discount: number): string {
  return `−${Math.round(discount * 100)} %`
}

/** Le DPE qui fait échouer la rentabilité, nommé quand la classe est lue. */
function dpeWord(dpeClass: string | null | undefined): string {
  return dpeClass ? `DPE ${dpeClass}` : 'DPE classé E à G'
}

function profitabilityReason(input: ListingAnswerInput): string {
  const text = verdictReason(input)
  return input.rentEstimated
    ? `${text.replace(/\.$/, '')}, avec un loyer visé estimé.`
    : text
}

function verdictReason(input: ListingAnswerInput): string {
  switch (input.verdict) {
    case 'target':
      return 'Dans la cible de rentabilité au prix affiché.'
    case 'to_dig':
      return reason(
        'Cible de rentabilité manquée de peu',
        input.nearMisses.map(n => NEAR_MISS_WORDS[n])
      )
    default:
      return reason(
        'Hors de la cible de rentabilité',
        input.failures.map(f =>
          f === 'dpe' ? dpeWord(input.dpeClass) : FAILURE_WORDS[f]
        )
      )
  }
}

function searchReason(fit: ListingAnswerInput['fit']): string | null {
  if (!fit || fit.activeCriteria === 0) return null
  const detail = fit.reasons.length
    ? [lowerFirst(fitReasonsText(fit.reasons))]
    : []
  switch (fit.level) {
    case 'in':
      return 'Dans tes critères de recherche.'
    case 'margin':
      return detail.length
        ? reason('À la marge de tes critères', detail)
        : 'À la marge de tes critères de recherche.'
    case 'to_confirm':
      return detail.length
        ? reason('À confirmer face à tes critères', detail)
        : 'À confirmer face à tes critères de recherche.'
    default:
      return detail.length
        ? reason('Hors de tes critères', detail)
        : 'Hors de tes critères de recherche.'
  }
}

function targetPriceReason(input: ListingAnswerInput): string | null {
  const target = input.targetPrice
  if (!target) return null
  if (target.targetPrice === null) return 'Pas de prix cible calculable.'
  const price = formatEuros(target.targetPrice)
  if (target.discount === null || target.discount <= 0) {
    return input.verdict === 'target'
      ? null
      : `Prix cible ${price}, déjà atteint.`
  }
  if (input.failures.includes('dpe')) {
    return `Baisser le prix ne suffit pas : le DPE la laisse hors cible, même à ${price}.`
  }
  const reach =
    target.discountClass && target.discountClass !== 'in_target'
      ? ` : ${lowerFirst(DISCOUNT_CLASS_LABELS[target.discountClass])}`
      : ''
  return `Il faudrait l’obtenir à ${price}, soit ${discountText(target.discount)}${reach}.`
}

const sentenceOf = (lead: string, reasons: readonly string[]): string =>
  [`${lead}.`, ...reasons].join(' ')

/**
 * La réponse à « Faut-il y aller ? » : d'abord le mot qui répond, puis trois
 * raisons courtes au plus (lot 26), tirées de la rentabilité, du prix cible
 * et de la recherche tels que l'application les a calculés. Rien d'inventé :
 * sans loyer visé ou sans prix, elle le dit et ne juge pas la rentabilité.
 */
export function listingAnswer(input: ListingAnswerInput): ListingAnswer {
  const missing = [
    ...(input.price > 0 ? [] : ['le prix']),
    ...(input.hasRent ? [] : ['le loyer visé']),
  ]
  const search = searchReason(input.fit)
  if (missing.length) {
    const reasons = [
      `Sans ${missing.join(' et ')}, la rentabilité et le prix cible ne se calculent pas.`,
      ...(search ? [search] : []),
    ]
    return {
      tone: 'unknown',
      lead: LEADS.unknown,
      reasons,
      sentence: sentenceOf(LEADS.unknown, reasons),
      missing,
    }
  }

  const fitLevel =
    input.fit && input.fit.activeCriteria > 0 ? input.fit.level : null
  const reachable =
    input.targetPrice?.discountClass === 'negotiable' ||
    input.targetPrice?.discountClass === 'tight'
  let lead: keyof typeof LEADS
  if (fitLevel === 'out') lead = 'no'
  else if (input.verdict === 'off_target') {
    lead = !input.failures.includes('dpe') && reachable ? 'not_at_price' : 'no'
  } else if (
    input.verdict === 'to_dig' ||
    fitLevel === 'margin' ||
    fitLevel === 'to_confirm'
  ) {
    lead = 'maybe'
  } else lead = 'go'

  const ordered =
    fitLevel === 'out'
      ? [search, profitabilityReason(input), targetPriceReason(input)]
      : [profitabilityReason(input), targetPriceReason(input), search]
  const reasons = ordered
    .filter((part): part is string => Boolean(part))
    .map(upperFirst)
    .slice(0, ANSWER_REASONS_MAX)
  const tone: AnswerTone = lead === 'not_at_price' ? 'maybe' : lead
  return {
    tone,
    lead: LEADS[lead],
    reasons,
    sentence: sentenceOf(LEADS[lead], reasons),
    missing: [],
  }
}

// ---------------------------------------------------------------------------
// L'action que l'étape demande
// ---------------------------------------------------------------------------

export type FicheActionKind =
  | 'triage'
  | 'decision'
  | 'settle'
  | 'plan_visit'
  | 'visit_mode'
  | 'prepare_visit'
  | 'give_opinion'
  | 'opinions'
  | 'prepare_offer'
  | 'seller_answer'
  | 'todo'
  | 'rescue'
  | 'none'

export interface FicheAction {
  kind: FicheActionKind
  /** Le libellé du bouton ; vide pour `none`. */
  label: string
  /** Une précision sous le bouton, ou null. */
  hint: string | null
}

export interface FicheActionInput extends StageRowListing {
  /** Maintenant : une prochaine visite le même jour (heure de Paris) ouvre le mode visite. */
  now: Date
}

/**
 * L'action de l'étape où en est l'annonce, celle des lignes de l'étape
 * (`listingRowKind`) vue depuis la fiche : trier, répondre à une proposition,
 * planifier ou préparer une visite, ouvrir le mode visite, donner mon avis,
 * préparer une offre, noter la réponse du vendeur, repêcher. Un changement de
 * statut passe toujours par la proposition quand l'espace décide à plusieurs
 * (le tri, le menu Statut) : cette fonction ne l'applique pas.
 */
export function ficheNextAction(input: FicheActionInput): FicheAction {
  const kind = listingRowKind(input)
  const action = (
    k: FicheActionKind,
    label: string,
    hint: string | null = null
  ): FicheAction => ({ kind: k, label, hint })
  switch (kind) {
    case 'to_sort':
      return action(
        'triage',
        'Trier cette annonce',
        'À visiter, à garder ou à écarter'
      )
    case 'to_confirm':
      return action(
        'decision',
        'Répondre à la proposition',
        'Une proposition attend ta réponse'
      )
    case 'waiting':
      return action(
        'decision',
        'Voir la proposition',
        input.decision ? waitingLabel(input.decision) : null
      )
    case 'ready':
      return action(
        'decision',
        'Voir la proposition',
        'Plus personne à attendre'
      )
    case 'to_settle':
      return action(
        'settle',
        'Trancher ensemble',
        'Les réponses ne vont pas dans le même sens'
      )
    case 'no_date':
      return action(
        'plan_visit',
        'Planifier une visite',
        'Aucune visite prévue'
      )
    case 'visit_planned':
      return input.stage?.nextVisitAt &&
        parisDay(input.stage.nextVisitAt) === parisDay(input.now.toISOString())
        ? action('visit_mode', 'Ouvrir le mode visite', 'Visite aujourd’hui')
        : action('prepare_visit', 'Préparer la visite', null)
    case 'to_rate':
      return action(
        'give_opinion',
        'Donner mon avis',
        'Tu ne l’as pas encore notée'
      )
    case 'to_discuss':
      return action('opinions', 'Voir nos désaccords', 'Nos notes s’écartent')
    case 'opinions_waiting':
      return action('opinions', 'Voir nos avis', 'Un avis est encore attendu')
    case 'opinions_complete':
      return action('prepare_offer', 'Préparer une offre', null)
    case 'offer_pending':
      return action(
        'seller_answer',
        'Noter la réponse du vendeur',
        'Offre en attente de réponse'
      )
    case 'offer_counter':
      return action('seller_answer', 'Répondre à la contre-proposition', null)
    case 'offer_accepted':
      return action('todo', 'Voir ce qu’il reste à faire', 'Offre acceptée')
    case 'archived_discarded':
    case 'archived_refused':
      return action('rescue', 'Repêcher', 'Elle revient À étudier')
    default:
      return action('none', '', null)
  }
}

// ---------------------------------------------------------------------------
// Où mène une prochaine étape
// ---------------------------------------------------------------------------

export interface NextStepTarget {
  tab: HighlightTab
  /** L'identifiant du bloc à atteindre dans l'onglet, ou null. */
  anchor: string | null
  /** « Voir la visite », pour le lien. */
  label: string
}

/** Le bloc de la fiche où se traite une prochaine étape (lien de la Synthèse). */
export function nextStepTarget(
  step: Pick<NextStep, 'kind' | 'id'>
): NextStepTarget {
  switch (step.kind) {
    case 'visit':
      return { tab: 'a-faire', anchor: 'visites', label: 'Voir la visite' }
    case 'discuss':
      return { tab: 'synthese', anchor: 'nos-avis', label: 'Voir nos avis' }
    case 'draft':
      return { tab: 'a-faire', anchor: 'echanges', label: 'Valider' }
    case 'follow_up':
      return { tab: 'a-faire', anchor: 'echanges', label: 'Relancer' }
    default:
      return { tab: 'a-faire', anchor: `todo-${step.id}`, label: 'Voir' }
  }
}

// ---------------------------------------------------------------------------
// « Depuis ta dernière ouverture » en une ligne
// ---------------------------------------------------------------------------

export interface ChangesLineEntry {
  channel: ActivityChannel
  actor: { displayName: string } | null
}

/** Au plus trois champs nommés, puis « … ». */
export const CHANGES_LINE_FIELDS_MAX = 3

/**
 * « 4 changements, par Chloé et Claude : prix, statut, surface. » ; null s'il
 * n'y a rien. Claude (canal MCP) est nommé comme tel ; un import ou le
 * système, « l'application ».
 */
export function listingChangesLine(changes: {
  changedFields: readonly string[]
  entries: readonly ChangesLineEntry[]
}): string | null {
  const count = changes.entries.length
  if (count === 0) return null
  const names = [
    ...new Set(
      changes.entries.map(e =>
        e.channel === 'mcp'
          ? 'Claude'
          : (e.actor?.displayName ?? 'l’application')
      )
    ),
  ]
  const who =
    names.length > 1
      ? `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`
      : names[0]
  const fields = changes.changedFields
    .slice(0, CHANGES_LINE_FIELDS_MAX)
    .map(f => lowerFirst(listingFieldLabel(f)))
  const more = changes.changedFields.length > CHANGES_LINE_FIELDS_MAX ? '…' : ''
  const head = `${count} changement${count > 1 ? 's' : ''}, par ${who}`
  return fields.length
    ? `${head} : ${fields.join(', ')}${more || '.'}`
    : `${head}.`
}

// ---------------------------------------------------------------------------
// La photo de couverture
// ---------------------------------------------------------------------------

export interface CoverVisitLike {
  id: string
  visitedAt: string
}

export interface CoverPhotoLike {
  id: string
  visitId: string
  status: 'pending' | 'ready'
  createdAt: string
}

export interface CoverChoice {
  photoId: string
  visitId: string
  /** Choisie par un membre (sinon la première photo de la première visite). */
  chosen: boolean
}

/**
 * La couverture d'une annonce : la photo choisie par un membre si elle est
 * prête et d'une visite de l'annonce ; sinon la première photo prête de la
 * première visite qui en a (date de visite, puis ordre d'envoi). Aucune
 * photo : null (jamais une image de portail, rien avant la première visite).
 */
export function coverPhotoOf(
  visits: readonly CoverVisitLike[],
  photos: readonly CoverPhotoLike[],
  chosenId: string | null
): CoverChoice | null {
  const visitDate = new Map(visits.map(v => [v.id, Date.parse(v.visitedAt)]))
  const ready = photos.filter(
    p => p.status === 'ready' && visitDate.has(p.visitId)
  )
  const chosen = chosenId ? ready.find(p => p.id === chosenId) : undefined
  if (chosen) {
    return { photoId: chosen.id, visitId: chosen.visitId, chosen: true }
  }
  const first = [...ready].sort(
    (a, b) =>
      (visitDate.get(a.visitId) ?? 0) - (visitDate.get(b.visitId) ?? 0) ||
      Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
      a.id.localeCompare(b.id)
  )[0]
  return first
    ? { photoId: first.id, visitId: first.visitId, chosen: false }
    : null
}
