/**
 * Les imports open data à lancer avec `--opendata`, d'après les fichiers
 * présents dans `data/opendata/` (jamais commités). Une source absente est
 * signalée et sautée, sans erreur.
 */

export interface OpenDataFiles {
  encadrement: string[]
  tbm: string[]
  dvf: string[]
  /** Lot 11 : quartiers (se_quart_s, se_quartvie_s), IRIS, recensement sportif, OpenStreetMap. */
  quartiers?: string[]
  iris?: string[]
  res?: string[]
  osm?: string[]
}

export interface OpenDataStep {
  label: string
  /** Script de `scripts/` et ses arguments. */
  script: string
  args: string[]
}

export interface OpenDataPlan {
  steps: OpenDataStep[]
  skipped: string[]
}

const DECREE =
  /^Tableaux_loyers_reference_Bordeaux_Arrete_\d{4}-\d{2}-\d{2}\.xlsx$/
const DVF = /^33-(\d{4})\.csv\.gz$/

export function openDataPlan(files: OpenDataFiles): OpenDataPlan {
  const steps: OpenDataStep[] = []
  const skipped: string[] = []

  const enc = new Set(files.encadrement)
  if (
    enc.has('l_zonage_oll_bordeaux.gml') &&
    enc.has('loyers-reference.csv') &&
    files.encadrement.some(f => DECREE.test(f))
  ) {
    steps.push({
      label: 'encadrement des loyers',
      script: 'import-rent-control.ts',
      args: [],
    })
  } else {
    skipped.push(
      'encadrement : il faut l_zonage_oll_bordeaux.gml, loyers-reference.csv et le classeur de l’arrêté dans data/opendata/encadrement/'
    )
  }

  const tbm = new Set(files.tbm)
  if (tbm.has('sv_arret_p.geojson') && tbm.has('sv_ligne_a.json')) {
    steps.push({
      label: 'arrêts TBM',
      script: 'import-transit-stops.ts',
      args: [],
    })
  } else {
    skipped.push(
      'arrêts TBM : il faut sv_arret_p.geojson et sv_ligne_a.json dans data/opendata/tbm/'
    )
  }

  const years = files.dvf
    .map(f => DVF.exec(f)?.[1])
    .filter((y): y is string => y !== undefined)
    .sort()
  if (years.length > 0) {
    steps.push({
      label: `ventes DVF ${years.join(', ')}`,
      script: 'import-dvf.ts',
      args: years.flatMap(year => ['--year', year]),
    })
  } else {
    skipped.push('DVF : aucun fichier 33-AAAA.csv.gz dans data/opendata/dvf/')
  }

  // Lot 11 : noms de fichiers par défaut des scripts (docs/open-data.md).
  const quartiers = new Set(files.quartiers ?? [])
  const iris = new Set(files.iris ?? [])
  const res = new Set(files.res ?? [])
  const osm = new Set(files.osm ?? [])
  const lot11 = steps.length
  if (quartiers.has('se_quart_s.geojson') && iris.has(IRIS_FILE)) {
    steps.push({
      label: 'quartiers',
      script: 'import-neighbourhoods.ts',
      args: quartiers.has('se_quartvie_s.geojson') ? [] : ['--no-secteurs'],
    })
  } else {
    skipped.push(
      `quartiers : il faut quartiers/se_quart_s.geojson et iris/${IRIS_FILE} dans data/opendata/`
    )
  }
  // Lot 12 : lieux-dits OpenStreetMap, rattachés aux communes des contours.
  const neighbourhoodsImported = steps.some(
    s => s.script === 'import-neighbourhoods.ts'
  )
  if (osm.has(PLACES_FILE) && neighbourhoodsImported) {
    steps.push({
      label: 'lieux-dits',
      script: 'import-places.ts',
      args: [],
    })
  } else {
    skipped.push(
      `lieux-dits : il faut osm/${PLACES_FILE} et les quartiers dans data/opendata/`
    )
  }
  const tracks = res.has('bm-athletisme.json')
  const fitness = osm.has('fitness-park.json')
  if (tracks || fitness) {
    steps.push({
      label:
        tracks && fitness
          ? 'pistes et Fitness Park'
          : tracks
            ? 'pistes'
            : 'Fitness Park',
      script: 'import-sports-facilities.ts',
      args: [
        ...(tracks && fitness ? [] : ['--only', tracks ? 'tracks' : 'fitness']),
        ...(tracks && !osm.has('athletics-tracks.json')
          ? ['--no-osm-tracks']
          : []),
      ],
    })
  } else {
    skipped.push(
      'équipements sportifs : il faut res/bm-athletisme.json ou osm/fitness-park.json dans data/opendata/'
    )
  }
  if (osm.has('supermarkets.json')) {
    steps.push({
      label: 'supermarchés avec drive',
      script: 'import-supermarkets.ts',
      args: [],
    })
  } else {
    skipped.push('drives : il faut osm/supermarkets.json dans data/opendata/')
  }
  if (neighbourhoodsImported) {
    steps.push({
      label: 'repère des annonces au quartier',
      script: 'relocate-listings.ts',
      args: [],
    })
  }
  if (steps.length > lot11) {
    steps.push({
      label: 'quartier et équipements des annonces',
      script: 'refresh-surroundings.ts',
      args: [],
    })
  }
  // Lot 14 : les arrêts de tram et le repère des annonces changent les
  // mesures de l'adéquation aux critères ; on la recalcule en dernier.
  if (
    steps.some(
      s =>
        s.script === 'import-transit-stops.ts' ||
        s.script === 'relocate-listings.ts'
    )
  ) {
    steps.push({
      label: 'adéquation des annonces aux critères',
      script: 'refresh-criteria-fit.ts',
      args: [],
    })
  }
  return { steps, skipped }
}

/** Le fichier des Contours IRIS attendu par `import-neighbourhoods` (édition 2026). */
export const IRIS_FILE = 'bm-contours_iris-2026.geojson'
/** Le fichier des lieux-dits OpenStreetMap attendu par `import-places` (lot 12). */
export const PLACES_FILE = 'quartiers-places.json'
