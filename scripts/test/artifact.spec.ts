import { describe, expect, it } from 'vitest'
import {
  geocodeQuery,
  mapAssumptions,
  mapListing,
  parseFloor,
  sourceFromUrl,
  validUrl,
} from '../lib/artifact.js'

/** Un enregistrement synthétique au format de l'artefact (aucune donnée réelle). */
const record = {
  titre: 'T3 Talence Forum 62 m², balcon',
  url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/1',
  adresse: 'Rue du Forum, 33400 Talence (numéro à demander)',
  commune: 'Talence',
  quartier: 'Forum (tram B)',
  statut: 'avisiter',
  prix: 199000,
  surface: '62,5',
  pieces: 3,
  etage: '1er sur 4, ascenseur',
  dpe: 'D',
  annee: 1964,
  loyer: 850,
  chargesAn: 1440,
  copro: 30,
  tf: null,
  mobilier: 0,
  notes: 'Vente entre particuliers.',
  source: 'recherche Claude',
  travaux: 0,
  trav_actif: true,
  trav_niveau: 'renovation',
  trav_duree: 6,
  trav_notes: 'Estimation, à remplacer par des devis.',
  trav_postes: [
    { id: 'p0', lib: 'Peinture', montant: 2500 },
    { id: 'p1', lib: 'Cuisine', montant: null },
  ],
  p2_annee: 2028,
  p2_type: 'vide',
  p2_encadre: 'auto',
  p2_demande: 'forte',
  p2_reglement: 'oui',
  p2_decence: null,
  avis: {
    richard: { date: '2026-10-31T22:12:31.805Z', note: 4, texte: 'Bien placé' },
    chloe: { note: 0, texte: '' },
  },
  todos: [
    { id: 'a', t: 'Demander le montant de la taxe foncière', done: true },
    { id: 'b', t: "Appeler l'agence", done: false },
  ],
  vue: true,
  vueLe: '2026-11-01T00:20:00.000Z',
  ajouteLe: '2026-10-31T18:35:00.000Z',
  modifieLe: '2026-11-01T00:40:00.000Z',
}

describe('mapListing', () => {
  const mapped = mapListing('lbc-1', record)

  it('reprend identité, bien et localisation avec la provenance « user »', () => {
    const { input } = mapped
    expect(input.title).toBe('T3 Talence Forum 62 m², balcon')
    expect(input.source).toBe('leboncoin')
    expect(input.sourceLabel).toBe('recherche Claude')
    expect(input.externalId).toBe('lbc-1')
    expect(input.price).toBe(199_000)
    expect(input.surface).toBe(62.5)
    expect(input.rooms).toBe(3)
    expect(input.floor).toBe(1)
    expect(input.floorsTotal).toBe(4)
    expect(input.elevator).toBe(true)
    expect(input.floorLabel).toBe('1er sur 4, ascenseur')
    expect(input.constructionYear).toBe(1964)
    expect(input.dpeClass).toBe('D')
    expect(input.annualCharges).toBe(1440)
    expect(input.nonRecoverableChargesMonthly).toBe(30)
    expect(input.propertyTax).toBeNull()
    expect(input.furnitureValue).toBe(0)
    expect(input.status).toBe('to_visit')
    expect(input.location.commune).toBe('Talence')
    expect(input.location.district).toBe('Forum (tram B)')
    expect(input.location.addressRaw).toContain('Rue du Forum')
    expect(input.fieldSources.price).toEqual({ source: 'user' })
    expect(input.fieldSources.propertyTax).toBeUndefined()
    expect(input.fieldSources.targetRent).toEqual({ source: 'user' })
  })

  it('reprend travaux et phase 2', () => {
    const { input } = mapped
    expect(input.renovation).toMatchObject({
      active: true,
      level: 'renovation',
      durationMonths: 6,
      notes: 'Estimation, à remplacer par des devis.',
    })
    expect(input.renovation?.items).toEqual([
      { label: 'Peinture', amount: 2500 },
      { label: 'Cuisine', amount: null },
    ])
    // Lot 19 : l'année et le type de location ne s'importent plus par annonce.
    expect(input.rentalPlan).not.toHaveProperty('year')
    expect(input.rentalPlan).not.toHaveProperty('leaseType')
    expect(input.rentalPlan).toMatchObject({
      rentControl: 'auto',
      targetRent: 850,
      demand: 'strong',
      coOwnershipAllowsRental: 'yes',
      decencyCompliant: 'unknown',
      rentalPermitRequired: 'unknown',
    })
  })

  it('reprend avis, tâches, « vu par » et dates', () => {
    expect(mapped.opinions).toEqual([
      {
        handle: 'richard',
        rating: 4,
        text: 'Bien placé',
        date: '2026-10-31T22:12:31.805Z',
      },
    ])
    expect(mapped.tasks).toEqual([
      {
        label: 'Demander le montant de la taxe foncière',
        done: true,
        origin: 'default',
      },
      { label: "Appeler l'agence", done: false, origin: 'manual' },
    ])
    expect(mapped.seenByRichardAt).toBe('2026-11-01T00:20:00.000Z')
    expect(mapped.createdAt).toBe('2026-10-31T18:35:00.000Z')
    expect(mapped.updatedAt).toBe('2026-11-01T00:40:00.000Z')
    expect(mapped.hasExactAddress).toBe(true)
  })

  it("sans adresse : une tâche « demander l'adresse », pas de « vu »", () => {
    const bare = mapListing('x', {
      titre: 'Studio',
      prix: 100000,
      commune: 'Bordeaux',
      statut: 'ecarte',
      trav_actif: false,
      travaux: 9000,
    })
    expect(bare.hasExactAddress).toBe(false)
    expect(bare.tasks).toEqual([
      {
        label: "Demander l'adresse exacte du bien",
        done: false,
        origin: 'missing_field',
      },
    ])
    expect(bare.seenByRichardAt).toBeNull()
    expect(bare.input.status).toBe('discarded')
    expect(bare.input.renovation).toBeNull()
    expect(bare.input.source).toBe('autre')
    expect(bare.input.rentalPlan?.targetRent).toBeNull()
  })

  it('un total de travaux sans interrupteur devient un poste unique', () => {
    const legacy = mapListing('y', { titre: 'T2', prix: 1, travaux: 12000 })
    expect(legacy.input.renovation).toMatchObject({ active: true })
    expect(legacy.input.renovation?.items).toEqual([
      { label: 'Travaux (montant global)', amount: 12000 },
    ])
  })

  it('tolère les champs absents, les chaînes et les valeurs inconnues', () => {
    const odd = mapListing('z', {
      prix: '150 000',
      surface: '',
      dpe: 'Z',
      statut: 'inconnu',
      p2_type: 'autre',
      url: 'pas une url',
      etage: 'Rez-de-chaussée surélevé',
    })
    expect(odd.input.title).toBe('Annonce z')
    expect(odd.input.price).toBe(150_000)
    expect(odd.input.surface).toBeNull()
    expect(odd.input.dpeClass).toBeNull()
    expect(odd.input.status).toBe('to_study')
    expect(odd.input.url).toBeNull()
    expect(odd.input.floor).toBe(0)
    expect(odd.input.elevator).toBeNull()
  })
})

