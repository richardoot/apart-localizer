import type {
  FieldProvenanceMap,
  FieldSource,
  Provenance,
} from '@apart/contracts'
import type { ListingForm } from './listing-form'

/**
 * Provenance par champ côté interface : libellés des pastilles, couleur
 * selon la confiance, correspondance entre les champs du formulaire et les
 * clés de `fieldSources` (aplaties : `addressRaw`, `point`, `renovation`...),
 * et bascule en `user` des champs modifiés à la main. Fonctions pures.
 */

export const FIELD_SOURCE_LABELS: Record<FieldSource, string> = {
  listing: 'annonce',
  user: 'vous',
  ai: 'IA',
  open_data: 'open data',
  estimated: 'estimé',
  agency: 'agence',
}

export const FIELD_SOURCE_TITLES: Record<FieldSource, string> = {
  listing: "Lu tel quel dans l'annonce",
  user: 'Saisi ou corrigé par un membre',
  ai: "Extrait par l'IA",
  open_data: 'Issu de données ouvertes (géocodage IGN)',
  estimated: 'Estimé faute de saisie',
  agency: "Donné par l'annonceur (agence ou vendeur) en réponse à une question",
}

/** Classes des pastilles ; l'IA est colorée par sa confiance. */
export const FIELD_SOURCE_CLASSES: Record<FieldSource, string> = {
  listing: 'bg-surface-2 text-muted',
  user: 'bg-accent-soft text-fg',
  ai: 'bg-warn-soft text-warn',
  open_data: 'bg-good-soft text-good',
  estimated: 'bg-surface-2 text-muted',
  agency: 'bg-accent-soft text-accent',
}

/** Couleur d'une valeur IA selon sa confiance : sûre, à vérifier, douteuse. */
export function confidenceClass(confidence: number | undefined): string {
  if (confidence === undefined) return 'bg-warn-soft text-warn'
  if (confidence >= 0.85) return 'bg-good-soft text-good'
  if (confidence >= 0.6) return 'bg-warn-soft text-warn'
  return 'bg-bad-soft text-bad'
}

export function confidencePercent(confidence: number | undefined): string {
  return confidence === undefined ? '' : `${Math.round(confidence * 100)} %`
}

/** La clé de `fieldSources` d'un champ du formulaire (racine, ou `location.x`, `renovation.x`...). */
export type FormFieldPath =
  | Exclude<keyof ListingForm, 'renovation' | 'rentalPlan' | 'overrides'>
  | `renovation.${keyof ListingForm['renovation']}`
  | `rentalPlan.${keyof ListingForm['rentalPlan']}`

const SPECIAL_KEYS: Partial<Record<string, string>> = {
  longitude: 'point',
  latitude: 'point',
  precision: 'precision',
}

export function provenanceKeyOf(path: FormFieldPath | string): string {
  if (path.startsWith('renovation.')) return 'renovation'
  if (path.startsWith('rentalPlan.')) return 'rentalPlan'
  return SPECIAL_KEYS[path] ?? path
}

/** La provenance d'un champ du formulaire, s'il en a une. */
export function provenanceOf(
  fieldSources: FieldProvenanceMap | null | undefined,
  path: FormFieldPath | string
): Provenance | null {
  return fieldSources?.[provenanceKeyOf(path)] ?? null
}

/** Les champs du formulaire dont la valeur diffère entre deux états (chemins aplatis). */
export function changedFormPaths(
  before: ListingForm,
  after: ListingForm
): string[] {
  const changed: string[] = []
  const compare = (prefix: string, a: unknown, b: unknown): void => {
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(prefix)
  }
  for (const key of Object.keys(after) as Array<keyof ListingForm>) {
    if (key === 'renovation' || key === 'rentalPlan') {
      const a = before[key] as Record<string, unknown>
      const b = after[key] as Record<string, unknown>
      for (const sub of Object.keys(b)) compare(`${key}.${sub}`, a[sub], b[sub])
    } else if (key === 'overrides') {
      compare('overrides', before.overrides, after.overrides)
    } else {
      compare(key, before[key], after[key])
    }
  }
  return changed
}

/**
 * Après corrections manuelles : les clés de provenance des champs modifiés
 * sont retirées ; le serveur leur attribue alors `user` (daté). Les champs
 * laissés tels quels gardent leur provenance (IA, annonce, open data).
 */
export function provenanceAfterEdits(
  fieldSources: FieldProvenanceMap,
  extracted: ListingForm,
  current: ListingForm
): FieldProvenanceMap {
  const result: FieldProvenanceMap = { ...fieldSources }
  for (const path of changedFormPaths(extracted, current)) {
    delete result[provenanceKeyOf(path)]
  }
  return result
}
