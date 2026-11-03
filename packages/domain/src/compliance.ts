import type {
  CheckLevel,
  ComplianceItem,
  ComplianceReport,
  DpeClass,
  GeorisquesReport,
  LeaseType,
  RegulatoryRule,
  RegulatoryRulesTable,
  RentalVerdict,
  TriState,
} from '@apart/contracts'
import { STUDY_DISCLAIMER } from '@apart/contracts'
import { addMonths } from './dates.js'
import { DPE_NEW_METHOD_FROM, DPE_VALIDITY_YEARS } from './dpe.js'
import { formatEuros } from './format.js'

/**
 * Checklist réglementaire datée (besoin L5) : chaque règle de la table de
 * référence est évaluée à la date de mise en location prévue et rend un
 * point ok, attention, bloquant ou à vérifier, avec sa date et sa source.
 * Les risques Géorisques à l'adresse (D6) s'y ajoutent. Pure : la table et
 * le rapport Géorisques sont des entrées.
 */

export interface ComplianceInput {
  listingId?: string | null
  title?: string
  dpeClass: DpeClass | null
  dpeDate: string | null
  constructionYear: number | null
  leaseType: LeaseType
  inseeCode: string | null
  commune: string | null
  surface: number | null
  /** La commune est encadrée d'après la fiche (commune ou phase 2 « encadrement : oui »). */
  rentControlled: boolean
  targetRent: number | null
  rentCap: number | null
  heatingType: string | null
  coOwnershipAllowsRental: TriState
  decencyCompliant: TriState
  rentalPermitRequired: TriState
}

/** Ce que la checklist lit d'une annonce. */
export interface ComplianceListingLike {
  id?: string | null
  title?: string
  dpeClass?: DpeClass | null
  dpeDate?: string | null
  constructionYear?: number | null
  surface?: number | null
  heatingType?: string | null
  location?: { inseeCode?: string | null; commune?: string | null } | null
  rentalPlan?: {
    leaseType?: LeaseType | null
    targetRent?: number | null
    coOwnershipAllowsRental?: TriState | null
    decencyCompliant?: TriState | null
    rentalPermitRequired?: TriState | null
  } | null
}

/** L'entrée de la checklist d'après une annonce et ses indicateurs (encadrement, plafond). */
export function complianceInputFromListing(
  listing: ComplianceListingLike,
  metrics: { rentControlled: boolean; rentCap: number | null }
): ComplianceInput {
  const plan = listing.rentalPlan
  return {
    listingId: listing.id ?? null,
    title: listing.title ?? 'Annonce',
    dpeClass: listing.dpeClass ?? null,
    dpeDate: listing.dpeDate ?? null,
    constructionYear: listing.constructionYear ?? null,
    leaseType: plan?.leaseType ?? 'unfurnished',
    inseeCode: listing.location?.inseeCode ?? null,
    commune: listing.location?.commune ?? null,
    surface: listing.surface ?? null,
    rentControlled: metrics.rentControlled,
    targetRent: plan?.targetRent ?? null,
    rentCap: metrics.rentCap,
    heatingType: listing.heatingType ?? null,
    coOwnershipAllowsRental: plan?.coOwnershipAllowsRental ?? 'unknown',
    decencyCompliant: plan?.decencyCompliant ?? 'unknown',
    rentalPermitRequired: plan?.rentalPermitRequired ?? 'unknown',
  }
}

export interface ComplianceOptions {
  rentalStartDate: string
  at: Date
}

const frDate = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

function item(
  rule: RegulatoryRule | null,
  fields: Omit<ComplianceItem, 'source' | 'provenance'> & {
    provenance?: ComplianceItem['provenance']
  }
): ComplianceItem {
  return {
    ...fields,
    source: rule?.source ?? null,
    provenance: fields.provenance ?? (rule ? 'reference' : 'listing'),
  }
}

const rulesOf = <K extends RegulatoryRule['kind']>(
  table: RegulatoryRulesTable,
  kind: K
): Extract<RegulatoryRule, { kind: K }>[] =>
  table.rules.filter(
    (r): r is Extract<RegulatoryRule, { kind: K }> => r.kind === kind
  )

