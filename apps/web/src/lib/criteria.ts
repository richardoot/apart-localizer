import type { CriteriaMatchChanges } from '@apart/contracts'

/** « Entre dans le critère « Talence » ; sort de « Bègles ». », ou null si rien ne change. */
export function criteriaChangesMessage(
  changes: CriteriaMatchChanges | null | undefined
): string | null {
  if (!changes) return null
  const parts: string[] = []
  if (changes.entered.length) {
    parts.push(
      `Entre dans ${changes.entered.length > 1 ? 'les critères' : 'le critère'} ${changes.entered
        .map(m => `« ${m.name} »${m.approximate ? ' (sous réserve)' : ''}`)
        .join(', ')}.`
    )
  }
  if (changes.left.length) {
    parts.push(
      `Sort ${changes.left.length > 1 ? 'des critères' : 'du critère'} ${changes.left
        .map(m => `« ${m.name} »`)
        .join(', ')}.`
    )
  }
  return parts.length ? parts.join(' ') : null
}
