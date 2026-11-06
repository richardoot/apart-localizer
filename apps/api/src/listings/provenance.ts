import type { FieldProvenanceMap, FieldSource } from '@apart/contracts'

/** Les clés d'une annonce qui ne sont pas des champs métier à tracer. */
const UNTRACKED_KEYS: ReadonlySet<string> = new Set([
  'fieldSources',
  'sourceText',
  'status',
  'discardReason',
  'location',
])

/**
 * Complète la provenance par champ à la création : chaque clé renseignée
 * (ni absente ni nulle) dans `values` qui n'a pas déjà de provenance en
 * reçoit une (`source`, date du relevé). Les clés déjà renseignées (l'IA a
 * donné sa confiance et son extrait) sont gardées. Pur ; `now` est injectable.
 */
export function withProvenance(
  existing: FieldProvenanceMap | null | undefined,
  values: Record<string, unknown>,
  source: FieldSource,
  now: Date = new Date()
): FieldProvenanceMap {
  const result: FieldProvenanceMap = { ...(existing ?? {}) }
  const recordedAt = now.toISOString()
  for (const [key, value] of Object.entries(values)) {
    if (value == null || UNTRACKED_KEYS.has(key)) continue
    if (existing && key in existing) continue
    result[key] = { source, recordedAt }
  }
  return result
}

/**
 * Pour une mise à jour : les champs du patch prennent la provenance donnée,
 * sauf si le patch apporte déjà sa propre carte de provenance pour eux.
 */
export function provenanceAfterPatch(
  existing: FieldProvenanceMap | null | undefined,
  patch: Record<string, unknown>,
  source: FieldSource,
  now: Date = new Date()
): FieldProvenanceMap {
  const supplied =
    (patch.fieldSources as FieldProvenanceMap | undefined) ?? undefined
  const base: FieldProvenanceMap = { ...(existing ?? {}), ...(supplied ?? {}) }
  const recordedAt = now.toISOString()
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || UNTRACKED_KEYS.has(key)) continue
    if (supplied && key in supplied) continue
    base[key] = { source, recordedAt }
  }
  return base
}