function energyItems(
  input: ComplianceInput,
  table: RegulatoryRulesTable,
  start: string
): ComplianceItem[] {
  const items: ComplianceItem[] = []
  const bans = rulesOf(table, 'dpe_rental_ban').sort((x, y) =>
    x.from.localeCompare(y.from)
  )
  if (!input.dpeClass) {
    items.push(
      item(bans[0] ?? null, {
        key: 'dpe_ban',
        category: 'energy',
        level: 'unknown',
        title: 'Calendrier d’interdiction selon le DPE',
        message: `DPE inconnu : impossible de savoir si le logement sera louable au ${frDate(start)}.`,
        date: null,
      })
    )
  } else {
    const ban = bans.find(r =>
      r.dpeClasses.includes(input.dpeClass as DpeClass)
    )
    if (!ban) {
      items.push(
        item(bans[bans.length - 1] ?? null, {
          key: 'dpe_ban',
          category: 'energy',
          level: 'ok',
          title: 'Calendrier d’interdiction selon le DPE',
          message: `DPE ${input.dpeClass} : aucune interdiction de location prévue (table du ${frDate(table.asOf)}).`,
          date: null,
        })
      )
    } else if (ban.from <= start) {
      items.push(
        item(ban, {
          key: 'dpe_ban',
          category: 'energy',
          level: 'bad',
          title: ban.label,
          message: `DPE ${input.dpeClass} : non décent pour un bail depuis le ${frDate(ban.from)}, donc à la mise en location du ${frDate(start)}. Travaux de rénovation énergétique obligatoires avant.`,
          date: ban.from,
        })
      )
    } else {
      items.push(
        item(ban, {
          key: 'dpe_ban',
          category: 'energy',
          level: 'warn',
          title: ban.label,
          message: `DPE ${input.dpeClass} : louable au ${frDate(start)}, mais plus à partir du ${frDate(ban.from)} (baux signés, renouvelés ou reconduits). Travaux à prévoir avant.`,
          date: ban.from,
        })
      )
    }
    const freeze = rulesOf(table, 'dpe_rent_freeze').find(
      r => r.dpeClasses.includes(input.dpeClass as DpeClass) && r.from <= start
    )
    if (freeze) {
      items.push(
        item(freeze, {
          key: freeze.key,
          category: 'energy',
          level: 'warn',
          title: freeze.label,
          message: `DPE ${input.dpeClass} : loyer ni révisable ni majorable depuis le ${frDate(freeze.from)}.`,
          date: freeze.from,
        })
      )
    }
  }
  // Validité du DPE à la date de mise en location.
  const dpeRule =
    rulesOf(table, 'diagnostic').find(r => r.diagnostic === 'dpe') ?? null
  if (!input.dpeDate) {
    items.push(
      item(dpeRule, {
        key: 'dpe_validity',
        category: 'energy',
        level: 'unknown',
        title: 'Validité du DPE',
        message:
          'Date du DPE inconnue : vérifiez qu’il date d’après le 1er juillet 2021.',
        date: null,
      })
    )
  } else if (input.dpeDate < DPE_NEW_METHOD_FROM) {
    items.push(
      item(dpeRule, {
        key: 'dpe_validity',
        category: 'energy',
        level: 'bad',
        title: 'Validité du DPE',
        message: `DPE du ${frDate(input.dpeDate)}, ancienne méthode : plus valable, un nouveau DPE est obligatoire avant de louer.`,
        date: input.dpeDate,
      })
    )
  } else {
    const expiry = addMonths(input.dpeDate, DPE_VALIDITY_YEARS * 12)
    items.push(
      item(dpeRule, {
        key: 'dpe_validity',
        category: 'energy',
        level: expiry <= start ? 'warn' : 'ok',
        title: 'Validité du DPE',
        message:
          expiry <= start
            ? `DPE du ${frDate(input.dpeDate)} expiré le ${frDate(expiry)}, avant la mise en location : à refaire.`
            : `DPE du ${frDate(input.dpeDate)} valable jusqu’au ${frDate(expiry)}.`,
        date: expiry,
      })
    )
  }
  return items
}

