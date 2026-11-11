/**
 * Lot 25 : les tableaux larges (projection, régimes, sensibilité, critères du
 * prix cible) défilent dans leur cadre, nommé et atteignable au clavier, avec
 * une ligne qui le dit au téléphone, la première colonne collée ; TRI, VAN et
 * cash-flow ont leur « ? ». Données fictives évaluées par le vrai `domain`.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { AssumptionsSchema, DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import {
  financialsFromListing,
  sensitivityGrid,
  studyInputFromListing,
} from '@apart/domain'
import { fakeEvaluated, fakeTargetPriceReport } from '@/test/fixtures'
import SensitivityTable from '@/components/listings/SensitivityTable.vue'
import TargetCriteriaTable from '@/components/listings/TargetCriteriaTable.vue'
import StatTile from '@/components/ui/StatTile.vue'
import ProjectionPanel from './ProjectionPanel.vue'

const A = AssumptionsSchema.parse({
  ...DEFAULT_ASSUMPTIONS,
  purchaseDate: '2026-01-01',
  rentalStartDate: '2028-01-01',
  currentRent: 850,
})
const item = fakeEvaluated()

function regions(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('[data-scroll-table]').map(r => ({
    role: r.attributes('role'),
    label: r.attributes('aria-label'),
    tabindex: r.attributes('tabindex'),
    classes: r.classes(),
  }))
}

describe('Lot 25 : la projection au téléphone', () => {
  const wrapper = () =>
    mount(ProjectionPanel, {
      props: {
        listingId: item.listing.id,
        title: item.listing.title,
        input: studyInputFromListing(item.listing, A),
        assumptions: A,
      },
    })

  it('les deux tableaux défilent dans un cadre nommé, la première colonne collée', () => {
    const w = wrapper()
    expect(regions(w)).toEqual([
      expect.objectContaining({
        role: 'region',
        label: 'Comparaison des régimes fiscaux',
        tabindex: '0',
        classes: expect.arrayContaining([
          'overflow-x-auto',
          'overscroll-x-contain',
        ]),
      }),
      expect.objectContaining({
        role: 'region',
        label: 'Tableau annuel de la projection',
      }),
    ])
    expect(
      w.findAll('[data-testid="scroll-hint"]').map(h => h.classes())
    ).toEqual([
      expect.arrayContaining(['sm:hidden']),
      expect.arrayContaining(['sm:hidden']),
    ])
    expect(w.get('[data-testid="rows"]').classes()).toContain('text-sm')
    expect(w.get('[data-testid="rows"] th').classes()).toContain('sticky')
    expect(w.get('[data-testid="regimes"] th').classes()).toContain('sticky')
  })

  it('TRI, VAN et cash-flow ont leur « ? »', () => {
    const terms = wrapper()
      .findAll('[data-term]')
      .map(b => b.attributes('data-term'))
    expect(terms.filter(t => t === 'irr').length).toBeGreaterThanOrEqual(3)
    expect(terms).toContain('npv')
    expect(terms).toContain('cash_flow_after_tax')
  })

  it('StatTile sans terme reste comme avant', () => {
    const tile = mount(StatTile, { props: { label: 'Prix', value: '1 €' } })
    expect(tile.find('[data-term]').exists()).toBe(false)
  })
})

describe('Lot 25 : sensibilité et critères du prix cible', () => {
  it('la sensibilité défile dans son cadre, en-têtes de ligne collés', () => {
    const grid = sensitivityGrid(financialsFromListing(item.listing), A, {
      rowAxis: 'price',
      colAxis: 'rent',
    })
    const w = mount(SensitivityTable, {
      props: { grid, rowAxis: 'price', colAxis: 'rent' },
    })
    expect(regions(w)).toEqual([
      expect.objectContaining({
        role: 'region',
        label: 'Tableau de sensibilité',
        tabindex: '0',
      }),
    ])
    expect(w.get('[data-testid="sensitivity-grid"]').classes()).toContain(
      'text-sm'
    )
    expect(w.get('tbody th').classes()).toContain('sticky')
  })

  it('les critères du prix cible défilent dans leur cadre', () => {
    const report = fakeTargetPriceReport(item)
    const w = mount(TargetCriteriaTable, {
      props: {
        targetPrice: report.targetPrice,
        assumptions: DEFAULT_ASSUMPTIONS,
        rent: item.evaluation.metrics.rent,
      },
    })
    expect(regions(w)).toEqual([
      expect.objectContaining({
        role: 'region',
        label: 'Prix maximal par critère',
      }),
    ])
    expect(w.get('tbody th').classes()).toContain('sticky')
  })
})
