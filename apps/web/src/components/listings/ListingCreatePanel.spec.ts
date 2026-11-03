import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import {
  MEMBERS,
  fakeDuplicate,
  fakeEvaluated,
  fakeExtractionResult,
} from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  workspace: vi.fn(),
  assumptions: { current: vi.fn() },
  listings: { extract: vi.fn(), create: vi.fn() },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import ListingCreatePanel from './ListingCreatePanel.vue'

function mountPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(ListingCreatePanel, {
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
}

const body = (): HTMLElement => document.body

function query<T extends Element>(selector: string): T {
  const element = body().querySelector<T>(selector)
  if (!element) throw new Error(`introuvable : ${selector}`)
  return element
}

async function fill(selector: string, value: string): Promise<void> {
  const input = query<HTMLInputElement>(selector)
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

describe('ListingCreatePanel', () => {
  afterEach(() => {
    // Un test qui échoue avant `unmount` ne doit pas polluer le suivant.
    document.body.innerHTML = ''
  })

  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.assumptions.current.mockResolvedValue({
      id: 'v1',
      workspaceId: MEMBERS[0]?.workspaceId,
      label: null,
      effectiveFrom: '2026-11-03T10:00:00.000Z',
      createdAt: '2026-11-03T10:00:00.000Z',
      values: DEFAULT_ASSUMPTIONS,
    })
    apiMock.listings.create.mockResolvedValue({
      ...fakeEvaluated(),
      duplicates: [],
      createdTasks: [],
    })
  })

  it('s’ouvre sur « Coller une annonce », la saisie manuelle reste à côté', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(
      body().querySelector('[data-testid="extraction-pane"]')
    ).not.toBeNull()
    expect(body().querySelector('#f-title')).toBeNull()
    const tabs = [...body().querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    expect(tabs.map(t => t.textContent?.trim())).toEqual([
      'Coller une annonce',
      'Saisie manuelle',
    ])
    tabs[1]?.click()
    await flushPromises()
    expect(body().querySelector('#f-title')).not.toBeNull()
    expect(body().querySelector('[data-testid="extraction-pane"]')).toBeNull()
    wrapper.unmount()
  })

  it('analyse, pré-remplit la fiche avec provenance, confiance et champs manquants, puis enregistre en gardant l’IA sauf sur les champs corrigés', async () => {
    const result = fakeExtractionResult()
    apiMock.listings.extract.mockResolvedValue(result)
    const wrapper = mountPanel()
    await flushPromises()

    const analyze = query<HTMLButtonElement>('[data-testid="analyze"]')
    expect(analyze.disabled).toBe(true)
    await fill('#x-text', 'Appartement T2 Talence Forum - 189 000 € FAI')
    await fill('#x-url', 'https://agence-fictive.invalid/annonce/AGF-12345')
    expect(analyze.disabled).toBe(false)
    analyze.click()
    await flushPromises()
    expect(apiMock.listings.extract).toHaveBeenCalledWith({
      text: 'Appartement T2 Talence Forum - 189 000 € FAI',
      url: 'https://agence-fictive.invalid/annonce/AGF-12345',
      images: [],
    })

    // La fiche pré-remplie, le coût, les pastilles et les champs à compléter.
    expect(query<HTMLInputElement>('#f-title').value).toBe(
      'T2 Talence Forum, 3e étage avec balcon'
    )
    expect(query<HTMLInputElement>('#f-price').value).toBe('189000')
    expect(query<HTMLInputElement>('#f-surface').value).toBe('45.2')
    expect(query('[data-testid="extraction-cost"]').textContent).toContain(
      '0,0453 $'
    )
    const priceBadge = body()
      .querySelector('label[for="f-price"]')
      ?.querySelector('[data-source="ai"]')
    expect(priceBadge?.textContent?.trim()).toBe('IA 95 %')
    expect(priceBadge?.getAttribute('title')).toContain('189 000 € FAI')
    expect(
      body()
        .querySelector('label[for="f-lng"]')
        ?.querySelector('[data-source="open_data"]')
    ).not.toBeNull()
    expect(query('[data-testid="missing-fields"]').textContent).toContain(
      'Loyer visé'
    )
    expect(query('[data-testid="missing-fields"]').textContent).toContain(
      'Charges de copropriété annuelles (lu avec 50 % de confiance)'
    )
    expect(
      query('label[for="f-rent"]').closest('[data-missing="true"]')
    ).not.toBeNull()
    expect(
      query('label[for="f-price"]').closest('[data-missing="true"]')
    ).toBeNull()

    // Richard corrige le prix et renseigne le loyer : les pastilles basculent.
    await fill('#f-price', '185000')
    await fill('#f-rent', '800')
    expect(
      body()
        .querySelector('label[for="f-price"]')
        ?.querySelector('[data-source]')
    ).toBeNull()
    expect(
      query('label[for="f-rent"]').closest('[data-missing="true"]')
    ).toBeNull()

    query<HTMLButtonElement>('[data-testid="save"]').click()
    await flushPromises()
    expect(apiMock.listings.create).toHaveBeenCalledTimes(1)
    const sent = apiMock.listings.create.mock.calls[0]?.[0] as {
      price: number
      floor: number
      sourceText: string | null
      ignoreDuplicates: boolean
      rentalPlan: { targetRent: number } | null
      fieldSources: Record<string, { source: string }>
      location: { point: unknown; precision: string; inseeCode: string }
    }
    expect(sent.price).toBe(185_000)
    expect(sent.rentalPlan?.targetRent).toBe(800)
    expect(sent.floor).toBe(3)
    expect(sent.sourceText).toBe(result.listing.sourceText)
    expect(sent.ignoreDuplicates).toBe(false)
    expect(sent.fieldSources.price).toBeUndefined()
    expect(sent.fieldSources.rentalPlan).toBeUndefined()
    expect(sent.fieldSources.surface?.source).toBe('ai')
    expect(sent.fieldSources.point?.source).toBe('open_data')
    expect(sent.location.precision).toBe('street')
    expect(sent.location.inseeCode).toBe('33522')
    expect(wrapper.emitted('created')).toEqual([[fakeEvaluated().listing.id]])
    wrapper.unmount()
  })

  it('montre les doublons : « ouvrir l’existante » émet open, « créer quand même » enregistre avec ignoreDuplicates', async () => {
    apiMock.listings.extract.mockResolvedValue(
      fakeExtractionResult({ duplicates: [fakeDuplicate()] })
    )
    const wrapper = mountPanel()
    await flushPromises()
    await fill('#x-text', 'T2 Talence')
    query<HTMLButtonElement>('[data-testid="analyze"]').click()
    await flushPromises()
    const banner = query('[data-testid="duplicates-banner"]')
    expect(banner.textContent).toContain('T2 fictif')
    ;[...banner.querySelectorAll('button')]
      .find(b => b.textContent?.includes("ouvrir l'existante"))
      ?.click()
    await flushPromises()
    expect(wrapper.emitted('open')).toEqual([[fakeDuplicate().listingId]])

    ;[...banner.querySelectorAll('button')]
      .find(b => b.textContent?.includes('Créer quand même'))
      ?.click()
    await flushPromises()
    expect(body().querySelector('[data-testid="duplicates-banner"]')).toBeNull()
    query<HTMLButtonElement>('[data-testid="save"]').click()
    await flushPromises()
    expect(apiMock.listings.create.mock.calls[0]?.[0]).toMatchObject({
      ignoreDuplicates: true,
    })
    wrapper.unmount()
  })

  it('explique une IA indisponible et laisse la saisie manuelle', async () => {
    const { ApiError } = await import('@/lib/api')
    apiMock.listings.extract.mockRejectedValue(
      new ApiError(503, 'IA non configurée : renseignez ANTHROPIC_API_KEY.')
    )
    const wrapper = mountPanel()
    await flushPromises()
    await fill('#x-text', 'T2 Talence')
    query<HTMLButtonElement>('[data-testid="analyze"]').click()
    await flushPromises()
    expect(query('[role="alert"]').textContent).toContain('IA non configurée')
    expect(
      body().querySelector('[data-testid="extraction-pane"]')
    ).not.toBeNull()
    wrapper.unmount()
  })
})
