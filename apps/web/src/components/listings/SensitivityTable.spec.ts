import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import { financialsFromListing, sensitivityGrid } from '@apart/domain'
import { fakeEvaluated } from '@/test/fixtures'
import SensitivityTable from './SensitivityTable.vue'

const item = fakeEvaluated({ renovation: null })
const financials = financialsFromListing(item.listing)

describe('SensitivityTable', () => {
  it('rend la grille prix affiché × loyer, verdict par couleur et par symbole, cellule courante encadrée', () => {
    const grid = sensitivityGrid(financials, DEFAULT_ASSUMPTIONS, {
      rowAxis: 'price',
      colAxis: 'rent',
    })
    const wrapper = mount(SensitivityTable, {
      props: { grid, rowAxis: 'price', colAxis: 'rent' },
    })
    const table = wrapper.get('[data-testid="sensitivity-grid"]')
    expect(table.findAll('tbody tr')).toHaveLength(4)
    expect(table.findAll('tbody tr')[0]?.findAll('td')).toHaveLength(3)
    expect(table.findAll('[data-current="true"]')).toHaveLength(1)
    expect(table.get('[data-current="true"]').attributes('data-verdict')).toBe(
      'off_target'
    )
    expect(table.get('[data-current="true"]').text()).toContain('✗')
    expect(table.text()).toMatch(/170\s000 €/)
    expect(table.text()).toMatch(/825 €\/mois/)
    expect(table.findAll('[data-verdict]').length).toBe(12)
    // Les axes sont nommés « Prix affiché » ; aucune information au survol.
    expect(table.get('thead th').text()).toContain('Prix affiché ↓')
    expect(table.findAll('[title]')).toHaveLength(0)
  })

  it('explique lignes, colonnes et cases, et met sous chaque prix le coût tout compris', () => {
    const grid = sensitivityGrid(financials, DEFAULT_ASSUMPTIONS, {
      rowAxis: 'price',
      colAxis: 'rent',
    })
    const wrapper = mount(SensitivityTable, {
      props: { grid, rowAxis: 'price', colAxis: 'rent' },
    })
    const explanation = wrapper.get('[data-testid="sensitivity-explanation"]')
    expect(explanation.text()).toContain(
      'Lignes : prix affiché, avec le coût tout compris qu’il entraîne'
    )
    expect(explanation.text()).toContain('Colonnes : loyer mensuel')
    expect(explanation.text()).toContain('calculés sur le coût tout compris')
    const costs = wrapper.findAll('[data-testid="row-cost"]').map(c => c.text())
    expect(costs).toHaveLength(4)
    expect(costs[3]).toMatch(/→ 220\s000 € tout compris/)
    expect(
      wrapper.findAll('[data-testid="row-tag"]').map(t => t.text())
    ).toEqual(['· affiché'])
  })

  it('repère et libelle la ligne du prix cible quand elle est dans la grille', () => {
    const grid = sensitivityGrid(financials, DEFAULT_ASSUMPTIONS, {
      rowAxis: 'price',
      colAxis: 'rent',
      includeTargetPrice: true,
    })
    const wrapper = mount(SensitivityTable, {
      props: { grid, rowAxis: 'price', colAxis: 'rent' },
    })
    const target = wrapper.get('tbody tr[data-target="true"]')
    expect(target.text()).toContain('prix cible')
    expect(target.get('th').classes()).toContain('bg-accent-soft')
    // Au prix cible et au loyer actuel : dans la cible.
    expect(target.findAll('td')[1]?.get('button').text()).toContain('✓')
    expect(wrapper.text()).toContain(
      '« Prix cible » : le prix affiché le plus haut'
    )
  })

  it('montre sans survol le détail de la case choisie : coût, mensualité, net, verdict', async () => {
    const grid = sensitivityGrid(financials, DEFAULT_ASSUMPTIONS, {
      rowAxis: 'price',
      colAxis: 'rent',
    })
    const wrapper = mount(SensitivityTable, {
      props: { grid, rowAxis: 'price', colAxis: 'rent' },
    })
    // D'abord la situation actuelle.
    const detail = () => wrapper.get('[data-testid="sensitivity-detail"]')
    expect(detail().text()).toContain('situation actuelle')
    expect(detail().get('[data-testid="detail-cost"]').text()).toMatch(
      /220\s000 €/
    )
    expect(detail().get('[data-testid="detail-payment"]').text()).toMatch(
      /931 €\/mois/
    )
    expect(detail().get('[data-testid="detail-verdict"]').text()).toContain(
      'Hors cible'
    )
    const first = wrapper.findAll('tbody button')[0]
    expect(first?.attributes('aria-pressed')).toBe('false')
    expect(first?.attributes('aria-label')).toMatch(
      /Prix affiché 170\s000 €, loyer 675 €\/mois : rendement brut .*, effort .*/
    )
    await first?.trigger('click')
    expect(first?.attributes('aria-pressed')).toBe('true')
    expect(detail().text()).not.toContain('situation actuelle')
    expect(detail().get('[data-testid="detail-cost"]').text()).toMatch(
      /187\s750 €/
    )
    expect(detail().get('[data-testid="detail-net"]').text()).toMatch(/%/)
  })

  it('défile dans sa boîte sur mobile', () => {
    const grid = sensitivityGrid(financials, DEFAULT_ASSUMPTIONS, {
      rowAxis: 'price',
      colAxis: 'rent',
    })
    const wrapper = mount(SensitivityTable, {
      props: { grid, rowAxis: 'price', colAxis: 'rent' },
    })
    expect(wrapper.get('[data-testid="sensitivity-scroll"]').classes()).toEqual(
      expect.arrayContaining(['overflow-x-auto', 'max-w-full'])
    )
  })

  it('change les axes et les échange quand on choisit deux fois le même', async () => {
    const grid = sensitivityGrid(financials, DEFAULT_ASSUMPTIONS, {
      rowAxis: 'rate',
      colAxis: 'rent',
    })
    const wrapper = mount(SensitivityTable, {
      props: { grid, rowAxis: 'rate', colAxis: 'rent', loading: true },
    })
    expect(wrapper.text()).toContain('calcul…')
    expect(wrapper.text()).toContain('3,15 %')
    expect(wrapper.findAll('[data-testid="row-cost"]')).toHaveLength(0)
    expect(
      wrapper.findAll('[data-testid="row-tag"]').map(t => t.text())
    ).toEqual(['· actuel'])
    expect(
      wrapper.get('[data-testid="sensitivity-explanation"]').text()
    ).not.toContain('qu’il entraîne')
    await wrapper.get('select[aria-label="Axe des lignes"]').setValue('rent')
    expect(wrapper.emitted('update:colAxis')).toEqual([['rate']])
    expect(wrapper.emitted('update:rowAxis')).toEqual([['rent']])
    await wrapper
      .get('select[aria-label="Axe des colonnes"]')
      .setValue('duration')
    expect(wrapper.emitted('update:colAxis')?.[1]).toEqual(['duration'])
    const empty = mount(SensitivityTable, {
      props: { grid: null, rowAxis: 'price', colAxis: 'rent' },
    })
    expect(empty.text()).toContain('se calcule dès que')
  })

  it('prix affiché en colonnes : le coût tout compris passe sous chaque colonne', async () => {
    const grid = sensitivityGrid(financials, DEFAULT_ASSUMPTIONS, {
      rowAxis: 'rent',
      colAxis: 'price',
      includeTargetPrice: true,
    })
    const wrapper = mount(SensitivityTable, {
      props: { grid, rowAxis: 'rent', colAxis: 'price' },
    })
    const headers = wrapper.findAll('thead th').map(th => th.text())
    expect(headers.filter(h => h.includes('tout compris'))).toHaveLength(5)
    expect(wrapper.get('thead th[data-target="true"]').text()).toContain(
      'prix cible'
    )
    expect(
      wrapper.get('[data-testid="sensitivity-explanation"]').text()
    ).toContain('Colonnes : prix affiché, avec le coût tout compris')
    // Choisir la colonne du prix cible le dit dans le détail.
    const targetCol = grid.cols.findIndex(c => c.isTarget)
    await wrapper
      .findAll('tbody tr')[0]
      ?.findAll('td')
      [targetCol]?.get('button')
      .trigger('click')
    expect(wrapper.get('[data-testid="sensitivity-detail"]').text()).toContain(
      '(prix cible)'
    )
  })

  it('lot 19 : dans le dépli de Négocier, sans cadre ni titre visible', () => {
    const grid = sensitivityGrid(financials, DEFAULT_ASSUMPTIONS, {
      rowAxis: 'price',
      colAxis: 'rent',
    })
    const framed = mount(SensitivityTable, {
      props: { grid, rowAxis: 'price', colAxis: 'rent' },
    })
    expect(framed.get('section').classes()).toContain('border')
    expect(framed.get('#sensitivity-title').classes()).not.toContain('sr-only')
    const bare = mount(SensitivityTable, {
      props: { grid, rowAxis: 'price', colAxis: 'rent', bare: true },
    })
    expect(bare.get('section').classes()).not.toContain('border')
    expect(bare.get('#sensitivity-title').classes()).toContain('sr-only')
    expect(bare.find('[data-testid="sensitivity-grid"]').exists()).toBe(true)
  })
})
