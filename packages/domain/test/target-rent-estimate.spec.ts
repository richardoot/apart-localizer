/**
 * ADR 0046 : le loyer visé estimé d'après l'observatoire des loyers, la règle
 * du recalcul, la fusion, la réponse de la fiche et le journal. Table et
 * loyers inventés : aucune valeur réelle de l'observatoire.
 */
import { describe, expect, it } from 'vitest'
import { RentObservatoryTableSchema } from '@apart/contracts'
import type { RentObservatoryLookup } from '@apart/contracts'
import {
  ESTIMATED_TARGET_RENT_STEP,
  TARGET_RENT_KEY,
  describeActivity,
  estimatedTargetRent,
  listingAnswer,
  lookupRentObservatory,
  mergeTargetRentFill,
  targetRentAction,
  targetRentIsEstimated,
} from '../src/index.js'
import type { ListingAnswerInput, WhatsNewEvent } from '../src/index.js'

const plain = (text: string): string => text.replace(/[\u202f\u00a0]/g, ' ')

const TABLE = RentObservatoryTableSchema.parse({
  territory: 'bordeaux',
  observatory: 'L9900',
  year: 2030,
  observedAt: '2030-01-01',
  housingType: 'apartment',
  zones: [
    {
      zone: 2,
      label: 'Zone 2',
      stats: [
        {
          rooms: null,
          medianPerM2: 14,
          q1PerM2: 12,
          q3PerM2: 16,
          observations: 900,
        },
        {
          rooms: 2,
          medianPerM2: 15.2,
          q1PerM2: 13,
          q3PerM2: 17,
          observations: 400,
        },
      ],
    },
  ],
  irisZones: { '339990101': 2 },
  communeZones: {},
  source: {
    url: null,
    file: 'fictif.zip',
    sha256: 'fictif',
    importedAt: '2030-11-11T10:00:00.000Z',
  },
})

const lookup = (
  over: Partial<Parameters<typeof lookupRentObservatory>[0]> = {}
): RentObservatoryLookup =>
  lookupRentObservatory({
    tables: [TABLE],
    hasPoint: true,
    precision: 'exact',
    inseeCode: '33999',
    irisCodes: ['339990101'],
    rooms: 2,
    surface: 41,
    targetRent: null,
    ...over,
  })

describe('ADR 0046 : le loyer visé estimé', () => {
  it('médiane du nombre de pièces × surface, arrondie aux 5 euros, avec sa source', () => {
    const estimate = estimatedTargetRent(lookup(), 41)
    // 15,2 × 41 = 623,2 → 625
    expect(estimate?.targetRent).toBe(625)
    expect(ESTIMATED_TARGET_RENT_STEP).toBe(5)
    expect(plain(estimate?.evidence ?? '')).toBe(
      'Observatoire des loyers 2030, zone 2, appartements 2 pièces : médiane 15,2 €/m² × 41 m² = 625 € par mois hors charges ; loyers de tous les locataires en place, à confirmer'
    )
  })

  it('une adresse à la rue : estimé, la zone dite « lue à la rue »', () => {
    const estimate = estimatedTargetRent(lookup({ precision: 'street' }), 41)
    expect(estimate?.targetRent).toBe(625)
    expect(estimate?.evidence).toContain('zone 2 (lue à la rue)')
  })

  it('rien sans zone sûre, sans ligne pour ce nombre de pièces ni sans surface', () => {
    // Repère au quartier : « à vérifier ».
    expect(
      estimatedTargetRent(lookup({ precision: 'district' }), 41)
    ).toBeNull()
    // Trois pièces : seulement la médiane de toutes tailles.
    expect(estimatedTargetRent(lookup({ rooms: 3 }), 41)).toBeNull()
    // Pièces inconnues.
    expect(estimatedTargetRent(lookup({ rooms: null }), 41)).toBeNull()
    expect(estimatedTargetRent(lookup(), null)).toBeNull()
    expect(estimatedTargetRent(lookup(), 0)).toBeNull()
    // Hors du périmètre.
    expect(
      estimatedTargetRent(lookup({ irisCodes: [], inseeCode: '33997' }), 41)
    ).toBeNull()
    // Une surface minuscule qui s'arrondit à zéro.
    expect(estimatedTargetRent(lookup(), 0.1)).toBeNull()
  })

  it('l’estimation se reconnaît à sa provenance', () => {
    expect(TARGET_RENT_KEY).toBe('rentalPlan.targetRent')
    expect(
      targetRentIsEstimated({
        [TARGET_RENT_KEY]: { source: 'estimated', recordedAt: 'x' },
      })
    ).toBe(true)
    expect(
      targetRentIsEstimated({
        [TARGET_RENT_KEY]: { source: 'user', recordedAt: 'x' },
      })
    ).toBe(false)
    expect(targetRentIsEstimated({})).toBe(false)
    expect(targetRentIsEstimated(null)).toBe(false)
  })
})

