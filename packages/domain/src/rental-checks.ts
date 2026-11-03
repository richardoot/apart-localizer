import type {
  Assumptions,
  CheckLevel,
  DpeClass,
  ListingMetrics,
  RentalCheck,
  RentalChecksResult,
  RentalDemand,
  RentalVerdict,
  TriState,
} from '@apart/contracts'
import { formatEuros, formatPercent } from './format.js'

/**
 * Calendrier d'interdiction de location selon le DPE (loi Climat et
 * résilience) : première année où la classe est interdite. Table par défaut ;
 * la version datée en base (ReferenceData) la remplacera.
 */
export const DEFAULT_DPE_BAN_SCHEDULE: Readonly<
  Partial<Record<DpeClass, number>>
> = {
  G: 2025,
  F: 2028,
  E: 2034,
}

/** Écart au-dessus du loyer de marché à partir duquel la vacance menace. */
export const MARKET_RENT_WARN_RATIO = 0.08

export interface RentalChecksInput {
  dpeClass: DpeClass | null
  /** Année de mise en location ; null = année par défaut des hypothèses. */
  year: number | null
  marketRent: number | null
  demand: RentalDemand | null
  coOwnershipAllowsRental: TriState
  decencyCompliant: TriState
  rentalPermitRequired: TriState
}

export interface RentalChecksOptions {
  banSchedule?: Readonly<Partial<Record<DpeClass, number>>>
}

const check = (
  key: RentalCheck['key'],
  level: CheckLevel,
  message: string
): RentalCheck => ({ key, level, message })

/**
 * Les contrôles de louabilité de l'artefact (ex-`phase2`), chacun rendant
 * ok, warn, bad ou unknown, puis le verdict : incompatible dès un bloquant,
 * sous conditions dès un point d'attention ou à partir de trois inconnus,
 * sinon compatible.
 */
