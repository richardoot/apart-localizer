import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useFiltersStore } from '@/stores/filters'
import FiltersBar from './FiltersBar.vue'

describe('FiltersBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('bascule un statut à partir de la sélection active implicite', async () => {
    const store = useFiltersStore()
    const wrapper = mount(FiltersBar, { props: { communes: ['Talence'] } })
    const discarded = wrapper.get('button[data-status="discarded"]')
    expect(discarded.attributes('aria-pressed')).toBe('false')
    await discarded.trigger('click')
    expect(store.filters.status).toEqual([
      'to_study',
      'to_visit',
      'visited',
      'offer_made',
      'offer_accepted',
      'discarded',
    ])
    await wrapper.get('button[data-status="to_study"]').trigger('click')
    expect(store.filters.status).not.toContain('to_study')
  })

  it('commune, verdict, DPE, prix et tri écrivent dans le store', async () => {
    const store = useFiltersStore()
    const wrapper = mount(FiltersBar, {
      props: { communes: ['Pessac', 'Talence'] },
    })
    const commune = wrapper.get('#f-commune')
    expect(commune.findAll('option').map(o => o.text())).toEqual([
      'Toutes',
      'Pessac',
      'Talence',
    ])
    await commune.setValue('Talence')
    expect(store.filters.commune).toEqual(['Talence'])
    await wrapper.get('[aria-label="Verdicts"] button').trigger('click')
    expect(store.filters.verdict).toEqual(['target'])
    await wrapper.get('[aria-label="Classes DPE"] button').trigger('click')
    expect(store.filters.dpe).toEqual(['A'])
    await wrapper.get('#f-price-max').setValue('250000')
    expect(store.filters.priceMax).toBe(250_000)
    await wrapper.get('#f-sort').setValue('price')
    expect(store.filters.sort).toBe('price')
    expect(store.filters.order).toBe('asc')
    await wrapper.get('input[type="checkbox"]').setValue(true)
    expect(store.filters.newForMe).toBe(true)
  })

  it('affiche le rayon actif et le retire au clic ; efface tout', async () => {
    const store = useFiltersStore()
    store.setNear({ longitude: -0.59, latitude: 44.8, radiusMeters: 800 })
    store.patch({ search: 'tram' })
    const wrapper = mount(FiltersBar, { props: { communes: [] } })
    const chip = wrapper.get(
      'button[title="Retirer le filtre par point et rayon"]'
    )
    expect(chip.text()).toContain('800 m')
    await chip.trigger('click')
    expect(store.filters.near).toBeUndefined()
    expect(wrapper.text()).toContain('Effacer les filtres (1)')
    await wrapper.get('button.underline').trigger('click')
    expect(store.activeCount).toBe(0)
  })
})