function rentControlItem(
  input: ComplianceInput,
  table: RegulatoryRulesTable,
  start: string
): ComplianceItem {
  const rule =
    rulesOf(table, 'rent_control').find(r =>
      input.inseeCode !== null
        ? r.inseeCodes.includes(input.inseeCode)
        : input.rentControlled
    ) ?? null
  const applies = rule !== null || input.rentControlled
  if (!applies) {
    return item(rulesOf(table, 'rent_control')[0] ?? null, {
      key: 'rent_control',
      category: 'rent_control',
      level: 'ok',
      title: 'Encadrement des loyers',
      message: `Pas d’encadrement des loyers${input.commune ? ` à ${input.commune}` : ''} (seule Bordeaux l’applique dans la métropole).`,
      date: null,
    })
  }
  if (rule && rule.until !== null && start > rule.until) {
    return item(rule, {
      key: 'rent_control',
      category: 'rent_control',
      level: 'unknown',
      title: rule.label,
      message: `L’expérimentation prend fin le ${frDate(rule.until)}, avant la mise en location du ${frDate(start)}.${rule.note ? ` ${rule.note}` : ''}`,
      date: rule.until,
    })
  }
  if (input.rentCap === null) {
    return item(rule, {
      key: 'rent_control',
      category: 'rent_control',
      level: 'unknown',
      title: rule?.label ?? 'Encadrement des loyers',
      message:
        'Commune encadrée : plafond à déterminer (loyer de référence majoré à saisir ou à vérifier).',
      date: rule?.until ?? null,
    })
  }
  const over = input.targetRent !== null && input.targetRent > input.rentCap
  return item(rule, {
    key: 'rent_control',
    category: 'rent_control',
    level: over ? 'warn' : 'ok',
    title: rule?.label ?? 'Encadrement des loyers',
    message: over
      ? `Loyer visé (${formatEuros(input.targetRent ?? 0)}) au-dessus du plafond (${formatEuros(input.rentCap)}) : le plafond s’impose, sauf complément de loyer justifié.`
      : `Loyer visé sous le plafond (${formatEuros(input.rentCap)}).`,
    date: rule?.until ?? null,
  })
}

function permitItem(
  input: ComplianceInput,
  table: RegulatoryRulesTable
): ComplianceItem {
  const rule = rulesOf(table, 'rental_permit')[0] ?? null
  const title = rule?.label ?? 'Permis de louer'
  if (input.rentalPermitRequired === 'yes') {
    return item(rule, {
      key: 'rental_permit',
      category: 'permit',
      level: 'warn',
      title,
      message:
        'Permis de louer exigé dans le secteur : autorisation à demander avant chaque nouveau bail.',
      date: null,
      provenance: 'listing',
    })
  }
  if (input.rentalPermitRequired === 'no') {
    return item(rule, {
      key: 'rental_permit',
      category: 'permit',
      level: 'ok',
      title,
      message: 'Pas de permis de louer dans le secteur (vérifié).',
      date: null,
      provenance: 'listing',
    })
  }
  const listed =
    rule !== null &&
    input.inseeCode !== null &&
    rule.inseeCodes.includes(input.inseeCode)
  return item(rule, {
    key: 'rental_permit',
    category: 'permit',
    level: 'unknown',
    title,
    message: `${listed ? `Une partie de ${input.commune ?? 'la commune'} y est soumise` : 'Certaines communes de la métropole ont des secteurs soumis'} : vérifiez l’adresse${rule?.mapUrl ? ` sur la carte (${rule.mapUrl})` : ' auprès de la mairie'}.`,
    date: null,
  })
}

