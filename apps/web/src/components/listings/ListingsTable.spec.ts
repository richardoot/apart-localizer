import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { fakeEvaluated } from '@/test/fixtures'
import ListingsTable from './ListingsTable.vue'

const cheap = fakeEvaluated(
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Moins cher',
    price: 120_000,
  },
  { isNewForMe: true }
)
const dear = fakeEvaluated({
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Plus cher',
  price: 260_000,
  dpeClass: 'F',
})

describe('ListingsTable', () => {
  it('rend une ligne par annonce avec verdict, DPE, prix et badge « nouvelle »', () => {
    const wrapper = mount(ListingsTable, { props: { items: [cheap, dear] } })
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.text()).toContain('Moins cher')
    expect(rows[0]?.text()).toContain('nouvelle')
    expect(rows[1]?.text()).not.toContain('nouvelle')
    expect(wrapper.findAll('[data-verdict]')).toHaveLength(2)
    expect(rows[1]?.text()).toContain('F')
    expect(wrapper.text()).toContain('€/m²')
  })

  it('trie au clic sur un en-tête : décroissant d’abord sur un nombre, puis croissant', async () => {
    const wrapper = mount(ListingsTable, { props: { items: [cheap, dear] } })
    const ids = (): string[] =>
      wrapper.findAll('tbody tr').map(r => r.attributes('data-id') ?? '')
    expect(ids()).toEqual([cheap.listing.id, dear.listing.id])
    const priceHeader = wrapper
      .findAll('thead button')
      .find(b => b.text().startsWith('Prix'))
    await priceHeader?.trigger('click')
    expect(ids()).toEqual([dear.listing.id, cheap.listing.id])
    expect(priceHeader?.text()).toContain('↓')
    await priceHeader?.trigger('click')
    expect(ids()).toEqual([cheap.listing.id, dear.listing.id])
    expect(priceHeader?.text()).toContain('↑')
  })

  it('ouvre la fiche au clic ou à Entrée, et dit quand rien ne correspond', async () => {
    const wrapper = mount(ListingsTable, { props: { items: [cheap] } })
    await wrapper.get('tbody tr').trigger('click')
    await wrapper.get('tbody tr').trigger('keydown.enter')
    expect(wrapper.emitted('open')).toEqual([
      [cheap.listing.id],
      [cheap.listing.id],
    ])
    const empty = mount(ListingsTable, { props: { items: [] } })
    expect(empty.text()).toContain('Aucune annonce ne correspond')
  })
})
