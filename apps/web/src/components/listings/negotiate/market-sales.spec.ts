/**
 * Lot 25 : les ventes comparables de Négocier, cinq d'abord puis « Voir les
 * 65 ventes » ; au téléphone, une ligne empilée par vente (le tableau reste
 * à partir de `sm`). Données fictives.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { fakeContext } from '@/test/criteria-fixtures'

const apiMock = vi.hoisted(() => ({ listings: { context: vi.fn() } }))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import MarketSales from './MarketSales.vue'

enableAutoUnmount(afterEach)

const n = (text: string): string => text.replace(/[\u202f\u00a0]/g, ' ')

function contextWith(count: number) {
  const base = fakeContext()
  const [sale] = base.market.comparables
  if (!sale) throw new Error('fixture sans vente')
  return fakeContext({
    market: {
      ...base.market,
      comparables: Array.from({ length: count }, (_, i) => ({
        ...sale,
        id: `s${i}`,
        address: `${i + 1} rue Fictive`,
      })),
    },
  })
}

async function mountSales(count: number) {
  apiMock.listings.context.mockResolvedValue(contextWith(count))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = mount(MarketSales, {
    props: { listingId: '11111111-1111-4111-8111-111111111111' },
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  })
  await flushPromises()
  return wrapper
}

describe('Lot 25 : ventes comparables, cinq puis toutes', () => {
  it('montre les cinq plus récentes, puis « Voir les 65 ventes » et replie', async () => {
    const wrapper = await mountSales(65)
    const rows = () => wrapper.findAll('[data-testid="market-sales"] tbody tr')
    const stacked = () =>
      wrapper.findAll('[data-testid="market-sales-stack"] [data-sale]')
    expect(rows()).toHaveLength(5)
    expect(stacked()).toHaveLength(5)
    expect(rows()[0]?.text()).toContain('1 rue Fictive')
    const more = wrapper.get('[data-testid="market-sales-more"]')
    expect(more.text()).toBe('Voir les 65 ventes')
    expect(more.attributes('aria-expanded')).toBe('false')
    await more.trigger('click')
    expect(rows()).toHaveLength(65)
    expect(stacked()).toHaveLength(65)
    expect(more.text()).toBe('N’en montrer que 5')
    expect(more.attributes('aria-expanded')).toBe('true')
    await more.trigger('click')
    expect(rows()).toHaveLength(5)
  })

  it('cinq ventes ou moins : pas de bouton', async () => {
    const wrapper = await mountSales(5)
    expect(wrapper.find('[data-testid="market-sales-more"]').exists()).toBe(
      false
    )
  })

  it('au téléphone, une ligne empilée par vente ; le tableau à partir de sm', async () => {
    const wrapper = await mountSales(1)
    const stack = wrapper.get('[data-testid="market-sales-stack"]')
    expect(stack.classes()).toContain('sm:hidden')
    const line = n(stack.get('[data-sale]').text())
    expect(line).toContain('120 m · 44 m² · 2 p.')
    expect(line).toContain('3 rue Fictive'.replace('3', '1'))
    expect(line).toContain('190 000 €')
    expect(line).toContain('12 juin 2024')
    expect(line).toContain('4 318 €/m²')
    const table = wrapper.get('[data-testid="market-sales"]')
    expect(table.element.parentElement?.className).toContain('hidden')
    expect(table.element.parentElement?.className).toContain('sm:block')
  })
})
