/**
 * Lot 20, « Nos avis » critère par critère : cartes par personne, bilan et
 * note commune, détail dépliable avec les désaccords, tâche de contre-visite
 * proposée (rien n'est créé avant la confirmation), avis à l'aveugle et
 * « Voir quand même », « Mon avis » au clavier (radiogroup), au téléphone,
 * et la garde des modifications non enregistrées de la fiche. Données
 * fictives (celles de la maquette).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import type { EvaluatedListing, Listing, Visit } from '@apart/contracts'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import {
  LISTING_EDITOR,
  createListingEditor,
} from '@/composables/useListingEditor'
import { useLivePreview } from '@/composables/useLivePreview'
import { ApiError } from '@/lib/api'
import { SCORE_CHOICES } from '@/lib/opinions'
import {
  MEMBERS,
  fakeEvaluated,
  fakeListing,
  fakeOpinionSummary,
  fakeTask,
  mockupOpinions,
} from '@/test/fixtures'
import OpinionsSection from '../OpinionsSection.vue'
import UnsavedChangesBar from '../sections/UnsavedChangesBar.vue'
import ScoreRadioGroup from './ScoreRadioGroup.vue'

const R = MEMBERS[0]?.id ?? ''
const C = MEMBERS[1]?.id ?? ''
const n = (text: string) => text.replace(/\s+/g, ' ').trim()

function itemWith(
  options: Parameters<typeof fakeOpinionSummary>[1] & {
    opinions?: ReturnType<typeof mockupOpinions>
    tasks?: EvaluatedListing['tasks']
  } = {}
): EvaluatedListing {
  const { visible, summary } = fakeOpinionSummary(
    options.opinions ?? mockupOpinions(),
    options
  )
  return fakeEvaluated(
    {},
    {
      opinions: visible,
      opinionSummary: summary,
      tasks: options.tasks ?? [fakeTask()],
    }
  )
}

function actions() {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    reveal: vi.fn().mockResolvedValue(undefined),
    addTask: vi.fn().mockResolvedValue(undefined),
  }
}

const doneVisit: Visit = {
  id: 'eeeeeeee-0000-4000-8000-000000000001',
  listingId: '11111111-1111-4111-8111-111111111111',
  visitedAt: '2026-10-14T09:00:00.000Z',
  status: 'done',
  participantIds: [R, C],
  report: null,
  pros: null,
  cons: null,
  rating: 0,
  prepTaskId: null,
  createdById: R,
  createdAt: '2026-11-14T09:00:00.000Z',
  updatedAt: '2026-11-14T09:00:00.000Z',
  photoCount: 0,
  photos: [],
}

function mountSection(
  item: EvaluatedListing,
  props: Record<string, unknown> = {}
) {
  return mount(OpinionsSection, {
    attachTo: document.body,
    props: { item, members: MEMBERS, meId: R, actions: actions(), ...props },
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('« Nos avis » confrontés (maquette « Synthèse »)', () => {
  it('une carte par personne, le bilan, la note commune ; le détail se déplie', async () => {
    const wrapper = mountSection(itemWith())
    const cards = wrapper.findAll('[data-member]')
    expect(cards.map(c => c.attributes('data-state'))).toEqual([
      'rated',
      'rated',
    ])
    const richard = n(cards[0]?.text() ?? '')
    expect(richard).toContain('Richard4/5critères : 4,0 en moyenne')
    expect(richard).toContain('Lumineux, balcon agréable ; cuisine à refaire.')
    expect(richard).toContain('8 critères sur 8')
    const chloe = n(cards[1]?.text() ?? '')
    expect(chloe).toContain('3/5')
    expect(chloe).toContain('critères : 3,1 en moyenne')
    expect(chloe).toContain('7 critères sur 8')
    expect(n(wrapper.get('[data-testid="opinions-sentence"]').text())).toBe(
      'D’accord sur 5 critères. Désaccord sur le calme (Richard 4, Chloé 2) et « on s’y voit » (4 et 2). Chloé n’a pas encore noté la rue.'
    )
    expect(n(wrapper.get('[data-testid="common-score"]').text())).toBe(
      'Note commune 3,6 / 5'
    )
    expect(wrapper.get('[data-testid="opinion-edit"]').text()).toBe(
      'Modifier mon avis'
    )

    const toggle = wrapper.get('[data-testid="opinions-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-controls')).toBe('opinions-detail')
    expect(wrapper.find('#opinions-detail').exists()).toBe(false)
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.text()).toBe('Masquer le détail')
    const detail = wrapper.get('#opinions-detail')
    expect(detail.findAll('thead th').map(th => th.text())).toEqual([
      'Critère',
      'Richard',
      'Chloé',
      'Écart',
      'Ce qu’en dit chacun',
    ])
    expect(detail.findAll('tbody tr')).toHaveLength(8)
    const quiet = detail.get('[data-row="quiet"]')
    expect(quiet.attributes('data-agreement')).toBe('disagree')
    expect(quiet.classes()).toContain('bg-warn-soft/60')
    expect(n(quiet.text())).toBe(
      'Calme4 · bien2 · bof2 pointsRichard : fenêtres fermées, ça va ; Chloé : bus devant la chambre'
    )
    expect(n(detail.get('[data-row="street"]').text())).toBe(
      'Rue et ambiance4 · bien——Chloé : pas encore d’avis'
    )
    expect(detail.get('[data-row="layout"]').text()).toContain('d’accord')
    expect(detail.get('[data-row="luminosity"]').text()).toContain('1 point')
    expect(detail.text()).toContain(
      'Écart de 2 points ou plus : à rediscuter. « — » : pas encore d’avis.'
    )
  })

  it('la contre-visite est proposée, pré-remplie, et n’est ajoutée qu’au clic de confirmation', async () => {
    const acts = actions()
    const wrapper = mountSection(itemWith(), { actions: acts })
    await wrapper.get('[data-testid="opinions-toggle"]').trigger('click')
    const buttons = wrapper.findAll('[data-testid="counter-visit"]')
    expect(buttons.map(b => b.text())).toEqual([
      'À revoir à la contre-visite : le calme',
      'À revoir à la contre-visite : « on s’y voit »',
    ])
    await buttons[0]?.trigger('click')
    const proposal = wrapper.get('[data-testid="counter-visit-proposal"]')
    expect(n(proposal.text())).toContain(
      'Les notes s’écartent de 2 points : Richard 4 (« fenêtres fermées, ça va »), Chloé 2 (« bus devant la chambre »).'
    )
    expect(acts.addTask).not.toHaveBeenCalled()
    await proposal.get('[data-testid="counter-visit-confirm"]').trigger('click')
    await flushPromises()
    expect(acts.addTask).toHaveBeenCalledWith({
      label: 'À revoir à la contre-visite : le calme',
      details:
        'Les notes s’écartent de 2 points : Richard 4 (« fenêtres fermées, ça va »), Chloé 2 (« bus devant la chambre »).',
    })
    expect(wrapper.get('[data-testid="counter-visit-added"]').text()).toBe(
      'Tâche ajoutée dans À faire : À revoir à la contre-visite : le calme'
    )
    // Annuler la proposition : rien n'est créé.
    await wrapper.get('[data-testid="counter-visit"]').trigger('click')
    const cancel = wrapper
      .get('[data-testid="counter-visit-proposal"]')
      .findAll('button')
      .find(b => b.text() === 'Annuler')
    await cancel?.trigger('click')
    expect(acts.addTask).toHaveBeenCalledTimes(1)
  })

  it('« Déjà dans À faire » quand la tâche est ouverte ; un échec se dit', async () => {
    const acts = actions()
    acts.addTask.mockRejectedValueOnce(new ApiError(409, 'Refusé : conflit'))
    const wrapper = mountSection(
      itemWith({
        tasks: [
          fakeTask({
            id: 'aaaaaaaa-0000-4000-8000-0000000000aa',
            label: 'À revoir à la contre-visite : le calme',
            origin: 'opinion',
          }),
        ],
      }),
      { actions: acts }
    )
    await wrapper.get('[data-testid="opinions-toggle"]').trigger('click')
    expect(wrapper.get('[data-testid="counter-visit-exists"]').text()).toBe(
      'Déjà dans À faire : À revoir à la contre-visite : le calme'
    )
    await wrapper.get('[data-testid="counter-visit"]').trigger('click')
    await wrapper.get('[data-testid="counter-visit-confirm"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Refusé : conflit')
  })
})

describe('avis à l’aveugle (maquette « Avis à l’aveugle »)', () => {
  it('tant que je n’ai pas noté, l’autre avis est compté, jamais montré ; « Voir quand même »', async () => {
    const [, chloe] = mockupOpinions()
    const acts = actions()
    const wrapper = mountSection(
      itemWith({ opinions: [chloe as NonNullable<typeof chloe>] }),
      { actions: acts }
    )
    const mine = wrapper.get(`[data-member="${R}"]`)
    expect(mine.attributes('data-state')).toBe('me-missing')
    expect(n(mine.text())).toContain(
      'Tu n’as pas encore donné ton avis. Note de ton côté d’abord : tu verras ensuite celui de Chloé, sans influence.'
    )
    const other = wrapper.get(`[data-member="${C}"]`)
    expect(other.attributes('data-state')).toBe('masked')
    expect(n(other.text())).toContain(
      'Chloé a noté 7 critères sur 8. Ses notes restent masquées tant que tu n’as pas donné les tiennes.'
    )
    expect(other.findAll('[aria-hidden="true"] span')).toHaveLength(7)
    expect(wrapper.text()).not.toContain('Belle lumière')
    expect(wrapper.text()).not.toContain('3/5')
    expect(wrapper.find('[data-testid="opinions-sentence"]').exists()).toBe(
      false
    )
    expect(wrapper.get('[data-testid="blind-why"]').text()).toContain(
      'Pourquoi masquer ?'
    )
    await other.get('[data-testid="opinion-reveal"]').trigger('click')
    await flushPromises()
    expect(acts.reveal).toHaveBeenCalledTimes(1)
  })

  it('après « Voir quand même » : l’avis de l’autre, et la mention qui suivra le mien', () => {
    const [, chloe] = mockupOpinions()
    const wrapper = mountSection(
      itemWith({
        opinions: [chloe as NonNullable<typeof chloe>],
        revealed: true,
      })
    )
    expect(wrapper.get(`[data-member="${C}"]`).attributes('data-state')).toBe(
      'rated'
    )
    expect(wrapper.text()).toContain('Belle lumière')
    expect(wrapper.get('[data-testid="revealed-note"]').text()).toBe(
      'Vu avant d’avoir noté : ton avis portera la mention « après avoir vu celui de Chloé ».'
    )
    expect(wrapper.find('[data-testid="blind-why"]').exists()).toBe(false)
  })

  it('après une visite faite avec moi : « Note pendant que c’est frais »', () => {
    const wrapper = mountSection(itemWith({ opinions: [] }), {
      visits: [doneVisit],
    })
    const mine = wrapper.get(`[data-member="${R}"]`)
    expect(n(mine.text())).toContain('Visite faite le 14 oct.')
    expect(mine.get('[data-testid="fresh-visit"]').text()).toContain(
      'Note pendant que c’est frais'
    )
    expect(wrapper.get(`[data-member="${C}"]`).text()).toContain(
      'Pas encore donné'
    )
  })
})

describe('« Mon avis », critère par critère (maquette « Donner son avis »)', () => {
  it('six choix par critère au clavier, mot facultatif, note globale à part, moyenne en direct', async () => {
    const acts = actions()
    const wrapper = mountSection(itemWith({ opinions: [] }), {
      actions: acts,
      visits: [doneVisit],
    })
    await wrapper.get('[data-testid="opinion-edit"]').trigger('click')
    const form = wrapper.get('[data-testid="my-opinion-form"]')
    expect(form.get('#my-opinion-title').text()).toBe('Mon avis : Richard')
    expect(form.get('[data-testid="my-opinion-visit"]').text()).toContain(
      'Tu étais à la visite du 14 oct. : ces notes seront marquées « après visite ».'
    )
    const groups = form.findAll('[role="radiogroup"]')
    expect(groups).toHaveLength(9)
    const quiet = form.get('[data-criterion="quiet"] [role="radiogroup"]')
    expect(quiet.attributes('aria-labelledby')).toBe('crit-quiet-label')
    const radios = quiet.findAll('[role="radio"]')
    expect(radios.map(r => r.attributes('aria-label'))).toEqual(
      SCORE_CHOICES.map(c => c.aria)
    )
    expect(radios.map(r => r.attributes('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
      '-1',
      '-1',
      '-1',
    ])
    await radios[0]?.trigger('keydown', { key: 'ArrowRight' })
    expect(radios[1]?.attributes('aria-checked')).toBe('true')
    expect(radios[1]?.attributes('tabindex')).toBe('0')
    await radios[1]?.trigger('keydown', { key: 'End' })
    expect(radios[5]?.attributes('aria-checked')).toBe('true')
    await radios[5]?.trigger('keydown', { key: 'ArrowRight' })
    expect(radios[0]?.attributes('aria-checked')).toBe('true')
    await radios[0]?.trigger('keydown', { key: 'ArrowLeft' })
    expect(radios[5]?.attributes('aria-checked')).toBe('true')
    await radios[5]?.trigger('keydown', { key: 'Home' })
    expect(radios[0]?.attributes('aria-checked')).toBe('true')
    await radios[2]?.trigger('click')
    expect(radios[2]?.attributes('aria-checked')).toBe('true')
    await form
      .get('[data-criterion="feel"] [role="radio"][data-value="4"]')
      .trigger('click')
    const average = form.get('[data-testid="my-opinion-average"]')
    expect(average.get('strong').text()).toBe('3,0')
    expect(n(average.text())).toContain('2 critères notés sur 8')
    const toggleWord = form.get('[data-testid="word-toggle-quiet"]')
    expect(toggleWord.text()).toBe('Ajouter un mot')
    expect(toggleWord.attributes('aria-expanded')).toBe('false')
    await toggleWord.trigger('click')
    expect(toggleWord.attributes('aria-expanded')).toBe('true')
    const input = form.get('[data-testid="word-quiet"]')
    expect(input.attributes('maxlength')).toBe('80')
    expect(form.get(`label[for="${input.attributes('id')}"]`).text()).toBe(
      'Un mot sur « Calme » (facultatif)'
    )
    await input.setValue('bus devant la chambre')
    const global = form.get('[aria-labelledby="global-rating-label"]')
    await global.get('[aria-label="3 sur 5"]').trigger('click')
    await global.get('[aria-label="4 sur 5"]').trigger('click')
    expect(
      global.get('[aria-label="4 sur 5"]').attributes('aria-checked')
    ).toBe('true')
    await form.get('#opinion-text').setValue('  Belle lumière  ')
    await form.trigger('submit')
    await flushPromises()
    expect(acts.save).toHaveBeenCalledWith({
      rating: 4,
      text: 'Belle lumière',
      scores: {
        quiet: { score: 2, word: 'bus devant la chambre' },
        feel: { score: 4, word: null },
      },
      expectedUpdatedAt: null,
    })
    expect(wrapper.find('[data-testid="my-opinion-form"]').exists()).toBe(false)
  })

  it('un second clic enlève la note globale ; un échec garde la saisie ; Annuler referme', async () => {
    const acts = actions()
    acts.save.mockRejectedValueOnce(
      new ApiError(409, 'Ton avis a changé entre-temps : relis-le.')
    )
    const wrapper = mountSection(itemWith(), { actions: acts })
    await wrapper.get('[data-testid="opinion-edit"]').trigger('click')
    const form = wrapper.get('[data-testid="my-opinion-form"]')
    const four = form.get('[aria-label="4 sur 5"]')
    expect(four.attributes('aria-checked')).toBe('true')
    await four.trigger('click')
    expect(four.attributes('aria-checked')).toBe('false')
    await form.trigger('submit')
    await flushPromises()
    expect(acts.save).toHaveBeenCalledWith(
      expect.objectContaining({
        rating: 0,
        scores: {},
        expectedUpdatedAt: '2026-11-03T10:00:00.000Z',
      })
    )
    expect(form.get('[role="alert"]').text()).toBe(
      'Ton avis a changé entre-temps : relis-le.'
    )
    await form.get('[data-testid="opinion-cancel"]').trigger('click')
    expect(wrapper.find('[data-testid="my-opinion-form"]').exists()).toBe(false)
    // Rien de changé : enregistrer referme sans rien envoyer.
    await wrapper.get('[data-testid="opinion-edit"]').trigger('click')
    await wrapper.get('[data-testid="my-opinion-form"]').trigger('submit')
    await flushPromises()
    expect(acts.save).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="my-opinion-form"]').exists()).toBe(false)
  })

  it('au téléphone : six boutons de 48 px par critère, le mot à droite, mots et phrase repliés', async () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia
    try {
      const wrapper = mountSection(itemWith({ opinions: [] }), {
        visits: [doneVisit],
      })
      await wrapper.get('[data-testid="opinion-edit"]').trigger('click')
      const form = wrapper.get('[data-testid="my-opinion-form"]')
      expect(form.get('[data-testid="my-opinion-visit"]').text()).toContain(
        'Note pendant que c’est frais'
      )
      const quiet = form.get('[data-criterion="quiet"]')
      const group = quiet.get('[role="radiogroup"]')
      expect(group.classes()).toContain('grid-cols-6')
      const radios = group.findAll('[role="radio"]')
      expect(radios.every(r => r.classes().includes('h-12'))).toBe(true)
      expect(radios.map(r => r.text())).toEqual(['—', '1', '2', '3', '4', '5'])
      await radios[4]?.trigger('click')
      expect(n(quiet.text())).toContain('Calmebien')
      expect(form.find('#opinion-text').exists()).toBe(false)
      expect(form.find('[data-testid="word-toggle-quiet"]').exists()).toBe(
        false
      )
      await form.get('[data-testid="opinion-details-toggle"]').trigger('click')
      expect(form.find('#opinion-text').exists()).toBe(true)
      expect(form.find('[data-testid="word-toggle-quiet"]').exists()).toBe(true)
      expect(
        form.get('[aria-labelledby="global-rating-label"]').classes()
      ).toContain('grid-cols-5')
    } finally {
      window.matchMedia = original
    }
  })
})

describe('la garde des modifications non enregistrées (lot 19, étendue)', () => {
  it('« Mon avis » modifié : changer d’onglet attend la confirmation, sans window.confirm', async () => {
    const original = window.confirm
    const confirm = vi.fn()
    window.confirm = confirm
    const listing = ref<Listing | null>(fakeListing())
    const editor = createListingEditor({
      listing,
      changedFields: computed(() => []),
      preview: draft => useLivePreview(draft, ref(DEFAULT_ASSUMPTIONS)),
      submit: vi.fn().mockResolvedValue(undefined),
    })
    const item = itemWith()
    const Host = defineComponent({
      setup() {
        return () =>
          h('div', [
            h(UnsavedChangesBar),
            h(OpinionsSection, {
              item,
              members: MEMBERS,
              meId: R,
              actions: actions(),
            }),
          ])
      },
    })
    const wrapper = mount(Host, {
      attachTo: document.body,
      global: { provide: { [LISTING_EDITOR as symbol]: editor } },
    })
    await wrapper.get('[data-testid="opinion-edit"]').trigger('click')
    expect(editor.editing.value).toBe('opinion')
    expect(editor.dirty.value).toBe(false)
    expect(editor.titleOf('opinion')).toBe('Mon avis')
    await wrapper
      .get('[data-criterion="quiet"] [role="radio"][data-value="3"]')
      .trigger('click')
    expect(editor.dirty.value).toBe(true)

    const leave = vi.fn()
    editor.guard(leave)
    await flushPromises()
    expect(leave).not.toHaveBeenCalled()
    expect(editor.pending.value?.section).toBe('opinion')
    const bar = wrapper.get('[data-testid="unsaved-changes"]')
    expect(n(bar.text())).toContain(
      'La section « Mon avis » a des modifications qui seront perdues.'
    )
    await bar.get('[data-testid="unsaved-stay"]').trigger('click')
    expect(editor.pending.value).toBeNull()
    expect(wrapper.find('[data-testid="my-opinion-form"]').exists()).toBe(true)

    // Ouvrir une section de la fiche passe aussi par la garde.
    editor.start('works')
    expect(editor.editing.value).toBe('opinion')
    expect(editor.pending.value?.section).toBe('opinion')
    await flushPromises()
    await wrapper.get('[data-testid="unsaved-leave"]').trigger('click')
    expect(editor.editing.value).toBe('works')
    expect(wrapper.find('[data-testid="my-opinion-form"]').exists()).toBe(false)
    expect(confirm).not.toHaveBeenCalled()
    wrapper.unmount()
    window.confirm = original
  })
})

describe('ScoreRadioGroup', () => {
  it('le choix coché seul dans la tabulation, flèches haut et bas, désactivé', async () => {
    const wrapper = mount(ScoreRadioGroup, {
      props: { choices: SCORE_CHOICES, modelValue: 3, labelledby: 'x' },
    })
    const radios = wrapper.findAll('[role="radio"]')
    expect(radios[3]?.attributes('tabindex')).toBe('0')
    expect(radios[0]?.attributes('tabindex')).toBe('-1')
    await radios[3]?.trigger('keydown', { key: 'ArrowDown' })
    await radios[3]?.trigger('keydown', { key: 'ArrowUp' })
    await radios[3]?.trigger('keydown', { key: 'a' })
    expect(wrapper.emitted('update:modelValue')).toEqual([[4], [2]])
    await wrapper.setProps({ disabled: true })
    await radios[1]?.trigger('click')
    await radios[1]?.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')).toHaveLength(2)
  })
})