export function rentalChecks(
  input: RentalChecksInput,
  metrics: ListingMetrics,
  a: Assumptions,
  options: RentalChecksOptions = {}
): RentalChecksResult {
  const schedule = options.banSchedule ?? DEFAULT_DPE_BAN_SCHEDULE
  const year = input.year ?? a.rentalYear
  const checks: RentalCheck[] = []

  // 1. Calendrier DPE
  const ban = input.dpeClass ? schedule[input.dpeClass] : undefined
  if (!input.dpeClass) {
    checks.push(
      check(
        'dpe_ban',
        'unknown',
        "DPE inconnu : impossible de savoir jusqu'à quand le bien sera louable."
      )
    )
  } else if (ban !== undefined && ban <= year) {
    checks.push(
      check(
        'dpe_ban',
        'bad',
        `DPE ${input.dpeClass} : location interdite depuis ${ban}, donc dès la mise en location en ${year}. Travaux obligatoires avant.`
      )
    )
  } else if (ban !== undefined) {
    checks.push(
      check(
        'dpe_ban',
        'warn',
        `DPE ${input.dpeClass} : louable en ${year}, mais interdit à partir de ${ban}. Travaux à prévoir avant cette date.`
      )
    )
  } else {
    checks.push(
      check(
        'dpe_ban',
        'ok',
        `DPE ${input.dpeClass} : aucune interdiction de location prévue.`
      )
    )
  }

  // 2. Encadrement
  if (metrics.rentControlled) {
    if (metrics.rentCap === null) {
      checks.push(
        check(
          'rent_control',
          'unknown',
          'Commune à loyers encadrés : saisissez le loyer de référence majoré au m² pour connaître le plafond.'
        )
      )
    } else if (metrics.targetRent > metrics.rentCap) {
      checks.push(
        check(
          'rent_control',
          'warn',
          `Loyer visé (${formatEuros(metrics.targetRent)}) au-dessus du plafond légal (${formatEuros(metrics.rentCap)}) : les calculs retiennent le plafond.`
        )
      )
    } else {
      checks.push(
        check(
          'rent_control',
          'ok',
          `Loyer visé sous le plafond légal (${formatEuros(metrics.rentCap)}).`
        )
      )
    }
  } else {
    checks.push(
      check(
        'rent_control',
        'ok',
        "Pas d'encadrement des loyers dans cette commune."
      )
    )
  }

  // 3. Loyer de marché
  if (input.marketRent !== null && input.marketRent > 0) {
    const gap = metrics.rent / input.marketRent - 1
    if (gap > MARKET_RENT_WARN_RATIO) {
      checks.push(
        check(
          'market_rent',
          'warn',
          `Loyer retenu ${formatPercent(gap)} au-dessus du marché constaté (${formatEuros(input.marketRent)}) : risque de vacance.`
        )
      )
    } else {
      checks.push(
        check(
          'market_rent',
          'ok',
          `Loyer retenu cohérent avec le marché constaté (${formatEuros(input.marketRent)}).`
        )
      )
    }
  } else {
    checks.push(
      check(
        'market_rent',
        'unknown',
        'Loyer de marché non renseigné : comparez avec 5 à 10 annonces de location similaires.'
      )
    )
  }

  // 4 et 5. Règlement de copropriété, décence
  checks.push(
    triState(
      'co_ownership',
      input.coOwnershipAllowsRental,
      'Règlement de copropriété',
      'autorise la location visée',
      "l'interdit : bloquant"
    )
  )
  checks.push(
    triState(
      'decency',
      input.decencyCompliant,
      'Critères de décence (surface, hauteur, équipements)',
      'respectés',
      'non respectés : bloquant'
    )
  )

  // 6. Permis de louer
  if (input.rentalPermitRequired === 'yes') {
    checks.push(
      check(
        'rental_permit',
        'warn',
        "Permis de louer exigé : demande d'autorisation à faire avant chaque bail."
      )
    )
  } else if (input.rentalPermitRequired === 'no') {
    checks.push(
      check('rental_permit', 'ok', 'Pas de permis de louer dans le secteur.')
    )
  } else {
    checks.push(
      check(
        'rental_permit',
        'unknown',
        'Permis de louer : vérifier auprès de la mairie si le secteur y est soumis.'
      )
    )
  }

  // 7. Demande locative
  if (input.demand === 'strong') {
    checks.push(check('demand', 'ok', 'Demande locative forte.'))
  } else if (input.demand === 'medium') {
    checks.push(
      check(
        'demand',
        'warn',
        'Demande locative moyenne : prévoir une vacance plus longue.'
      )
    )
  } else if (input.demand === 'weak') {
    checks.push(check('demand', 'bad', 'Demande locative faible.'))
  } else {
    checks.push(
      check(
        'demand',
        'unknown',
        "Demande locative à évaluer (transports, campus, CHU, bassin d'emploi)."
      )
    )
  }

  // 8. Effort une fois loué
  if (-metrics.effort > a.maxMonthlyEffort) {
    checks.push(
      check(
        'effort',
        'warn',
        `Effort mensuel une fois loué (${formatEuros(-metrics.effort)}) au-dessus de votre maximum (${formatEuros(a.maxMonthlyEffort)}).`
      )
    )
  } else {
    checks.push(
      check(
        'effort',
        'ok',
        `Effort mensuel une fois loué dans votre budget (${metrics.effort < 0 ? formatEuros(-metrics.effort) : 'aucun'}).`
      )
    )
  }

  const has = (level: CheckLevel): boolean =>
    checks.some(c => c.level === level)
  const unknownCount = checks.filter(c => c.level === 'unknown').length
  const result: RentalVerdict = has('bad')
    ? 'incompatible'
    : has('warn') || unknownCount >= 3
      ? 'conditional'
      : 'compatible'

  return {
    year,
    checks,
    verdict: result,
    rank: result === 'compatible' ? 2 : result === 'conditional' ? 1 : 0,
    unknownCount,
  }
}

function triState(
  key: RentalCheck['key'],
  value: TriState,
  label: string,
  okText: string,
  badText: string
): RentalCheck {
  if (value === 'yes') return check(key, 'ok', `${label} : ${okText}.`)
  if (value === 'no') return check(key, 'bad', `${label} : ${badText}.`)
  return check(key, 'unknown', `${label} : à vérifier.`)
}
