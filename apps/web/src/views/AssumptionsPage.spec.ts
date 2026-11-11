import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import type {
  AssumptionsImpact,
  AssumptionsUpdate,
  AssumptionsVersion,
} from '@apart/contracts'
import { DESKTOP_QUERY } from '@/composables/useMediaQuery'

const apiMock = vi.hoisted(() => ({
  assumptions: {
    current: vi.fn(),
    history: vi.fn(),
    update: vi.fn(),
    preview: vi.fn(),
  },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import AssumptionsPage from './AssumptionsPage.vue'
import { ApiError } from '@/lib/api'

const WS = '22222222-2222-4222-8222-222222222222'
const CURRENT: AssumptionsVersion = {
  id: '33333333-3333-4333-8333-333333333333',
  workspaceId: WS,
  label: 'Taux négocié',
  effectiveFrom: '2026-11-03T10:00:00.000Z',
  createdAt: '2026-11-03T10:00:00.000Z',
  values: { ...DEFAULT_ASSUMPTIONS, interestRate: 0.032 },
}
const OLDER: AssumptionsVersion = {
  ...CURRENT,
  id: '44444444-4444-4444-8444-444444444444',
  label: null,
  effectiveFrom: '2026-11-01T10:00:00.000Z',
  values: { ...DEFAULT_ASSUMPTIONS, notaryMode: 'scale' },
}
const IMPACT: AssumptionsImpact = {
  total: 4,
  changedVerdicts: 1,
  changes: [
    {
      listingId: '55555555-5555-4555-8555-555555555555',
      title: 'T2 fictif',
      before: 'to_dig',
      after: 'target',
      targetPriceBefore: 180_000,
      targetPriceAfter: 190_000,
    },
  ],
  byVerdictBefore: { target: 1, to_dig: 2, off_target: 1 },
  byVerdictAfter: { target: 2, to_dig: 1, off_target: 1 },
}

const nbsp = (s: string): string => s.replace(/[\u202f\u00a0]/g, ' ')
const nth = <T>(list: readonly T[], i: number): T => {
  const item = list[i]
  if (item === undefined) throw new Error(`élément ${i} absent`)
  return item
}
const originalMatchMedia = window.matchMedia
let wrapper: VueWrapper | null = null

async function mountPage(): Promise<VueWrapper> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  wrapper = mount(AssumptionsPage, {
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === DESKTOP_QUERY,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
  apiMock.assumptions.current.mockResolvedValue(CURRENT)
  apiMock.assumptions.history.mockResolvedValue([CURRENT, OLDER])
  apiMock.assumptions.update.mockReset()
  apiMock.assumptions.preview.mockReset()
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  window.matchMedia = originalMatchMedia
})

describe('AssumptionsPage', () => {
  it('en-tête : version en vigueur et lien vers l’historique', async () => {
    const page = await mountPage()
    expect(page.get('h1').text()).toBe('Hypothèses')
    const current = page.get('[data-testid="current-version"]')
    expect(current.text()).toContain('Version en vigueur : Taux négocié')
    expect(current.text()).toContain('depuis le 3 nov. 2026')
    expect(current.get('a').attributes('href')).toBe('#historique')
    await current.get('a').trigger('click')
    expect(document.activeElement?.id).toBe('historique-title')
  })

  it('historique en tableau défilant, version en vigueur mise en avant', async () => {
    const page = await mountPage()
    const history = page.get('[data-testid="history"]')
    expect(history.get('h2').text()).toContain('Historique des versions (2)')
    expect(history.get('.overflow-x-auto').attributes('tabindex')).toBe('0')
    expect(history.findAll('thead th').map(th => th.text())).toEqual([
      'Depuis le',
      'Libellé',
      'Apport',
      'Taux',
      'Durée',
      'Notaire',
    ])
    const rows = history.findAll('tbody tr')
    expect(nth(rows, 0).attributes('aria-current')).toBe('true')
    expect(nbsp(nth(rows, 0).text())).toContain('Taux négocié · en vigueur')
    expect(nbsp(nth(rows, 0).text())).toContain('40 000 €')
    expect(nth(rows, 0).text()).toContain('3,2 %')
    expect(nth(rows, 0).text()).toContain('7,5 %')
    expect(nth(rows, 1).attributes('aria-current')).toBeUndefined()
    expect(nth(rows, 1).text()).toContain('sans libellé')
    expect(nth(rows, 1).text()).toContain('barème')
  })

  it('enregistre avec le garde-fou de la version lue, puis dit l’impact', async () => {
    const page = await mountPage()
    apiMock.assumptions.update.mockResolvedValue({
      ...CURRENT,
      id: '66666666-6666-4666-8666-666666666666',
      label: 'Apport revu',
      values: { ...CURRENT.values, downPayment: 50_000 },
      impact: IMPACT,
    })
    await page.get('#h-down').setValue('50000')
    await page.get('#h-label').setValue('  Apport revu ')
    await page.get('form').trigger('submit')
    await flushPromises()
    const [update] = apiMock.assumptions.update.mock.calls[0] as [
      AssumptionsUpdate,
    ]
    expect(update.label).toBe('Apport revu')
    expect(update.expectedVersion).toBe(CURRENT.id)
    expect(update.values.downPayment).toBe(50_000)
    expect(apiMock.assumptions.history).toHaveBeenCalledTimes(2)
    const bar = page.get('[data-testid="save-bar"]')
    expect(bar.text()).toContain('Aucune modification non enregistrée')
    expect(bar.text()).toContain(
      'Hypothèses enregistrées : 1 annonce sur 4 change de verdict.'
    )
  })

  it('refus de l’API (version changée) : message dans la barre, saisie gardée', async () => {
    const page = await mountPage()
    apiMock.assumptions.update.mockRejectedValue(
      new ApiError(409, 'Une autre version a été enregistrée entre-temps.')
    )
    await page.get('#h-down').setValue('50000')
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(page.get('[data-testid="save-bar"] [role="alert"]').text()).toBe(
      'Une autre version a été enregistrée entre-temps.'
    )
    expect((page.get('#h-down').element as HTMLInputElement).value).toBe(
      '50000'
    )
  })

  it('« Voir l’impact » appelle l’aperçu, Annuler l’efface', async () => {
    const page = await mountPage()
    apiMock.assumptions.preview.mockResolvedValue(IMPACT)
    await page.get('#h-yield').setValue('4,5')
    await page.get('[data-testid="preview"]').trigger('click')
    await flushPromises()
    expect(apiMock.assumptions.preview).toHaveBeenCalledTimes(1)
    expect(
      apiMock.assumptions.preview.mock.calls[0]?.[0].grossYieldThreshold
    ).toBeCloseTo(0.045, 10)
    expect(page.get('[data-testid="impact"]').text()).toContain(
      'Avec ces changements : 1 annonce change de verdict, 3 inchangées.'
    )
    await page.get('[data-testid="cancel"]').trigger('click')
    expect(page.find('[data-testid="impact"]').exists()).toBe(false)
    expect((page.get('#h-yield').element as HTMLInputElement).value).toBe('5,5')
  })

  it('échec de l’aperçu : message dans la barre', async () => {
    const page = await mountPage()
    apiMock.assumptions.preview.mockRejectedValue(new Error('réseau'))
    await page.get('#h-yield').setValue('4,5')
    await page.get('[data-testid="preview"]').trigger('click')
    await flushPromises()
    expect(page.get('[data-testid="save-bar"] [role="alert"]').text()).toBe(
      "Le calcul de l'impact a échoué."
    )
  })

  it('hypothèses illisibles : l’erreur et « Réessayer », sans formulaire', async () => {
    apiMock.assumptions.current.mockRejectedValue(new Error('Erreur 500'))
    const page = await mountPage()
    // Lot 22 : un échec sans message du serveur dit « La lecture a échoué. ».
    expect(page.get('[role="alert"]').text()).toContain('La lecture a échoué.')
    expect(page.find('[data-testid="retry"]').exists()).toBe(true)
    expect(page.find('form').exists()).toBe(false)
  })
})
