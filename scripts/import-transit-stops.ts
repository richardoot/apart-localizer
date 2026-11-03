#!/usr/bin/env tsx
/**
 * Import des arrêts TBM (besoin D4) dans `transit_stops`.
 *
 *   pnpm import:transit-stops [--dry-run] [--stops sv_arret_p.geojson]
 *                             [--lines sv_ligne_a.json] [--paths sv_chem_l.geojson]
 *                             [--no-prune] [--database-url ...]
 *
 * Arrêts actifs de Bordeaux Métropole (sans les arrêts fictifs), mode tram
 * ou bus, lignes déduites des chemins (terminus et tracé à 25 m pour le tram,
 * 20 m pour le bus). Upsert par (réseau, identifiant) ; les arrêts TBM
 * absents du fichier sont supprimés (sauf --no-prune). Idempotent.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { cliArgs } from './lib/cli.js'
import {
  databaseUrlFrom,
  elapsed,
  openDatabase,
  redact,
  repoRoot,
} from './lib/db.js'
import { buildStops, parseLines, parsePaths } from './lib/transit.js'

const dir = path.join(repoRoot, 'data/opendata/tbm')
const HELP = `Import des arrêts TBM (Bordeaux Métropole, jeux SAEIV) dans transit_stops.

Options :
  --stops FICHIER     arrêts physiques GeoJSON (défaut data/opendata/tbm/sv_arret_p.geojson)
  --lines FICHIER     lignes commerciales JSON (défaut data/opendata/tbm/sv_ligne_a.json)
  --paths FICHIER     chemins de ligne GeoJSON avec tracé (défaut data/opendata/tbm/sv_chem_l.geojson,
                      sinon sv_chem_l.json sans tracé : terminus seulement)
  --no-prune          garder les arrêts absents du fichier
  --dry-run           lit et calcule sans rien écrire
  --database-url URL  base cible (défaut DATABASE_URL de apps/api/.env)
  --help              cette aide`

const { values: args } = parseArgs({
  args: cliArgs(),
  options: {
    stops: { type: 'string', default: path.join(dir, 'sv_arret_p.geojson') },
    lines: { type: 'string', default: path.join(dir, 'sv_ligne_a.json') },
    paths: { type: 'string' },
    'no-prune': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'database-url': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
})

const readJson = (file: string): unknown =>
  JSON.parse(readFileSync(file, 'utf8'))

async function main(): Promise<void> {
  if (args.help) {
    console.log(HELP)
    return
  }
  const started = Date.now()
  const pathsFile =
    args.paths ??
    (existsSync(path.join(dir, 'sv_chem_l.geojson'))
      ? path.join(dir, 'sv_chem_l.geojson')
      : path.join(dir, 'sv_chem_l.json'))
  const lines = parseLines(readJson(args.lines as string))
  const paths = parsePaths(readJson(pathsFile), lines)
  const withShape = paths.filter(p => p.lines.length > 0).length
  const { stops, stats } = buildStops(readJson(args.stops as string), paths)
  const byMode = (mode: string) => stops.filter(s => s.mode === mode).length
  console.log(
    `${lines.size} lignes actives, ${paths.length} chemins (${withShape} avec tracé) lus dans ${path.basename(pathsFile)}`
  )
  console.log(
    `${stats.read} arrêts lus : ${stats.kept} retenus (${byMode('tram')} tram, ${byMode('bus')} bus), ${stats.inactive} inactifs ou fictifs, ${stats.outsideMetropole} hors métropole ; ${stats.withLine} avec au moins une ligne`
  )
  const noLine = stops.filter(s => s.mode === 'tram' && s.lines.length === 0)
  if (noLine.length) {
    console.warn(
      `  ! ${noLine.length} arrêt(s) de tram sans ligne : ${noLine
        .slice(0, 5)
        .map(s => s.name)
        .join(', ')}`
    )
  }
  if (args['dry-run']) {
    console.log(
      `Simulation (--dry-run) : rien n'est écrit (${elapsed(started)}).`
    )
    return
  }
  const url = databaseUrlFrom(args['database-url'])
  const db = openDatabase(url)
  try {
    const result = await db.geo.upsertTransitStops('TBM', stops, {
      pruneMissing: !args['no-prune'],
    })
    console.log(
      `Import terminé sur ${redact(url)} : ${result.upserted} arrêts écrits, ${result.pruned} supprimés (${elapsed(started)}).`
    )
  } finally {
    await db.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
