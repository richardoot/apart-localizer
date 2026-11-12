/**
 * Lot 16 : exploration par les critères dans le web. Textes d'une carte
 * « À valider », carte (états, doublon, écart avec raison), onglet « À
 * valider » (bandeau, ajout direct, « Ajouter celles dans les critères »,
 * écart et annulation, « c'est la même »), page « Ce que Claude cherche »
 * (brief, portails cochés, demande à copier), compte rendu (bilan, filtre
 * dans l'URL), store (onglet dans l'URL). API simulée, données fictives.
 */
import { CLAUDE_REQUESTS } from '@apart/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Component } from 'vue'
import {
  CRITERIA_ID,
  EXPLORATION_ID,
  LISTING_ID,
  fakeBrief,
  fakeDraft,
  fakeExplorationDetail,
  fakeExplorationSummary,
  fitOf,
} from '@/test/exploration-fixtures'
import { fakeCriteria } from '@/test/criteria-fixtures'

const apiMock = vi.hoisted(() => ({
  drafts: {
    list: vi.fn(),
    decide: vi.fn(),
    accept: vi.fn(),
    acceptInCriteria: vi.fn(),
    merge: vi.fn(),
    distinct: vi.fn(),
    attached: vi.fn(() => Promise.resolve([])),
    detach: vi.fn(),
  },
  explorations: { list: vi.fn(), get: vi.fn(), brief: vi.fn() },
  searchCriteria: { list: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import DraftCard from './DraftCard.vue'
import DraftsTab from './DraftsTab.vue'
import CriteriaBriefPage from '@/views/CriteriaBriefPage.vue'
import ExplorationPage from '@/views/ExplorationPage.vue'
import {
  draftFitReason,
  draftPlace,
  draftReadLabel,
  draftSourceLabel,
  draftWhen,
  duplicateWhy,
  mergeDraftCards,
  pendingDuplicate,
} from '@/lib/drafts'
import {
  criteriaHeadline,
  explorationCountsText,
  explorationDuration,
  explorationTitle,
  explorationWhen,
  lineFilterFromQuery,
  portalLastRunText,
} from '@/lib/exploration'
import {
  stageFromQuery,
  queryFromFilters,
  filtersFromQuery,
  useFiltersStore,
} from '@/stores/filters'
import { ApiError } from '@/lib/api'
import { useFeedbackStore } from '@/stores/feedback'

const n = (value: string) =>
  value.replace(/[\u202f\u00a0]/g, ' ').replace(/\s+/g, ' ')

const duplicate = {
  listingId: LISTING_ID,
  title: '[Exemple] T3 66 m², balcon et cave',
  status: 'to_visit' as const,
  price: 215_000,
  surface: 66,
  commune: 'Bordeaux',
  url: null,
  score: 0.8,
  reasons: [
    {
      kind: 'same_commune_price_surface' as const,
      score: 0.8,
      detail: 'même surface, même rue, 5 000 € de moins',
    },
  ],
  certain: false,
  sellerType: 'unknown' as const,
  sellerName: null,
  sellerReference: null,
  linkCount: 1,
  differences: [],
}

function makeRouter() {
  const Empty = { render: () => null }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/annonces', name: 'listings', component: Empty },
      { path: '/annonces/nouvelle', name: 'listing-new', component: Empty },
      { path: '/annonces/:id', name: 'listing', component: Empty },
      { path: '/criteres', name: 'criteria', component: Empty },
      {
        path: '/criteres/explorations/:id',
        name: 'exploration',
        component: ExplorationPage,
      },
      {
        path: '/criteres/:id',
        name: 'criteria-brief',
        component: CriteriaBriefPage,
      },
    ],
  })
}

async function mountWith(component: Component, path = '/annonces', props = {}) {
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = mount(component, {
    props,
    global: {
      plugins: [router, [VueQueryPlugin, { queryClient: client }]],
      stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('les textes d’une carte « À valider »', () => {
  const now = new Date('2026-11-05T19:00:00.000Z')

  it('lieu, source, date, raison, lecture', () => {
    expect(draftPlace(fakeDraft())).toBe('Bordeaux · Caudéran, à la rue')
    const bare = fakeDraft()
    bare.listing.location = {
      ...bare.listing.location,
      commune: null,
      district: null,
    }
    expect(draftPlace(bare)).toBe('Repère à la rue')
    bare.listing.location = { ...bare.listing.location, precision: null }
    expect(draftPlace(bare)).toBe('Lieu inconnu')
    const communeOnly = fakeDraft()
    communeOnly.listing.location = {
      ...communeOnly.listing.location,
      district: null,
      precision: null,
    }
    expect(draftPlace(communeOnly)).toBe('Bordeaux')
    expect(draftSourceLabel(fakeDraft())).toBe('Leboncoin')
    expect(draftSourceLabel(fakeDraft({ portal: null, origin: 'email' }))).toBe(
      'E-mail'
    )
    expect(draftSourceLabel(fakeDraft({ portal: null }))).toBe('Autre portail')
    expect(draftWhen(fakeDraft(), now)).toBe('publiée hier')
    const unpublished = fakeDraft()
    unpublished.listing = { ...unpublished.listing, publishedAt: null }
    expect(draftWhen(unpublished, now)).toBe("trouvée aujourd'hui")
    expect(draftWhen({ ...unpublished, origin: 'email' }, now)).toBe(
      "reçue aujourd'hui"
    )
    expect(draftFitReason(fakeDraft())).toBe(
      '« [Exemple] Caudéran et Le Bouscat, T3 »'
    )
    expect(draftFitReason(fakeDraft({ fit: fitOf({ name: null }) }))).toBeNull()
    expect(
      draftFitReason(
        fakeDraft({ fit: fitOf({ level: 'margin', reasons: ['prix +2,7 %'] }) })
      )
    ).toBe('Prix +2,7 %')
    expect(
      draftFitReason(
        fakeDraft({ fit: fitOf({ level: 'margin', reasons: [] }) })
      )
    ).toBeNull()
    expect(draftFitReason(fakeDraft({ fit: null }))).toBeNull()
    expect(draftReadLabel(fakeDraft())).toBe('Lu sur la page par Claude')
    expect(
      draftReadLabel(fakeDraft({ origin: 'email', extractedBy: 'ai' }))
    ).toBe('Lu dans l’e-mail par l’IA')
    expect(
      draftReadLabel(fakeDraft({ origin: 'email', extractedBy: 'parser' }))
    ).toBe('Lu dans l’e-mail (analyseur simple)')
  })

  it('le doublon à trancher, et les cartes gardées à leur place', () => {
    expect(pendingDuplicate(fakeDraft())).toBeNull()
    expect(
      pendingDuplicate(fakeDraft({ duplicates: [duplicate] }))?.listingId
    ).toBe(LISTING_ID)
    expect(
      pendingDuplicate(fakeDraft({ duplicates: [duplicate], distinct: true }))
    ).toBeNull()
    expect(
      pendingDuplicate(fakeDraft({ duplicates: [duplicate], status: 'merged' }))
    ).toBeNull()
    expect(duplicateWhy(duplicate)).toBe(
      'même surface, même rue, 5 000 € de moins'
    )
    const a = fakeDraft({ id: 'a', receivedAt: '2026-11-05T10:00:00.000Z' })
    const b = fakeDraft({ id: 'b', receivedAt: '2026-11-05T12:00:00.000Z' })
    const c = fakeDraft({ id: 'c', receivedAt: '2026-11-05T12:00:00.000Z' })
    expect(
      mergeDraftCards(
        [a, b],
        new Map([['c', { ...c, status: 'dismissed' }]])
      ).map(d => d.id)
    ).toEqual(['b', 'c', 'a'])
    expect(
      mergeDraftCards([a], new Map([['a', { ...a, status: 'accepted' }]]))[0]
        ?.status
    ).toBe('accepted')
  })

  it('les textes du brief et du compte rendu', () => {
    const now = new Date('2026-11-05T19:00:00.000Z')
    expect(explorationWhen('2026-11-05T17:40:00.000Z', now)).toBe(
      'Aujourd’hui, 18:40'
    )
    expect(explorationWhen('2026-10-30T20:10:00.000Z', now)).toBe(
      '30 octobre, 21:10'
    )
    expect(explorationTitle('2026-11-05T17:40:00.000Z')).toBe(
      'Exploration du 5 novembre, 18:40'
    )
    expect(
      explorationDuration(
        '2026-11-05T17:34:00.000Z',
        '2026-11-05T17:40:00.000Z'
      )
    ).toBe('durée 6 min')
    expect(
      explorationDuration(
        '2026-11-05T17:40:00.000Z',
        '2026-11-05T17:40:10.000Z'
      )
    ).toBe('durée moins d’une minute')
    expect(explorationCountsText(fakeExplorationSummary().counts)).toBe(
      '4 vues · 2 à valider'
    )
    expect(
      explorationCountsText({
        ...fakeExplorationSummary().counts,
        seen: 1,
        toValidate: 0,
      })
    ).toBe('1 vue · aucune à valider')
    expect(portalLastRunText(null)).toBeNull()
    expect(
      portalLastRunText(
        { status: 'read', at: '2026-11-05T17:40:00.000Z', note: null },
        now
      )
    ).toBe('lu aujourd’hui')
    expect(
      portalLastRunText(
        { status: 'blocked', at: '2026-10-30T20:10:00.000Z', note: 'captcha' },
        now
      )
    ).toBe('bloqué le 30 octobre (captcha)')
    expect(
      n(
        criteriaHeadline(
          fakeCriteria({
            filters: {
              ...fakeCriteria().filters,
              priceMin: 100_000,
              surfaceMin: 60,
              roomsMin: 1,
              dpeMax: 'D',
              maxTramDistanceMeters: 500,
              communes: ['Bordeaux'],
            },
          }),
          'Polygone dessiné'
        )
      )
    ).toBe(
      'Polygone dessiné · ≤ 200 000 € · ≥ 100 000 € · ≥ 60 m² · 1 pièce et plus · DPE ≤ D · tram ≤ 500 m · Bordeaux'
    )
    expect(lineFilterFromQuery('out')).toBe('out')
    expect(lineFilterFromQuery(['todo'])).toBe('todo')
    expect(lineFilterFromQuery('nimporte')).toBe('all')
  })
})

describe('le store : « À valider » dans l’URL (lot 21 : une étape)', () => {
  it('lu, écrit et basculé', () => {
    expect(stageFromQuery({ etape: 'a-valider' })).toBe('a-valider')
    expect(stageFromQuery({})).toBeNull()
    expect(
      queryFromFilters(filtersFromQuery({}), 'cards', 'a-valider')
    ).toEqual({
      view: 'cards',
      etape: 'a-valider',
    })
    const store = useFiltersStore()
    store.loadFromQuery({ etape: 'a-valider' })
    expect(store.stage).toBe('a-valider')
    store.setStage('a-etudier')
    expect(store.routeQuery).toEqual({ etape: 'a-etudier' })
  })
})

describe('DraftCard', () => {
  it('à valider : faits, adéquation, extrait, actions ; écarter demande une raison facultative', async () => {
    const { wrapper } = await mountWith(DraftCard, '/annonces', {
      draft: fakeDraft(),
    })
    const text = n(wrapper.text())
    expect(text).toContain('[Exemple] T3 68 m², balcon sud')
    expect(text).toContain('Leboncoin')
    expect(text).toContain('214 000 €')
    expect(text).toContain('DPE C')
    expect(text).toContain('Dans les critères')
    expect(text).toContain('« [Exemple] Caudéran et Le Bouscat, T3 »')
    expect(text).toContain('Lu sur la page par Claude')
    expect(wrapper.find('[data-action="open"]').attributes('href')).toContain(
      'leboncoin'
    )
    expect(wrapper.find('[data-action="open"]').attributes('rel')).toContain(
      'noopener'
    )
    await wrapper.get('[data-action="accept"]').trigger('click')
    await wrapper.get('[data-action="edit"]').trigger('click')
    expect(wrapper.emitted('accept')).toHaveLength(1)
    expect(wrapper.emitted('edit')).toHaveLength(1)
    await wrapper.get('[data-action="dismiss"]').trigger('click')
    expect(wrapper.find('[data-testid="dismiss-form"]').exists()).toBe(true)
    await wrapper
      .get('[data-testid="dismiss-form"] input')
      .setValue('  rez-de-chaussée  ')
    await wrapper.get('[data-testid="dismiss-form"]').trigger('submit')
    expect(wrapper.emitted('dismiss')?.[0]).toEqual(['rez-de-chaussée'])
    await wrapper.get('[data-action="dismiss"]').trigger('click')
    await wrapper.get('[data-testid="dismiss-form"]').trigger('submit')
    expect(wrapper.emitted('dismiss')?.[1]).toEqual([null])
    await wrapper.get('[data-action="dismiss"]').trigger('click')
    await wrapper
      .findAll('[data-testid="dismiss-form"] button')[0]
      ?.trigger('click')
    expect(wrapper.find('[data-testid="dismiss-form"]').exists()).toBe(false)
  })

  it('un doublon probable se tranche ; les états décidés se lisent', async () => {
    const { wrapper } = await mountWith(DraftCard, '/annonces', {
      draft: fakeDraft({
        duplicates: [duplicate],
        warnings: ['Surface à demander.'],
        fit: fitOf({
          level: 'to_confirm',
          reasons: ['quartier à cheval sur le périmètre : adresse à préciser'],
        }),
      }),
      error: 'Refusé',
    })
    expect(n(wrapper.get('[data-testid="draft-duplicate"]').text())).toContain(
      'Peut-être [Exemple] T3 66 m², balcon et cave, déjà suivie : même surface, même rue, 5 000 € de moins'
    )
    expect(wrapper.text()).toContain('Surface à demander.')
    expect(wrapper.text()).toContain('Quartier à cheval sur le périmètre')
    expect(wrapper.text()).toContain('Refusé')
    await wrapper.get('[data-action="same"]').trigger('click')
    await wrapper.get('[data-action="other"]').trigger('click')
    expect(wrapper.emitted('same')?.[0]).toEqual([LISTING_ID])
    expect(wrapper.emitted('other')).toHaveLength(1)

    await wrapper.setProps({
      draft: fakeDraft({ status: 'accepted', listingId: LISTING_ID }),
    })
    expect(wrapper.text()).toContain('Ajoutée à l’étape « À étudier ».')
    await wrapper.setProps({
      draft: fakeDraft({
        status: 'accepted',
        listingId: LISTING_ID,
        fit: null,
      }),
    })
    expect(wrapper.text()).toContain('Ajoutée à l’étape « À étudier ».')
    await wrapper.setProps({
      draft: fakeDraft({ status: 'dismissed', dismissReason: 'trop cher' }),
    })
    expect(n(wrapper.text())).toContain(
      'Écartée : Claude ne la proposera plus (« trop cher »).'
    )
    await wrapper.get('[data-action="undo"]').trigger('click')
    expect(wrapper.emitted('undo')).toHaveLength(1)
    await wrapper.setProps({
      draft: fakeDraft({
        status: 'merged',
        listingId: LISTING_ID,
        merge: { checkId: null, summary: 'Prix 215 000 € → 210 000 €' },
      }),
    })
    expect(n(wrapper.text())).toContain(
      'Fiche mise à jour : Prix 215 000 € → 210 000 €, noté dans l’Historique.'
    )
    await wrapper.setProps({
      draft: fakeDraft({
        origin: 'email',
        portal: null,
        excerpt: null,
        emailSubject: 'Alerte fictive',
        fit: null,
      }),
    })
    expect(wrapper.text()).toContain('« Alerte fictive »')
    expect(wrapper.find('[data-testid="fit-badge"]').exists()).toBe(false)
  })
})

describe('DraftsTab', () => {
  it('bandeau, cartes, ajout direct, écart puis annulation, « c’est la même »', async () => {
    const inside = fakeDraft({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd01' })
    const dup = fakeDraft({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd02',
      receivedAt: '2026-11-05T17:39:00.000Z',
      duplicates: [duplicate],
      listing: {
        ...fakeDraft().listing,
        title: '[Exemple] T3 66 m², balcon et cave',
      },
    })
    apiMock.drafts.list.mockResolvedValue([inside, dup])
    apiMock.explorations.list.mockResolvedValue([fakeExplorationSummary()])
    apiMock.drafts.accept.mockResolvedValue({
      draft: { ...inside, status: 'accepted', listingId: LISTING_ID },
      listingId: LISTING_ID,
      title: inside.listing.title,
    })
    const { wrapper, router } = await mountWith(DraftsTab)
    const banner = n(wrapper.get('[data-testid="exploration-banner"]').text())
    expect(banner).toContain('pour Richard')
    expect(banner).toContain('1 critère · Leboncoin · 4 annonces vues')
    expect(banner).toContain('Voir le compte rendu')
    expect(wrapper.get('[data-testid="waiting-duplicates"]').text()).toBe(
      'Un doublon probable attend toujours ton choix.'
    )
    expect(wrapper.get('[data-testid="out-note"]').text()).toContain(
      'L’annonce vue hors critères'
    )
    expect(wrapper.findAll('[data-testid="draft-card"]')).toHaveLength(2)

    await wrapper.findAll('[data-action="accept"]')[0]?.trigger('click')
    await flushPromises()
    expect(apiMock.drafts.accept).toHaveBeenCalledWith(inside.id)
    expect(wrapper.find('[data-testid="draft-added"]').exists()).toBe(true)

    apiMock.drafts.decide.mockResolvedValueOnce({
      ...dup,
      status: 'dismissed',
      dismissReason: 'trop cher',
    })
    await wrapper.findAll('[data-action="dismiss"]')[0]?.trigger('click')
    await wrapper
      .get('[data-testid="dismiss-form"] input')
      .setValue('trop cher')
    await wrapper.get('[data-testid="dismiss-form"]').trigger('submit')
    await flushPromises()
    expect(apiMock.drafts.decide).toHaveBeenCalledWith(dup.id, {
      status: 'dismissed',
      reason: 'trop cher',
    })
    expect(wrapper.find('[data-testid="draft-dismissed"]').exists()).toBe(true)
    apiMock.drafts.decide.mockResolvedValueOnce({ ...dup })
    await wrapper.get('[data-action="undo"]').trigger('click')
    await flushPromises()
    expect(apiMock.drafts.decide).toHaveBeenLastCalledWith(dup.id, {
      status: 'pending',
    })

    apiMock.drafts.merge.mockResolvedValue({
      ...dup,
      status: 'merged',
      listingId: LISTING_ID,
      merge: { checkId: null, summary: 'Prix 215 000 € → 210 000 €' },
    })
    await wrapper.get('[data-action="same"]').trigger('click')
    await flushPromises()
    expect(apiMock.drafts.merge).toHaveBeenCalledWith(dup.id, {
      listingId: LISTING_ID,
    })
    expect(wrapper.find('[data-testid="draft-merged"]').exists()).toBe(true)
    expect(router.currentRoute.value.name).toBe('listings')
  })

  it('« Ajouter celles dans les critères », écart sans raison, distinct, erreur lisible', async () => {
    const inside = fakeDraft()
    const other = fakeDraft({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd03',
      duplicates: [duplicate],
    })
    apiMock.drafts.list.mockResolvedValue([inside, other])
    apiMock.explorations.list.mockResolvedValue([fakeExplorationSummary()])
    apiMock.drafts.acceptInCriteria.mockResolvedValue({
      accepted: [
        {
          draftId: inside.id,
          listingId: LISTING_ID,
          title: inside.listing.title,
        },
      ],
      skipped: 1,
    })
    apiMock.drafts.distinct.mockRejectedValue(
      new ApiError(409, 'Ce brouillon est déjà traité.')
    )
    apiMock.drafts.decide.mockResolvedValue({ ...inside, status: 'dismissed' })
    const { wrapper } = await mountWith(DraftsTab)
    await wrapper.get('[data-action="add-all-in"]').trigger('click')
    await flushPromises()
    expect(apiMock.drafts.acceptInCriteria).toHaveBeenCalledWith({
      explorationId: EXPLORATION_ID,
    })
    // Lot 22 : la réussite part dans la zone de messages commune.
    expect(useFeedbackStore().messages.map(m => m.text)).toContain(
      '1 annonce ajoutée à la liste.'
    )
    await wrapper.get('[data-action="other"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Ce brouillon est déjà traité.')

    apiMock.drafts.acceptInCriteria.mockResolvedValue({
      accepted: [],
      skipped: 1,
    })
    await wrapper.get('[data-action="add-all-in"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="batch-message"]').text()).toContain(
      'Aucune annonce'
    )
    apiMock.drafts.acceptInCriteria.mockRejectedValue(new Error('réseau'))
    await wrapper.get('[data-action="add-all-in"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="batch-message"]').text()).toBe(
      'L’ajout a échoué.'
    )

    apiMock.drafts.decide.mockRejectedValue(new Error('réseau'))
    await wrapper.findAll('[data-action="dismiss"]').at(-1)?.trigger('click')
    await wrapper.get('[data-testid="dismiss-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('L’action a échoué.')
  })

  it('rien à valider : explication et lien vers les critères', async () => {
    apiMock.drafts.list.mockResolvedValue([])
    apiMock.explorations.list.mockResolvedValue([])
    const { wrapper } = await mountWith(DraftsTab)
    expect(wrapper.get('[data-testid="drafts-empty"]').text()).toContain(
      'Rien à valider.'
    )
    expect(wrapper.find('[data-testid="exploration-banner"]').exists()).toBe(
      false
    )
  })

  it('« Modifier avant d’ajouter » ouvre le formulaire pré-rempli', async () => {
    apiMock.drafts.list.mockResolvedValue([fakeDraft()])
    apiMock.explorations.list.mockResolvedValue([])
    const { wrapper, router } = await mountWith(DraftsTab)
    await wrapper.get('[data-action="edit"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('listing-new')
    expect(router.currentRoute.value.query).toEqual({
      brouillon: fakeDraft().id,
    })
  })
})

describe('CriteriaBriefPage', () => {
  it('le brief, les portails cochés et leurs liens, la demande, les dernières explorations', async () => {
    apiMock.explorations.brief.mockResolvedValue(fakeBrief())
    apiMock.searchCriteria.list.mockResolvedValue([
      fakeCriteria({ id: CRITERIA_ID }),
    ])
    apiMock.searchCriteria.update.mockResolvedValue(
      fakeCriteria({ id: CRITERIA_ID })
    )
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const { wrapper } = await mountWith(
      CriteriaBriefPage,
      `/criteres/${CRITERIA_ID}`
    )
    expect(apiMock.explorations.brief).toHaveBeenCalledWith(CRITERIA_ID)
    const text = n(wrapper.text())
    expect(text).toContain('[Exemple] Caudéran et Le Bouscat, T3')
    expect(n(wrapper.get('[data-testid="brief-headline"]').text())).toBe(
      'Polygone dessiné · ≤ 220 000 € · ≥ 60 m² · 3 pièces et plus · DPE ≤ D · 7 annonces gardées'
    )
    expect(text).toContain('jusqu’à 231 000 € (220 000 € + 5 %)')
    expect(text).toContain('29 annonces suivies et 4 écartées')
    expect(
      wrapper.findAll('[data-testid="manual-filters"]').length
    ).toBeGreaterThan(0)
    expect(
      wrapper
        .get('[data-portal="logicimmo"] [data-testid="portal-last-run"]')
        .text()
    ).toContain('bloqué')
    expect(
      wrapper
        .get('[data-portal="leboncoin"] [data-action="open-search"]')
        .attributes('href')
    ).toContain('leboncoin.fr/recherche')
    // Cocher Logic-Immo : la liste des portails cochés est enregistrée.
    const logic = wrapper.get('[data-portal="logicimmo"] input')
    ;(logic.element as HTMLInputElement).checked = true
    await logic.trigger('change')
    await flushPromises()
    expect(apiMock.searchCriteria.update).toHaveBeenCalledWith(CRITERIA_ID, {
      portals: ['leboncoin', 'seloger', 'bienici', 'pap', 'logicimmo'],
    })
    await wrapper.get('[data-action="copy"]').trigger('click')
    await flushPromises()
    // Lot 26 : la même demande que la page « Claude » (une seule source).
    expect(writeText).toHaveBeenCalledWith(
      CLAUDE_REQUESTS.find(r => r.prompt === 'explore_listings')?.request
    )
    expect(wrapper.get('[data-action="copy"]').text()).toBe('Copié')
    expect(text).toContain('4 vues · 2 à valider')
  })

  it('« Copié » redevient « Copier la demande » au bout de deux secondes (lot 26)', async () => {
    apiMock.explorations.brief.mockResolvedValue(fakeBrief())
    apiMock.searchCriteria.list.mockResolvedValue([])
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.resolve()) },
      configurable: true,
    })
    const { wrapper } = await mountWith(
      CriteriaBriefPage,
      `/criteres/${CRITERIA_ID}`
    )
    vi.useFakeTimers()
    try {
      await wrapper.get('[data-action="copy"]').trigger('click')
      await flushPromises()
      expect(wrapper.get('[data-action="copy"]').text()).toBe('Copié')
      vi.advanceTimersByTime(1900)
      await flushPromises()
      expect(wrapper.get('[data-action="copy"]').text()).toBe('Copié')
      vi.advanceTimersByTime(200)
      await flushPromises()
      expect(wrapper.get('[data-action="copy"]').text()).toBe(
        'Copier la demande'
      )
      // Un départ de la page pendant « Copié » ne laisse aucun minuteur.
      const clear = vi.spyOn(globalThis, 'clearTimeout')
      await wrapper.get('[data-action="copy"]').trigger('click')
      await flushPromises()
      const before = clear.mock.calls.length
      wrapper.unmount()
      expect(clear.mock.calls.length).toBeGreaterThan(before)
      clear.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })

  it('garde au moins un portail ; une erreur se lit', async () => {
    const brief = fakeBrief()
    const only = brief.criteria[0]
    if (!only) throw new Error('brief')
    only.portals = only.portals.map(p => ({
      ...p,
      enabled: p.portal === 'pap',
    }))
    apiMock.explorations.brief.mockResolvedValue({
      ...brief,
      recentExplorations: [],
    })
    apiMock.searchCriteria.list.mockResolvedValue([])
    apiMock.searchCriteria.update.mockRejectedValue(
      new ApiError(409, 'Le critère a changé')
    )
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.reject(new Error('non'))) },
      configurable: true,
    })
    const { wrapper } = await mountWith(
      CriteriaBriefPage,
      `/criteres/${CRITERIA_ID}`
    )
    expect(wrapper.text()).toContain('Aucune pour l’instant.')
    const pap = wrapper.get('[data-portal="pap"] input')
    ;(pap.element as HTMLInputElement).checked = false
    await pap.trigger('change')
    await flushPromises()
    expect(apiMock.searchCriteria.update).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Garde au moins un portail coché.')
    const lbc = wrapper.get('[data-portal="leboncoin"] input')
    ;(lbc.element as HTMLInputElement).checked = true
    await lbc.trigger('change')
    await flushPromises()
    expect(wrapper.text()).toContain('Le critère a changé')
    await wrapper.get('[data-action="copy"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Copie impossible')
  })
})

