import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { ApiError } from '@/lib/api'
import { useAction } from '@/composables/useAction'
import { installLeaveGuard, useLeaveGuard } from '@/composables/useLeaveGuard'
import {
  FEEDBACK_MAX,
  FEEDBACK_TIMEOUT_MS,
  FEEDBACK_UNDO_TIMEOUT_MS,
  useFeedbackStore,
} from '@/stores/feedback'
import { useLeaveGuardStore } from '@/stores/leave-guard'
import FeedbackHost from './FeedbackHost.vue'
import UnsavedDialog from './UnsavedDialog.vue'

describe('zone de messages (stores/feedback)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('un message part seul ; avec « Annuler », il reste plus longtemps', () => {
    const store = useFeedbackStore()
    store.success('Tâche cochée.')
    store.success('Brouillon repêché.', { undo: () => undefined })
    expect(store.messages.map(m => m.action?.label ?? null)).toEqual([
      null,
      'Annuler',
    ])
    vi.advanceTimersByTime(FEEDBACK_TIMEOUT_MS)
    expect(store.messages.map(m => m.text)).toEqual(['Brouillon repêché.'])
    vi.advanceTimersByTime(FEEDBACK_UNDO_TIMEOUT_MS - FEEDBACK_TIMEOUT_MS)
    expect(store.messages).toHaveLength(0)
  })

  it('« Annuler » défait l’action ; un échec de l’annulation est dit', async () => {
    const store = useFeedbackStore()
    const undo = vi.fn().mockRejectedValue(new ApiError(409, 'Déjà changé.'))
    const id = store.success('Réponse enregistrée.', { undo })
    await store.act(id)
    expect(undo).toHaveBeenCalled()
    expect(store.messages.map(m => [m.tone, m.text])).toEqual([
      ['bad', 'Déjà changé.'],
    ])
  })

  it('survol : le message reste ; trois au plus', () => {
    const store = useFeedbackStore()
    const id = store.success('Un')
    store.hold(id)
    vi.advanceTimersByTime(FEEDBACK_TIMEOUT_MS * 2)
    expect(store.messages).toHaveLength(1)
    store.release(id)
    vi.advanceTimersByTime(FEEDBACK_TIMEOUT_MS)
    expect(store.messages).toHaveLength(0)
    for (let i = 0; i < FEEDBACK_MAX + 2; i++) store.success(`m${i}`)
    expect(store.messages).toHaveLength(FEEDBACK_MAX)
  })

  it('la zone la plus récente (panneau ouvert) montre les messages', async () => {
    const store = useFeedbackStore()
    const page = mount(FeedbackHost)
    const panel = mount(FeedbackHost)
    store.success('Enregistré.')
    await nextTick()
    expect(page.findAll('[data-testid="feedback-message"]')).toHaveLength(0)
    expect(panel.get('[data-testid="feedback-message"]').text()).toContain(
      'Enregistré.'
    )
    panel.unmount()
    await nextTick()
    expect(page.findAll('[data-testid="feedback-message"]')).toHaveLength(1)
    page.unmount()
  })

  it('« Annuler » dans la zone appelle l’annulation', async () => {
    const store = useFeedbackStore()
    const undo = vi.fn()
    const host = mount(FeedbackHost)
    store.success('Tâche cochée.', { undo })
    await nextTick()
    await host.get('[data-testid="feedback-action"]').trigger('click')
    await flushPromises()
    expect(undo).toHaveBeenCalled()
    host.unmount()
  })
})

describe('useAction', () => {
  function withAction() {
    let action: ReturnType<typeof useAction> | undefined
    mount(
      defineComponent({
        setup() {
          action = useAction('L’enregistrement a échoué.')
          return () => h('div')
        },
      })
    )
    return action as ReturnType<typeof useAction>
  }

  it('réussite : message et « Annuler » dans la zone ; échec : erreur au bloc', async () => {
    const action = withAction()
    const store = useFeedbackStore()
    const undo = vi.fn()
    const result = await action.run(() => Promise.resolve(42), {
      success: value => `Fait (${value}).`,
      undo,
    })
    expect(result).toBe(42)
    expect(store.messages[0]?.text).toBe('Fait (42).')
    await store.act(store.messages[0]?.id ?? 0)
    expect(undo).toHaveBeenCalledWith(42)

    await action.run(() => Promise.reject(new ApiError(409, 'Modifiée.')))
    expect(action.error.value).toBe('Modifiée.')
    await action.run(() => Promise.reject(new Error('boom')))
    expect(action.error.value).toBe('L’enregistrement a échoué.')
    expect(action.pending.value).toBe(false)
  })

  it('`rethrow` garde l’erreur pour l’appelant (un formulaire garde sa saisie)', async () => {
    const action = withAction()
    await expect(
      action.run(() => Promise.reject(new ApiError(400, 'Non.')), {
        rethrow: true,
      })
    ).rejects.toThrow('Non.')
    expect(action.error.value).toBe('Non.')
  })
})

