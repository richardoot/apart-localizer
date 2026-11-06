/**
 * Lot 19 : la charge utile qu'envoyait l'ancien grand formulaire « Fiche et
 * saisie » (lots 9 à 18) pour une annonce fictive, relevée en faisant tourner
 * le code d'avant le lot 19 (`formToRawInput` du commit 59ea239) sur cette
 * annonce. Les tests de non-régression des sections (`listing-sections.spec.ts`)
 * vérifient qu'une saisie identique envoie, champ par champ, la même mise à
 * jour ; seules les clés retirées au lot 19 (année et type de location de la
 * phase 2, surcharge d'hypothèses) ne partent plus. Données fictives.
 */
import type { Listing } from '@apart/contracts'
import { fakeListing } from '@/test/fixtures'

/** L'annonce fictive du relevé. */
export function legacyListing(): Listing {
  return fakeListing({
    source: 'leboncoin',
    sourceLabel: '[Exemple] Agence',
    url: 'https://exemple.invalid/annonce/19',
    externalId: null,
    title: '[Exemple] T3 lot 19',
    publishedAt: null,
    sourceUpdatedAt: null,
    description: '[Exemple] T3 traversant avec balcon plein sud.',
    notes: 'Demander l’âge de la chaudière.',
    price: 214000,
    feesAmount: 8000,
    feesPercent: null,
    feesPayer: 'buyer',
    surface: 68,
    surfaceTotal: null,
    rooms: 3,
    bedrooms: 2,
    floor: null,
    floorsTotal: null,
    floorLabel: '2e sur 4, sans ascenseur',
    elevator: false,
    constructionYear: 1965,
    constructionPeriod: null,
    dpeClass: 'C',
    dpeConsumption: null,
    gesClass: 'C',
    dpeDate: '2024-03-15',
    dpeNumber: null,
    heatingType: 'Individuel gaz',
    heatingCollective: null,
    outdoor: 'Balcon 6 m², sud',
    parking: 'Cave, pas de parking',
    cellar: null,
    orientation: null,
    condition: null,
    annualCharges: 1440,
    nonRecoverableChargesMonthly: 40,
    lotsCount: 24,
    proceedings: 'Aucune connue',
    votedWorks: 'Ravalement 2025, quote-part à demander',
    syndic: 'Syndic professionnel',
    propertyTax: null,
    furnitureValue: 0,
    location: {
      addressRaw: null,
      addressNormalized: null,
      banId: null,
      commune: 'Bordeaux',
      inseeCode: '33063',
      district: 'Caudéran',
      point: {
        type: 'Point',
        coordinates: [-0.6123, 44.8512],
      },
      precision: 'district',
      placement: null,
    },
    status: 'to_study',
    discardReason: null,
    discardedAt: null,
    renovation: {
      active: true,
      level: 'heavy',
      durationMonths: 2,
      notes: 'Devis salle de bain demandé.',
      items: [
        {
          id: 'i1',
          label: 'Salle de bain',
          amount: 9000,
          position: 0,
        },
        {
          id: 'i2',
          label: 'Cuisine',
          amount: 6500,
          position: 1,
        },
        {
          id: 'i3',
          label: 'Peintures',
          amount: 2500,
          position: 2,
        },
      ],
    },
    rentalPlan: {
      rentControl: 'auto',
      referenceRentPerM2: 14.1,
      targetRent: 890,
      marketRent: 900,
      demand: 'strong',
      coOwnershipAllowsRental: 'yes',
      decencyCompliant: 'unknown',
      rentalPermitRequired: 'no',
      notes: 'Profil étudiant ou jeune actif.',
    },
    fieldSources: {},
    lastCheckedAt: null,
    lastSeenOnlineAt: null,
    republishedFromId: null,
    sellerType: 'unknown',
    sellerName: null,
    sellerReference: null,
    sellerReferenceKey: null,
  } as Partial<Listing>)
}

/** Ce que l'ancien formulaire envoyait à l'enregistrement, avant validation par le contrat. */
export const LEGACY_SAVE_PAYLOAD = {
  title: '[Exemple] T3 lot 19',
  url: 'https://exemple.invalid/annonce/19',
  source: 'leboncoin',
  sourceLabel: '[Exemple] Agence',
  status: 'to_study',
  location: {
    addressRaw: null,
    commune: 'Bordeaux',
    district: 'Caudéran',
    point: {
      type: 'Point',
      coordinates: [-0.6123, 44.8512],
    },
    precision: 'district',
  },
  price: 214000,
  feesAmount: 8000,
  feesPayer: 'buyer',
  surface: 68,
  rooms: 3,
  bedrooms: 2,
  floorLabel: '2e sur 4, sans ascenseur',
  elevator: false,
  constructionYear: 1965,
  dpeClass: 'C',
  gesClass: 'C',
  dpeDate: '2024-03-15',
  heatingType: 'Individuel gaz',
  outdoor: 'Balcon 6 m², sud',
  parking: 'Cave, pas de parking',
  annualCharges: 1440,
  nonRecoverableChargesMonthly: 40,
  propertyTax: null,
  furnitureValue: 0,
  lotsCount: 24,
  syndic: 'Syndic professionnel',
  proceedings: 'Aucune connue',
  votedWorks: 'Ravalement 2025, quote-part à demander',
  description: '[Exemple] T3 traversant avec balcon plein sud.',
  notes: 'Demander l’âge de la chaudière.',
  renovation: {
    active: true,
    level: 'heavy',
    durationMonths: 2,
    items: [
      {
        label: 'Salle de bain',
        amount: 9000,
      },
      {
        label: 'Cuisine',
        amount: 6500,
      },
      {
        label: 'Peintures',
        amount: 2500,
      },
    ],
    notes: 'Devis salle de bain demandé.',
  },
  rentalPlan: {
    year: 2028,
    leaseType: 'unfurnished',
    rentControl: 'auto',
    referenceRentPerM2: 14.1,
    targetRent: 890,
    marketRent: 900,
    demand: 'strong',
    coOwnershipAllowsRental: 'yes',
    decencyCompliant: 'unknown',
    rentalPermitRequired: 'no',
    notes: 'Profil étudiant ou jeune actif.',
  },
  assumptionsOverride: null,
}

/** Les clés que l'ancien formulaire envoyait et qui ne partent plus (lot 19). */
export const REMOVED_IN_LOT_19 = {
  root: ['assumptionsOverride'],
  rentalPlan: ['year', 'leaseType'],
} as const
