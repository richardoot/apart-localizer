#!/usr/bin/env tsx
/**
 * Rattrapage du lot 14 : recalcule l'adéquation de toutes les annonces aux
 * critères actifs (dans les critères, à confirmer, à la marge, hors
 * critères), avec les règles et l'écriture de l'API.
 *
 *   pnpm refresh:criteria-fit [--dry-run] [--workspace NOM] [--database-url ...]
 *
 * Sans réseau. Une ligne de journal par changement de niveau (canal
 * `system`, cause « rattrapage », sans alerte ni « ce qui a changé »).
 * Idempotent : un second passage ne change rien. À lancer après la
 * migration du lot 14, et après un import qui change les mesures (arrêts de
 * tram, contours des quartiers) ou `relocate:listings`.
 */
import { parseArgs } from 'node:util'
import { cliArgs } from './lib/cli.js'
import { databaseUrlFrom, elapsed, openDatabase, redact } from './lib/db.js'
import { refreshCriteriaFit } from './lib/refresh-criteria-fit.js'

const HELP = `Recalcule l'adéquation des annonces aux critères actifs (lot 14).

Pour chaque annonce et chaque critère actif : dans les critères, à confirmer (adresse au quartier
ou à la commune dont le contour touche le périmètre, ou donnée manquante), à la marge (dépassement
dans la marge de tolérance du critère) ou hors critères. Le meilleur niveau est gardé sur
l'annonce ; chaque changement est journalisé (canal système, sans notification).

Options :
  --dry-run           affiche « annonce : avant → après (critère : raisons) » sans rien écrire
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
    const { stats } = await refreshCriteriaFit(db, {
      dryRun: args['dry-run'],
      workspace: args.workspace,
      log: line => console.log(line),
    })
    console.log(
      `${stats.listings} annonce(s) dans ${stats.workspaces} espace(s) sur ${redact(url)}${stats.withoutCriteria ? ` (${stats.withoutCriteria} sans critère actif)` : ''} : ${stats.entered} entrée(s), ${stats.left} sortie(s) vers « hors critères », ${stats.changed} autre(s) changement(s) de niveau, ${stats.initialized} comparée(s) pour la première fois${args['dry-run'] ? ' [simulation, rien n’est écrit]' : ''} (${elapsed(started)}).`
    )
  } finally {
    await db.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