describe('garde des modifications', () => {
  function makeRouter() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { render: () => null } },
        { path: '/annonces/:id?', component: { render: () => null } },
        { path: '/criteres', component: { render: () => null } },
      ],
    })
    const win = {
      addEventListener: vi.fn(),
      history: { state: null } as unknown as History,
    }
    installLeaveGuard(router, () => useLeaveGuardStore(), win)
    return { router, win }
  }

  it('une navigation qui quitte une saisie modifiée attend la confirmation', async () => {
    const { router } = makeRouter()
    await router.push('/annonces/nouvelle')
    const store = useLeaveGuardStore()
    let dirty = true
    const discard = vi.fn(() => (dirty = false))
    store.register({
      title: () => 'Nouvelle annonce',
      isDirty: () => dirty,
      discard,
    })
    await router.push('/criteres')
    expect(router.currentRoute.value.path).toBe('/annonces/nouvelle')
    expect(store.pending?.title).toBe('Nouvelle annonce')
    store.stay()
    expect(store.pending).toBeNull()
    await router.push('/criteres')
    store.confirmLeave()
    await flushPromises()
    expect(discard).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/criteres')
  })

  it('une source dit ce qui la quitte ; sa propre interface demande', async () => {
    const { router } = makeRouter()
    await router.push('/annonces/a?onglet=bien')
    const store = useLeaveGuardStore()
    let dirty = true
    const prompt = vi.fn()
    store.register({
      title: () => 'Caractéristiques',
      isDirty: () => dirty,
      discard: () => (dirty = false),
      prompt,
      leaves: (to, from) =>
        to.path !== from.path || to.query.onglet !== from.query.onglet,
    })
    await router.push('/annonces/a?onglet=bien&carte=1')
    expect(router.currentRoute.value.fullPath).toBe(
      '/annonces/a?onglet=bien&carte=1'
    )
    await router.push('/annonces/a?onglet=budget')
    expect(router.currentRoute.value.query.onglet).toBe('bien')
    expect(prompt).toHaveBeenCalledTimes(1)
    const proceed = prompt.mock.calls[0]?.[0] as () => void
    proceed()
    await flushPromises()
    expect(router.currentRoute.value.query.onglet).toBe('budget')
  })

  it('beforeunload : la question du navigateur seulement si une saisie est modifiée', () => {
    const { win } = makeRouter()
    const listener = win.addEventListener.mock.calls.find(
      ([type]) => type === 'beforeunload'
    )?.[1] as (event: Event) => void
    const event = { preventDefault: vi.fn(), returnValue: undefined }
    listener(event as unknown as Event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    useLeaveGuardStore().register({
      title: () => 'x',
      isDirty: () => true,
      discard: () => undefined,
    })
    listener(event as unknown as Event)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('useLeaveGuard : fermer un panneau modifié passe par la boîte commune', async () => {
    let guard: ((run: () => void) => void) | undefined
    let dirty = true
    const host = mount(
      defineComponent({
        setup() {
          guard = useLeaveGuard({
            title: () => 'Critère « Bordeaux centre »',
            isDirty: () => dirty,
            discard: () => (dirty = false),
          }).guard
          return () => h(UnsavedDialog)
        },
      }),
      { attachTo: document.body }
    )
    const close = vi.fn()
    guard?.(close)
    await flushPromises()
    const dialog = document.body.querySelector('[data-testid="unsaved-dialog"]')
    expect(dialog?.textContent).toContain(
      '« Critère « Bordeaux centre » » a des modifications qui seront perdues.'
    )
    expect(close).not.toHaveBeenCalled()
    ;(
      document.body.querySelector(
        '[data-testid="unsaved-leave"]'
      ) as HTMLElement
    ).click()
    await flushPromises()
    expect(close).toHaveBeenCalled()
    expect(dirty).toBe(false)
    host.unmount()
    // Démonté : la source n'est plus gardée.
    expect(useLeaveGuardStore().sources).toHaveLength(0)
  })
})
