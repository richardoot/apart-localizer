/**
 * Champs que le connecteur n'écrit pas (ADR 0040) : plafond d'encadrement,
 * loyer de marché retenu, sorties du géocodeur. Données fictives.
 */
import { describe, expect, it } from 'vitest'
import { ListingInputSchema, ListingUpdateSchema } from '@apart/contracts'
import type { FieldProvenanceMap } from '@apart/contracts'
import {
  CONNECTOR_ESTIMATED_KEYS,
  CONNECTOR_IGNORED_LOCATION_KEYS,
  CONNECTOR_IGNORED_RENTAL_KEYS,
  REFERENCE_RENT_KEY,
  connectorListingCreate,
  connectorListingUpdate,
  describeUnsupportedEstimates,
  restoreKeptProvenance,
  unsupportedEstimates,
} from '../src/index.js'

const AT = '2026-11-11T10:00:00.000Z'

const sent = ListingInputSchema.parse({
  title: '[Exemple] T2 rue Fictive',
  price: 190_000,
  surface: 45,
  location: {
    addressRaw: '1 rue Fictive',
    addressNormalized: '1 Rue Fictive 33000 Bordeaux',
    banId: '33063_9999_00001',
    commune: 'Bordeaux',
    inseeCode: '33063',
    district: 'Victoire',
  },
  rentalPlan: { targetRent: 700, referenceRentPerM2: 20, marketRent: 900 },
  fieldSources: {
    title: { source: 'ai', confidence: 0.9, recordedAt: AT },
    banId: { source: 'ai', recordedAt: AT },
    [REFERENCE_RENT_KEY]: { source: 'open_data', recordedAt: AT },
  },
})

describe('connectorListingCreate', () => {
  it('vide le plafond, le loyer de marché et les sorties du géocodeur', () => {
    const input = connectorListingCreate(sent)
    expect(input.rentalPlan?.referenceRentPerM2).toBeNull()
    expect(input.rentalPlan?.marketRent).toBeNull()
    expect(input.rentalPlan?.targetRent).toBe(700)
    expect(input.location.addressNormalized).toBeNull()
    expect(input.location.banId).toBeNull()
    expect(input.location.inseeCode).toBeNull()
    // Ce que l'annonce dit reste.
    expect(input.location.addressRaw).toBe('1 rue Fictive')
    expect(input.location.commune).toBe('Bordeaux')
    expect(input.location.district).toBe('Victoire')
    expect(input.title).toBe(sent.title)
    expect(input.surface).toBe(45)
  })

  it('retire la provenance des clés ignorées, garde les autres', () => {
    const { fieldSources } = connectorListingCreate(sent)
    expect(fieldSources).not.toHaveProperty('banId')
    expect(fieldSources).not.toHaveProperty(REFERENCE_RENT_KEY)
    expect(fieldSources.title?.confidence).toBe(0.9)
  })

  it('garde ce que le géocodeur du serveur a rendu (fiche de extract_listing)', () => {
    const geocoded: FieldProvenanceMap = {
      point: { source: 'open_data', recordedAt: AT },
      banId: { source: 'open_data', recordedAt: AT },
      inseeCode: { source: 'open_data', recordedAt: AT },
    }
    const input = connectorListingCreate({
      ...sent,
      location: {
        ...sent.location,
        point: { type: 'Point', coordinates: [-0.58, 44.84] },
        precision: 'exact',
      },
      fieldSources: geocoded,
    })
    expect(input.location.banId).toBe('33063_9999_00001')
    expect(input.location.inseeCode).toBe('33063')
    expect(input.fieldSources.banId?.source).toBe('open_data')
    // Sans provenance du géocodeur, l'adresse normalisée est ignorée.
    expect(input.location.addressNormalized).toBeNull()
    expect(input.location.point?.coordinates).toEqual([-0.58, 44.84])
  })

  it('une clé « open_data » sans point géocodé par le serveur ne compte pas', () => {
    const input = connectorListingCreate({
      ...sent,
      fieldSources: { banId: { source: 'open_data', recordedAt: AT } },
    })
    expect(input.location.banId).toBeNull()
  })

  it('sans phase 2, rien n’est créé', () => {
    expect(
      connectorListingCreate({ ...sent, rentalPlan: null }).rentalPlan
    ).toBeNull()
  })

  it('ne modifie pas l’entrée reçue', () => {
    const copy = structuredClone(sent)
    connectorListingCreate(sent)
    expect(sent).toEqual(copy)
  })
})

