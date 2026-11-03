import type { MissingField } from '@apart/contracts'

/** Deux libellés de tâche sont les mêmes à la casse, aux espaces et à la ponctuation finale près. */
export function normalizeTaskLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s.…!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Les libellés de tâches à créer pour des champs manquants, sans doublon
 * entre eux ni avec les tâches déjà présentes (checklist par défaut, tâches
 * saisies). Pure.
 */
export function missingFieldTaskLabels(
  missing: readonly MissingField[],
  existingLabels: readonly string[]
): string[] {
  const seen = new Set(existingLabels.map(normalizeTaskLabel))
  const labels: string[] = []
  for (const field of missing) {
    const key = normalizeTaskLabel(field.taskLabel)
    if (seen.has(key)) continue
    seen.add(key)
    labels.push(field.taskLabel)
  }
  return labels
}
