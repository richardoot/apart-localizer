/**
 * Lot 14 : adéquation aux critères dans le tableau et les cartes (depuis le
 * lot 21, la barre d'étapes remplace les onglets : voir
 * `components/workflow/workflow.spec.ts`). Annonces fictives évaluées par le
 * vrai paquet `domain`.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { NO_CRITERIA_FIT } from '@apart/contracts'
import type { ListingCriteriaFit } from '@apart/contracts'
import { fakeEvaluated } from '@/test/fixtures'
import ListingCards from './ListingCards.vue'
import ListingsTable from './ListingsTable.vue'

const CRITERIA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const fitOf = (over: Partial<ListingCriteriaFit>): ListingCriteriaFit => ({
  ...NO_CRITERIA_FIT,
  activeCriteria: 1,
  criteriaId: CRITERIA,
  name: 'Caudéran fictif',
  ...over,
})

describe('liste : la colonne et les cartes d’adéquation', () => {
  const inside = fakeEvaluated(
    { id: '11111111-1111-4111-8111-111111111111', title: 'T3 dedans' },
    { criteriaFit: fitOf({ level: 'in' }) }
  )
  const kept = fakeEvaluated(
    {
      id: '22222222-2222-4222-8222-222222222222',
      title: 'T3 avec offre',
      status: 'offer_made',
    },
    {
      criteriaFit: fitOf({
        level: 'out',
        reasons: ['Prix +19 % (maximum 220 000 €, marge 5 %)'],
        kept: 'offer',
        since: '2026-11-02T09:00:00.000Z',
        origin: { cause: 'listing', trigger: 'price_up', criteriaName: null },
      }),
    }
  )

  it('tableau : pastille, raison, mention « gardée » sous le titre ; « depuis » dans l’onglet hors critères', async () => {
    const wrapper = mount(ListingsTable, { props: { items: [inside, kept] } })
    expect(wrapper.text()).toContain('Adéquation')
    const rows = wrapper.findAll('tbody tr')
    const row = (id: string) => rows.find(r => r.attributes('data-id') === id)
    expect(row(inside.listing.id)?.get('[data-fit]').text()).toBe(
      'Dans les critères'
    )
    expect(row(inside.listing.id)?.text()).toContain('Caudéran fictif')
    const keptRow = row(kept.listing.id)
    expect(keptRow?.get('[data-testid="fit-kept"]').text()).toBe(
      'Gardée dans la liste : offre en cours'
    )
    expect(keptRow?.find('[data-testid="fit-since"]').exists()).toBe(false)
    await wrapper.setProps({ outTab: true })
    expect(wrapper.text()).toContain('Pourquoi hors critères')
    const outRow = wrapper
      .findAll('tbody tr')
      .find(r => r.attributes('data-id') === kept.listing.id)
    expect(outRow?.get('[data-testid="fit-since"]').text()).toBe(
      'Prix remonté le 2 novembre'
    )
    expect(outRow?.find('[data-testid="fit-kept"]').exists()).toBe(false)
  })

  it('cartes : pastille, raison et mention « gardée »', () => {
    const wrapper = mount(ListingCards, { props: { items: [kept] } })
    expect(wrapper.get('[data-fit]').text()).toBe('Hors critères')
    expect(wrapper.get('[data-testid="fit-reason"]').text()).toContain(
      'Prix +19 %'
    )
    expect(wrapper.get('[data-testid="fit-kept"]').text()).toContain(
      'offre en cours'
    )
  })
})