describe('connectorListingUpdate', () => {
  const current = {
    location: {
      addressNormalized: '2 Rue Réelle 33000 Bordeaux',
      banId: '33063_9999_00002',
      inseeCode: '33063',
    },
    rentalPlan: { referenceRentPerM2: 13, marketRent: 680 },
    fieldSources: {
      banId: { source: 'open_data', recordedAt: AT },
      [REFERENCE_RENT_KEY]: { source: 'open_data', recordedAt: AT },
    } satisfies FieldProvenanceMap,
  }

  it('la phase 2 remplacée garde le plafond et le loyer de marché de la fiche', () => {
    const patch = ListingUpdateSchema.parse({
      rentalPlan: { targetRent: 790, referenceRentPerM2: 25, marketRent: 1000 },
    })
    const result = connectorListingUpdate(patch, current)
    expect(result.patch.rentalPlan?.targetRent).toBe(790)
    expect(result.patch.rentalPlan?.referenceRentPerM2).toBe(13)
    expect(result.patch.rentalPlan?.marketRent).toBe(680)
    expect(result.keptKeys).toEqual([REFERENCE_RENT_KEY])
  })

  it('une fiche sans phase 2 en reçoit une sans plafond ni loyer de marché', () => {
    const patch = ListingUpdateSchema.parse({
      rentalPlan: { targetRent: 700, marketRent: 1000 },
    })
    const result = connectorListingUpdate(patch, {
      ...current,
      rentalPlan: null,
    })
    expect(result.patch.rentalPlan?.referenceRentPerM2).toBeNull()
    expect(result.patch.rentalPlan?.marketRent).toBeNull()
  })

  it('la localisation remplacée garde les sorties du géocodeur de la fiche', () => {
    const patch = ListingUpdateSchema.parse({
      location: {
        addressRaw: '3 rue Fictive',
        commune: 'Bordeaux',
        banId: 'INVENTE',
        inseeCode: '99999',
      },
    })
    const result = connectorListingUpdate(patch, current)
    expect(result.patch.location?.addressRaw).toBe('3 rue Fictive')
    expect(result.patch.location?.banId).toBe('33063_9999_00002')
    expect(result.patch.location?.inseeCode).toBe('33063')
    expect(result.patch.location?.addressNormalized).toBe(
      '2 Rue Réelle 33000 Bordeaux'
    )
    expect(result.keptKeys).toEqual([...CONNECTOR_IGNORED_LOCATION_KEYS])
  })

  it('retire de la provenance fournie les clés ignorées', () => {
    const patch = ListingUpdateSchema.parse({
      surface: 46,
      fieldSources: {
        surface: { source: 'user', recordedAt: AT },
        banId: { source: 'open_data', recordedAt: AT },
        [REFERENCE_RENT_KEY]: { source: 'open_data', recordedAt: AT },
      },
    })
    const result = connectorListingUpdate(patch, current)
    expect(Object.keys(result.patch.fieldSources ?? {})).toEqual(['surface'])
    expect(result.keptKeys).toEqual([])
  })

  it('un patch sans phase 2 ni localisation passe tel quel', () => {
    const patch = ListingUpdateSchema.parse({ price: 185_000 })
    expect(connectorListingUpdate(patch, current)).toEqual({
      patch,
      keptKeys: [],
      ignoredEstimates: [],
    })
  })

  it('retirer la phase 2 reste possible', () => {
    const patch = ListingUpdateSchema.parse({ rentalPlan: null })
    expect(connectorListingUpdate(patch, current).patch.rentalPlan).toBeNull()
  })
})

