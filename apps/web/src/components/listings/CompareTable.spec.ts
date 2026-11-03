import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { CompareResult } from '@apart/contracts'
import { fakeEvaluated } from '@/test/fixtures'
import CompareTable from './CompareTable.vue'

const cheap = fakeEvaluated({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Moins cher',
  price: 120_000,
})
const dear = fakeEvaluated({
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Plus cher',
  price: 260_000,
})

const result: CompareResult = {
  items: [
    {
      ...cheap,
      ranks: {
        score: 1,
        grossYield: 1,
        netYield: 1,
        effort: 1,
        pricePerM2: 1,
        discount: 1,
      },
    },
    {
      ...dear,
      ranks: {
        score: 2,
        grossYield: 2,
        netYield: 2,
        effort: 2,
        pricePerM2: 2,
        discount: 2,
      },
    },
  ],
  best: {
    score: cheap.listing.id,
    grossYield: cheap.listing.id,
    netYield: cheap.listing.id,
    effort: cheap.listing.id,
    pricePerM2: cheap.listing.id,
    discount: cheap.listing.id,
  },
}

describe('CompareTable', () => {
  it('met les annonces en colonnes, les indicateurs en lignes, et marque la meilleure', async () => {
    const wrapper = mount(CompareTable, { props: { result } })
    const headers = wrapper.findAll('thead th').map(th => th.text())
    expect(headers).toEqual(['Indicateur', 'Moins cher', 'Plus cher'])
    const gross = wrapper.get('[data-row="grossYield"]')
    const cells = gross.findAll('td')
    expect(cells[0]?.attributes('data-best')).toBe('true')
    expect(cells[1]?.attributes('data-best')).toBeUndefined()
    expect(wrapper.get('[data-row="targetPrice"]').text()).toContain(
      'rendement brut'
    )
    expect(wrapper.get('[data-row="discount"]').text()).toContain(
      'Hors de portée'
    )
    expect(
      wrapper.get('[data-row="price"]').findAll('[data-best]')
    ).toHaveLength(0)
    await wrapper.findAll('thead button')[1]?.trigger('click')
    expect(wrapper.emitted('open')).toEqual([[dear.listing.id]])
  })
})
