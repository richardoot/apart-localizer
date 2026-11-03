import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  filtersFromQuery,
  queryFromFilters,
  useFiltersStore,
  viewFromQuery,
} from './filters'

describe('filtres ⇄ URL', () => {
  it('lit la chaîne de requête de la page avec les noms de l’API', () => {
    const filters = filtersFromQuery({
      status: 'to_visit,visited',
      commune: 'Talence',
      lng: '-0.59',
      lat: '44.8',
      radius: '800',
      newForMe: 'true',
      sort: 'effort',
      order: 'asc',
      page: '3',
    })
    expect(filters.status).toEqual(['to_visit', 'visited'])
    expect(filters.commune).toEqual(['Talence'])
    expect(filters.near).toEqual({
      longitude: -0.59,
      latitude: 44.8,
      radiusMeters: 800,
    })
    expect(filters.newForMe).toBe(true)
    expect(filters.sort).toBe('effort')
    expect('page' in filters).toBe(false)
  })

  it('ignore une requête illisible et retombe sur les défauts', () => {
    const filters = filtersFromQuery({ status: 'vendu', radius: '0' })
    expect(filters.status).toBeUndefined()
    expect(filters.sort).toBe('score')
    expect(viewFromQuery({ view: 'map' })).toBe('map')
    expect(viewFromQuery({ view: 'x' })).toBe('table')
    expect(viewFromQuery({})).toBe('table')
  })

  it('écrit une URL courte : défauts omis, vue seulement hors tableau', () => {
    expect(queryFromFilters(filtersFromQuery({}), 'table')).toEqual({})
    expect(
      queryFromFilters(
        { ...filtersFromQuery({}), commune: ['Pessac'], newForMe: true },
        'map'
      )
    ).toEqual({ commune: 'Pessac', newForMe: 'true', view: 'map' })
  })
})

describe('store des filtres', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('bascule un statut, compte les filtres actifs et produit la requête API', () => {
    const store = useFiltersStore()
    expect(store.activeCount).toBe(0)
    store.toggleStatus('to_visit')
    store.toggleStatus('visited')
    expect(store.filters.status).toEqual(['to_visit', 'visited'])
    store.toggleStatus('to_visit')
    expect(store.filters.status).toEqual(['visited'])
    store.toggleStatus('visited')
    expect(store.filters.status).toBeUndefined()
    store.setNear({ longitude: -0.59, latitude: 44.8, radiusMeters: 500 })
    store.patch({ search: 'tram', priceMax: 250_000 })
    expect(store.activeCount).toBe(3)
    expect(store.apiFilters(2, 50)).toMatchObject({
      near: { radiusMeters: 500 },
      search: 'tram',
      priceMax: 250_000,
      page: 2,
      limit: 50,
    })
    store.setNear(undefined)
    expect(store.filters.near).toBeUndefined()
    store.setSort('price', 'asc')
    expect(store.routeQuery).toMatchObject({ sort: 'price', order: 'asc' })
    store.reset()
    expect(store.activeCount).toBe(0)
  })

  it('se charge depuis une requête de route, vue comprise', () => {
    const store = useFiltersStore()
    store.loadFromQuery({ view: 'cards', dpe: 'A,B', verdict: 'target' })
    expect(store.view).toBe('cards')
    expect(store.filters.dpe).toEqual(['A', 'B'])
    expect(store.filters.verdict).toEqual(['target'])
    expect(store.routeQuery).toEqual({
      dpe: 'A,B',
      verdict: 'target',
      view: 'cards',
    })
  })
})