describe('restoreKeptProvenance', () => {
  it('reprend la provenance de la fiche pour les clés gardées', () => {
    const after: FieldProvenanceMap = {
      surface: { source: 'ai', recordedAt: AT },
      banId: { source: 'ai', recordedAt: AT },
      inseeCode: { source: 'ai', recordedAt: AT },
    }
    const before: FieldProvenanceMap = {
      banId: { source: 'open_data', recordedAt: AT },
    }
    expect(
      restoreKeptProvenance(after, before, ['banId', 'inseeCode'])
    ).toEqual({
      surface: { source: 'ai', recordedAt: AT },
      banId: { source: 'open_data', recordedAt: AT },
    })
  })

  it('les listes de clés sont celles annoncées', () => {
    expect([...CONNECTOR_IGNORED_RENTAL_KEYS]).toEqual([
      'referenceRentPerM2',
      'marketRent',
    ])
    expect([...CONNECTOR_IGNORED_LOCATION_KEYS]).toEqual([
      'addressNormalized',
      'banId',
      'inseeCode',
    ])
  })
})

describe('montants estimables : lus avec leur extrait ou dictés', () => {
  const read = { source: 'ai' as const, recordedAt: AT }

  it('une valeur « ai » sans extrait est écartée, avec ou sans entrée de provenance', () => {
    expect(
      unsupportedEstimates(
        { propertyTax: 900, nonRecoverableChargesMonthly: 30 },
        { propertyTax: read },
        'ai'
      )
    ).toEqual(['propertyTax', 'nonRecoverableChargesMonthly'])
  })

  it('une valeur lue avec son extrait, ou dictée, est gardée', () => {
    expect(
      unsupportedEstimates(
        { propertyTax: 900, nonRecoverableChargesMonthly: 30 },
        {
          propertyTax: { ...read, evidence: 'Taxe foncière : 900 €' },
          nonRecoverableChargesMonthly: { source: 'user', recordedAt: AT },
        },
        'ai'
      )
    ).toEqual([])
    expect(unsupportedEstimates({ propertyTax: 900 }, {}, 'user')).toEqual([])
  })

  it('un extrait vide ne compte pas ; une valeur absente ou nulle non plus', () => {
    expect(
      unsupportedEstimates(
        { propertyTax: 900 },
        { propertyTax: { ...read, evidence: '  ' } },
        'ai'
      )
    ).toEqual(['propertyTax'])
    expect(unsupportedEstimates({ propertyTax: null }, {}, 'ai')).toEqual([])
    expect(unsupportedEstimates({}, null, 'ai')).toEqual([])
  })

  it('la provenance du champ l’emporte sur celle de l’appel', () => {
    expect(
      unsupportedEstimates({ propertyTax: 900 }, { propertyTax: read }, 'user')
    ).toEqual(['propertyTax'])
  })

  it('création : les montants sans appui sont vidés, leur provenance retirée', () => {
    const input = connectorListingCreate(
      {
        ...sent,
        propertyTax: 750,
        nonRecoverableChargesMonthly: 25,
        annualCharges: 1200,
        fieldSources: {
          nonRecoverableChargesMonthly: {
            ...read,
            evidence: 'dont 25 €/mois non récupérables',
          },
        },
      },
      'ai'
    )
    expect(input.propertyTax).toBeNull()
    expect(input.nonRecoverableChargesMonthly).toBe(25)
    expect(input.annualCharges).toBe(1200)
    expect(input.fieldSources).not.toHaveProperty('propertyTax')
  })

  it('modification : le montant sans appui n’est pas modifié, il est signalé', () => {
    const patch = ListingUpdateSchema.parse({
      propertyTax: 750,
      surface: 46,
      fieldSources: { propertyTax: read },
    })
    const result = connectorListingUpdate(
      patch,
      {
        location: { addressNormalized: null, banId: null, inseeCode: null },
        rentalPlan: null,
        fieldSources: {},
      },
      'ai'
    )
    expect(result.patch).not.toHaveProperty('propertyTax')
    expect(result.patch.surface).toBe(46)
    expect(result.patch.fieldSources).toEqual({})
    expect(result.ignoredEstimates).toEqual(['propertyTax'])
  })

  it('dit ce qui n’est pas gardé et comment le faire garder', () => {
    expect(describeUnsupportedEstimates([])).toBeNull()
    const one = describeUnsupportedEstimates(['propertyTax'])
    expect(one).toContain('Non gardé : Taxe foncière.')
    expect(one).toContain('fieldSources.<champ>.evidence')
    expect(one).toContain('« user »')
    expect(
      describeUnsupportedEstimates([...CONNECTOR_ESTIMATED_KEYS])
    ).toContain('Non gardés : Taxe foncière, Charges non récupérables.')
  })
})
