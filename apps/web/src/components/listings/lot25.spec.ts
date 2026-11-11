/**
 * Lot 25, la fiche répond d'abord : jugements étiquetés, couverture, réponse
 * et action en tête de la Synthèse, focus et conflit des sections. Données
 * fictives, évaluées par le vrai paquet `domain`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Listing, ListingCover as Cover } from '@apart/contracts'
import { DEFAULT_ASSUMPTIONS, NO_CRITERIA_FIT } from '@apart/contracts'
import { judgementsOfListing, listingJudgements } from '@apart/domain'
import { ApiError } from '@/lib/api'
import { SECTION_CONFLICT_MESSAGE } from '@/lib/errors'
import {
  createListingEditor,
  provideListingEditor,
} from '@/composables/useListingEditor'
import type { ListingEditor } from '@/composables/useListingEditor'
import { useLivePreview } from '@/composables/useLivePreview'
import { fakeEvaluated, fakeListing } from '@/test/fixtures'
import type { ListingTab } from '@/lib/listing-tabs'
import JudgementPills from './JudgementPills.vue'
import ListingCover from './ListingCover.vue'
import ListingSynthesis from './ListingSynthesis.vue'
import ListingTabs from './ListingTabs.vue'
import FeaturesSection from './property/FeaturesSection.vue'

enableAutoUnmount(afterEach)

const cover = (over: Partial<Cover> = {}): Cover => ({
  listingId: '11111111-1111-4111-8111-111111111111',
  photoId: '22222222-2222-4222-8222-222222222222',
  visitId: '33333333-3333-4333-8333-333333333333',
  thumbnailUrl: 'https://storage.invalid/sign/thumb.webp?token=t',
  urlExpiresAt: '2026-11-11T10:10:00.000Z',
  chosen: false,
  ...over,
})

describe('Lot 25 : trois jugements étiquetés', () => {
  const judgements = listingJudgements({
    verdict: 'target',
    fit: { level: 'out', activeCriteria: 1 },
    rental: 'conditional',
  })

  it('« Cible » à côté de « Hors critères » dit de quoi il s’agit, dans l’ordre', () => {
    const wrapper = mount(JudgementPills, { props: { judgements } })
    const pills = wrapper.findAll('[data-judgement]')
    expect(pills.map(p => p.attributes('data-judgement'))).toEqual([
      'profitability',
      'search',
      'rental',
    ])
    expect(pills.map(p => p.text())).toEqual([
      '✓Rentabilité :Cible',
      '✗Recherche :Hors critères',
      '~Location :Sous conditions',
    ])
    // Le sens ne repose pas sur la seule couleur : un symbole et le mot.
    expect(pills.map(p => p.attributes('data-sense'))).toEqual([
      'good',
      'bad',
      'mixed',
    ])
    expect(pills[0]?.attributes('title')).toMatch(/^Rentabilité : /)
  })

  it('compact : les formes courtes, l’étiquette entière pour le lecteur d’écran', () => {
    const wrapper = mount(JudgementPills, {
      props: { judgements, compact: true, nowrap: true },
    })
    const first = wrapper.get('[data-judgement="profitability"]')
    expect(first.get('[aria-hidden="true"]:not(:first-child)').text()).toBe(
      'Renta.'
    )
    expect(first.get('.sr-only').text()).toBe('Rentabilité :')
    expect(wrapper.get('ul').classes()).toContain('flex-nowrap')
  })

  it('rien à montrer : rien', () => {
    expect(
      mount(JudgementPills, { props: { judgements: [] } })
        .find('ul')
        .exists()
    ).toBe(false)
  })
})

describe('Lot 25 : la photo de couverture', () => {
  it('une vignette de visite, sans référent ; rien sans photo', async () => {
    expect(
      mount(ListingCover, { props: { cover: null } })
        .find('img')
        .exists()
    ).toBe(false)
    expect(
      mount(ListingCover, { props: { cover: cover({ thumbnailUrl: null }) } })
        .find('img')
        .exists()
    ).toBe(false)
    const wrapper = mount(ListingCover, {
      props: { cover: cover(), size: 'card' },
    })
    const img = wrapper.get('img')
    expect(img.attributes('src')).toContain('/sign/')
    expect(img.attributes('referrerpolicy')).toBe('no-referrer')
    expect(img.attributes('alt')).toBe('')
    // Une URL expirée : l'image disparaît et demande une relecture.
    await img.trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.emitted('expired')).toHaveLength(1)
    await wrapper.setProps({
      cover: cover({ thumbnailUrl: 'https://storage.invalid/sign/new.webp' }),
    })
    expect(wrapper.find('img').exists()).toBe(true)
  })
})

describe('Lot 25 : la Synthèse répond d’abord', () => {
  function mountSynthesis(over: Record<string, unknown> = {}) {
    setActivePinia(createPinia())
    const item = fakeEvaluated(
      {},
      {
        criteriaFit: {
          ...NO_CRITERIA_FIT,
          activeCriteria: 1,
          level: 'in',
          name: 'Talence fictif',
        },
      }
    )
    return {
      item,
      wrapper: mount(ListingSynthesis, {
        props: {
          item,
          evaluation: item.evaluation,
          targetPrice: item.evaluation.targetPrice,
          negotiation: null,
          assumptions: DEFAULT_ASSUMPTIONS,
          ...over,
        },
        global: {
          plugins: [createPinia()],
          stubs: { OpinionsSection: true, CriteriaFitSection: true },
        },
      }),
    }
  }

  it('la phrase et l’action de l’étape avant les chiffres', async () => {
    const { wrapper } = mountSynthesis()
    const answer = wrapper.get('[data-testid="answer"]')
    const figures = wrapper.get('[data-testid="key-figures"]')
    expect(
      answer.element.compareDocumentPosition(figures.element) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    const sentence = answer
      .get('[data-testid="answer-sentence"]')
      .text()
      .replace(/[\u202f\u00a0]/g, ' ')
    // L'annonce fictive est hors cible ; la décote est hors de portée.
    // Lot 26 : une réponse courte, puis trois raisons courtes au plus.
    expect(sentence).toMatch(/^Plutôt non\.?\s*Hors de la cible de rentabilité/)
    const reasons = answer.findAll('[data-testid="answer-reasons"] li')
    expect(reasons.length).toBeGreaterThan(0)
    expect(reasons.length).toBeLessThanOrEqual(3)
    expect(reasons.map(r => r.text())).toContain(
      'Dans tes critères de recherche.'
    )
    expect(answer.attributes('data-tone')).toBe('no')
    const action = answer.get('[data-testid="answer-action"]')
    expect(action.text()).toBe('Trier cette annonce')
    await action.trigger('click')
    expect(wrapper.emitted('action')).toEqual([['triage']])
  })

  it('« Depuis ta dernière ouverture » en une ligne, le détail à la demande', async () => {
    const { wrapper } = mountSynthesis({
      changes: {
        listingId: '11111111-1111-4111-8111-111111111111',
        since: '2026-11-02T10:00:00.000Z',
        changedFields: ['price'],
        entries: [
          {
            id: '99999999-9999-4999-8999-999999999999',
            createdAt: '2026-11-03T09:00:00.000Z',
            action: 'listing.price_changed',
            kind: 'price',
            channel: 'mcp',
            channelLabel: 'Claude',
            actor: null,
            listing: null,
            summary: 'a changé le prix',
            changes: [],
          },
        ],
      },
    })
    const line = wrapper.get('[data-testid="changes-line"]')
    expect(line.text()).toContain('1 changement, par Claude : prix.')
    expect(wrapper.find('[data-testid="listing-changes"]').exists()).toBe(false)
    await line.get('[data-testid="changes-toggle"]').trigger('click')
    expect(wrapper.find('[data-testid="listing-changes"]').exists()).toBe(true)
  })

  it('sans évaluation : elle le dit, sans action inventée', () => {
    const { wrapper } = mountSynthesis({ evaluation: null })
    expect(wrapper.get('[data-testid="answer-sentence"]').text()).toContain(
      'Pas encore de réponse'
    )
  })
})

/** Une section de la fiche dans un hôte qui fournit l'éditeur. */
function mountSection(submit: (...args: unknown[]) => Promise<void>) {
  setActivePinia(createPinia())
  const listing = fakeListing()
  const current = ref<Listing | null>(listing)
  const reload = vi.fn(() =>
    Promise.resolve<Listing>({
      ...listing,
      rooms: 3,
      updatedAt: '2026-11-11T09:00:00.000Z',
    })
  )
  let editor!: ListingEditor
  const Host = defineComponent({
    setup() {
      editor = createListingEditor({
        listing: current,
        changedFields: computed(() => []),
        preview: draft => useLivePreview(draft, ref(DEFAULT_ASSUMPTIONS)),
        submit,
        reload,
      })
      provideListingEditor(editor)
      return () => h(FeaturesSection, { listing })
    },
  })
  const wrapper = mount(Host, {
    attachTo: document.body,
    global: { plugins: [createPinia()] },
  })
  return { wrapper, editor: () => editor, reload }
}