function diagnosticItems(
  input: ComplianceInput,
  table: RegulatoryRulesTable,
  start: string,
  georisques: GeorisquesReport | null
): ComplianceItem[] {
  const year = input.constructionYear
  const startYear = Number(start.slice(0, 4))
  return rulesOf(table, 'diagnostic').map(rule => {
    const base = {
      key: rule.key,
      category: 'diagnostics' as const,
      title: rule.label,
      date: rule.builtBefore,
    }
    const required = (message: string, level: CheckLevel = 'ok') =>
      item(rule, { ...base, level, message })
    switch (rule.diagnostic) {
      case 'dpe':
        return required(
          input.dpeClass
            ? `À annexer au bail (${rule.validity}).`
            : 'DPE à obtenir : obligatoire dans l’annonce et annexé au bail.',
          input.dpeClass ? 'ok' : 'unknown'
        )
      case 'lead':
      case 'asbestos': {
        if (year === null || rule.builtBefore === null) {
          return required(
            'Année de construction inconnue : exigence à vérifier.',
            'unknown'
          )
        }
        const before = year < Number(rule.builtBefore.slice(0, 4))
        if (!before) return required(`Non exigé (logement de ${year}).`)
        return rule.diagnostic === 'lead'
          ? required(
              `Exigé : logement de ${year}, antérieur au ${frDate(rule.builtBefore)} (${rule.validity}) ; présence de plomb = travaux possibles.`,
              'warn'
            )
          : required(
              `Exigé : logement de ${year}, permis antérieur au ${frDate(rule.builtBefore)} (${rule.validity}).`
            )
      }
      case 'electricity':
      case 'gas': {
        const gasHeating =
          rule.diagnostic === 'gas' && /gaz/i.test(input.heatingType ?? '')
        const older =
          year !== null && rule.installationOlderThanYears !== null
            ? startYear - year > rule.installationOlderThanYears
            : null
        const what = rule.diagnostic === 'gas' ? 'de gaz' : 'électrique'
        if (older === null) {
          return required(
            `À fournir si l’installation ${what} a plus de ${rule.installationOlderThanYears ?? 15} ans (${rule.validity}).`,
            'unknown'
          )
        }
        return required(
          older
            ? `Probablement exigé : logement de ${year}, installation ${what} de plus de ${rule.installationOlderThanYears} ans sauf réfection récente (${rule.validity})${gasHeating ? ', chauffage au gaz' : ''}.`
            : `Exigé seulement si l’installation ${what} a plus de ${rule.installationOlderThanYears} ans (logement de ${year}).`
        )
      }
      case 'risks':
        if (georisques?.status === 'ok') {
          const concerned = georisques.hazards.some(h => h.present)
          return item(rule, {
            ...base,
            level: 'ok',
            message: concerned
              ? `À annexer au bail (${rule.validity}) : la commune est exposée à ${georisques.hazards.filter(h => h.present).length} aléa(s) recensé(s) par Géorisques.`
              : `Aucun aléa recensé par Géorisques dans la commune ; état des risques à vérifier (${rule.validity}).`,
            date: null,
            provenance: 'open_data',
          })
        }
        return required(
          `À établir (${rule.validity}) ; risques à l’adresse non connus (Géorisques indisponible ou adresse non localisée).`,
          'unknown'
        )
      case 'noise':
        return input.inseeCode === '33281'
          ? required(
              'À vérifier : l’aéroport de Bordeaux-Mérignac est sur la commune, le logement peut être dans son plan d’exposition au bruit.',
              'unknown'
            )
          : required(
              'Exigé seulement si le logement est dans le plan d’exposition au bruit d’un aérodrome (non importé ici : Mérignac et ses abords surtout).'
            )
    }
  })
}

const TRI_LEVEL: Record<TriState, CheckLevel> = {
  yes: 'ok',
  no: 'bad',
  unknown: 'unknown',
}

function decencyItems(
  input: ComplianceInput,
  table: RegulatoryRulesTable
): ComplianceItem[] {
  const items: ComplianceItem[] = []
  const rule = rulesOf(table, 'decency_surface')[0]
  if (rule) {
    items.push(
      item(rule, {
        key: rule.key,
        category: 'decency',
        level:
          input.surface === null
            ? 'unknown'
            : input.surface < rule.minSurface
              ? 'bad'
              : 'ok',
        title: rule.label,
        message:
          input.surface === null
            ? `Surface inconnue : une pièce principale d’au moins ${rule.minSurface} m² (ou ${rule.minVolume} m³) est exigée.`
            : input.surface < rule.minSurface
              ? `${input.surface} m² : sous le minimum de ${rule.minSurface} m² (ou ${rule.minVolume} m³).`
              : `${input.surface} m² : au-dessus du minimum de ${rule.minSurface} m².`,
        date: null,
      })
    )
  }
  items.push(
    item(null, {
      key: 'decency',
      category: 'decency',
      level: TRI_LEVEL[input.decencyCompliant],
      title: 'Critères de décence (équipements, sécurité)',
      message:
        input.decencyCompliant === 'yes'
          ? 'Respectés (vérifié).'
          : input.decencyCompliant === 'no'
            ? 'Non respectés : bloquant.'
            : 'À vérifier lors de la visite.',
      date: null,
    })
  )
  items.push(
    item(null, {
      key: 'co_ownership',
      category: 'co_ownership',
      level: TRI_LEVEL[input.coOwnershipAllowsRental],
      title: 'Règlement de copropriété',
      message:
        input.coOwnershipAllowsRental === 'yes'
          ? 'Autorise la location visée (vérifié).'
          : input.coOwnershipAllowsRental === 'no'
            ? 'Interdit la location visée : bloquant.'
            : 'À lire : vérifier qu’il autorise la location visée.',
      date: null,
    })
  )
  return items
}

