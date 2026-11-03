/**
 * Les imports open data à lancer avec `--opendata`, d'après les fichiers
 * présents dans `data/opendata/` (jamais commités). Une source absente est
 * signalée et sautée, sans erreur.
 */

export interface OpenDataFiles {
  encadrement: string[]
  tbm: string[]
  dvf: string[]
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
  return { steps, skipped }
}
