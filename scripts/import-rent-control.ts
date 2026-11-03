#!/usr/bin/env tsx
/**
 * Import de l'encadrement des loyers de Bordeaux (besoins D3, L2).
 *
 *   pnpm import:rent-control [--dry-run] [--zones FICHIER.gml] [--decree FICHIER.xlsx]
 *                            [--check-csv loyers-reference.csv] [--valid-from AAAA-MM-JJ]
 *                            [--valid-until AAAA-MM-JJ] [--source-url URL] [--database-url ...]
 *
 * 1. Zonage de l'observatoire local des loyers (GML du WFS de la DDTM de la
 *    Gironde) : un secteur par IRIS, zone 1 à 4, dans `rent_control_zones`
 *    (remplacement complet du territoire « bordeaux »).
 * 2. Tableau de l'arrêté préfectoral (classeur de la préfecture, feuille
 *    « Appartements ») : référence, majoré, minoré par zone, pièces, époque,
 *    meublé ou vide, dans `reference_data` (sorte `rent_reference`, clé
 *    `bordeaux:<date d'application>`).
 * 3. Contrôle croisé avec le référentiel national (CSV) : valeurs
 *    identiques exigées, dates d'application lues là (le classeur ne les
 *    porte pas) ; sans CSV, --valid-from est obligatoire. Rien n'est deviné.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { cliArgs } from './lib/cli.js'
import { RentReferenceTableSchema } from '@apart/contracts'
import type { Prisma } from '../apps/api/src/generated/prisma/index.js'
import {
  databaseUrlFrom,
  elapsed,
  openDatabase,
  redact,
  repoRoot,
} from './lib/db.js'
import {
  crossCheckCsv,
  parseDecreeWorkbook,
  parseZoningGml,
} from './lib/rent-control.js'

const dir = path.join(repoRoot, 'data/opendata/encadrement')
const HELP = `Import de l'encadrement des loyers de Bordeaux (zonage + arrêté préfectoral).

Options :
  --zones FICHIER        zonage GML (défaut data/opendata/encadrement/l_zonage_oll_bordeaux.gml)
  --decree FICHIER       tableaux de l'arrêté .xlsx (défaut : le plus récent Tableaux_loyers_reference_Bordeaux_Arrete_*.xlsx)
  --check-csv FICHIER    référentiel national loyers-reference.csv pour le contrôle croisé
                         et les dates d'application (défaut data/opendata/encadrement/loyers-reference.csv)
  --no-check             pas de contrôle croisé (alors --valid-from est obligatoire)
  --valid-from DATE      premier jour d'application (AAAA-MM-JJ), sinon lu dans le CSV
  --valid-until DATE     dernier jour d'application, sinon lu dans le CSV
  --source-url URL       adresse de téléchargement de l'arrêté, sinon lue dans le CSV
  --dry-run              lit et contrôle sans rien écrire
  --database-url URL     base cible (défaut DATABASE_URL de apps/api/.env)
  --help                 cette aide`

const { values: args } = parseArgs({
  args: cliArgs(),
  options: {
    zones: {
      type: 'string',
      default: path.join(dir, 'l_zonage_oll_bordeaux.gml'),
    },
    decree: { type: 'string' },
    'check-csv': {
      type: 'string',
      default: path.join(dir, 'loyers-reference.csv'),
    },
    'no-check': { type: 'boolean', default: false },
    'valid-from': { type: 'string' },
    'valid-until': { type: 'string' },
    'source-url': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'database-url': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
})

function latestDecree(): string {
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter(f =>
          /^Tableaux_loyers_reference_Bordeaux_Arrete_\d{4}-\d{2}-\d{2}\.xlsx$/.test(
            f
          )
        )
        .sort()
    : []
  const last = files[files.length - 1]
  if (!last)
    throw new Error(`Aucun classeur d'arrêté dans ${dir} : passez --decree`)
  return path.join(dir, last)
}

async function main(): Promise<void> {
  if (args.help) {
    console.log(HELP)
    return
  }
  const started = Date.now()
  const zonesFile = args.zones as string
  const decreeFile = args.decree ?? latestDecree()
  const zones = parseZoningGml(readFileSync(zonesFile, 'utf8'))
  const decreeBuffer = readFileSync(decreeFile)
  const decree = parseDecreeWorkbook(decreeBuffer)
  console.log(
    `Zonage : ${zones.length} secteurs (zones ${[...new Set(zones.map(z => z.zone))].sort().join(', ')}) lus dans ${path.basename(zonesFile)}`
  )
  console.log(
    `Arrêté du ${decree.decreeDate} : ${decree.rows.length} loyers de référence (feuille « ${decree.sheet} ») lus dans ${path.basename(decreeFile)}`
  )
  const tableZones = new Set(decree.rows.map(r => r.zone))
  const zoningZones = new Set(zones.map(z => z.zone))
  const unknown = [...zoningZones].filter(z => !tableZones.has(z))
  if (unknown.length) {
    throw new Error(
      `Zones du zonage absentes de l'arrêté : ${unknown.join(', ')} — le zonage ne correspond pas à cet arrêté.`
    )
  }

  let validFrom = args['valid-from'] ?? null
  let validUntil = args['valid-until'] ?? null
  let sourceUrl = args['source-url'] ?? null
  let crossCheck: string | null = null
  if (!args['no-check']) {
    const csvFile = args['check-csv'] as string
    if (!existsSync(csvFile)) {
      throw new Error(
        `Référentiel introuvable : ${csvFile} (ou --no-check avec --valid-from)`
      )
    }
    const check = crossCheckCsv(readFileSync(csvFile, 'utf8'), decree)
    if (check.compared === 0) {
      throw new Error(
        `Le référentiel ${path.basename(csvFile)} ne contient pas l'arrêté du ${decree.decreeDate} : contrôle impossible.`
      )
    }
    if (check.mismatches.length || check.missing) {
      throw new Error(
        `Contrôle croisé en échec (${check.mismatches.length} écart(s), ${check.missing} ligne(s) absente(s)) :\n${check.mismatches.slice(0, 10).join('\n')}`
      )
    }
    validFrom ??= check.validFrom
    validUntil ??= check.validUntil
    sourceUrl ??= check.sourceUrl
    crossCheck = `${check.compared} valeurs identiques à ${path.basename(csvFile)} ; application ${check.validFrom ?? '?'} → ${check.validUntil ?? '?'} lue dans ce référentiel`
    console.log(`Contrôle croisé : ${crossCheck}`)
  }
  if (!validFrom) {
    throw new Error(
      "Date d'application inconnue : passez --valid-from (le classeur ne la porte pas)."
    )
  }
  const table = RentReferenceTableSchema.parse({
    territory: 'bordeaux',
    inseeCodes: ['33063'],
    housingType: 'apartment',
    decreeDate: decree.decreeDate,
    validFrom,
    validUntil,
    source: {
      url: sourceUrl,
      file: path.basename(decreeFile),
      sha256: createHash('sha256').update(decreeBuffer).digest('hex'),
      importedAt: new Date().toISOString(),
      crossCheck,
    },
    rows: decree.rows,
  })
  console.log(
    `Application : du ${table.validFrom} au ${table.validUntil ?? '(non précisé)'}`
  )
  if (args['dry-run']) {
    console.log(
      `Simulation (--dry-run) : rien n'est écrit (${elapsed(started)}).`
    )
    return
  }

  const url = databaseUrlFrom(args['database-url'])
  const db = openDatabase(url)
  try {
    // Zonage et arrêté ensemble : un échec en cours ne laisse pas d'état mêlé.
    const result = await db.prisma.$transaction(
      async tx => {
        const written = await db.geo.replaceRentControlZones(
          'bordeaux',
          zones.map(z => ({ ...z, source: path.basename(zonesFile) })),
          tx
        )
        await tx.referenceData.upsert({
          where: {
            kind_key: {
              kind: 'rent_reference',
              key: `bordeaux:${table.validFrom}`,
            },
          },
          create: {
            kind: 'rent_reference',
            key: `bordeaux:${table.validFrom}`,
            validFrom: new Date(`${table.validFrom}T00:00:00Z`),
            payload: table as unknown as Prisma.InputJsonValue,
          },
          update: {
            validFrom: new Date(`${table.validFrom}T00:00:00Z`),
            payload: table as unknown as Prisma.InputJsonValue,
            fetchedAt: new Date(),
          },
        })
        return written
      },
      { timeout: 120_000, maxWait: 10_000 }
    )
    console.log(
      `Import terminé sur ${redact(url)} : ${result.upserted} secteurs écrits, ${result.pruned} supprimés ; arrêté du ${table.decreeDate} enregistré (${elapsed(started)}).`
    )
  } finally {
    await db.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
