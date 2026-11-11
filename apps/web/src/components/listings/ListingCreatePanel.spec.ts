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
  drafts: { get: vi.fn(), decide: vi.fn(), list: vi.fn(), merge: vi.fn() },
  links: { add: vi.fn() },
}))

/** La route courante : vide, sauf pour les tests de partage et de brouillon. */
const routeState = vi.hoisted(() => ({ query: {} as Record<string, string> }))
vi.mock('vue-router', async () => {
  const actual =
    await vi.importActual<typeof import('vue-router')>('vue-router')
  return { ...actual, useRoute: () => routeState }
})

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import ListingCreatePanel from './ListingCreatePanel.vue'

/** Une annonce qui ressemble, sans le même lien (« créer quand même » possible). */
const similar = fakeDuplicate({
  certain: false,
  score: 0.8,
  reasons: [
    {
      kind: 'same_commune_price_surface',
      score: 0.8,
      detail: 'Talence : 45 m² contre 45,2 m²',
    },
  ],
})

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
    routeState.query = {}
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
    const tabs = [
      ...body().querySelectorAll<HTMLButtonElement>(
        '[aria-label="Mode de saisie"] button'
      ),
    ]
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
      .querySelector('[data-field="f-price"]')
      ?.querySelector('[data-source="ai"]')
    expect(priceBadge?.textContent?.trim()).toBe('IA 95 %')
    expect(priceBadge?.getAttribute('title')).toContain('189 000 € FAI')
    expect(
      body()
        .querySelector('[data-field="f-lng"]')
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
        .querySelector('[data-field="f-price"]')
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
    expect(wrapper.emitted('created')?.[0]?.[0]).toBe(
      fakeEvaluated().listing.id
    )
    wrapper.unmount()
  })

  it('montre les doublons : « ouvrir l’existante » émet open, « créer quand même » enregistre avec ignoreDuplicates', async () => {
    apiMock.listings.extract.mockResolvedValue(
      fakeExtractionResult({ duplicates: [similar] })
    )
    const wrapper = mountPanel()
    await flushPromises()
    await fill('#x-text', 'T2 Talence')
    query<HTMLButtonElement>('[data-testid="analyze"]').click()
    await flushPromises()
    const banner = query('[data-testid="duplicates-banner"]')
    expect(banner.textContent).toContain('T2 fictif')
    ;[...banner.querySelectorAll('button')]
      .find(b => b.textContent?.includes('ouvrir l’existante'))
      ?.click()
    await flushPromises()
    expect(wrapper.emitted('open')).toEqual([[similar.listingId]])

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

  it('partage depuis le mobile : le texte et le lien partagés sont analysés à l’ouverture', async () => {
    routeState.query = {
      partage: '1',
      url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/2890123456',
      texte: 'Appartement 2 pièces 45 m² Talence',
    }
    apiMock.listings.extract.mockResolvedValue(fakeExtractionResult())
    const wrapper = mountPanel()
    await flushPromises()
    expect(apiMock.listings.extract).toHaveBeenCalledWith({
      text: 'Appartement 2 pièces 45 m² Talence',
      url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/2890123456',
      images: [],
    })
    expect(
      body().querySelector('[data-testid="extraction-summary"]')
    ).not.toBeNull()
    wrapper.unmount()
  })

  it('partage sans IA : saisie manuelle pré-remplie avec le lien et le texte', async () => {
    routeState.query = {
      partage: '1',
      url: 'https://www.seloger.com/annonces/achat/appartement/talence-33/218765432.htm',
      texte: 'T3 lumineux',
      titre: 'T3 Talence',
    }
    const { ApiError } = await import('@/lib/api')
    apiMock.listings.extract.mockRejectedValue(
      new ApiError(503, "L'extraction par IA n'est pas configurée.")
    )
    const wrapper = mountPanel()
    await flushPromises()
    expect(query<HTMLInputElement>('#f-url').value).toBe(
      'https://www.seloger.com/annonces/achat/appartement/talence-33/218765432.htm'
    )
    expect(query<HTMLInputElement>('#f-title').value).toBe('T3 Talence')
    expect(query<HTMLSelectElement>('#f-source').value).toBe('seloger')
    expect(
      body().querySelector('[data-testid="create-notice"]')?.textContent
    ).toContain("L'analyse par IA n'est pas configurée")
    wrapper.unmount()
  })

  it('brouillon reçu par e-mail : fiche pré-remplie, doublons, puis validé à l’enregistrement', async () => {
    const extracted = fakeExtractionResult()
    routeState.query = { brouillon: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }
    apiMock.drafts.get.mockResolvedValue({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      workspaceId: MEMBERS[0]?.workspaceId,
      origin: 'email',
      status: 'pending',
      extractedBy: 'parser',
      listing: extracted.listing,
      duplicates: [fakeDuplicate()],
      warnings: ['Lu par l’analyseur simple'],
      url: extracted.listing.url,
      emailSubject: 'Alerte SeLoger',
      emailFrom: null,
      receivedAt: '2026-11-03T10:00:00.000Z',
      decidedAt: null,
      decidedById: null,
      listingId: null,
      createdAt: '2026-11-03T10:00:00.000Z',
    })
    apiMock.drafts.decide.mockResolvedValue({})
    const wrapper = mountPanel()
    await flushPromises()
    expect(apiMock.drafts.get).toHaveBeenCalledWith(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    )
    expect(body().textContent).toContain(
      'Fiche pré-remplie par l’analyseur simple.'
    )
    expect(body().textContent).toContain(
      'Reçue par e-mail (« Alerte SeLoger »)'
    )
    expect(
      body().querySelector('[data-testid="duplicates-banner"]')
    ).not.toBeNull()
    query<HTMLButtonElement>('[data-testid="save"]').click()
    await flushPromises()
    expect(apiMock.listings.create).toHaveBeenCalledTimes(1)
    expect(apiMock.drafts.decide).toHaveBeenCalledWith(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      { status: 'accepted', listingId: fakeEvaluated().listing.id }
    )
    expect(wrapper.emitted('created')).toHaveLength(1)
    wrapper.unmount()
  })

  it('lot 18 : partage depuis le téléphone d’une annonce déjà suivie, « C’est la même : ajouter ce lien »', async () => {
    const url = 'https://www.seloger.com/annonces/0000000202.htm'
    routeState.query = { partage: '1', url, texte: 'T3 fictif 68 m²' }
    const extracted = fakeExtractionResult({
      duplicates: [
        fakeDuplicate({
          sellerType: 'agency',
          sellerReference: 'EX-2041',
          reasons: [
            {
              kind: 'same_reference',
              score: 1,
              detail: 'Même agence et même référence (EX-2041)',
            },
          ],
        }),
      ],
    })
    extracted.listing.url = url
    extracted.listing.sellerType = 'agency'
    extracted.listing.sellerName = '[Exemple] Immobilier des Chartrons'
    extracted.listing.sellerReference = 'EX-2041'
    apiMock.listings.extract.mockResolvedValue(extracted)
    apiMock.links.add.mockResolvedValue({
      link: null,
      check: null,
      listing: fakeEvaluated(),
      priceProposal: null,
      summary: 'Lien SeLoger ajouté',
    })
    const wrapper = mountPanel()
    await flushPromises()
    query<HTMLButtonElement>('[data-action="attach-link"]').click()
    await flushPromises()
    expect(apiMock.links.add).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      {
        url,
        origin: 'share',
        price: 189_000,
        online: true,
        sellerType: 'agency',
        sellerName: '[Exemple] Immobilier des Chartrons',
        reference: 'EX-2041',
      }
    )
    expect(apiMock.listings.create).not.toHaveBeenCalled()
    expect(wrapper.emitted('open')).toEqual([
      ['11111111-1111-4111-8111-111111111111'],
    ])
    wrapper.unmount()
  })

  it('lot 18 : refus de même référence à la création : ajouter le lien, ouvrir, ou créer quand même', async () => {
    const { ApiError } = await import('@/lib/api')
    apiMock.listings.extract.mockResolvedValue(fakeExtractionResult())
    apiMock.listings.create.mockRejectedValueOnce(
      new ApiError(
        409,
        'Même agence et même référence que « [Exemple] T3 68 m² » [id 11111111-1111-4111-8111-111111111111] : c’est la même annonce, publiée sur un autre portail. Ajoutez ce lien à sa fiche (add_listing_link, ou « C’est la même : ajouter ce lien à la fiche »), ou confirmez qu’il s’agit d’une autre annonce (ignoreDuplicates).'
      )
    )
    const wrapper = mountPanel()
    await flushPromises()
    await fill('#x-text', 'T2 Talence')
    query<HTMLButtonElement>('[data-testid="analyze"]').click()
    await flushPromises()
    query<HTMLButtonElement>('[data-testid="save"]').click()
    await flushPromises()
    const failure = query('[data-testid="create-failure"]')
    expect(failure.textContent).toContain(
      'Même agence et même référence que « [Exemple] T3 68 m² » : c’est la même annonce'
    )
    expect(failure.textContent).not.toContain('[id ')
    expect(failure.textContent).not.toContain('add_listing_link')
    expect(failure.textContent).toContain(
      'C’est la même : ajouter ce lien à « [Exemple] T3 68 m² »'
    )
    query<HTMLButtonElement>('[data-action="conflict-create"]').click()
    await flushPromises()
    expect(apiMock.listings.create).toHaveBeenCalledTimes(2)
    expect(apiMock.listings.create.mock.calls[1]?.[0]).toMatchObject({
      ignoreDuplicates: true,
    })
    expect(wrapper.emitted('created')).toHaveLength(1)
    wrapper.unmount()
  })

  it('lot 18 : un lien déjà sur une autre fiche ne se crée jamais quand même', async () => {
    const { ApiError } = await import('@/lib/api')
    apiMock.listings.extract.mockResolvedValue(fakeExtractionResult())
    apiMock.listings.create.mockRejectedValueOnce(
      new ApiError(
        409,
        'Ce lien est déjà celui de l’annonce « T2 fictif » [id 11111111-1111-4111-8111-111111111111] : une même URL ne peut pas être sur deux fiches. Ouvrez cette annonce plutôt que d’en créer une autre.'
      )
    )
    const wrapper = mountPanel()
    await flushPromises()
    await fill('#x-text', 'T2 Talence')
    query<HTMLButtonElement>('[data-testid="analyze"]').click()
    await flushPromises()
    query<HTMLButtonElement>('[data-testid="save"]').click()
    await flushPromises()
    expect(body().querySelector('[data-action="conflict-create"]')).toBeNull()
    expect(body().querySelector('[data-action="conflict-attach"]')).toBeNull()
    query<HTMLButtonElement>('[data-action="conflict-open"]').click()
    expect(wrapper.emitted('open')).toEqual([
      ['11111111-1111-4111-8111-111111111111'],
    ])
    wrapper.unmount()
  })
})
