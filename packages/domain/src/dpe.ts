import type {
  DpeCandidate,
  DpeClass,
  DpeSearchStatus,
  DpeValidity,
} from '@apart/contracts'
import { isoDay } from './rent-reference.js'

/**
 * DPE vérifié (besoin L3) : validité réglementaire d'un DPE, ressemblance
 * d'un DPE de l'observatoire ADEME avec l'annonce, et règle d'application
 * automatique. Pures ; la recherche elle-même est dans l'API (opendata/dpe).
 */

/** Un DPE établi avant cette date suit l'ancienne méthode. */
export const DPE_NEW_METHOD_FROM = '2021-07-01'
/** Les DPE de 2018 au 30 juin 2021 ne valent plus depuis cette date. */
export const DPE_OLD_METHOD_INVALID_FROM = '2025-01-01'
/** Les DPE d'avant 2018 ne valent plus depuis cette date. */
export const DPE_PRE_2018_INVALID_FROM = '2023-01-01'
/** Durée de validité d'un DPE, en années. */
export const DPE_VALIDITY_YEARS = 10

/**
 * Audit énergétique obligatoire à la vente d'un logement hors copropriété
 * (maison, immeuble en monopropriété) : F et G depuis le 1er avril 2023,
 * E depuis le 1er janvier 2025.
 */
export const ENERGY_AUDIT_FROM: Readonly<Partial<Record<DpeClass, string>>> = {
  G: '2023-04-01',
  F: '2023-04-01',
  E: '2025-01-01',
}

export interface DpeValidityInput {
  dpeClass: DpeClass | null
  dpeDate: string | null
  /** Vrai si le logement est en copropriété (lots connus) ; null si on ne sait pas. */
  inCoOwnership: boolean | null
  at: Date
}

/** Le DPE est-il encore valable, et l'audit énergétique est-il dû ? */
export function dpeValidity(input: DpeValidityInput): DpeValidity {
  const day = isoDay(input.at)
  const messages: string[] = []
  let level: DpeValidity['level'] = 'ok'
  const worsen = (next: DpeValidity['level']): void => {
    const order = { ok: 0, unknown: 1, warn: 2, bad: 3 } as const
    if (order[next] > order[level]) level = next
  }

  if (!input.dpeClass) {
    worsen('unknown')
    messages.push(
      'DPE inconnu : demande-le, il est obligatoire dans l’annonce.'
    )
  }
  if (!input.dpeDate) {
    worsen('unknown')
    messages.push(
      'Date du DPE inconnue : vérifie qu’il a été établi après le 1er juillet 2021 (sinon il n’est plus valable).'
    )
  } else if (input.dpeDate < DPE_NEW_METHOD_FROM) {
    const invalidFrom =
      input.dpeDate < '2018-01-01'
        ? DPE_PRE_2018_INVALID_FROM
        : DPE_OLD_METHOD_INVALID_FROM
    if (day >= invalidFrom) {
      worsen('bad')
      messages.push(
        `DPE du ${frDate(input.dpeDate)}, antérieur au 1er juillet 2021 : il n’est plus valable depuis le ${frDate(invalidFrom)}, un nouveau DPE est obligatoire pour vendre ou louer.`
      )
    } else {
      worsen('warn')
      messages.push(
        `DPE du ${frDate(input.dpeDate)}, ancienne méthode : valable jusqu’au ${frDate(previousDay(invalidFrom))} seulement.`
      )
    }
  } else {
    const end = addYears(input.dpeDate, DPE_VALIDITY_YEARS)
    if (day >= end) {
      worsen('bad')
      messages.push(
        `DPE du ${frDate(input.dpeDate)} expiré depuis le ${frDate(end)}.`
      )
    } else {
      messages.push(
        `DPE du ${frDate(input.dpeDate)}, méthode 2021, valable jusqu’au ${frDate(previousDay(end))}.`
      )
    }
  }

  let auditRequired: boolean | null = null
  const auditFrom = input.dpeClass
    ? ENERGY_AUDIT_FROM[input.dpeClass]
    : undefined
  if (input.dpeClass) {
    if (auditFrom === undefined || day < auditFrom) {
      auditRequired = false
    } else if (input.inCoOwnership === true) {
      auditRequired = false
      messages.push(
        `Classe ${input.dpeClass} en copropriété : pas d’audit énergétique obligatoire à la vente (il ne vise que les maisons et les immeubles en monopropriété).`
      )
    } else if (input.inCoOwnership === false) {
      auditRequired = true
      worsen('warn')
      messages.push(
        `Classe ${input.dpeClass} hors copropriété : audit énergétique obligatoire à la vente depuis le ${frDate(auditFrom)}, à demander au vendeur.`
      )
    } else {
      worsen('warn')
      messages.push(
        `Classe ${input.dpeClass} : audit énergétique obligatoire à la vente si le logement n’est pas en copropriété (depuis le ${frDate(auditFrom)}) ; à vérifier.`
      )
    }
  }
  return { level, messages, auditRequired }
}