/** Le niveau d'un aléa Géorisques d'après ses libellés à l'adresse et dans la commune. */
export function georisqueLevel(
  present: boolean,
  addressStatus: string | null,
  communeStatus: string | null
): CheckLevel {
  if (!present) return 'ok'
  const status = (addressStatus ?? '').toLowerCase()
  if (status === '') return communeStatus ? 'unknown' : 'ok'
  if (status.includes('non concern')) return 'ok'
  if (status.includes('non connu') || status.includes('inconnu'))
    return 'unknown'
  if (status.includes('faible')) return 'ok'
  if (status.includes('existant') || status.includes('concern')) return 'warn'
  return 'unknown'
}

function riskItems(georisques: GeorisquesReport | null): ComplianceItem[] {
  const source = georisques?.reportUrl
    ? {
        label:
          'Géorisques, rapport « risques près de chez moi » (BRGM, ministère de la Transition écologique, licence Etalab 2.0)',
        url: georisques.reportUrl,
        consultedAt: (georisques.fetchedAt ?? new Date().toISOString()).slice(
          0,
          10
        ),
      }
    : null
  if (!georisques || georisques.status !== 'ok') {
    return [
      {
        key: 'georisques',
        category: 'risks',
        level: 'unknown',
        title: 'Risques à l’adresse (Géorisques)',
        message:
          georisques?.message ??
          'Risques à l’adresse non consultés : adresse non localisée.',
        date: null,
        source,
        provenance: 'open_data',
      },
    ]
  }
  const day = georisques.fetchedAt ? georisques.fetchedAt.slice(0, 10) : null
  const items: ComplianceItem[] = []
  const quiet: string[] = []
  for (const hazard of georisques.hazards.filter(h => h.present)) {
    if (hazard.level === 'ok') {
      quiet.push(hazard.label)
      continue
    }
    items.push({
      key: `georisques_${hazard.key}`,
      category: 'risks',
      level: hazard.level,
      title: hazard.label,
      message:
        hazard.level === 'warn'
          ? `À l’adresse : ${hazard.addressStatus} (commune : ${hazard.communeStatus ?? '—'}).`
          : `Commune : ${hazard.communeStatus ?? 'recensé'} ; à l’adresse : ${hazard.addressStatus ?? 'non précisé'}.`,
      date: day,
      source,
      provenance: 'open_data',
    })
  }
  items.push({
    key: 'georisques_quiet',
    category: 'risks',
    level: 'ok',
    title: 'Autres aléas',
    message: quiet.length
      ? `Faibles ou sans objet à l’adresse : ${quiet.join(', ')}.`
      : 'Aucun autre aléa recensé dans la commune.',
    date: day,
    source,
    provenance: 'open_data',
  })
  return items
}

/** Le verdict de la checklist : comme la louabilité, bloquant d'abord. */
export function complianceVerdict(
  items: readonly ComplianceItem[]
): RentalVerdict {
  if (items.some(i => i.level === 'bad')) return 'incompatible'
  const unknown = items.filter(i => i.level === 'unknown').length
  if (items.some(i => i.level === 'warn') || unknown >= 3) return 'conditional'
  return 'compatible'
}

export function complianceReport(
  input: ComplianceInput,
  table: RegulatoryRulesTable,
  georisques: GeorisquesReport | null,
  options: ComplianceOptions
): ComplianceReport {
  const start = options.rentalStartDate
  const items: ComplianceItem[] = [
    ...energyItems(input, table, start),
    rentControlItem(input, table, start),
    permitItem(input, table),
    ...diagnosticItems(input, table, start, georisques),
    ...decencyItems(input, table),
  ]
  const furnished = rulesOf(table, 'furnished_inventory')[0]
  if (furnished && input.leaseType !== 'unfurnished') {
    items.push(
      item(furnished, {
        key: furnished.key,
        category: 'furnished',
        level: 'ok',
        title: furnished.label,
        message:
          'À prévoir : literie, occultation, plaques, four ou micro-ondes, réfrigérateur et congélateur, vaisselle, table et sièges, rangements, luminaires, matériel d’entretien ; sinon le bail peut être requalifié en location vide.',
        date: null,
      })
    )
  }
  items.push(...riskItems(georisques))
  const counts = { ok: 0, warn: 0, bad: 0, unknown: 0 }
  for (const i of items) counts[i.level] += 1
  return {
    listingId: input.listingId ?? null,
    title: input.title ?? 'Annonce',
    rentalStartDate: start,
    evaluatedAt: options.at.toISOString(),
    items,
    counts,
    verdict: complianceVerdict(items),
    georisques,
    rules: { version: table.version, asOf: table.asOf, label: table.label },
    disclaimer: STUDY_DISCLAIMER,
  }
}
