import { CRITERIA_FIT_LEVEL_LABELS } from '@apart/contracts'
import type { CriteriaMatchChanges } from '@apart/contracts'

/**
 * « Entre dans le critère « Talence » (à confirmer) ; sort de « Bègles »
 * (hors critères). », ou null si rien ne change (lot 14 : niveaux compris).
 */
export function criteriaChangesMessage(
  changes: CriteriaMatchChanges | null | undefined
): string | null {
  if (!changes) return null
  const parts: string[] = []
  const level = (l: keyof typeof CRITERIA_FIT_LEVEL_LABELS): string =>
    CRITERIA_FIT_LEVEL_LABELS[l].toLowerCase()
  if (changes.entered.length) {
    parts.push(
      `Entre dans ${changes.entered.length > 1 ? 'les critères' : 'le critère'} ${changes.entered
        .map(
          m => `« ${m.name} »${m.level !== 'in' ? ` (${level(m.level)})` : ''}`
        )
        .join(', ')}.`
    )
  }
  if (changes.left.length) {
    parts.push(
      `Sort ${changes.left.length > 1 ? 'des critères' : 'du critère'} ${changes.left
        .map(m => `« ${m.name} »`)
        .join(', ')} (hors critères).`
    )
  }
  for (const m of changes.changed ?? []) {
    parts.push(`« ${m.name} » : ${level(m.before)} → ${level(m.after)}.`)
  }
  return parts.length ? parts.join(' ') : null
}
