/**
 * Lot 15 : la mention « vérifiée il y a … » et le filtre « À revérifier » de
 * la liste. La chronologie des vérifications et les constats à la main sont
 * dans l'onglet Historique depuis le lot 19 (`history/history.spec.ts`), la
 * republication dans les arguments de Négocier (`negotiate/negotiate.spec.ts`).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { fakeListing } from '@/test/fixtures'
import { useFiltersStore, queryFromFilters } from '@/stores/filters'
import CheckFreshnessBadge from './CheckFreshnessBadge.vue'
import FiltersBar from './FiltersBar.vue'

describe('Lot 15 : liste et filtre « À revérifier »', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('mention discrète : « Vérifiée il y a N j », « À revérifier », rien pour une annonce récente', () => {
    const now = Date.now()
    const day = 86_400_000
    const iso = (offset: number) => new Date(now - offset).toISOString()
    const fresh = mount(CheckFreshnessBadge, {
      props: {
        listing: fakeListing({
          lastCheckedAt: iso(3 * day + 3600_000),
          createdAt: iso(40 * day),
        }),
      },
    })
    expect(fresh.text()).toBe('Vérifiée il y a 3 j')
    expect(fresh.get('span').attributes('data-stale')).toBe('false')
    const stale = mount(CheckFreshnessBadge, {
      props: {
        listing: fakeListing({ lastCheckedAt: null, createdAt: iso(20 * day) }),
      },
    })
    expect(stale.text()).toBe('À revérifier')
    expect(stale.get('span').classes()).toContain('text-warn')
    const recent = mount(CheckFreshnessBadge, {
      props: {
        listing: fakeListing({ lastCheckedAt: null, createdAt: iso(day) }),
      },
    })
    expect(recent.find('span').exists()).toBe(false)
    const blocked = mount(CheckFreshnessBadge, {
      props: {
        listing: fakeListing({
          lastCheckedAt: iso(2 * day + 3600_000),
          createdAt: iso(40 * day),
        }),
        lastOutcome: 'inaccessible',
      },
    })
    expect(blocked.text()).toBe('Page inaccessible il y a 2 j')
  })

  it('filtre « À revérifier » : 7 jours dans le store et dans l’URL, compté, retiré', async () => {
    const store = useFiltersStore()
    const wrapper = mount(FiltersBar, { props: { communes: [] } })
    const box = wrapper.get('[data-testid="filter-stale"]')
    await box.setValue(true)
    expect(store.filters.staleDays).toBe(7)
    expect(store.activeCount).toBe(1)
    expect(queryFromFilters(store.filters, 'table')).toMatchObject({
      staleDays: '7',
    })
    await box.setValue(false)
    expect(store.filters.staleDays).toBeUndefined()
    await wrapper.get('#f-sort').setValue('lastCheckedAt')
    expect(store.filters.order).toBe('asc')
  })
})
