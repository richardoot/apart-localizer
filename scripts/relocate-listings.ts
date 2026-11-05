#!/usr/bin/env tsx
/**
 * Rattrapage du lot 12 : replace le repère des annonces au centre de la
 * commune, au quartier ou sans repère, d'après leur champ « quartier »
 * (contours des quartiers et lieux-dits importés), puis recalcule leur
 * instantané de contexte (desserte, marché, encadrement, quartier et
 * équipements).
 *
 *   pnpm relocate:listings [--dry-run] [--workspace NOM] [--database-url ...]
 *
 * Mêmes règles que l'API (`domain`, module geo), sans réseau. Jamais une
 * annonce à l'adresse (numéro ou rue) ni un point saisi ; jamais une
 * précision moindre. Une ligne de journal `listing.relocated` (canal
 * `system`) par annonce replacée. Idempotent : un second passage ne change
 * rien. À lancer après la migration du lot 12 et les imports
 * `import:neighbourhoods` et `import:places`.
 */
import { parseArgs } from 'node:util'
import { cliArgs } from './lib/cli.js'
import { databaseUrlFrom, elapsed, openDatabase, redact } from './lib/db.js'
import { relocateListings } from './lib/relocate-listings.js'

const HELP = `Replace le repère des annonces au centre de la commune, au quartier ou sans repère (lot 12).

Lit le champ « quartier » de chaque annonce et le compare aux contours des quartiers et aux
lieux-dits importés de sa commune ; un quartier reconnu place le repère en son centre
(précision district). Les annonces à l'adresse (numéro ou rue) et les points saisis ne sont
jamais touchés. L'instantané de contexte (desserte, marché, encadrement, quartier et
équipements) est recalculé pour chaque annonce replacée.

Options :
  --dry-run           affiche « annonce : précision avant → après (quartier) » sans rien écrire
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
    const { stats } = await relocateListings(db, {
      dryRun: args['dry-run'],
      workspace: args.workspace,
      log: line => console.log(line),
    })
    console.log(
      `${stats.listings} annonce(s) sur ${redact(url)} : ${stats.kept} à l'adresse ou saisie(s) (jamais touchées), ${stats.candidates} au quartier, à la commune ou sans repère, dont ${stats.changed} ${args['dry-run'] ? 'à replacer [simulation, rien n’est écrit]' : 'replacée(s)'}, ${stats.unchanged} inchangée(s), ${stats.notLocated} sans repère possible (${elapsed(started)}).`
    )
  } finally {
    await db.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
