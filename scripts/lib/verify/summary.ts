import type { CiStep } from './workflow.js'

export type StepOutcome =
  | { step: CiStep; state: 'passed'; ms: number }
  | { step: CiStep; state: 'failed'; ms: number; code: number }
  | { step: CiStep; state: 'skipped'; reason: string }

/** Le résumé final de `pnpm verify` : chaque étape, sa durée, et celle qui échoue. */
export function formatVerifySummary(
  outcomes: StepOutcome[],
  totalMs: number
): string {
  const width = Math.max(...outcomes.map(o => o.step.name.length), 10)
  const lines = [
    '',
    'Résumé de pnpm verify (étapes de .github/workflows/ci.yml) :',
  ]
  for (const o of outcomes) {
    const name = o.step.name.padEnd(width)
    if (o.state === 'skipped') lines.push(`  – ${name}  ${o.reason}`)
    else {
      const time = `${(o.ms / 1000).toFixed(1)} s`.padStart(8)
      lines.push(
        `  ${o.state === 'passed' ? '✓' : '✗'} ${name}  ${time}   ${o.step.run.split('\n')[0]}`
      )
    }
  }
  const failed = outcomes.find(o => o.state === 'failed')
  lines.push('')
  if (failed && failed.state === 'failed') {
    lines.push(
      `✗ Échec à l’étape « ${failed.step.name} » (${failed.step.run.split('\n')[0]}), code ${failed.code}, après ${(totalMs / 1000).toFixed(0)} s.`
    )
  } else {
    lines.push(`✓ Tout est vert en ${(totalMs / 1000).toFixed(0)} s.`)
  }
  return lines.join('\n')
}
