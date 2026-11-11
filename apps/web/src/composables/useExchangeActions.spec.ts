/**
 * Lot 19 : les actions des échanges avec l'annonceur, sorties de l'ancien
 * onglet « Échanges » : chaque écriture appelle la bonne route, rend son
 * message ou l'erreur de l'API. Aucun message ne part de l'application.
 * API simulée ; données fictives.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { fakeAgencyRequest, fakeExchanges } from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  agency: {
    exchanges: vi.fn(),
    settings: vi.fn(),
    updateSettings: vi.fn(),
    putContact: vi.fn(),
    clearContact: vi.fn(),
    draft: vi.fn(),
    update: vi.fn(),
    approve: vi.fn(),
    cancel: vi.fn(),
    sent: vi.fn(),
    noAnswer: vi.fn(),
    apply: vi.fn(),
  },
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import { useFeedbackStore } from '@/stores/feedback'
import { useExchangeActions } from './useExchangeActions'
import type { ExchangeActions } from './useExchangeActions'

const LISTING = '11111111-1111-4111-8111-111111111111'
const REQUEST = fakeAgencyRequest()
/** Lot 22 : le dernier message de la zone commune. */
const lastMessage = () => useFeedbackStore().messages.at(-1)?.text ?? null

function setup(): ExchangeActions {
  let actions: ExchangeActions | null = null
  const Host = defineComponent({
    setup() {
      actions = useExchangeActions(LISTING)
      return () => h('div')
    },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  mount(Host, {
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  })
  return actions as unknown as ExchangeActions
}

describe('useExchangeActions (lot 19)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.agency.exchanges.mockResolvedValue(
      fakeExchanges({ requests: [REQUEST] })
    )
    apiMock.agency.settings.mockResolvedValue({
      signature: 'Richard et Chloé',
      custom: false,
      defaultSignature: 'Richard et Chloé',
      followUpBusinessDays: 5,
    })
  })

  it('prépare, relance, valide, corrige, annule, note l’envoi, « pas de réponse », applique', async () => {
    for (const fn of [
      'draft',
      'update',
      'approve',
      'cancel',
      'sent',
      'noAnswer',
    ] as const) {
      apiMock.agency[fn].mockResolvedValue({ request: REQUEST, requests: [] })
    }
    apiMock.agency.apply.mockResolvedValue({
      request: REQUEST,
      listing: { listing: { id: LISTING } },
      applied: [],
    })
    const a = setup()
    await flushPromises()
    expect(a.view.value?.requests).toHaveLength(1)

    expect(await a.prepare()).toBe(true)
    expect(apiMock.agency.draft).toHaveBeenLastCalledWith(LISTING, {})
    expect(lastMessage()).toBe('Message préparé : relis-le, puis valide-le.')
    await a.followUp(REQUEST.id)
    expect(apiMock.agency.draft).toHaveBeenLastCalledWith(LISTING, {
      followUpOf: REQUEST.id,
    })
    await a.approve([REQUEST.id])
    expect(apiMock.agency.approve).toHaveBeenCalledWith([REQUEST.id])
    expect(lastMessage()).toContain('Message validé : demande à Claude')
    await a.approve(['a', 'b'])
    expect(lastMessage()).toContain('2 messages validés')
    await a.save(REQUEST.id, { subject: 'Objet', body: 'Texte' })
    expect(apiMock.agency.update).toHaveBeenCalledWith(REQUEST.id, {
      subject: 'Objet',
      body: 'Texte',
    })
    await a.cancel(REQUEST.id)
    expect(apiMock.agency.cancel).toHaveBeenCalledWith(REQUEST.id)
    await a.markSent(REQUEST.id)
    expect(apiMock.agency.sent).toHaveBeenCalledWith(REQUEST.id, undefined)
    await a.noAnswer(REQUEST.id)
    expect(apiMock.agency.noAnswer).toHaveBeenCalledWith(REQUEST.id)
    await a.apply(REQUEST.id, ['propertyTax'])
    expect(apiMock.agency.apply).toHaveBeenCalledWith(REQUEST.id, {
      keys: ['propertyTax'],
      expectedUpdatedAt: '2026-11-03T10:00:00.000Z',
    })
    expect(lastMessage()).toBe('Valeur de l’annonceur appliquée à la fiche.')
  })

  it('contact, effacement, signature ; l’erreur de l’API est rendue', async () => {
    const { ApiError } =
      await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
    apiMock.agency.putContact.mockResolvedValueOnce({})
    apiMock.agency.putContact.mockRejectedValueOnce(
      new ApiError(400, 'E-mail illisible')
    )
    apiMock.agency.clearContact.mockResolvedValue(undefined)
    apiMock.agency.updateSettings.mockResolvedValue({
      signature: 'R. et C.',
      custom: true,
      defaultSignature: 'Richard et Chloé',
      followUpBusinessDays: 5,
    })
    apiMock.agency.approve.mockRejectedValue(
      new ApiError(400, 'Seul un message « à valider » se valide')
    )
    const a = setup()
    await flushPromises()
    const input = {
      agencyName: 'Agence [Exemple]',
      contactName: null,
      email: null,
      phone: null,
      portalMessageUrl: null,
      preferredChannel: null,
    }
    expect(await a.saveContact(input)).toBeNull()
    expect(lastMessage()).toBe('Contact enregistré.')
    const error = await a.saveContact(input)
    expect(error).toBeInstanceOf(ApiError)
    expect(await a.clearContact()).toBe(true)
    expect(apiMock.agency.clearContact).toHaveBeenCalledWith(LISTING)
    await a.saveSignature('R. et C.')
    expect(apiMock.agency.updateSettings).toHaveBeenCalledWith('R. et C.')
    const before = useFeedbackStore().messages.length
    expect(await a.approve([REQUEST.id])).toBe(false)
    expect(a.failure.value).toBe('Seul un message « à valider » se valide')
    expect(useFeedbackStore().messages.length).toBe(before)
    apiMock.agency.cancel.mockRejectedValue(new Error('réseau'))
    await a.cancel(REQUEST.id)
    expect(a.failure.value).toBe('L’enregistrement a échoué.')
  })
})
