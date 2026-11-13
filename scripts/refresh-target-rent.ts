#!/usr/bin/env tsx
/**
 * Rattrapage de l'ADR 0046 : estime le loyer visé des annonces qui n'en ont
 * pas, d'après l'observatoire des loyers (médiane au m² de la zone et du
 * nombre de pièces × surface), comme le fait l'API à chaque recalcul.
 *
 *   pnpm refresh:target-rent [--dry-run] [--workspace NOM] [--database-url ...]
 *
 * Un loyer visé donné (membre, Claude, annonce) n'est jamais touché ; sans
 * adresse au numéro ou à la rue, rien n'est estimé. Une ligne de journal
 * `listing.enriched` (canal `system`) par annonce réécrite. Idempotent.
 */
import { parseArgs } from 'node:util'
import { cliArgs } from './lib/cli.js'
import { databaseUrlFrom, elapsed, openDatabase, redact } from './lib/db.js'
import { refreshTargetRent } from './lib/refresh-target-rent.js'

const HELP = `Estime le loyer visé des annonces qui n'en ont pas (observatoire des loyers, ADR 0046).

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
    const stats = await refreshTargetRent(db, {
      dryRun: args['dry-run'],
      workspace: args.workspace,
      log: line => console.log(line),
    })
    console.log(
      `${stats.listings} annonce(s) sur ${redact(url)} : ${stats.estimated} ${args['dry-run'] ? 'à estimer [simulation, rien n’est écrit]' : 'estimée(s)'}, ${stats.cleared} estimation(s) retirée(s), ${stats.unchanged} inchangée(s), ${stats.given} avec un loyer visé donné, ${stats.withoutEstimate} sans estimation possible (${elapsed(started)}).`
    )
  } finally {
    await db.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
