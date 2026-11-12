import { LISTING_FIELD_LABELS } from '@apart/contracts'
import type { ListingInput, ListingMergeField } from '@apart/contracts'
import { formatActivityValue } from './activity.js'
import { MERGE_FILL_FIELDS, mergeFieldPlan } from './listing-merge.js'
import type { MergeFieldValues } from './listing-merge.js'

/**
 * Lot 31 (ADR 0044) : deux brouillons du même bien n'en font plus qu'un. Le
 * brouillon gardé l'emporte ; ses vides se complètent de l'autre : les champs
 * du bien d'une fusion de fiches (`MERGE_FILL_FIELDS`), et, propres à un
 * brouillon, le prix quand il n'est pas lu, la localisation quand elle ne
 * donne ni adresse ni commune, le vendeur quand il n'est pas lu. La
 * provenance d'un champ complété est celle de l'autre brouillon. Pur.
 */

const isEmpty = (value: unknown): boolean =>
  value === null || value === undefined || value === ''

function fieldValues(input: ListingInput): MergeFieldValues {
  const record = input as unknown as Record<string, unknown>
  return Object.fromEntries(
    MERGE_FILL_FIELDS.map(field => [field, record[field]])
  )
}

const line = (
  field: string,
  kept: unknown,
  other: unknown
): ListingMergeField => ({
  field,
  label: LISTING_FIELD_LABELS[field] ?? field,
  kept: formatActivityValue(field, kept),
  other: formatActivityValue(field, other),
})

/** Ce que la fusion de `absorb` dans `keep` donne au brouillon gardé. */
export function draftMergePlan(
  keep: ListingInput,
  absorb: ListingInput
): {
  input: ListingInput
  fills: ListingMergeField[]
  differences: ListingMergeField[]
} {
  const plan = mergeFieldPlan(fieldValues(keep), fieldValues(absorb))
  const fills = [...plan.fills]
  const filled: string[] = Object.keys(plan.values)
  const next: ListingInput = {
    ...keep,
    ...(plan.values as Partial<ListingInput>),
  }
  if (keep.price <= 0 && absorb.price > 0) {
    next.price = absorb.price
    filled.push('price')
    fills.push(line('price', null, absorb.price))
  }
  const placeOf = (input: ListingInput): boolean =>
    !isEmpty(input.location.addressRaw) || !isEmpty(input.location.commune)
  if (!placeOf(keep) && placeOf(absorb)) {
    next.location = { ...absorb.location }
    filled.push('addressRaw', 'commune', 'district', 'point', 'precision')
    fills.push(
      line(
        'commune',
        null,
        absorb.location.addressRaw ?? absorb.location.commune
      )
    )
  }
  if (keep.sellerType === 'unknown' && absorb.sellerType !== 'unknown') {
    next.sellerType = absorb.sellerType
    next.sellerName = absorb.sellerName
    next.sellerReference = absorb.sellerReference
    filled.push('sellerType', 'sellerName', 'sellerReference')
    fills.push(line('sellerName', null, absorb.sellerName ?? 'Particulier'))
  }
  const fieldSources = { ...keep.fieldSources }
  for (const field of filled) {
    const source = absorb.fieldSources[field]
    if (source) fieldSources[field] = source
  }
  return {
    input: { ...next, fieldSources },
    fills,
    differences: plan.differences,
  }
}

/** La raison d'écart portée par le brouillon absorbé. */
export function mergedDraftReason(keptTitle: string): string {
  return `Doublon du brouillon « ${keptTitle} » (brouillons fusionnés)`
}

/** Texte comparé sans accents ni casse. */
function folded(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * La recherche texte de `list_drafts` : chaque mot cherché se trouve dans le
 * titre, la localisation, l'agence, la référence, le lien ou la raison de
 * l'écart (sans accents ni casse ; une référence sans espaces ni tirets).
 */
export function draftMatchesSearch(
  draft: {
    listing: ListingInput
    url: string | null
    dismissReason: string | null
  },
  search: string | null | undefined
): boolean {
  const tokens = folded(search ?? '')
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length === 0) return true
  const { listing } = draft
  const haystack = folded(
    [
      listing.title,
      listing.location.commune,
      listing.location.district,
      listing.location.addressRaw,
      listing.sellerName,
      listing.sellerReference,
      listing.sellerReference?.replace(/[\s.-]/g, ''),
      draft.url ?? listing.url,
      draft.dismissReason,
    ]
      .filter((part): part is string => typeof part === 'string')
      .join(' ')
  )
  return tokens.every(token => haystack.includes(token))
}
