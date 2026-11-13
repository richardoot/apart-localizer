/**
 * ADR 0046 : le loyer visé estimé d'après l'observatoire des loyers, la règle
 * du recalcul, la fusion, la réponse de la fiche et le journal. Table et
 * loyers inventés : aucune valeur réelle de l'observatoire.
 */
import { describe, expect, it } from 'vitest'
import { RentObservatoryTableSchema } from '@apart/contracts'
import {
  ESTIMATED_TARGET_RENT_STEP,
  TARGET_RENT_KEY,
  describeActivity,
  estimateTargetRent,
  listingAnswer,
  mergeTargetRentFill,
  targetRentAction,
  targetRentIsEstimated,
} from '../src/index.js'
import type {
  ListingAnswerInput,
  RentObservatoryInput,
  WhatsNewEvent,
} from '../src/index.js'

const plain = (text: string): string => text.replace(/[\u202f\u00a0]/g, ' ')

const stats = (
  rooms: number | null,
  medianPerM2: number,
  observations: number
) => ({
  rooms,
  medianPerM2,
  q1PerM2: medianPerM2 - 2,
  q3PerM2: medianPerM2 + 2,
  observations,
})

/** La commune fictive 33999 est partagée entre les zones 2 et 3 ; 33998 est entière en zone 5. */
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
      stats: [stats(null, 14, 900), stats(2, 15.2, 400)],
    },
    {
      zone: 3,
      label: 'Zone 3',
      stats: [stats(null, 12, 500), stats(2, 13, 200)],
    },
    {
      zone: 5,
      label: 'Zone 5',
      stats: [stats(null, 10, 300), stats(2, 11, 100)],
    },
  ],
  irisZones: { '339990101': 2, '339990102': 3 },
  communeZones: { '33998': 5 },
  source: {
    url: null,
    file: 'fictif.zip',
    sha256: 'fictif',
    importedAt: '2030-11-11T10:00:00.000Z',
  },
})

const input = (
  over: Partial<RentObservatoryInput> = {}
): RentObservatoryInput => ({
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
  it('adresse : la médiane de sa zone × surface, arrondie aux 5 euros, avec sa source', () => {
    const estimate = estimateTargetRent(input())
    // 15,2 × 41 = 623,2 → 625
    expect(estimate?.targetRent).toBe(625)
    expect(ESTIMATED_TARGET_RENT_STEP).toBe(5)
    expect(plain(estimate?.evidence ?? '')).toBe(
      'Observatoire des loyers 2030, zone 2, appartements 2 pièces : médiane 15,2 €/m² × 41 m² = 625 € par mois hors charges ; loyers de tous les locataires en place, à confirmer'
    )
    // Le loyer visé de l'entrée n'y change rien.
    expect(estimateTargetRent(input({ targetRent: 900 }))?.targetRent).toBe(625)
  })

  it('adresse à la rue : la zone dite « lue à la rue »', () => {
    const estimate = estimateTargetRent(input({ precision: 'street' }))
    expect(estimate?.targetRent).toBe(625)
    expect(estimate?.evidence).toContain('zone 2 (lue à la rue)')
  })

  it('quartier : la zone du centre du quartier, à confirmer avec l’adresse', () => {
    const estimate = estimateTargetRent(input({ precision: 'district' }))
    expect(estimate?.targetRent).toBe(625)
    expect(estimate?.evidence).toContain(
      'zone 2 (celle du centre du quartier, à confirmer avec l’adresse)'
    )
  })

  it('commune seule, partagée entre zones : la moyenne de ses zones pondérée par les logements enquêtés', () => {
    // (15,2 × 400 + 13 × 200) / 600 = 14,47 → 14,5 €/m² ; × 41 = 594,5 → 595.
    const expected = 595
    const centre = estimateTargetRent(input({ precision: 'commune' }))
    expect(centre?.targetRent).toBe(expected)
    expect(plain(centre?.evidence ?? '')).toBe(
      'Observatoire des loyers 2030, zones 2 et 3 de la commune (adresse inconnue : moyenne de leurs médianes pondérée par les logements enquêtés, à confirmer avec l’adresse), appartements 2 pièces : 14,5 €/m² × 41 m² = 595 € par mois hors charges ; loyers de tous les locataires en place, à confirmer'
    )
    // Sans repère, ou repère en limite de deux zones : la même règle.
    expect(
      estimateTargetRent(
        input({ hasPoint: false, precision: null, irisCodes: [] })
      )?.targetRent
    ).toBe(expected)
    expect(
      estimateTargetRent(
        input({
          precision: 'district',
          irisCodes: ['339990101', '339990102'],
        })
      )?.targetRent
    ).toBe(expected)
  })

  it('commune entière dans une zone : la médiane de la zone, même au centre de la commune', () => {
    const estimate = estimateTargetRent(
      input({ inseeCode: '33998', irisCodes: [], precision: 'commune' })
    )
    // 11 × 41 = 451 → 450
    expect(estimate?.targetRent).toBe(450)
    expect(estimate?.evidence).toContain('zone 5, appartements 2 pièces')
  })

  it('rien sans surface, sans nombre de pièces, sans ligne pour ce nombre de pièces, ni hors du périmètre', () => {
    expect(estimateTargetRent(input({ surface: null }))).toBeNull()
    expect(estimateTargetRent(input({ surface: 0 }))).toBeNull()
    expect(estimateTargetRent(input({ rooms: null }))).toBeNull()
    // Trois pièces : aucune zone n'a de ligne, à l'adresse comme à la commune.
    expect(estimateTargetRent(input({ rooms: 3 }))).toBeNull()
    expect(
      estimateTargetRent(input({ rooms: 3, precision: 'commune' }))
    ).toBeNull()
    expect(
      estimateTargetRent(input({ irisCodes: [], inseeCode: '33997' }))
    ).toBeNull()
    expect(
      estimateTargetRent(
        input({ hasPoint: false, inseeCode: null, irisCodes: [] })
      )
    ).toBeNull()
    expect(estimateTargetRent(input({ tables: [] }))).toBeNull()
    // Une surface minuscule qui s'arrondit à zéro.
    expect(estimateTargetRent(input({ surface: 0.1 }))).toBeNull()
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
