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
}

/** La provenance et l'état « modifié » d'un champ (chemin du formulaire). */
export function fieldMeta(
  fieldSources: FieldProvenanceMap | null | undefined,
  changedFields: readonly string[],
  path: string
): FieldMeta {
  const key = path === 'floorLabel' ? 'floor' : path
  return {
    provenance:
      provenanceOf(fieldSources, key) ??
      (path === 'floorLabel' ? provenanceOf(fieldSources, 'floorLabel') : null),
    changed: changedKeysOf(path).some(k => changedFields.includes(k)),
  }
}
