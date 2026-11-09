import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useFiltersStore } from '@/stores/filters'
import { fakeCriteria } from '@/test/criteria-fixtures'
import FiltersBar from './FiltersBar.vue'

describe('FiltersBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('lot 21 : plus de pastilles de statut, c’est l’étape qui décide', () => {
    const wrapper = mount(FiltersBar, { props: { communes: ['Talence'] } })
    expect(wrapper.find('button[data-status]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Statut')
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

  it('le critère enregistré se choisit dans les filtres et compte comme un filtre', async () => {
    const store = useFiltersStore()
    const wrapper = mount(FiltersBar, {
      props: { communes: [], criteria: [fakeCriteria()] },
    })
    const select = wrapper.get('#f-criteria')
    expect(select.findAll('option').map(o => o.text())).toEqual([
      'Aucun',
      'Talence fictif (3)',
    ])
    await select.setValue('cccccccc-cccc-4ccc-8ccc-cccccccccccc')
    expect(store.filters.criteriaId).toBe(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    )
    expect(store.activeCount).toBe(1)
    expect(store.routeQuery).toMatchObject({
      criteriaId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    })
    await select.setValue('')
    expect(store.filters.criteriaId).toBeUndefined()
  })
})