describe('helpers', () => {
  it('parseFloor', () => {
    expect(parseFloor('3e sur 5, sans ascenseur')).toEqual({
      floor: 3,
      floorsTotal: 5,
      elevator: false,
    })
    expect(parseFloor('RDC sur 4, ascenseur')).toEqual({
      floor: 0,
      floorsTotal: 4,
      elevator: true,
    })
    expect(parseFloor('6e et dernier, ascenseur')).toEqual({
      floor: 6,
      floorsTotal: null,
      elevator: true,
    })
    expect(parseFloor('Étage à préciser (immeuble de 4 étages)')).toEqual({
      floor: null,
      floorsTotal: null,
      elevator: null,
    })
    expect(parseFloor(null)).toEqual({
      floor: null,
      floorsTotal: null,
      elevator: null,
    })
  })

  it('sourceFromUrl et validUrl', () => {
    expect(sourceFromUrl('https://www.leboncoin.fr/ad/1')).toBe('leboncoin')
    expect(sourceFromUrl('https://www.bienici.com/annonce/x')).toBe('bienici')
    expect(sourceFromUrl('https://www.seloger.com/x')).toBe('seloger')
    expect(sourceFromUrl('https://www.pap.fr/x')).toBe('pap')
    expect(sourceFromUrl('https://agence.example/x')).toBe('agence')
    expect(sourceFromUrl(null)).toBe('autre')
    expect(sourceFromUrl('nope')).toBe('autre')
    expect(validUrl('ftp://x')).toBeNull()
    expect(validUrl('https://x.example/a')).toBe('https://x.example/a')
  })

  it('geocodeQuery : adresse nettoyée complétée par la commune, sinon la commune', () => {
    expect(geocodeQuery(mapListing('a', record).input)).toBe(
      'Rue du Forum, 33400 Talence'
    )
    expect(
      geocodeQuery(
        mapListing('b', {
          titre: 'x',
          prix: 1,
          adresse: '12 Av. de la Libération',
          commune: 'Le Bouscat',
        }).input
      )
    ).toBe('12 Av. de la Libération, Le Bouscat')
    expect(
      geocodeQuery(
        mapListing('c', { titre: 'x', prix: 1, commune: 'Pessac' }).input
      )
    ).toBe('Pessac')
    expect(
      geocodeQuery(mapListing('d', { titre: 'x', prix: 1 }).input)
    ).toBeNull()
  })

  it('mapAssumptions convertit les pourcentages en fractions', () => {
    const a = mapAssumptions({
      apport: 40000,
      taux: 3.65,
      duree: 25,
      assur: 0.1,
      notaire: 7.5,
      vacance: 0.5,
      frais: 1050,
      seuilRdt: 5.5,
      seuilEffort: 150,
    })
    expect(a.interestRate).toBe(0.0365)
    expect(a.insuranceRate).toBe(0.001)
    expect(a.notaryRate).toBe(0.075)
    expect(a.grossYieldThreshold).toBe(0.055)
    expect(a.maxMonthlyEffort).toBe(150)
    expect(a.grossYieldMargin).toBe(0.007)
  })
})