describe('ADR 0046 : la règle du recalcul', () => {
  const estimate = { targetRent: 625, evidence: 'Observatoire' }
  const estimated = {
    [TARGET_RENT_KEY]: { source: 'estimated' as const, recordedAt: 'x' },
  }

  it('un loyer vide reçoit l’estimation', () => {
    expect(
      targetRentAction({ current: null, fieldSources: {}, estimate })
    ).toEqual({ kind: 'set', targetRent: 625, evidence: 'Observatoire' })
  })

  it('un loyer estimé suit l’estimation du moment, et part quand elle ne vaut plus', () => {
    expect(
      targetRentAction({ current: 600, fieldSources: estimated, estimate })
    ).toEqual({ kind: 'set', targetRent: 625, evidence: 'Observatoire' })
    expect(
      targetRentAction({
        current: 600,
        fieldSources: estimated,
        estimate: null,
      })
    ).toEqual({ kind: 'clear' })
  })

  it('un loyer donné (membre, Claude, annonce) n’est jamais touché', () => {
    for (const source of ['user', 'ai', 'listing'] as const) {
      expect(
        targetRentAction({
          current: 700,
          fieldSources: { rentalPlan: { source, recordedAt: 'x' } },
          estimate,
        })
      ).toEqual({ kind: 'keep' })
    }
    // Sans estimation ni loyer : rien.
    expect(
      targetRentAction({ current: null, fieldSources: {}, estimate: null })
    ).toEqual({ kind: 'keep' })
  })
})

describe('ADR 0046 : la fusion de deux fiches', () => {
  const estimated = {
    [TARGET_RENT_KEY]: { source: 'estimated' as const, recordedAt: 'x' },
  }
  const given = { rentalPlan: { source: 'user' as const, recordedAt: 'x' } }

  it('un loyer donné sur l’absorbée remplace le loyer estimé ou vide de la gardée', () => {
    const fill = mergeTargetRentFill(
      { rentalPlan: { targetRent: 625 }, fieldSources: estimated },
      { rentalPlan: { targetRent: 700 }, fieldSources: given }
    )
    expect(fill?.targetRent).toBe(700)
    expect(fill?.line).toMatchObject({
      field: TARGET_RENT_KEY,
      label: 'Loyer visé',
    })
    expect(plain(fill?.line.kept ?? '')).toBe('625 € (estimé)')
    expect(plain(fill?.line.other ?? '')).toBe('700 €')
    expect(
      mergeTargetRentFill(
        { rentalPlan: { targetRent: null }, fieldSources: {} },
        { rentalPlan: { targetRent: 700 }, fieldSources: given }
      )?.line.kept
    ).toBeNull()
  })

  it('rien quand la gardée a son propre loyer, quand l’absorbée n’a qu’une estimation, ou sans phase 2 gardée', () => {
    expect(
      mergeTargetRentFill(
        { rentalPlan: { targetRent: 650 }, fieldSources: given },
        { rentalPlan: { targetRent: 700 }, fieldSources: given }
      )
    ).toBeNull()
    expect(
      mergeTargetRentFill(
        { rentalPlan: { targetRent: 625 }, fieldSources: estimated },
        { rentalPlan: { targetRent: 640 }, fieldSources: estimated }
      )
    ).toBeNull()
    expect(
      mergeTargetRentFill(
        { rentalPlan: { targetRent: 625 }, fieldSources: estimated },
        { rentalPlan: { targetRent: null }, fieldSources: {} }
      )
    ).toBeNull()
    expect(
      mergeTargetRentFill(
        { rentalPlan: { targetRent: 625 }, fieldSources: estimated },
        { rentalPlan: null, fieldSources: {} }
      )
    ).toBeNull()
    // La phase 2 entière passe : ce n'est pas un loyer à compléter.
    expect(
      mergeTargetRentFill(
        { rentalPlan: null, fieldSources: {} },
        { rentalPlan: { targetRent: 700 }, fieldSources: given }
      )
    ).toBeNull()
  })
})

describe('ADR 0046 : ce que la fiche et le journal en disent', () => {
  const input = (
    over: Partial<ListingAnswerInput> = {}
  ): ListingAnswerInput => ({
    price: 200_000,
    hasRent: true,
    verdict: 'target',
    failures: [],
    nearMisses: [],
    fit: null,
    targetPrice: null,
    ...over,
  })

  it('la raison de rentabilité dit « avec un loyer visé estimé »', () => {
    expect(listingAnswer(input({ rentEstimated: true })).reasons[0]).toBe(
      'Dans la cible de rentabilité au prix affiché, avec un loyer visé estimé.'
    )
    expect(
      listingAnswer(
        input({
          rentEstimated: true,
          verdict: 'off_target',
          failures: ['gross_yield'],
        })
      ).reasons[0]
    ).toBe(
      'Hors de la cible de rentabilité : rendement brut trop faible, avec un loyer visé estimé.'
    )
    expect(listingAnswer(input()).reasons[0]).toBe(
      'Dans la cible de rentabilité au prix affiché.'
    )
  })

  const event = (after: unknown): WhatsNewEvent => ({
    id: 'e1',
    action: 'listing.enriched',
    channel: 'system',
    actorMemberId: null,
    listingId: 'l1',
    before: null,
    after,
    createdAt: '2030-11-13T10:00:00.000Z',
  })

  it('le journal dit le loyer estimé posé ou retiré', () => {
    expect(
      plain(describeActivity(event({ targetRentEstimated: 625 })).summary)
    ).toBe(
      'données ouvertes mises à jour (tram, plafond, marché, quartier, équipements) ; loyer visé estimé à 625 € par mois (observatoire des loyers, à confirmer)'
    )
    expect(describeActivity(event({ targetRentEstimated: null })).summary).toBe(
      'données ouvertes mises à jour (tram, plafond, marché, quartier, équipements) ; loyer visé estimé retiré (plus d’estimation sûre)'
    )
    expect(describeActivity(event({})).summary).toBe(
      'données ouvertes mises à jour (tram, plafond, marché, quartier, équipements)'
    )
  })
})
