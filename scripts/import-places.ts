#!/usr/bin/env tsx
/**
 * Import des lieux-dits OpenStreetMap (lot 12) dans `places`.
 *
 *   pnpm import:places [--dry-run] [--download]
 *        [--file data/opendata/osm/quartiers-places.json] [--database-url ...]
 *
 * OpenStreetMap (Overpass, ODbL) : `place=neighbourhood`, `quarter` ou
 * `suburb` nommés de la métropole, un point par objet, rattaché à la commune
 * dont un contour importé le contient (lancer `import:neighbourhoods`
 * avant). Ils servent de repli au placement d'une annonce au quartier. La
 * source est remplacée en entier (transaction). Idempotent.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { NEIGHBOURHOOD_TERRITORY } from '@apart/contracts'
import { cliArgs } from './lib/cli.js'
import {
  databaseUrlFrom,
  elapsed,
  openDatabase,
  redact,
  repoRoot,
} from './lib/db.js'
import { fetchOverpass, parseOverpass } from './lib/osm.js'
import { PLACES_QUERY, buildPlaces } from './lib/places.js'

const HELP = `Import des lieux-dits OpenStreetMap (place=neighbourhood, quarter, suburb) dans places.

Options :
  --file FICHIER      réponse Overpass JSON (défaut data/opendata/osm/quartiers-places.json)
  --download          interroge Overpass (overpass-api.de) au lieu du fichier
  --print-query       affiche la requête Overpass et s'arrête
  --dry-run           lit et compte sans rien écrire
  --database-url URL  base cible (défaut DATABASE_URL de apps/api/.env)
  --help              cette aide`

const { values: args } = parseArgs({
  args: cliArgs(),
  options: {
    file: {
      type: 'string',
      default: path.join(repoRoot, 'data/opendata/osm/quartiers-places.json'),
    },
    download: { type: 'boolean', default: false },
    'print-query': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'database-url': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
})

async function main(): Promise<void> {
  if (args.help) {
    console.log(HELP)
    return
  }
  if (args['print-query']) {
    console.log(PLACES_QUERY)
    return
  }
  const started = Date.now()
  if (!args.download && !existsSync(args.file)) {
    throw new Error(
      `Fichier introuvable : ${args.file} (requête : --print-query, ou passez --download).`
    )
  }
  const overpass = parseOverpass(
    args.download
      ? await fetchOverpass(PLACES_QUERY)
      : JSON.parse(readFileSync(args.file, 'utf8'))
  )
  const { rows, stats } = buildPlaces(overpass.elements)
  console.log(
    `OpenStreetMap (base du ${overpass.timestamp ?? '?'}) : ${stats.read} objet(s) lu(s), ${stats.kept} lieu(x)-dit(s) retenu(s) (${stats.byType.suburb} suburb, ${stats.byType.quarter} quarter, ${stats.byType.neighbourhood} neighbourhood) ; écartés : ${stats.otherPlace} sans place retenu (limites administratives…), ${stats.withoutName} sans nom`
  )
  if (args['dry-run']) {
    console.log(
      `Simulation (--dry-run) : rien n'est écrit (${elapsed(started)}).`
    )
    return
  }
  if (rows.length === 0) {
    throw new Error('Aucun lieu-dit dans la réponse : rien n’est remplacé.')
  }
  const url = databaseUrlFrom(args['database-url'])
  const db = openDatabase(url)
  try {
    const result = await db.geo.replacePlaces(
      'osm',
      NEIGHBOURHOOD_TERRITORY,
      rows
    )
    console.log(
      `Import terminé sur ${redact(url)} : ${result.written} lieu(x)-dit(s) écrit(s), ${result.removed} remplacé(s), ${result.withoutCommune} hors des contours importés (sans commune, jamais utilisés) (${elapsed(started)}). Replacez les annonces : pnpm relocate:listings -- --dry-run.`
    )
  } finally {
    await db.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
