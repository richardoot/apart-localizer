#!/usr/bin/env tsx
/**
 * Import des supermarchés avec drive (lot 11, besoin D9) dans `amenities`.
 *
 *   pnpm import:supermarkets [--dry-run] [--download]
 *        [--file data/opendata/osm/supermarkets.json] [--database-url ...]
 *
 * OpenStreetMap (Overpass, ODbL) : commerces alimentaires de la métropole
 * dont les étiquettes signalent un drive (`drive_through=only`, « Drive »
 * dans le nom ou l'enseigne) ou le laissent penser (`drive_through=yes`,
 * `branch=Drive`, `shop=outpost`, voie « drive » de l'enseigne à côté) :
 * « à vérifier ». Un magasin sans aucun signal n'est pas importé. Les lignes
 * OpenStreetMap sont remplacées en entier (transaction). Idempotent.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { SUPERMARKET_BRAND_LABELS } from '@apart/contracts'
import type { SupermarketBrandGroup } from '@apart/contracts'
import { cliArgs } from './lib/cli.js'
import {
  databaseUrlFrom,
  elapsed,
  openDatabase,
  redact,
  repoRoot,
} from './lib/db.js'
import { fetchOverpass, parseOverpass } from './lib/osm.js'
import { SUPERMARKETS_QUERY, buildDrives } from './lib/supermarkets.js'

const HELP = `Import des supermarchés avec drive (OpenStreetMap, Overpass) dans amenities.

Options :
  --file FICHIER      réponse Overpass JSON (défaut data/opendata/osm/supermarkets.json)
  --download          interroge Overpass (overpass-api.de) au lieu du fichier
  --print-query       affiche la requête Overpass et s'arrête
  --dry-run           lit, classe et compte sans rien écrire
  --database-url URL  base cible (défaut DATABASE_URL de apps/api/.env)
  --help              cette aide`

const { values: args } = parseArgs({
  args: cliArgs(),
  options: {
    file: {
      type: 'string',
      default: path.join(repoRoot, 'data/opendata/osm/supermarkets.json'),
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
    console.log(SUPERMARKETS_QUERY)
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
      ? await fetchOverpass(SUPERMARKETS_QUERY)
      : JSON.parse(readFileSync(args.file, 'utf8'))
  )
  const { rows, stats } = buildDrives(overpass.elements)
  console.log(
    `OpenStreetMap (base du ${overpass.timestamp ?? '?'}) : ${stats.read} objet(s) lu(s), ${stats.shops} commerce(s) alimentaire(s)`
  )
  console.log(
    `${stats.kept} drive(s) retenu(s) : ${stats.byStatus.yes} signalé(s), ${stats.byStatus.to_verify} à vérifier (dont ${stats.fromServiceRoad} par une voie « drive » de l'enseigne) ; ${stats.withoutSignal} commerce(s) sans aucun signal de drive écarté(s)${stats.withoutName ? `, ${stats.withoutName} sans nom` : ''}`
  )
  console.log(
    `Par enseigne : ${(Object.keys(stats.byBrand) as SupermarketBrandGroup[])
      .map(g => `${SUPERMARKET_BRAND_LABELS[g]} ${stats.byBrand[g]}`)
      .join(', ')}`
  )
  for (const row of rows.filter(r => r.brandGroup !== 'other')) {
    console.log(
      `  - ${row.name} (${row.drive === 'yes' ? 'drive' : 'à vérifier'} : ${row.details.driveEvidence})`
    )
  }
  if (args['dry-run']) {
    console.log(
      `Simulation (--dry-run) : rien n'est écrit (${elapsed(started)}).`
    )
    return
  }
  if (rows.length === 0) {
    throw new Error('Aucun drive dans la réponse : rien n’est remplacé.')
  }
  const url = databaseUrlFrom(args['database-url'])
  const db = openDatabase(url)
  try {
    const result = await db.geo.replaceAmenities(
      'supermarket_drive',
      'osm',
      rows
    )
    console.log(
      `Import terminé sur ${redact(url)} : ${result.written} drive(s) écrit(s), ${result.removed} remplacé(s) (${elapsed(started)}). Rattrapez le contexte des annonces : pnpm refresh:surroundings.`
    )
  } finally {
    await db.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
