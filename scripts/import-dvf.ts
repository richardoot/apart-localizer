#!/usr/bin/env tsx
/**
 * Import DVF (demandes de valeurs foncières géolocalisées, Etalab) des ventes
 * d'appartements de Bordeaux Métropole dans `dvf_sales` (besoins D5, N4).
 *
 *   pnpm import:dvf [--dry-run] [--year 2024 --year 2023] [--file chemin.csv.gz]
 *                   [--url https://...csv.gz] [--download] [--cerema]
 *                   [--batch 500] [--database-url ...]
 *
 * Sans option : data/opendata/dvf/33-<année>.csv.gz pour chaque --year (défaut
 * 2024). `--download` lit l'URL Etalab de chaque année au lieu du fichier local.
 * `--cerema` (lot 29) lit chaque --year à l'API « DVF+ open-data » du Cerema :
 * les années que les fichiers d'Etalab ne gardent plus (2014 à 2020), sans
 * adresse ni nombre de pièces, pour la tendance des prix.
 * Lecture en flux (gzip), une vente par mutation d'un seul appartement,
 * upsert par lots sur l'identifiant de mutation : relancer l'import ne crée
 * pas de doublon.
 */
import { existsSync } from 'node:fs'
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
import { csvLines, dvfUrl, readDvf, sourceLabel } from './lib/dvf.js'
import type { DvfSale, DvfStats } from './lib/dvf.js'
import {
  CEREMA_DVF_API,
  CEREMA_FIRST_YEAR,
  readCeremaDvf,
} from './lib/dvf-cerema.js'

const HELP = `Import DVF géolocalisé (ventes d'appartements de Bordeaux Métropole) dans dvf_sales.

Options :
  --year ANNÉE        année à importer, répétable (défaut 2024) ; fichier data/opendata/dvf/33-ANNÉE.csv.gz
  --file CHEMIN       fichier CSV (ou .csv.gz) à importer, répétable
  --url URL           fichier à lire en ligne, répétable
  --download          lire l'URL Etalab de chaque --year plutôt que le fichier local
  --cerema            lire chaque --year à l'API DVF+ open-data du Cerema (depuis ${CEREMA_FIRST_YEAR} ;
                      pour les années absentes des fichiers d'Etalab ; ni adresse ni pièces)
  --batch N           taille des lots d'écriture (défaut 500)
  --dry-run           lit et filtre sans rien écrire
                      (une année importée remplace en entier les ventes de cette année en base)
  --database-url URL  base cible (défaut DATABASE_URL de apps/api/.env)
  --help              cette aide`

const { values: args } = parseArgs({
  args: cliArgs(),
  options: {
    year: { type: 'string', multiple: true },
    file: { type: 'string', multiple: true },
    url: { type: 'string', multiple: true },
    download: { type: 'boolean', default: false },
    cerema: { type: 'boolean', default: false },
    batch: { type: 'string', default: '500' },
    'dry-run': { type: 'boolean', default: false },
    'database-url': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
})

interface Source {
  label: string
  read: () => Promise<{ sales: DvfSale[]; stats: DvfStats }>
}

function fileSource(source: string): Source {
  return {
    label: /^https?:/.test(source) ? source : path.relative(repoRoot, source),
    read: () => readDvf(csvLines(source), sourceLabel(source)),
  }
}

function ceremaSources(): Source[] {
  const years = (args.year ?? []).map(Number)
  if (years.length === 0) {
    throw new Error('--cerema demande au moins une année : --year 2015')
  }
  if (args.file?.length || args.url?.length || args.download) {
    throw new Error(
      '--cerema lit une API : sans --file, --url ni --download dans la même commande'
    )
  }
  for (const year of years) {
    if (!Number.isInteger(year) || year < CEREMA_FIRST_YEAR) {
      throw new Error(
        `Année illisible ou d'avant ${CEREMA_FIRST_YEAR} (début de DVF+ open-data) : ${year}`
      )
    }
  }
  return years.map(year => ({
    label: `${CEREMA_DVF_API} (${year})`,
    read: () => readCeremaDvf(year, { pauseMs: 200 }),
  }))
}

function sources(): Source[] {
  if (args.cerema) return ceremaSources()
  const list = [...(args.file ?? []), ...(args.url ?? [])]
  const years = args.year ?? (list.length ? [] : ['2024'])
  for (const year of years) {
    const local = path.join(repoRoot, 'data/opendata/dvf', `33-${year}.csv.gz`)
    if (args.download) list.push(dvfUrl(Number(year)))
    else if (existsSync(local)) list.push(local)
    else
      throw new Error(
        `Fichier absent : ${local} (ou --download pour lire ${dvfUrl(Number(year))})`
      )
  }
  return list.map(fileSource)
}

async function main(): Promise<void> {
  if (args.help) {
    console.log(HELP)
    return
  }
  const batchSize = Number(args.batch)
  const db = args['dry-run']
    ? null
    : openDatabase(databaseUrlFrom(args['database-url']))
  try {
    for (const source of sources()) {
      const started = Date.now()
      const { label } = source
      const { sales, stats } = await source.read()
      const skipped = Object.entries(stats.skipped)
        .sort((a, b) => b[1] - a[1])
        .map(([reason, n]) => `${n} ${reason}`)
        .join(', ')
      console.log(
        `${label} : ${stats.lines} lignes, ${stats.outsideMetropole} hors métropole ; ${stats.mutations} mutations de la métropole (${stats.years.join(', ') || 'aucune année'}), ${stats.kept} ventes d'un appartement retenues (${stats.communes} communes) ; écartées : ${skipped || 'aucune'} (lecture ${elapsed(started)})`
      )
      if (!db) continue
      const writeStarted = Date.now()
      // L'année du fichier se remplace en entier (identifiants de mutation
      // non stables d'une publication d'Etalab à l'autre).
      const written = await db.geo.upsertDvfSales(sales, {
        batchSize,
        replaceYears: stats.years,
      })
      console.log(
        `  ${written} ventes écrites, année(s) ${stats.years.join(', ')} remplacée(s) (${elapsed(writeStarted)})`
      )
    }
    if (db) {
      const years = await db.geo.dvfYears()
      console.log(
        `En base sur ${redact(databaseUrlFrom(args['database-url']))} : ${years.map(y => `${y.year} : ${y.count}`).join(', ')}`
      )
    } else {
      console.log("Simulation (--dry-run) : rien n'est écrit.")
    }
  } finally {
    await db?.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
