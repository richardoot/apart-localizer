import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { MEMBERS, fakeEvaluated, fakeOpinion } from '@/test/fixtures'
import MetricsPreview from './MetricsPreview.vue'
import OpinionsSection from './OpinionsSection.vue'
import StatusChanger from './StatusChanger.vue'

const me = MEMBERS[0]?.id ?? ''
const other = MEMBERS[1]?.id ?? ''

// Lot 19 : les tâches sont dans la liste « À faire » (`todo/todo.spec.ts`).

describe('OpinionsSection (lot 19 : « Nos avis » de la Synthèse)', () => {
  it('une ligne par membre : note et mot, « Pas encore donné » ; mon avis se modifie sur place', async () => {
    const wrapper = mount(OpinionsSection, {
      props: {
        opinions: [
          fakeOpinion({ memberId: other, rating: 4, text: 'Lumineux' }),
          fakeOpinion({
            id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
            memberId: me,
            rating: 2,
            text: 'Trop loin du tram',
          }),
        ],
        members: MEMBERS,
        meId: me,
      },
    })
    const rows = wrapper.findAll('li[data-member]')
    expect(rows.map(r => r.text())).toEqual([
      expect.stringContaining('Richard2/5Trop loin du tram'),
      expect.stringContaining('Chloé4/5Lumineux'),
    ])
    const edit = wrapper.get('[data-testid="opinion-edit"]')
    expect(edit.text()).toBe('Modifier mon avis')
    expect(rows[1]?.find('[data-testid="opinion-edit"]').exists()).toBe(false)
    await edit.trigger('click')
    expect(
      (wrapper.get('#opinion-text').element as HTMLTextAreaElement).value
    ).toBe('Trop loin du tram')
    const two = wrapper.get('button[aria-label="2 sur 5"]')
    expect(two.attributes('aria-pressed')).toBe('true')
    await wrapper.get('button[aria-label="5 sur 5"]').trigger('click')
    await wrapper.get('#opinion-text').setValue('Revu : très bien')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toEqual([
      [{ rating: 5, text: 'Revu : très bien' }],
    ])
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('un avis pas encore donné ; un second clic enlève la note ; Annuler referme', async () => {
    const wrapper = mount(OpinionsSection, {
      props: { opinions: [], members: MEMBERS, meId: me },
    })
    expect(wrapper.findAll('li[data-member]').map(r => r.text())).toEqual([
      'RichardPas encore donnéDonner mon avis',
      'ChloéPas encore donné',
    ])
    await wrapper.get('[data-testid="opinion-edit"]').trigger('click')
    const three = wrapper.get('button[aria-label="3 sur 5"]')
    await three.trigger('click')
    expect(three.attributes('aria-pressed')).toBe('true')
    await three.trigger('click')
    expect(three.attributes('aria-pressed')).toBe('false')
    const cancel = wrapper.findAll('button').find(b => b.text() === 'Annuler')
    await cancel?.trigger('click')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.emitted('save')).toBeUndefined()
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
    expect(wrapper.get('[role="alert"]').text()).toContain('raison')
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
    ).toContain('Saisissez un prix')
  })
})
