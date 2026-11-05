#!/usr/bin/env tsx
/**
 * Import des pistes d'athlétisme et des salles Fitness Park (lot 11,
 * besoins D8 et D10) dans `amenities`.
 *
 *   pnpm import:sports-facilities [--dry-run] [--download]
 *        [--res data/opendata/res/bm-athletisme.json]
 *        [--osm-tracks data/opendata/osm/athletics-tracks.json]
 *        [--fitness data/opendata/osm/fitness-park.json]
 *        [--only tracks|fitness] [--no-osm-tracks] [--database-url ...]
 *
 * Pistes : recensement des équipements sportifs (Data ES, ministère des
 * Sports), types stade d'athlétisme, piste isolée, piste 2 à 4 couloirs ;
 * en complément les pistes OpenStreetMap qu'aucune fiche ne décrit. Fitness
 * Park : OpenStreetMap, chaque club vérifié. Chaque source remplace ses
 * lignes en entier (transaction), par le module geo. Idempotent.
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
import type { AmenityRow } from '../apps/api/src/geo/geo.service.js'
import { fetchJson, fetchOverpass, parseOverpass } from './lib/osm.js'
import {
  OSM_FITNESS_QUERY,
  OSM_TRACKS_QUERY,
  RES_EXPORT_URL,
  buildFitnessParks,
  buildOsmTracks,
  buildResTracks,
} from './lib/sports.js'

const HELP = `Import des pistes d'athlétisme (recensement des équipements sportifs, OpenStreetMap)
et des salles Fitness Park (OpenStreetMap) dans amenities.

Options :
  --res FICHIER         export JSON ou GeoJSON du recensement (Data ES) filtré sur la métropole
                        (défaut data/opendata/res/bm-athletisme.json)
  --osm-tracks FICHIER  réponse Overpass des pistes OSM (défaut data/opendata/osm/athletics-tracks.json)
  --fitness FICHIER     réponse Overpass des Fitness Park (défaut data/opendata/osm/fitness-park.json)
  --download            lit les sources en ligne (equipements.sports.gouv.fr, Overpass) au lieu des fichiers
  --only tracks|fitness une seule famille
  --no-osm-tracks       pistes du recensement seules, sans complément OpenStreetMap
  --dry-run             lit, filtre et compte sans rien écrire
  --database-url URL    base cible (défaut DATABASE_URL de apps/api/.env)
  --help                cette aide`

const { values: args } = parseArgs({
  args: cliArgs(),
  options: {
    res: {
      type: 'string',
      default: path.join(repoRoot, 'data/opendata/res/bm-athletisme.json'),
    },
    'osm-tracks': {
      type: 'string',
      default: path.join(repoRoot, 'data/opendata/osm/athletics-tracks.json'),
    },
    fitness: {
      type: 'string',
      default: path.join(repoRoot, 'data/opendata/osm/fitness-park.json'),
    },
    download: { type: 'boolean', default: false },
    only: { type: 'string' },
    'no-osm-tracks': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'database-url': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
})

const readJson = (file: string): unknown => {
  if (!existsSync(file)) {
    throw new Error(
      `Fichier introuvable : ${file} (téléchargez-le, voir docs/open-data.md, ou passez --download).`
    )
  }
  return JSON.parse(readFileSync(file, 'utf8'))
}

async function main(): Promise<void> {
  if (args.help) {
    console.log(HELP)
    return
  }
  if (args.only && !['tracks', 'fitness'].includes(args.only)) {
    throw new Error('--only attend « tracks » ou « fitness ».')
  }
  const started = Date.now()
  const doTracks = args.only !== 'fitness'
  const doFitness = args.only !== 'tracks'
  const writes: Array<{
    kind: 'athletics_track' | 'fitness_park'
    source: 'res' | 'osm'
    rows: AmenityRow[]
    label: string
    /** Un résultat vide est légitime (complément) : il vide la source. */
    allowEmpty?: boolean
  }> = []

  if (doTracks) {
    const res = buildResTracks(
      args.download ? await fetchJson(RES_EXPORT_URL) : readJson(args.res)
    )
    const s = res.stats
    console.log(
      `Recensement : ${s.read} fiche(s) lue(s), ${s.kept} piste(s) retenue(s) (${Object.entries(
        s.byType
      )
        .map(([type, n]) => `${n} « ${type} »`)
        .join(
          ', '
        )}) ; écartées : ${s.otherTypes} aire(s) ou autre type, ${s.outsideMetropole} hors métropole, ${s.withoutPosition} sans position`
    )
    writes.push({
      kind: 'athletics_track',
      source: 'res',
      rows: res.rows,
      label: 'pistes du recensement',
    })
    if (!args['no-osm-tracks']) {
      const overpass = parseOverpass(
        args.download
          ? await fetchOverpass(OSM_TRACKS_QUERY)
          : readJson(args['osm-tracks'])
      )
      const osm = buildOsmTracks(overpass.elements, {
        athletics: res.athletics,
        tracks: res.rows,
      })
      const o = osm.stats
      console.log(
        `OpenStreetMap (base du ${overpass.timestamp ?? '?'}) : ${o.tracks} piste(s) d'athlétisme, ${o.knownByReference} déjà au recensement (ref:FR:sport_equip), ${o.nearResEquipment} à moins de 200 m d'une piste du recensement, ${o.kept} ajoutée(s) en complément`
      )
      writes.push({
        kind: 'athletics_track',
        source: 'osm',
        rows: osm.rows,
        label: 'pistes OpenStreetMap en complément',
        allowEmpty: o.tracks > 0,
      })
    }
  }

  if (doFitness) {
    const overpass = parseOverpass(
      args.download
        ? await fetchOverpass(OSM_FITNESS_QUERY)
        : readJson(args.fitness)
    )
    const fitness = buildFitnessParks(overpass.elements)
    console.log(
      `Fitness Park (OpenStreetMap, base du ${overpass.timestamp ?? '?'}) : ${fitness.stats.kept} club(s) retenu(s) sur ${fitness.stats.read} objet(s)${fitness.stats.rejected.length ? ` ; écartés (pas un Fitness Park) : ${fitness.stats.rejected.slice(0, 8).join(', ')}` : ''}`
    )
    for (const row of fitness.rows) {
      console.log(`  - ${row.name}${row.address ? `, ${row.address}` : ''}`)
    }
    writes.push({
      kind: 'fitness_park',
      source: 'osm',
      rows: fitness.rows,
      label: 'salles Fitness Park',
    })
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
    for (const write of writes) {
      if (write.rows.length === 0 && !write.allowEmpty) {
        console.warn(
          `  ! aucune ligne pour les ${write.label} : rien n'est remplacé.`
        )
        continue
      }
      const result = await db.geo.replaceAmenities(
        write.kind,
        write.source,
        write.rows,
        { allowEmpty: write.allowEmpty ?? false }
      )
      console.log(
        `  ${write.label} : ${result.written} écrite(s), ${result.removed} remplacée(s)`
      )
    }
    console.log(
      `Import terminé sur ${redact(url)} (${elapsed(started)}). Rattrapez le contexte des annonces : pnpm refresh:surroundings.`
    )
  } finally {
    await db.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
