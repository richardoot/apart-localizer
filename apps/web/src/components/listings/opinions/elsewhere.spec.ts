/**
 * Lot 20, les avis ailleurs dans l'application : colonnes de la liste (par
 * membre, note commune, désaccords), filtres « À rediscuter » et « Avis en
 * attente » dans l'URL, tris, comparaison critère par critère (la meilleure
 * note commune en gras), la tâche de contre-visite dans « À faire » et
 * « Pendant la visite ». Données fictives.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { CompareResult, EvaluatedListing } from '@apart/contracts'
import { visitChecklist } from '@/lib/todo'
import { SORT_LABELS } from '@/lib/labels'
import { queryFromFilters, useFiltersStore } from '@/stores/filters'
import {
  MEMBERS,
  fakeEvaluated,
  fakeOpinion,
  fakeOpinionSummary,
  fakeScores,
  fakeTask,
  mockupOpinions,
} from '@/test/fixtures'
import CompareTable from '../CompareTable.vue'
import FiltersBar from '../FiltersBar.vue'
import ListingsTable from '../ListingsTable.vue'
import TodoItemRow from '../todo/TodoItemRow.vue'

const R = MEMBERS[0]?.id ?? ''
const C = MEMBERS[1]?.id ?? ''

function listing(
  id: string,
  title: string,
  opinions: ReturnType<typeof mockupOpinions>,
  viewerId = R
): EvaluatedListing {
  const { visible, summary } = fakeOpinionSummary(
    opinions.map(o => ({ ...o, listingId: id })),
    { viewerId }
  )
  return fakeEvaluated(
    { id, title },
    { opinions: visible, opinionSummary: summary }
  )
}

const balcony = listing(
  '11111111-1111-4111-8111-111111111111',
  '[Exemple] T3 balcon sud',
  mockupOpinions()
)
const courtyard = listing(
  '33333333-3333-4333-8333-333333333333',
  '[Exemple] T3 cour',
  [
    fakeOpinion({
      id: 'dddddddd-dddd-4ddd-8ddd-000000000011',
      memberId: R,
      rating: 4,
      scores: fakeScores({ quiet: 5, luminosity: 3, layout: 4 }),
    }),
    fakeOpinion({
      id: 'dddddddd-dddd-4ddd-8ddd-000000000012',
      memberId: C,
      rating: 4,
      scores: fakeScores({ quiet: 4, luminosity: 3, layout: 5 }),
    }),
  ]
)
const waiting = listing(
  '44444444-4444-4444-8444-444444444444',
  '[Exemple] T2 bis',
  [mockupOpinions()[0] as ReturnType<typeof mockupOpinions>[number]]
)

describe('liste : nos avis en colonnes (maquette « Liste »)', () => {
  it('une colonne par membre, la note commune, les désaccords, juste après le prix', async () => {
    const wrapper = mount(ListingsTable, {
      props: {
        items: [balcony, courtyard, waiting],
        members: MEMBERS,
        meId: R,
      },
    })
    const headers = wrapper.findAll('thead th').map(th => th.text())
    const price = headers.findIndex(
      h => h.startsWith('Prix') && !h.includes('cible')
    )
    expect(
      headers
        .slice(price + 1, price + 5)
        .map(h => h.replace(/[↑↓↕]/g, '').trim())
    ).toEqual(['Richard', 'Chloé', 'Note commune', 'Désaccords'])
    expect(headers.some(h => h.trim() === 'Avis↕')).toBe(false)
    const row = (id: string) => wrapper.get(`tr[data-id="${id}"]`)
    const cells = (id: string, testid: string) =>
      row(id)
        .findAll(`[data-testid="${testid}"]`)
        .map(c => c.text())
    expect(cells(balcony.listing.id, 'opinion-member')).toEqual([
      '4/5 · 4,0',
      '3/5 · 3,1',
    ])
    expect(cells(balcony.listing.id, 'common-score')).toEqual(['3,6'])
    expect(cells(balcony.listing.id, 'disagreements')).toEqual([
      '2 : calme, on s’y voit',
    ])
    expect(cells(courtyard.listing.id, 'disagreements')).toEqual(['aucun'])
    expect(cells(waiting.listing.id, 'opinion-member')).toEqual([
      '4/5 · 4,0',
      '—',
    ])
    expect(cells(waiting.listing.id, 'common-score')).toEqual(['en attente'])
    expect(cells(waiting.listing.id, 'disagreements')).toEqual([
      'en attente de Chloé',
    ])

    // Tri par la note commune, au clic : la plus haute d'abord, l'attente en bas.
    const header = wrapper
      .findAll('thead button')
      .find(b => b.text().startsWith('Note commune'))
    await header?.trigger('click')
    expect(
      wrapper.findAll('tbody tr').map(r => r.attributes('data-id'))
    ).toEqual([courtyard.listing.id, balcony.listing.id, waiting.listing.id])
  })

  it('à l’aveugle, pour Richard qui n’a pas noté : « masqué », « à toi de noter »', () => {
    const blind = listing(
      '55555555-5555-4555-8555-555555555555',
      '[Exemple] T3 Bastide',
      [mockupOpinions()[1] as ReturnType<typeof mockupOpinions>[number]]
    )
    const wrapper = mount(ListingsTable, {
      props: { items: [blind], members: MEMBERS, meId: R },
    })
    expect(
      wrapper.findAll('[data-testid="opinion-member"]').map(c => c.text())
    ).toEqual(['—', 'masqué'])
    expect(wrapper.get('[data-testid="common-score"]').text()).toBe(
      'en attente'
    )
    expect(wrapper.get('[data-testid="disagreements"]').text()).toBe(
      'à toi de noter'
    )
    expect(wrapper.text()).not.toContain('3/5')
  })
})

describe('filtres et tris des avis', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('« Toutes », « À rediscuter », « Avis en attente » : aria-pressed, store et URL', async () => {
    const store = useFiltersStore()
    const wrapper = mount(FiltersBar, { props: { communes: [] } })
    const group = wrapper.get('[data-testid="filter-opinions"]')
    const pills = group.findAll('button')
    expect(pills.map(p => p.text())).toEqual([
      'Toutes',
      'À rediscuter',
      'Avis en attente',
    ])
    expect(pills[0]?.attributes('aria-pressed')).toBe('true')
    await group.get('[data-opinions="to_discuss"]').trigger('click')
    expect(store.filters.opinions).toBe('to_discuss')
    expect(store.activeCount).toBe(1)
    expect(store.routeQuery).toMatchObject({ opinions: 'to_discuss' })
    expect(
      group.get('[data-opinions="to_discuss"]').attributes('aria-pressed')
    ).toBe('true')
    await group.get('[data-opinions="pending"]').trigger('click')
    expect(store.filters.opinions).toBe('pending')
    await group.get('[data-opinions="all"]').trigger('click')
    expect(store.filters.opinions).toBeUndefined()
    store.loadFromQuery({ opinions: 'pending', sort: 'disagreement' })
    expect(store.filters.opinions).toBe('pending')
    expect(store.filters.sort).toBe('disagreement')
    expect(queryFromFilters(store.filters, 'table')).toMatchObject({
      opinions: 'pending',
      sort: 'disagreement',
    })
  })

  it('tris « Note commune » et « Plus gros désaccord » (décroissant)', async () => {
    const store = useFiltersStore()
    const wrapper = mount(FiltersBar, { props: { communes: [] } })
    expect(SORT_LABELS.commonScore).toBe('Note commune')
    expect(SORT_LABELS.disagreement).toBe('Plus gros désaccord')
    await wrapper.get('#f-sort').setValue('commonScore')
    expect(store.filters.sort).toBe('commonScore')
    expect(store.filters.order).toBe('desc')
    await wrapper.get('#f-sort').setValue('disagreement')
    expect(store.filters.sort).toBe('disagreement')
  })
})

describe('comparaison : nos avis côte à côte', () => {
  const ranks = {
    score: 1,
    grossYield: 1,
    netYield: 1,
    effort: 1,
    pricePerM2: 1,
    discount: 1,
  }
  const result: CompareResult = {
    items: [
      { ...balcony, ranks },
      { ...courtyard, ranks },
    ],
    best: {
      score: null,
      grossYield: null,
      netYield: null,
      effort: null,
      pricePerM2: null,
      discount: null,
    },
  }

  it('une ligne par critère (« 4 / 2 »), la meilleure note commune en gras, la légende', () => {
    const wrapper = mount(CompareTable, { props: { result, meId: R } })
    const cells = (key: string) =>
      wrapper.get(`[data-row="opinion-${key}"]`).findAll('td')
    expect(cells('quiet').map(c => c.text())).toEqual(['4 / 2', '5 / 4'])
    expect(cells('quiet').map(c => c.attributes('data-best'))).toEqual([
      undefined,
      'true',
    ])
    expect(cells('quiet')[1]?.classes()).toContain('font-bold')
    expect(cells('luminosity').map(c => c.attributes('data-best'))).toEqual([
      'true',
      undefined,
    ])
    // Un critère que Chloé n'a pas noté ici : pas de note commune.
    expect(cells('street').map(c => c.text())).toEqual(['4 / —', '— / —'])
    expect(
      cells('street').every(c => c.attributes('data-best') === undefined)
    ).toBe(true)
    expect(cells('global').map(c => c.text())).toEqual([
      '4/5 / 3/5',
      '4/5 / 4/5',
    ])
    expect(cells('common').map(c => c.text())).toEqual(['3,6', '4,0'])
    expect(cells('common')[1]?.attributes('data-best')).toBe('true')
    expect(cells('disagreements').map(c => c.text())).toEqual([
      '2 : calme, on s’y voit',
      'aucun',
    ])
    expect(wrapper.get('[data-testid="compare-opinions-legend"]').text()).toBe(
      'Chaque case : Richard / Chloé ; en gras, la meilleure note commune de la ligne.'
    )
  })

  it('sans avis du serveur, pas de lignes d’avis', () => {
    const plain = fakeEvaluated()
    const wrapper = mount(CompareTable, {
      props: {
        result: {
          ...result,
          items: [
            { ...plain, ranks },
            { ...plain, ranks },
          ],
        },
      },
    })
    expect(wrapper.find('[data-row="opinion-quiet"]').exists()).toBe(false)
    expect(
      wrapper.find('[data-testid="compare-opinions-legend"]').exists()
    ).toBe(false)
  })
})

describe('« À faire » et « Pendant la visite »', () => {
  it('la tâche de contre-visite porte son contexte et se range avec les visites', () => {
    const task = fakeTask({
      id: 'aaaaaaaa-0000-4000-8000-000000000020',
      label: 'À revoir à la contre-visite : le calme',
      origin: 'opinion',
      details:
        'Vos notes s’écartent de 2 points : Richard 4 (« fenêtres fermées, ça va »), Chloé 2 (« bus devant la chambre »).',
    })
    const wrapper = mount(TodoItemRow, {
      props: {
        item: {
          key: `task:${task.id}`,
          kind: 'task',
          id: task.id,
          group: 'visit',
          title: task.label,
          state: 'open',
          stateLabel: null,
          done: false,
          requestId: null,
          at: null,
        },
        task,
        request: null,
        showRequest: false,
        sameMessage: [],
        members: MEMBERS,
      },
    })
    expect(wrapper.get('[data-testid="todo-kind"]').text()).toBe('Visite')
    expect(wrapper.get('[data-testid="todo-details"]').text()).toContain(
      'Richard 4 (« fenêtres fermées, ça va »)'
    )
    expect(wrapper.get('[data-testid="todo-from-opinions"]').text()).toBe(
      'Proposée depuis « Nos avis », ajoutée d’un clic.'
    )
    // Ajoutée par un membre, elle se supprime comme une tâche saisie à la main.
    expect(wrapper.find('[data-testid="todo-remove"]').exists()).toBe(true)
    expect(
      visitChecklist([
        { ...task, position: 3 },
        fakeTask({
          id: 'aaaaaaaa-0000-4000-8000-000000000021',
          label: 'Appeler le syndic',
          origin: 'manual',
          position: 1,
        }),
        fakeTask({
          id: 'aaaaaaaa-0000-4000-8000-000000000022',
          label: 'À revoir à la contre-visite : l’immeuble',
          origin: 'opinion',
          done: true,
          position: 4,
        }),
      ]).map(p => p.label)
    ).toEqual(['À revoir à la contre-visite : le calme'])
  })
})
