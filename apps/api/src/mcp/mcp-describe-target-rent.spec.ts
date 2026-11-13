/**
 * ADR 0046 : le connecteur dit le loyer visé d'une annonce, et « estimé »
 * quand l'application l'a posé d'après l'observatoire des loyers. Données
 * fictives.
 */
import { describe, expect, it } from 'vitest'
import type { EvaluatedListing } from '@apart/contracts'
import { NO_CRITERIA_FIT } from '@apart/contracts'
import { describeListing } from './mcp-tools'

const n = (value: string) => value.replace(/[\u202f\u00a0]/g, ' ')

const item = (
  rentalPlan: { targetRent: number | null } | null,
  fieldSources: Record<string, unknown> = {}
) =>
  ({
    listing: {
      id: '11111111-1111-4111-8111-111111111111',
      title: '[Exemple] T2 40 m²',
      status: 'to_study',
      price: 150_000,
      surface: 40,
      sellerType: 'unknown',
      sellerName: null,
      sellerReference: null,
      rentalPlan,
      fieldSources,
      location: {
        precision: 'exact',
        point: null,
        placement: null,
        commune: 'Commune fictive',
        district: null,
      },
    },
    evaluation: {
      metrics: { grossYield: 0.05, effort: -100, verdict: 'to_dig' },
      rental: { verdict: 'ok' },
    },
    isNewForMe: false,
    distanceMeters: null,
    criteriaChanges: null,
    criteriaFit: NO_CRITERIA_FIT,
    links: [],
  }) as unknown as EvaluatedListing

describe('ADR 0046 : le loyer visé au connecteur', () => {
  it('estimé : dit comme une estimation à confirmer avec le membre', () => {
    const text = n(
      describeListing(
        item(
          { targetRent: 600 },
          {
            'rentalPlan.targetRent': {
              source: 'estimated',
              recordedAt: '2030-11-13T10:00:00.000Z',
            },
          }
        )
      )
    )
    expect(text).toContain(
      '40 m² · loyer visé 600 €/mois (estimé d’après l’observatoire des loyers, à confirmer avec le membre) · brut'
    )
  })

  it('donné : le montant seul ; absent : à renseigner', () => {
    expect(n(describeListing(item({ targetRent: 700 })))).toContain(
      'loyer visé 700 €/mois · brut'
    )
    expect(describeListing(item(null))).toContain('loyer visé à renseigner')
  })
})
