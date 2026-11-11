#!/usr/bin/env tsx
/**
 * Import des loyers observés par l'Observatoire local des loyers de
 * l'agglomération de Bordeaux (lot 28, ADR 0038) : médiane et quartiles hors
 * charges des appartements, par zone de calcul et nombre de pièces, et le
 * zonage (IRIS ou commune → zone), dans `reference_data` (sorte
 * `rent_observatory`, clé `bordeaux:<année>`).
 *
 *   pnpm import:rent-observatory [--dry-run] [--year 2025] [--download]
 *                                [--archive chemin.zip] [--database-url ...]
 *
 * Sans option : data/opendata/loyers-oll/Base_OP_<année>_L3300.zip. Un
 * indicateur, jamais un plafond : rien n'est écrit sur les annonces.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import type { Prisma } from '../apps/api/src/generated/prisma/index.js'
import { cliArgs } from './lib/cli.js'
import {
  databaseUrlFrom,
  elapsed,
  openDatabase,
  redact,
  repoRoot,
} from './lib/db.js'
import {
  buildRentObservatoryTable,
  ollArchiveName,
  ollArchiveUrl,
  parseOllResults,
  parseOllZoning,
  readOllArchive,
  sha256Of,
} from './lib/rent-observatory.js'

const dir = path.join(repoRoot, 'data/opendata/loyers-oll')
const DEFAULT_YEAR = '2025'

const HELP = `Import des loyers observés (Observatoire local des loyers de Bordeaux) dans reference_data.

Options :
  --year ANNÉE        année d'enquête (défaut ${DEFAULT_YEAR}) ; archive data/opendata/loyers-oll/Base_OP_ANNÉE_L3300.zip
  --archive CHEMIN    archive .zip de l'observatoire à lire
  --download          lire l'archive de l'année sur observatoires-des-loyers.org plutôt que le fichier local
  --source-url URL    adresse de la source à enregistrer (défaut : celle de l'année)
  --dry-run           lit et contrôle sans rien écrire
  --database-url URL  base cible (défaut DATABASE_URL de apps/api/.env)
  --help              cette aide

Un indicateur hors charges, jamais un plafond : rien n'est écrit sur les annonces.`

const { values: args } = parseArgs({
  args: cliArgs(),
  options: {
    year: { type: 'string', default: DEFAULT_YEAR },
    archive: { type: 'string' },
    download: { type: 'boolean', default: false },
    'source-url': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'database-url': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
})

async function readArchive(year: number): Promise<{
  buffer: Buffer
  file: string
  url: string
}> {
  const url = args['source-url'] ?? ollArchiveUrl(year)
  if (args.download) {
    const response = await fetch(ollArchiveUrl(year))
    if (!response.ok) {
      throw new Error(
        `Téléchargement impossible (${response.status}) : ${ollArchiveUrl(year)}`
      )
    }
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      file: ollArchiveName(year),
      url,
    }
  }
  const file = args.archive ?? path.join(dir, ollArchiveName(year))
  if (!existsSync(file)) {
    throw new Error(
      `Archive absente : ${file} (ou --download pour lire ${ollArchiveUrl(year)})`
    )
  }
  return { buffer: readFileSync(file), file: path.basename(file), url }
}

async function main(): Promise<void> {
  if (args.help) {
    console.log(HELP)
    return
  }
  const started = Date.now()
  const year = Number(args.year)
  if (!Number.isInteger(year) || year < 2000) {
    throw new Error(`Année illisible : ${args.year}`)
  }
  const archive = await readArchive(year)
  const { results: resultsText, zoning: zoningText } = readOllArchive(
    archive.buffer
  )
  const results = parseOllResults(resultsText)
  const zoning = parseOllZoning(zoningText)
  if (results.year !== year) {
    throw new Error(
      `L'archive porte l'année d'enquête ${results.year}, pas ${year} : passez --year ${results.year}.`
    )
  }
  const table = buildRentObservatoryTable({
    results,
    zoning,
    source: {
      url: archive.url,
      file: archive.file,
      sha256: sha256Of(archive.buffer),
    },
    importedAt: new Date().toISOString(),
  })
  console.log(
    `${archive.file} : ${results.lines} lignes, ${results.kept} loyers d'appartements par zone gardés (enquête ${table.year}, loyers au ${table.observedAt})`
  )
  console.log(
    `Zonage : ${zoning.communes} communes, ${Object.keys(table.communeZones).length} entières dans une zone, ${Object.keys(table.irisZones).length} IRIS de communes partagées`
  )
  for (const zone of table.zones) {
    const parts = zone.stats.map(
      s =>
        `${s.rooms === null ? 'toutes tailles' : s.rooms === 4 ? '4P+' : `${s.rooms}P`} ${s.medianPerM2}`
    )
    console.log(
      `  ${zone.label} : médiane en €/m² hors charges — ${parts.join(' ; ')}${zone.recentTenants ? ` ; arrivés depuis moins d'un an ${zone.recentTenants.medianPerM2}` : ''}`
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
    const key = `${table.territory}:${table.year}`
    const validFrom = new Date(`${table.observedAt}T00:00:00Z`)
    const payload = table as unknown as Prisma.InputJsonValue
    await db.prisma.referenceData.upsert({
      where: { kind_key: { kind: 'rent_observatory', key } },
      create: { kind: 'rent_observatory', key, validFrom, payload },
      update: { validFrom, payload, fetchedAt: new Date() },
    })
    console.log(
      `Import terminé sur ${redact(url)} : enquête ${table.year} enregistrée, ${table.zones.length} zones (${elapsed(started)}).`
    )
  } finally {
    await db.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
