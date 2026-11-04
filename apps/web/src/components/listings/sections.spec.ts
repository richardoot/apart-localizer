import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { MEMBERS, fakeEvaluated, fakeOpinion, fakeTask } from '@/test/fixtures'
import MetricsPreview from './MetricsPreview.vue'
import OpinionsSection from './OpinionsSection.vue'
import StatusChanger from './StatusChanger.vue'
import TasksSection from './TasksSection.vue'

const me = MEMBERS[0]?.id ?? ''
const other = MEMBERS[1]?.id ?? ''

describe('TasksSection', () => {
  it('compte, coche, ajoute et ne supprime que les tâches manuelles', async () => {
    const tasks = [
      fakeTask({ id: 'aaaaaaaa-0000-4000-8000-000000000001', done: true }),
      fakeTask({
        id: 'aaaaaaaa-0000-4000-8000-000000000002',
        label: "Appeler l'agence",
        origin: 'manual',
        assigneeId: other,
      }),
    ]
    const wrapper = mount(TasksSection, { props: { tasks, members: MEMBERS } })
    expect(wrapper.get('[data-testid="tasks-count"]').text()).toBe('1/2')
    expect(wrapper.text()).toContain('Chloé')
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    await checkboxes[1]?.setValue(true)
    expect(wrapper.emitted('toggle')).toEqual([
      ['aaaaaaaa-0000-4000-8000-000000000002', true],
    ])
    expect(wrapper.findAll('[aria-label="Supprimer la tâche"]')).toHaveLength(1)
    await wrapper.get('[aria-label="Supprimer la tâche"]').trigger('click')
    expect(wrapper.emitted('remove')).toEqual([
      ['aaaaaaaa-0000-4000-8000-000000000002'],
    ])
    await wrapper.get('[aria-label="Nouvelle tâche"]').setValue('  Visiter  ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('add')).toEqual([['Visiter']])
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('add')).toHaveLength(1)
  })
})

describe('TasksSection : tâches issues de l’IA', () => {
  it('marque les tâches « champ manquant » et ne permet pas de les supprimer', () => {
    const wrapper = mount(TasksSection, {
      props: {
        tasks: [
          fakeTask({
            id: 'aaaaaaaa-0000-4000-8000-000000000003',
            label: 'Fixer le loyer visé (phase 2) à partir du marché locatif',
            origin: 'missing_field',
          }),
        ],
        members: MEMBERS,
      },
    })
    expect(wrapper.get('[data-testid="task-ai"]').text()).toBe(
      'IA · champ manquant'
    )
    expect(wrapper.find('[aria-label="Supprimer la tâche"]').exists()).toBe(
      false
    )
  })
})

describe('OpinionsSection', () => {
  it("montre mon avis en édition et celui de l'autre en lecture", async () => {
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
    expect(wrapper.text()).toContain('Chloé')
    expect(wrapper.text()).toContain('Lumineux')
    expect(wrapper.text()).toContain('moyenne 3/5')
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      'Trop loin du tram'
    )
    await wrapper.get('[aria-label="5 sur 5"]').trigger('click')
    await wrapper.get('textarea').setValue('Revu : très bien')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toEqual([
      [{ rating: 5, text: 'Revu : très bien' }],
    ])
  })

  it("dit quand l'autre n'a pas encore donné d'avis", () => {
    const wrapper = mount(OpinionsSection, {
      props: { opinions: [], members: MEMBERS, meId: me },
    })
    expect(wrapper.text()).toContain("Pas encore d'avis de l'autre membre.")
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
      assumptionsOverride: null,
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
