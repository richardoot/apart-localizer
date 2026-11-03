import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import { financialsFromListing, sensitivityGrid } from '@apart/domain'
import { fakeEvaluated } from '@/test/fixtures'
import SensitivityTable from './SensitivityTable.vue'

const item = fakeEvaluated({ assumptionsOverride: null, renovation: null })
const financials = financialsFromListing(item.listing)

describe('SensitivityTable', () => {
  it('rend la grille prix × loyer, colore par verdict et encadre la cellule courante', () => {
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
    expect(table.text()).toMatch(/170\s000 €/)
    expect(table.text()).toMatch(/825 €\/mois/)
    expect(table.findAll('[data-verdict]').length).toBe(12)
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
    expect(wrapper.text()).toContain('3,2 %')
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
})
