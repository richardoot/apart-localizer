import { describe, expect, it } from 'vitest'
import { NO_CRITERIA_FIT } from '@apart/contracts'
import type { EvaluatedListing, ListingCriteriaFit } from '@apart/contracts'
import {
  MCP_TOOL_NAMES,
  describeFitDetail,
  describeFitRefresh,
  describeListFit,
} from './mcp-tools'

/** Lot 14 : l'adéquation aux critères dans les textes du connecteur. Données fictives. */
const CRITERIA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const fit: ListingCriteriaFit = {
  ...NO_CRITERIA_FIT,
  level: 'to_confirm',
  activeCriteria: 2,
  criteriaId: CRITERIA,
  name: 'Caudéran fictif',
  reasons: ['quartier à cheval sur le périmètre : adresse à préciser'],
  locationPending: true,
  criteria: [
    {
      criteriaId: CRITERIA,
      name: 'Caudéran fictif',
      level: 'to_confirm',
      reasons: ['quartier à cheval sur le périmètre : adresse à préciser'],
      checks: [],
      locationPending: true,
      since: '2026-11-05T09:00:00.000Z',
    },
    {
      criteriaId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      name: 'Mérignac fictif',
      level: 'in',
      reasons: [],
      checks: [],
      locationPending: false,
      since: '2026-11-05T09:00:00.000Z',
    },
  ],
}

const item = (criteriaFit: ListingCriteriaFit) =>
  ({ criteriaFit }) as unknown as EvaluatedListing

describe('MCP lot 14', () => {
  it('aucun outil nouveau au lot 14 : trente-quatre outils avec les lots 15 et 16, aucun de suppression', () => {
    expect(MCP_TOOL_NAMES).toHaveLength(34)
    expect(MCP_TOOL_NAMES.some(n => n.startsWith('delete'))).toBe(false)
  })

  it('détail de l’adéquation d’une annonce, critère par critère', () => {
    expect(describeFitDetail(item({ ...NO_CRITERIA_FIT }))).toContain(
      'aucun critère actif'
    )
    const text = describeFitDetail(item(fit))
    expect(text).toContain(
      'Adéquation : À confirmer — « Caudéran fictif » : Quartier à cheval sur le périmètre : adresse à préciser'
    )
    expect(text).toContain(
      '  - « Caudéran fictif » : À confirmer — Quartier à cheval sur le périmètre : adresse à préciser (préciser l’adresse tranchera)'
    )
    expect(text).toContain('  - « Mérignac fictif » : Dans les critères')
  })

  it('compteurs de la liste et changements après une écriture de critère', () => {
    expect(
      describeListFit({
        activeCriteria: [],
        counts: { in: 3, to_confirm: 0, margin: 0, out: 0 },
        kept: 0,
        criteriaId: null,
      })
    ).toBe(
      'Aucun critère actif : toutes les annonces sont « dans les critères ».'
    )
    expect(
      describeListFit({
        activeCriteria: [{ id: CRITERIA, name: 'Caudéran fictif' }],
        counts: { in: 2, to_confirm: 2, margin: 2, out: 4 },
        kept: 1,
        criteriaId: CRITERIA,
      })
    ).toBe(
      'Adéquation (critère choisi) : 2 dans les critères, 2 à confirmer, 2 à la marge, 4 hors critères (dont 1 gardée(s) dans la liste : offre en cours ou visite prévue).'
    )
    expect(describeFitRefresh(null)).toBeNull()
    expect(
      describeFitRefresh({ listings: 4, entered: 0, left: 0, changed: 0 })
    ).toBe('Adéquation : aucun changement sur 4 annonce(s).')
    expect(
      describeFitRefresh({ listings: 4, entered: 1, left: 2, changed: 1 })
    ).toBe(
      'Adéquation sur 4 annonce(s) : 1 entrée(s), 2 sortie(s) vers « hors critères », 1 autre(s) changement(s) de niveau.'
    )
  })
})
