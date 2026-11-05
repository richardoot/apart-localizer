#!/usr/bin/env tsx
/**
 * Rattrapage du lot 11 : recalcule le quartier et les équipements proches
 * (`open_data_context.surroundings`) des annonces existantes, après un
 * import des équipements ou des quartiers.
 *
 *   pnpm refresh:surroundings [--dry-run] [--workspace NOM] [--database-url ...]
 *
 * Même calcul que l'API (module geo, règles de `domain`), sans réseau ; seule
 * la clé `surroundings` de l'instantané change, une ligne de journal
 * `listing.enriched` (canal `system`) par annonce réécrite. Idempotent : une
 * annonce dont le résultat ne change pas n'est pas touchée.
 */
import { parseArgs } from 'node:util'
import { cliArgs } from './lib/cli.js'
import { databaseUrlFrom, elapsed, openDatabase, redact } from './lib/db.js'
import { refreshSurroundings } from './lib/refresh-surroundings.js'

const HELP = `Recalcule le quartier et les équipements proches des annonces (instantané open_data_context).

Options :
  --dry-run           liste les annonces qui changeraient, sans rien écrire
  --workspace NOM     un seul espace (défaut : tous)
  --database-url URL  base cible (défaut DATABASE_URL de apps/api/.env)
  --help              cette aide`

const { values: args } = parseArgs({
  args: cliArgs(),
  options: {
    'dry-run': { type: 'boolean', default: false },
    workspace: { type: 'string' },
    'database-url': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
})

async function main(): Promise<void> {
  if (args.help) {
    console.log(HELP)
    return
  }
  const started = Date.now()
  const url = databaseUrlFrom(args['database-url'])
  const db = openDatabase(url)
  try {
    const stats = await refreshSurroundings(db, {
      dryRun: args['dry-run'],
      workspace: args.workspace,
      log: line => console.log(line),
    })
    console.log(
      `${stats.listings} annonce(s) sur ${redact(url)} : ${stats.changed} ${args['dry-run'] ? 'à recalculer [simulation, rien n’est écrit]' : 'recalculée(s)'}, ${stats.unchanged} inchangée(s), dont ${stats.withoutPoint} sans point (${elapsed(started)}).`
    )
  } finally {
    await db.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
