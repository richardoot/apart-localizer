#!/usr/bin/env tsx
/**
 * Vérifier avant de pousser (lot 7) : rejoue localement les étapes de
 * `.github/workflows/ci.yml`, lues dans le fichier, avec ses variables
 * d'environnement : installation figée, paquets, lint, format, types,
 * unitaires, e2e sur la base de test (démarrée si besoin), build.
 *
 *   pnpm verify            tout, comme la CI
 *   pnpm verify --quick    sans les e2e ni le build (hook pre-push)
 *
 * S'arrête à la première étape en échec, comme la CI, et le dit.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { cliArgs } from './lib/cli.js'
import { pgDatabase } from './lib/stack/database.js'
import { socketAlive } from './lib/stack/docker-host.js'
import { processRunner } from './lib/stack/runner.js'
import { Stack } from './lib/stack/stack.js'
import { formatVerifySummary } from './lib/verify/summary.js'
import type { StepOutcome } from './lib/verify/summary.js'
import { parseCiWorkflow, stepKind } from './lib/verify/workflow.js'

const root = path.resolve(import.meta.dirname, '..')

const { values: args } = parseArgs({
  args: cliArgs(),
  options: {
    quick: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
})

async function main(): Promise<number> {
  if (args.help) {
    console.log(
      'Rejoue les étapes de .github/workflows/ci.yml.\n\n' +
        '  --quick   sans les e2e ni le build (le hook pre-push)\n' +
        'Variable : APART_SKIP_VERIFY=1 saute le hook pre-push.'
    )
    return 0
  }
  const workflow = parseCiWorkflow(
    readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')
  )
  const env = { ...process.env, ...workflow.env }
  const started = Date.now()
  const outcomes: StepOutcome[] = []
  let failed = false

  for (const step of workflow.steps) {
    const kind = stepKind(step)
    if (failed) {
      outcomes.push({
        step,
        state: 'skipped',
        reason: 'non lancée (échec plus haut)',
      })
      continue
    }
    if (args.quick && kind !== 'check') {
      outcomes.push({ step, state: 'skipped', reason: 'sautée (--quick)' })
      continue
    }
    if (kind === 'e2e') {
      try {
        await ensureTestDatabase(workflow.env.TEST_DATABASE_URL)
      } catch (error) {
        console.error(
          `✗ base de test injoignable : ${error instanceof Error ? error.message : String(error)}`
        )
        outcomes.push({ step, state: 'failed', ms: 0, code: 1 })
        failed = true
        continue
      }
    }
    console.log(`\n▸ ${step.name} : ${step.run}`)
    const t0 = Date.now()
    const result = spawnSync('bash', ['-eo', 'pipefail', '-c', step.run], {
      cwd: root,
      env,
      stdio: 'inherit',
    })
    const ms = Date.now() - t0
    const code = result.status ?? 1
    if (code === 0) outcomes.push({ step, state: 'passed', ms })
    else {
      outcomes.push({ step, state: 'failed', ms, code })
      failed = true
    }
  }
  console.log(formatVerifySummary(outcomes, Date.now() - started))
  return failed ? 1 : 0
}

/** La base des e2e (54329) : déjà là, sinon démarrée par la même logique que stack:up. */
async function ensureTestDatabase(url: string | undefined): Promise<void> {
  const target =
    url ?? 'postgresql://postgres:postgres@127.0.0.1:54329/postgres'
  try {
    await pgDatabase.waitFor(target, 1500)
    return
  } catch {
    console.log('\n▸ Base de test arrêtée : démarrage (docker/test-db.yml)')
  }
  const stack = new Stack({
    root,
    runner: processRunner,
    db: pgDatabase,
    env: process.env,
    platform: process.platform,
    nodeVersion: process.version,
    log: line => console.log(line),
    now: () => Date.now(),
    probe: async () => null,
    socketAlive,
  })
  await stack.prepareContainerEngine()
  await stack.ensureTestDatabase({ strict: true })
}

main().then(
  code => process.exit(code),
  (error: unknown) => {
    console.error(error)
    process.exit(1)
  }
)
