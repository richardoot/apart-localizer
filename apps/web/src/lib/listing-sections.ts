import type { ListingUpdate } from '@apart/contracts'
import { formToPatch, validateForm } from './listing-form'
import type { ListingForm } from './listing-form'

/**
 * Lot 19 (ADR 0029) : la fiche se modifie section par section, plus par un
 * grand formulaire. Une section regroupe des champs du formulaire de
 * l'annonce (`ListingForm`) ; l'enregistrement envoie, pour ces champs, la
 * même mise à jour qu'avant (`formToPatch` : même DTO, mêmes conversions),
 * restreinte à la section. Les sous-objets (travaux, phase 2, localisation)
 * partent entiers, comme avant : le serveur les remplace. Les champs des
 * autres sections ne partent plus : ils gardent leur provenance (« IA »).
 * Pur, testé.
 */
export type ListingSectionId =
  'works' | 'features' | 'energy' | 'copro' | 'listing' | 'notes' | 'rental'

interface SectionDefinition {
  /** Le nom de la section, dans les messages (« Travaux avant d'emménager »). */
  title: string
  /** Les champs du formulaire qu'elle modifie. */
  fields: readonly (keyof ListingForm)[]
  /** Les clés de la mise à jour qu'elle envoie. */
  keys: readonly (keyof ListingUpdate)[]
}

export const LISTING_SECTIONS: Readonly<
  Record<ListingSectionId, SectionDefinition>
> = {
  works: {
    title: 'Travaux avant d’emménager',
    fields: ['renovation'],
    keys: ['renovation'],
  },
  features: {
    title: 'Caractéristiques',
    fields: [
      'surface',
      'rooms',
      'bedrooms',
      'floorLabel',
      'elevator',
      'constructionYear',
      'heatingType',
      'outdoor',
      'parking',
    ],
    keys: [
      'surface',
      'rooms',
      'bedrooms',
      'floorLabel',
      'elevator',
      'constructionYear',
      'heatingType',
      'outdoor',
      'parking',
    ],
  },
  energy: {
    title: 'Énergie',
    fields: ['dpeClass', 'gesClass', 'dpeDate'],
    keys: ['dpeClass', 'gesClass', 'dpeDate'],
  },
  copro: {
    title: 'Copropriété et charges',
    fields: [
      'lotsCount',
      'syndic',
      'annualCharges',
      'nonRecoverableChargesMonthly',
      'propertyTax',
      'votedWorks',
      'proceedings',
      'feesAmount',
      'feesPayer',
    ],
    keys: [
      'lotsCount',
      'syndic',
      'annualCharges',
      'nonRecoverableChargesMonthly',
      'propertyTax',
      'votedWorks',
      'proceedings',
      'feesAmount',
      'feesPayer',
    ],
  },
  listing: {
    title: 'L’annonce et son adresse',
    fields: [
      'title',
      'url',
      'source',
      'sourceLabel',
      'price',
      'addressRaw',
      'commune',
      'district',
      'longitude',
      'latitude',
      'precision',
    ],
    keys: ['title', 'url', 'source', 'sourceLabel', 'price', 'location'],
  },
  notes: {
    title: 'Description de l’annonce et nos notes',
    fields: ['notes', 'description'],
    keys: ['notes', 'description'],
  },
  rental: {
    title: 'Phase 2 : la mise en location',
    fields: ['rentalPlan', 'furnitureValue'],
    keys: ['rentalPlan', 'furnitureValue'],
  },
}

export const LISTING_SECTION_IDS = Object.keys(
  LISTING_SECTIONS
) as ListingSectionId[]

/** La section d'une clé d'erreur de `validateForm` (`location.point`, `renovation.items.0.amount`). */
export function sectionOfErrorKey(key: string): ListingSectionId | null {
  const root = key.split('.')[0] ?? key
  for (const id of LISTING_SECTION_IDS) {
    const section = LISTING_SECTIONS[id]
    if (
      (section.keys as readonly string[]).includes(root) ||
      (section.fields as readonly string[]).includes(root)
    ) {
      return id
    }
  }
  return null
}

function pick<T extends object>(
  source: T,
  keys: readonly string[]
): Partial<T> {
  const out: Partial<T> = {}
  for (const key of keys) {
    if (key in source) {
      ;(out as Record<string, unknown>)[key] = (
        source as Record<string, unknown>
      )[key]
    }
  }
  return out
}

/** La mise à jour d'une section : celle du formulaire entier, restreinte à ses clés. */
export function sectionPatch(
  section: ListingSectionId,
  form: ListingForm
): ListingUpdate {
  return pick(formToPatch(form), LISTING_SECTIONS[section].keys)
}

export interface SectionValidation {
  /** La mise à jour à envoyer ; null si une erreur bloque. */
  patch: ListingUpdate | null
  /** Les erreurs, par champ (clé de `validateForm`). */
  errors: Record<string, string>
}

/**
 * Valide le formulaire (le contrat de l'annonce entier : les champs des
 * autres sections viennent de la fiche enregistrée) et rend la mise à jour
 * de la section, ou les erreurs.
 */
export function validateSection(
  section: ListingSectionId,
  form: ListingForm
): SectionValidation {
  const { input, errors } = validateForm(form)
  if (!input) return { patch: null, errors }
  return { patch: sectionPatch(section, form), errors: {} }
}

/** La section a des modifications non enregistrées. */
export function isSectionDirty(
  section: ListingSectionId,
  pristine: ListingForm,
  draft: ListingForm
): boolean {
  const fields = LISTING_SECTIONS[section].fields as readonly string[]
  return (
    JSON.stringify(pick(pristine, fields)) !==
    JSON.stringify(pick(draft, fields))
  )
}

/**
 * « Préciser l'adresse » : la section et le champ à atteindre. L'adresse se
 * modifie dans « L'annonce et son adresse ».
 */
export const ADDRESS_FIELD_ID = 'f-address'

/** Lot 25 : « Corriger le prix » depuis l'en-tête ouvre la même section, sur le prix. */
export const PRICE_FIELD_ID = 'f-price'

/**
 * Lot 25 : après un conflit (la fiche a changé pendant la saisie), la
 * section relue garde ce que le membre a tapé : pour chaque champ de la
 * section, la valeur tapée si elle diffère de celle d'avant, sinon la valeur
 * relue. `overlapping` : les champs changés des deux côtés (la valeur tapée
 * est gardée). Pur.
 */
export function rebaseSection(
  section: ListingSectionId,
  pristine: ListingForm,
  draft: ListingForm,
  fresh: ListingForm
): { draft: ListingForm; overlapping: string[] } {
  const next: Record<string, unknown> = { ...fresh }
  const overlapping: string[] = []
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b)
  for (const field of LISTING_SECTIONS[section].fields as readonly string[]) {
    const before = (pristine as unknown as Record<string, unknown>)[field]
    const typed = (draft as unknown as Record<string, unknown>)[field]
    const now = (fresh as unknown as Record<string, unknown>)[field]
    if (!same(typed, before)) {
      next[field] = typed
      if (!same(now, before)) overlapping.push(field)
    }
  }
  return { draft: next as unknown as ListingForm, overlapping }
}
