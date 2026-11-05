#!/usr/bin/env tsx
/**
 * Import des contours de quartiers de Bordeaux Métropole (lot 11, besoin
 * D11) dans `neighbourhoods`.
 *
 *   pnpm import:neighbourhoods [--dry-run] [--download]
 *        [--quartiers data/opendata/quartiers/se_quart_s.geojson]
 *        [--secteurs data/opendata/quartiers/se_quartvie_s.geojson]
 *        [--iris data/opendata/iris/bm-contours_iris-2026.geojson]
 *        [--iris-edition 2026] [--no-secteurs] [--database-url ...]
 *
 * Quartiers officiels là où la commune en publie (Bordeaux Métropole ; pour
 * Bordeaux, les secteurs de vie de la Ville), IRIS de l'INSEE ailleurs
 * (« IRIS <nom> »), commune entière pour une commune non découpée. Tout le
 * territoire est remplacé dans une transaction (module geo), qui calcule
 * aussi ce que la carte dessine. Idempotent.
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
import {
  IRIS_WFS_URL,
  QUARTIERS_URL,
  SECTEURS_URL,
  buildNeighbourhoods,
} from './lib/neighbourhoods.js'
import { fetchJson } from './lib/osm.js'

const HELP = `Import des contours de quartiers de Bordeaux Métropole dans neighbourhoods.

Options :
  --quartiers FICHIER  « Quartier des communes » (se_quart_s, GeoJSON)
                       (défaut data/opendata/quartiers/se_quart_s.geojson)
  --secteurs FICHIER   « Secteurs de vie » de Bordeaux (se_quartvie_s, GeoJSON)
                       (défaut data/opendata/quartiers/se_quartvie_s.geojson)
  --no-secteurs        les huit quartiers de Bordeaux au lieu des secteurs de vie
  --iris FICHIER       Contours IRIS (GeoJSON de la Géoplateforme ou se_iri24_s du datahub)
                       (défaut data/opendata/iris/bm-contours_iris-2026.geojson)
  --iris-edition AAAA  édition des contours IRIS, pour la provenance (défaut 2026)
  --download           lit les sources en ligne (datahub de Bordeaux Métropole, WFS de la Géoplateforme)
  --dry-run            lit et compte sans rien écrire
  --database-url URL   base cible (défaut DATABASE_URL de apps/api/.env)
  --help               cette aide`

const dir = path.join(repoRoot, 'data/opendata')
const { values: args } = parseArgs({
  args: cliArgs(),
  options: {
    quartiers: {
      type: 'string',
      default: path.join(dir, 'quartiers/se_quart_s.geojson'),
    },
    secteurs: {
      type: 'string',
      default: path.join(dir, 'quartiers/se_quartvie_s.geojson'),
    },
    'no-secteurs': { type: 'boolean', default: false },
    iris: {
      type: 'string',
      default: path.join(dir, 'iris/bm-contours_iris-2026.geojson'),
    },
    'iris-edition': { type: 'string', default: '2026' },
    download: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'database-url': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
})

const readJson = (file: string): unknown => {
  if (!existsSync(file)) {
    throw new Error(
      `Fichier introuvable : ${file} (voir docs/open-data.md, ou passez --download).`
    )
  }
  return JSON.parse(readFileSync(file, 'utf8'))
}

const RULE_LABELS = {
  secteurs: 'secteurs de vie',
  quartiers: 'quartiers officiels',
  iris: 'IRIS',
  commune: 'commune entière',
  absente: 'AUCUN CONTOUR',
} as const

async function main(): Promise<void> {
  if (args.help) {
    console.log(HELP)
    return
  }
  const started = Date.now()
  const load = (url: string, file: string) =>
    args.download ? fetchJson(url) : Promise.resolve(readJson(file))
  const [quartiers, secteurs, iris] = await Promise.all([
    load(QUARTIERS_URL, args.quartiers),
    args['no-secteurs']
      ? Promise.resolve(null)
      : load(SECTEURS_URL, args.secteurs),
    load(IRIS_WFS_URL, args.iris),
  ])
  const { rows, stats } = buildNeighbourhoods({
    quartiers,
    secteurs,
    iris,
    irisEdition: args['iris-edition'],
  })
  console.log(
    `${rows.length} contour(s) : ${stats.secteurs} secteur(s) de vie, ${stats.quartiers} quartier(s) officiel(s), ${stats.iris} IRIS, ${stats.communes} commune(s) entière(s) ; écartés : ${stats.invalid} non valide(s) ou sans nom, ${stats.outsideMetropole} hors métropole, ${stats.withoutGeometry} sans polygone`
  )
  for (const rule of stats.rules) {
    console.log(
      `  ${rule.commune.padEnd(28)} ${RULE_LABELS[rule.rule]}${rule.quartiers ? ` (${rule.quartiers})` : ''}${rule.iris ? `, ${rule.iris} IRIS${rule.quartiers ? ' à défaut' : ''}` : ''}`
    )
  }
  const missing = stats.rules.filter(r => r.rule === 'absente')
  if (missing.length) {
    console.warn(
      `  ! ${missing.length} commune(s) sans contour : ${missing.map(r => r.commune).join(', ')}`
    )
  }
  if (args['dry-run']) {
    console.log(
      `Simulation (--dry-run) : rien n'est écrit (${elapsed(started)}).`
    )
    return
  }
  if (rows.length === 0) {
    throw new Error('Aucun contour lu : rien n’est remplacé.')
  }
  const url = databaseUrlFrom(args['database-url'])
  const db = openDatabase(url)
  try {
    const result = await db.geo.replaceNeighbourhoods(
      NEIGHBOURHOOD_TERRITORY,
      rows
    )
    console.log(
      `Import terminé sur ${redact(url)} : ${result.written} contour(s) écrit(s), ${result.removed} remplacé(s) (${elapsed(started)}). Rattrapez le contexte des annonces : pnpm refresh:surroundings.`
    )
  } finally {
    await db.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