export interface DpeMatchTarget {
  surface: number | null
  floor: number | null
}

/**
 * Ressemblance d'un DPE avec l'annonce, de 0 à 1 : la surface d'abord
 * (écart relatif), l'étage ensuite ; une maison ne ressemble à aucun
 * appartement.
 */
export function dpeMatchScore(
  candidate: Pick<DpeCandidate, 'surface' | 'floor' | 'buildingType'>,
  target: DpeMatchTarget
): number {
  if (candidate.buildingType === 'maison') return 0
  let score: number
  if (
    candidate.surface !== null &&
    target.surface !== null &&
    target.surface > 0
  ) {
    const gap = Math.abs(candidate.surface - target.surface) / target.surface
    score = gap <= 0.02 ? 1 : gap <= 0.05 ? 0.85 : gap <= 0.1 ? 0.6 : 0.2
  } else {
    score = 0.5
  }
  if (candidate.floor !== null && target.floor !== null) {
    if (candidate.floor !== target.floor) score *= 0.6
  } else {
    // Étage inconnu : un voisin aux mêmes plans aurait la même surface, le
    // DPE est proposé, jamais appliqué d'office (0,8 < 0,85).
    score *= 0.8
  }
  return Math.round(score * 1000) / 1000
}

/** Seuil de ressemblance pour appliquer un DPE sans validation. */
export const DPE_AUTO_APPLY_SCORE = 0.85
/** Un second candidat au-dessus de ce seuil rend le choix ambigu. */
export const DPE_RIVAL_SCORE = 0.6

/**
 * Le statut d'une recherche et, s'il y a lieu, le DPE à appliquer d'office :
 * un seul candidat très ressemblant, aucun rival, et pas de contradiction
 * avec la classe déclarée par l'annonce. Sinon la proposition attend le
 * choix du membre.
 */
export function dpeSearchDecision(
  candidates: readonly DpeCandidate[],
  declaredClass: DpeClass | null
): { status: DpeSearchStatus; apply: DpeCandidate | null } {
  if (candidates.length === 0) return { status: 'none', apply: null }
  const sorted = [...candidates].sort((a, b) => b.matchScore - a.matchScore)
  const best = sorted[0] as DpeCandidate
  const rival = sorted[1]
  const clear =
    best.matchScore >= DPE_AUTO_APPLY_SCORE &&
    (!rival || rival.matchScore < DPE_RIVAL_SCORE)
  const consistent = declaredClass === null || declaredClass === best.dpeClass
  if (clear && consistent) return { status: 'verified', apply: best }
  return {
    status: candidates.length === 1 ? 'single' : 'multiple',
    apply: null,
  }
}

function frDate(day: string): string {
  const [y, m, d] = day.split('-')
  return `${d}/${m}/${y}`
}

function addYears(day: string, years: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCFullYear(date.getUTCFullYear() + years)
  return isoDay(date)
}

function previousDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return isoDay(date)
}