describe('Lot 25 : modifier une section', () => {
  it('le focus entre dans la section, puis revient sur « Modifier »', async () => {
    const { wrapper } = mountSection(() => Promise.resolve())
    await wrapper.get('[data-testid="edit-features"]').trigger('click')
    await flushPromises()
    const form = wrapper.get('form').element
    expect(form.contains(document.activeElement)).toBe(true)
    await wrapper.get('[data-testid="cancel-features"]').trigger('click')
    await flushPromises()
    expect(document.activeElement?.getAttribute('data-testid')).toBe(
      'edit-features'
    )
  })

  it('un conflit se dit en mots ; « Recharger » garde la saisie et prend la fiche relue', async () => {
    const submit = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          409,
          'L’annonce a changé depuis ta lecture (modifiée le 2026-11-11T09:00:00.000Z)'
        )
      )
    const { wrapper, editor, reload } = mountSection(submit)
    await wrapper.get('[data-testid="edit-features"]').trigger('click')
    await wrapper.get('#f-surface').setValue('52')
    await wrapper.get('[data-testid="save-features"]').trigger('submit')
    await flushPromises()
    const alert = wrapper.get('[data-testid="section-conflict"]')
    expect(alert.text()).toContain(SECTION_CONFLICT_MESSAGE)
    expect(alert.text()).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
    await alert.get('[data-testid="section-reload"]').trigger('click')
    await flushPromises()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(editor().draft.value.surface).toBe('52')
    expect(editor().draft.value.rooms).toBe('3')
    expect(editor().conflict.value).toBe(false)
    expect(wrapper.find('[data-testid="section-conflict"]').exists()).toBe(
      false
    )
  })
})

describe('Lot 25 : les flèches ne mènent pas à un onglet refusé', () => {
  it('la garde retient le changement : le focus ne bouge pas vers l’onglet refusé', async () => {
    const Host = defineComponent({
      setup() {
        const tab = ref<ListingTab>('synthese')
        // La garde refuse tout changement (une section modifiée attend sa réponse).
        const guarded = computed<ListingTab>({
          get: () => tab.value,
          set: () => undefined,
        })
        return () =>
          h(ListingTabs, {
            modelValue: guarded.value,
            'onUpdate:modelValue': (v: ListingTab) => {
              guarded.value = v
            },
          })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    const current = wrapper.get('[data-testid="tab-synthese"]')
    ;(current.element as HTMLElement).focus()
    await current.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    await nextTick()
    expect(document.activeElement?.getAttribute('data-testid')).toBe(
      'tab-synthese'
    )
  })
})

describe('Lot 25 : les jugements d’une annonce suivie', () => {
  it('liste, cartes, fiche : la même fonction de domain', () => {
    const item = fakeEvaluated()
    expect(judgementsOfListing(item).map(j => j.key)).toEqual([
      'profitability',
      'rental',
    ])
  })
})
