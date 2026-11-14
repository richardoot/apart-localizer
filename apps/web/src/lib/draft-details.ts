import { LISTING_FIELD_LABELS } from '@apart/contracts'
import type { ListingInput } from '@apart/contracts'
import { formatActivityValue } from '@apart/domain'
import { formatEuros } from './format'

/**
 * Lot 32 (ADR 0047) : la fiche pré-remplie d'un brouillon, lue comme une
 * fiche, par thème, pour juger l'annonce sans retourner sur le portail. Les
 * faits que l'on cherche toujours (surface, pièces, étage, DPE, charges, taxe
 * foncière) sont dits « non indiqué » quand ils manquent ; les autres
 * n'apparaissent que s'ils sont connus. Pur : du texte, aucun calcul
 * (les charges restent annuelles, comme sur la fiche).
 */

export interface DraftFact {
  key: string
  label: string
  /** La valeur lisible ; null quand elle manque (« non indiqué »). */
  value: string | null
}

export interface DraftFactGroup {
  key: 'property' | 'energy' | 'copro' | 'price'
  title: string
  facts: DraftFact[]
}

type Field = keyof ListingInput

/** Les faits toujours montrés, connus ou non. */
const ALWAYS: ReadonlySet<string> = new Set([
  'surface',
  'rooms',
  'floor',
  'dpeClass',
  'annualCharges',
  'propertyTax',
])

const GROUPS: ReadonlyArray<{
  key: DraftFactGroup['key']
  title: string
  fields: readonly Field[]
}> = [
  {
    key: 'property',
    title: 'Le bien',
    fields: [
      'surface',
      'surfaceTotal',
      'rooms',
      'bedrooms',
      'floor',
      'elevator',
      'outdoor',
      'parking',
      'cellar',
      'orientation',
      'condition',
      'constructionYear',
      'constructionPeriod',
    ],
  },
  {
    key: 'energy',
    title: 'Énergie',
    fields: [
      'dpeClass',
      'dpeConsumption',
      'gesClass',
      'dpeDate',
      'heatingType',
      'heatingCollective',
    ],
  },
  {
    key: 'copro',
    title: 'Copropriété et charges',
    fields: [
      'annualCharges',
      'nonRecoverableChargesMonthly',
      'propertyTax',
      'lotsCount',
      'syndic',
      'proceedings',
      'votedWorks',
    ],
  },
  {
    key: 'price',
    title: 'Prix et honoraires',
    fields: ['price', 'feesAmount', 'feesPercent', 'feesPayer'],
  },
]

const LABEL_OVERRIDES: Partial<Record<Field, string>> = {
  annualCharges: 'Charges de copropriété',
  propertyTax: 'Taxe foncière',
  floor: 'Étage',
  dpeClass: 'DPE',
  gesClass: 'GES',
}

/** « 3e sur 5 », « rez-de-chaussée », ou l'étage tel que lu. */
export function floorText(
  listing: Pick<ListingInput, 'floor' | 'floorsTotal' | 'floorLabel'>
): string | null {
  if (listing.floorLabel?.trim()) return listing.floorLabel.trim()
  if (listing.floor === null || listing.floor === undefined) return null
  const level =
    listing.floor === 0
      ? 'rez-de-chaussée'
      : listing.floor < 0
        ? `sous-sol ${-listing.floor}`
        : listing.floor === 1
          ? '1er'
          : `${listing.floor}e`
  return listing.floorsTotal ? `${level} sur ${listing.floorsTotal}` : level
}

function valueOf(listing: ListingInput, field: Field): string | null {
  const value = listing[field]
  if (field === 'floor') return floorText(listing)
  if (field === 'price') {
    return typeof value === 'number' && value > 0 ? formatEuros(value) : null
  }
  if (field === 'annualCharges' && typeof value === 'number') {
    return `${formatEuros(value)} par an`
  }
  if (field === 'propertyTax' && typeof value === 'number') {
    return `${formatEuros(value)} par an`
  }
  if (field === 'nonRecoverableChargesMonthly' && typeof value === 'number') {
    return `${formatEuros(value)} par mois`
  }
  if (field === 'dpeConsumption' && typeof value === 'number') {
    return `${value.toLocaleString('fr-FR')} kWh/m²/an`
  }
  if (field === 'constructionYear' && typeof value === 'number') {
    return String(value)
  }
  return formatActivityValue(field, value)
}

/** Les faits du brouillon par thème ; un thème sans rien à dire est omis. */
export function draftFactGroups(listing: ListingInput): DraftFactGroup[] {
  return GROUPS.map(group => ({
    key: group.key,
    title: group.title,
    facts: group.fields
      .map(field => ({
        key: field,
        label: LABEL_OVERRIDES[field] ?? LISTING_FIELD_LABELS[field] ?? field,
        value: valueOf(listing, field),
      }))
      .filter(fact => fact.value !== null || ALWAYS.has(fact.key)),
  })).filter(group => group.facts.length > 0)
}

/** Les faits recherchés qui manquent, pour une ligne « À demander ». */
export function missingDraftFacts(listing: ListingInput): string[] {
  return draftFactGroups(listing)
    .flatMap(group => group.facts)
    .filter(fact => fact.value === null)
    .map(fact => fact.label.toLowerCase())
}
