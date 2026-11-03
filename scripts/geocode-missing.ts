#!/usr/bin/env tsx
/**
 * Géocodage systématique (besoin D1) : rattrape les annonces sans point, ou
 * placées au centroïde de leur commune alors qu'une adresse est saisie.
 *
 *   pnpm geocode:missing [--dry-run] [--no-geocode] [--workspace NOM]
 *                        [--cache-file data/private/geocode-cache.json] [--database-url ...]
 *
 * Même client Géoplateforme que l'API, cache sur disque (data/private, ignoré
 * par git) ; `--no-geocode` n'utilise que le cache. Chaque correction écrit le
 * point (module geo), l'adresse normalisée, l'identifiant BAN et le code INSEE
 * en provenance `open_data`, et une ligne de journal (canal `system`). Les
 * enrichissements (plafond, DPE, marché) suivent par `POST /listings/:id/geocode`
 * ou à la prochaine modification de l'annonce.
 */
import path from 'node:path'
import { parseArgs } from 'node:util'
import { cliArgs } from './lib/cli.js'
import type { Prisma } from '../apps/api/src/generated/prisma/index.js'
import { databaseUrlFrom, openDatabase, redact, repoRoot } from './lib/db.js'
import { Geocoder } from './lib/geocode.js'
import { improves, needsGeocode, queryFor } from './lib/geocode-missing.js'

const HELP = `Géocode les annonces sans point, ou au centroïde de la commune alors qu'une adresse est saisie.

Options :
  --dry-run           liste les annonces concernées et le résultat, sans rien écrire
                      (ni base ni cache sur disque ; la Géoplateforme est interrogée sauf --no-geocode)
  --no-geocode        cache seul, aucun appel réseau
  --workspace NOM     un seul espace (défaut : tous)
  --cache-file FICHIER  cache sur disque (défaut data/private/geocode-cache.json)
  --database-url URL  base cible (défaut DATABASE_URL de apps/api/.env)
  --help              cette aide`

const { values: args } = parseArgs({
  args: cliArgs(),
  options: {
    'dry-run': { type: 'boolean', default: false },
    'no-geocode': { type: 'boolean', default: false },
    workspace: { type: 'string' },
    'cache-file': {
      type: 'string',
      default: path.join(repoRoot, 'data/private/geocode-cache.json'),
    },
    'database-url': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
})

async function main(): Promise<void> {
  if (args.help) {
    console.log(HELP)
    return
  }
  const url = databaseUrlFrom(args['database-url'])
  const db = openDatabase(url)
  const geocoder = new Geocoder({
    cacheFile: args['cache-file'] as string,
    online: !args['no-geocode'],
    // Simulation : ni la base ni le cache sur disque ne sont écrits.
    persist: !args['dry-run'],
  })
  const stats = { candidates: 0, fixed: 0, unchanged: 0, notFound: 0 }
  try {
    const rows = await db.prisma.listing.findMany({
      where: args.workspace ? { workspace: { name: args.workspace } } : {},
      select: {
        id: true,
        workspaceId: true,
        title: true,
        addressRaw: true,
        commune: true,
        locationPrecision: true,
        latitude: true,
        fieldSources: true,
      },
      orderBy: { createdAt: 'asc' },
    })
    for (const row of rows) {
      const candidate = {
        id: row.id,
        title: row.title,
        addressRaw: row.addressRaw,
        commune: row.commune,
        precision: row.locationPrecision,
        hasPoint: row.latitude !== null,
      }
      if (!needsGeocode(candidate)) continue
      stats.candidates++
      const q = queryFor(candidate)
      if (!q) continue
      let result = await geocoder.geocode(q.query, q.kind)
      if (
        q.kind === 'address' &&
        (!result || result.precision === 'commune') &&
        row.commune
      ) {
        result = (await geocoder.geocode(row.commune, 'municipality')) ?? result
      }
      if (!result) {
        stats.notFound++
        console.log(`- ${row.title} : aucun résultat pour « ${q.query} »`)
        continue
      }
      if (!improves(candidate, result)) {
        stats.unchanged++
        console.log(
          `- ${row.title} : pas mieux que la précision actuelle (${candidate.precision})`
        )
        continue
      }
      console.log(
        `- ${row.title} : ${candidate.precision ?? 'sans point'} → ${result.precision} (${result.label})${args['dry-run'] ? ' [simulation]' : ''}`
      )
      if (args['dry-run']) {
        stats.fixed++
        continue
      }
      const recordedAt = new Date().toISOString()
      const exact = result.precision !== 'commune'
      const keys = [
        'point',
        'precision',
        'inseeCode',
        ...(exact ? ['addressNormalized', 'banId'] : []),
        ...(row.commune ? [] : ['commune']),
      ]
      const fieldSources = {
        ...((row.fieldSources ?? {}) as Record<string, unknown>),
        ...Object.fromEntries(
          keys.map(k => [k, { source: 'open_data', recordedAt }])
        ),
      }
      await db.prisma.listing.update({
        where: { id: row.id },
        data: {
          addressNormalized: exact ? result.label : null,
          banId: exact ? result.banId : null,
          inseeCode: result.citycode,
          ...(row.commune ? {} : { commune: result.city }),
          fieldSources: fieldSources as Prisma.InputJsonValue,
        },
      })
      await db.geo.setListingPoint(row.id, result.point, result.precision)
      await db.prisma.activityLog.create({
        data: {
          workspaceId: row.workspaceId,
          listingId: row.id,
          channel: 'system',
          action: 'listing.geocoded',
          before: { precision: candidate.precision },
          after: {
            point: result.point,
            precision: result.precision,
            label: result.label,
          },
        },
      })
      stats.fixed++
    }
  } finally {
    await db.close()
  }
  console.log(
    `${redact(url)} : ${stats.candidates} annonce(s) à géocoder, ${args['dry-run'] ? 'à corriger' : 'corrigées'} : ${stats.fixed}${args['dry-run'] ? ' (simulation, rien d’écrit)' : ''}, sans amélioration : ${stats.unchanged}, sans résultat : ${stats.notFound} (${geocoder.calls} appel(s) réseau).`
  )
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
