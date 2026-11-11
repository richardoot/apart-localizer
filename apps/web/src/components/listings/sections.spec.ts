import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { MEMBERS, fakeEvaluated, fakeOpinion } from '@/test/fixtures'
import MetricsPreview from './MetricsPreview.vue'
import OpinionsSection from './OpinionsSection.vue'
import StatusChanger from './StatusChanger.vue'

const me = MEMBERS[0]?.id ?? ''
const other = MEMBERS[1]?.id ?? ''

// Lot 19 : les tâches sont dans la liste « À faire » (`todo/todo.spec.ts`).

describe('OpinionsSection (lot 19, refaite au lot 20)', () => {
  it('une carte par membre : note globale et phrase, « Pas encore donné » ; mon avis se modifie sur place', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(OpinionsSection, {
      props: {
        // Une fiche lue sans confrontation du serveur : celle des avis reçus.
        item: fakeEvaluated(
          {},
          {
            opinions: [
              fakeOpinion({ memberId: other, rating: 4, text: 'Lumineux' }),
              fakeOpinion({
                id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                memberId: me,
                rating: 2,
                text: 'Trop loin du tram',
              }),
            ],
          }
        ),
        members: MEMBERS,
        meId: me,
        actions: { save, reveal: vi.fn(), addTask: vi.fn() },
      },
    })
    const cards = wrapper.findAll('[data-member]')
    expect(cards.map(c => c.text())).toEqual([
      expect.stringContaining('Richard2/5'),
      expect.stringContaining('Chloé4/5'),
    ])
    expect(cards[0]?.text()).toContain('Trop loin du tram')
    expect(cards[1]?.text()).toContain('Lumineux')
    const edit = wrapper.get('[data-testid="opinion-edit"]')
    expect(edit.text()).toBe('Modifier mon avis')
    await edit.trigger('click')
    expect(
      (wrapper.get('#opinion-text').element as HTMLTextAreaElement).value
    ).toBe('Trop loin du tram')
    const two = wrapper.get('button[aria-label="2 sur 5"]')
    expect(two.attributes('aria-checked')).toBe('true')
    await wrapper.get('button[aria-label="5 sur 5"]').trigger('click')
    await wrapper.get('#opinion-text').setValue('Revu : très bien')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(save).toHaveBeenCalledWith({
      rating: 5,
      text: 'Revu : très bien',
      scores: {},
      expectedUpdatedAt: '2026-11-03T10:00:00.000Z',
    })
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('un avis pas encore donné ; un second clic enlève la note ; Annuler referme', async () => {
    const save = vi.fn()
    const wrapper = mount(OpinionsSection, {
      props: {
        item: fakeEvaluated(),
        members: MEMBERS,
        meId: me,
        actions: { save, reveal: vi.fn(), addTask: vi.fn() },
      },
    })
    expect(
      wrapper.findAll('[data-member]').map(r => r.attributes('data-state'))
    ).toEqual(['me-missing', 'missing'])
    expect(wrapper.get(`[data-member="${other}"]`).text()).toBe(
      'ChloéPas encore donné'
    )
    await wrapper.get('[data-testid="opinion-edit"]').trigger('click')
    const three = wrapper.get('button[aria-label="3 sur 5"]')
    await three.trigger('click')
    expect(three.attributes('aria-checked')).toBe('true')
    await three.trigger('click')
    expect(three.attributes('aria-checked')).toBe('false')
    await wrapper.get('[data-testid="opinion-cancel"]').trigger('click')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })
})

describe('StatusChanger', () => {
  it('change directement un statut ordinaire et exige une raison pour écarter', async () => {
    const wrapper = mount(StatusChanger, { props: { status: 'to_study' } })
    await wrapper.get('select').setValue('to_visit')
    expect(wrapper.emitted('change')).toEqual([
      [{ status: 'to_visit', reason: null }],
    ])
    await wrapper.get('select').setValue('discarded')
    expect(wrapper.emitted('change')).toHaveLength(1)
    await wrapper.get('form').trigger('submit')
    // Lot 22 : l'erreur est au champ, qui devient invalide.
    expect(wrapper.get('[data-testid="field-error"]').text()).toContain(
      'raison'
    )
    expect(wrapper.get('#discard-reason').attributes('aria-invalid')).toBe(
      'true'
    )
    await wrapper.get('#discard-reason').setValue('Trop cher')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('change')?.[1]).toEqual([
      { status: 'discarded', reason: 'Trop cher' },
    ])
  })
})

describe('MetricsPreview', () => {
  it('affiche les indicateurs du § 8 avec le marqueur « ≈ » des estimations', () => {
    const item = fakeEvaluated({
      renovation: null,
      annualCharges: null,
    })
    const wrapper = mount(MetricsPreview, {
      props: { evaluation: item.evaluation },
    })
    expect(wrapper.get('[data-testid="total-cost"]').text()).toMatch(
      /220\s?000 €/
    )
    // Lot 9 : « Coût tout compris », marqué de sa base de calcul.
    expect(wrapper.text()).toContain('Coût tout compris')
    expect(wrapper.text()).not.toContain('Coût total')
    expect(
      wrapper.findAll('[data-basis]').map(b => b.attributes('data-basis'))
    ).toEqual(['price', 'all_in'])
    expect(wrapper.get('[data-testid="gross-yield"]').text()).toBe('4,1 %')
    expect(wrapper.get('[data-testid="effort"]').text()).toMatch(/-362 €\/mois/)
    expect(wrapper.text()).toContain('≈')
    expect(wrapper.text()).toContain('Hors cible')
    expect(
      mount(MetricsPreview, { props: { evaluation: null } }).text()
    ).toContain('Saisis un prix')
  })
})
