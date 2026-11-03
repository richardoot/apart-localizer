/**
 * Une réponse fictive de l'API Géorisques (`resultats_rapport_risque`), au
 * format relevé le 3 novembre 2026 : quelques aléas, adresse inventée.
 */
export const FAKE_GEORISQUES_REPORT = {
  adresse: {
    libelle: '1 Allée Fictive, 33400 Talence',
    longitude: -0.5906,
    latitude: 44.8083,
  },
  commune: { libelle: 'Talence', codePostal: '33400', codeInsee: '33522' },
  url: 'https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport2?typeForm=adresse&codeInsee=33522&lon=-0.5906&lat=44.8083',
  risquesNaturels: {
    inondation: {
      present: false,
      libelle: 'Inondation',
      libelleStatutCommune: null,
      libelleStatutAdresse: null,
      specifique: null,
    },
    remonteeNappe: {
      present: true,
      libelle: 'Remontée de nappe',
      libelleStatutCommune: 'Risque Existant',
      libelleStatutAdresse: 'Risque Existant',
      specifique: null,
    },
    seisme: {
      present: true,
      libelle: 'Séisme',
      libelleStatutCommune: 'Risque Existant - faible',
      libelleStatutAdresse: 'Risque Existant - faible',
      specifique: null,
    },
    retraitGonflementArgile: {
      present: true,
      libelle: 'Retrait gonflement des argiles',
      libelleStatutCommune: 'Risque Existant - important',
      libelleStatutAdresse: 'Risque Existant - modéré',
      specifique: null,
    },
    feuForet: {
      present: true,
      libelle: 'Feu de foret',
      libelleStatutCommune: 'Risque Existant',
      libelleStatutAdresse: 'Risque non Connu',
      specifique: null,
    },
  },
  risquesTechnologiques: {
    pollutionSols: {
      present: true,
      libelle: 'Pollution des sols',
      libelleStatutCommune: 'Risque Concerne',
      libelleStatutAdresse: 'Risque non Concerne',
      specifique: null,
    },
  },
}

/** Un `fetch` qui rend le rapport fictif et compte ses appels. */
export function georisquesFetch(): {
  calls: string[]
  fetchImpl: (url: string) => Promise<{
    ok: boolean
    status: number
    json: () => Promise<unknown>
  }>
} {
  const calls: string[] = []
  return {
    calls,
    fetchImpl: url => {
      calls.push(url)
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(FAKE_GEORISQUES_REPORT),
      })
    },
  }
}