describe('ExplorationPage', () => {
  it('bilan par portail, filtre par résultat dans l’URL, une ligne par annonce lue', async () => {
    apiMock.explorations.get.mockResolvedValue(fakeExplorationDetail())
    const { wrapper, router } = await mountWith(
      ExplorationPage,
      `/criteres/explorations/${EXPLORATION_ID}`
    )
    expect(apiMock.explorations.get).toHaveBeenCalledWith(EXPLORATION_ID)
    expect(wrapper.text()).toContain('Exploration du 5 novembre, 18:40')
    expect(n(wrapper.get('[data-testid="exploration-subtitle"]').text())).toBe(
      'Par Claude pour Richard · connecteur, navigateur de Richard · 1 critère : « [Exemple] Caudéran et Le Bouscat, T3 » · durée 6 min'
    )
    expect(wrapper.get('[data-portal="logicimmo"]').classes()).toContain(
      'border-bad'
    )
    expect(wrapper.findAll('[data-filter]').map(b => n(b.text()))).toEqual([
      'Toutes · 4',
      'À valider · 2',
      'Déjà suivies · 1',
      'Déjà écartées · 0',
      'Hors critères · 1',
    ])
    expect(
      wrapper.findAll('[data-testid="lines-table"] tbody tr')
    ).toHaveLength(4)
    expect(wrapper.get('[data-testid="out-digest"]').text()).toContain(
      'prix au-delà de la marge (1)'
    )
    // Lot 26 : au téléphone, chaque carte d'une annonce suivie ouvre sa fiche, comme le tableau.
    const tableOpen = wrapper
      .findAll('[data-testid="lines-table"] a')
      .filter(a => a.text() === 'Ouvrir la fiche').length
    const cardOpen = wrapper.findAll(
      '[data-testid="lines-cards"] [data-testid="line-open"]'
    )
    expect(tableOpen).toBeGreaterThan(0)
    expect(cardOpen).toHaveLength(tableOpen)
    expect(cardOpen[0]?.text()).toBe('Ouvrir la fiche')
    await wrapper.get('[data-filter="todo"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ resultat: 'todo' })
    expect(
      wrapper.findAll('[data-testid="lines-table"] tbody tr')
    ).toHaveLength(2)
    expect(wrapper.find('[data-testid="out-digest"]').exists()).toBe(false)
    await wrapper.get('[data-filter="dismissed"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Aucune annonce pour ce résultat.')
    await wrapper.get('[data-filter="all"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('une exploration de l’application, sans auteur ni critère', async () => {
    apiMock.explorations.get.mockResolvedValue(
      fakeExplorationDetail({
        channel: 'web',
        author: null,
        criteria: [],
        notes: 'deux pages',
      })
    )
    const { wrapper } = await mountWith(
      ExplorationPage,
      `/criteres/explorations/${EXPLORATION_ID}`
    )
    expect(
      wrapper.get('[data-testid="exploration-subtitle"]').text()
    ).toContain('Exploration · aucun critère actif')
    expect(wrapper.text()).toContain('Note de Claude : deux pages')
  })
})
