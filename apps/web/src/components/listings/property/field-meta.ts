import type { FieldProvenanceMap, Provenance } from '@apart/contracts'
import { provenanceOf } from '@/lib/provenance'

/**
 * Lot 19 : la pastille de provenance et la mise en évidence « modifié » d'un
 * champ d'une section de « Le bien », comme le grand formulaire les donnait
 * (`ListingForm.vue`) : l'étage est saisi en libellé mais sa provenance est
 * celle de l'étage lu, les coordonnées celle du point, l'adresse, la commune
 * et le quartier celles de la localisation.
 */

/** Les clés du journal « ce qui a changé » d'un champ du formulaire. */
export function changedKeysOf(path: string): string[] {
  if (path === 'floorLabel') return ['floor', 'floorLabel']
  if (path === 'longitude' || path === 'latitude')
    return ['location.point', 'location']
  if (['addressRaw', 'commune', 'district'].includes(path))
    return [`location.${path}`]
  return [path]
}

export interface FieldMeta {
  provenance: Provenance | null
  changed: boolean
  /** Lot 22 : l'erreur de la dernière tentative d'enregistrement, au champ. */
  error: string | null
}

/** Lot 22 : la clé d'erreur de validation d'un champ du formulaire. */
export function errorKeyOf(path: string): string {
  if (path === 'longitude' || path === 'latitude') return 'location.point'
  return path
}

/** La provenance, l'état « modifié » et l'erreur d'un champ (chemin du formulaire). */
export function fieldMeta(
  fieldSources: FieldProvenanceMap | null | undefined,
  changedFields: readonly string[],
  path: string,
  errors: Readonly<Record<string, string>> = {}
): FieldMeta {
  const key = path === 'floorLabel' ? 'floor' : path
  return {
    error: errors[errorKeyOf(path)] ?? null,
    provenance:
      provenanceOf(fieldSources, key) ??
      (path === 'floorLabel' ? provenanceOf(fieldSources, 'floorLabel') : null),
    changed: changedKeysOf(path).some(k => changedFields.includes(k)),
  }
}
