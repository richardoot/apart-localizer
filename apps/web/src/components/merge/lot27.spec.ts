/**
 * Lot 27 : fusionner les doublons, plusieurs agences, « Déjà vue », dans la
 * fiche. La recherche des annonces ressemblantes (classement de l'API, texte
 * cherché après la frappe, vide et refus), le dialogue de fusion (laquelle
 * garder, ce qui la rejoint, refus), « Même bien, autre fiche ? »
 * (suggestions, fusions annulables, fiche fusionnée) et « Autres agences
 * pour ce bien » (ajout, retrait, refus lisible). Données fictives ; aucun
 * appel réseau.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type {
  EvaluatedListing,
  ListingMergePreview,
  ListingMergeRecord,
  ListingSeller,
  SimilarListing,
} from '@apart/contracts'
import { fakeEvaluated } from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  merges: {
    similar: vi.fn(),
    preview: vi.fn(),
    merge: vi.fn(),
    undo: vi.fn(),
    addSeller: vi.fn(),
    removeSeller: vi.fn(),
  },
  listings: { update: vi.fn() },
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})
const routerMock = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', async () => {
  const actual =
    await vi.importActual<typeof import('vue-router')>('vue-router')
  return { ...actual, useRouter: () => routerMock }
})

import { ApiError } from '@/lib/api'
import SellerSection from '@/components/listings/SellerSection.vue'
import { SIMILAR_SEARCH_DELAY_MS } from '@/composables/useListingMerge'
import { useFeedbackStore } from '@/stores/feedback'
import MergeDialog from './MergeDialog.vue'
import MergeSection from './MergeSection.vue'
import SimilarListingPicker from './SimilarListingPicker.vue'

enableAutoUnmount(afterEach)

const KEPT = '11111111-1111-4111-8111-111111111111'
const DOUBLE = '22222222-2222-4222-8222-222222222222'
const MERGE = '33333333-3333-4333-8333-333333333333'
const AT = '2026-11-10T10:00:00.000Z'
/** Espaces fines et insécables des montants ramenées à des espaces. */
const n = (value: string): string => value.replace(/[\u202f\u00a0]/g, ' ')

/** Le n-ième élément trouvé ; son absence fait échouer le test. */
function nth<T>(list: readonly T[], index: number): T {
  const found = list[index]
  if (found === undefined) throw new Error(`Élément ${index} absent`)
  return found
}

const similar = (over: Partial<SimilarListing> = {}): SimilarListing => ({
  listingId: DOUBLE,
  title: '[Exemple] Appartement 3 pièces Caudéran',
  status: 'to_study',
  price: 209_000,
  surface: 68,
  rooms: 3,
  commune: 'Bordeaux',
  district: 'Caudéran',
  url: null,
  sellerName: '[Exemple] Cabinet Bastide',
  sellerReference: 'CB-77',
  linkCount: 1,
  updatedAt: AT,
  score: 0.94,
  level: 'very_close',
  matches: [{ kind: 'surface', text: 'Même surface (68 m²)' }],
  differences: [],
  ...over,
})

const found = (items: SimilarListing[], summary = 'Trouvées') => ({
  items,
  compared: 12,
  summary,
})

const side = (over: Partial<ListingMergePreview['keep']> = {}) => ({
  id: KEPT,
  title: '[Exemple] T3 68 m², balcon sud',
  status: 'to_study' as const,
  price: 214_000,
  surface: 68,
  commune: 'Bordeaux',
  createdAt: AT,
  updatedAt: AT,
  links: 1,
  visits: 0,
  offers: 0,
  opinions: 0,
  tasks: 2,
  ...over,
})

const preview = (
  over: Partial<ListingMergePreview> = {}
): ListingMergePreview => ({
  keep: side(),
  absorb: side({
    id: DOUBLE,
    title: '[Exemple] Appartement 3 pièces Caudéran',
    price: 209_000,
    updatedAt: '2026-11-11T09:00:00.000Z',
    visits: 1,
  }),
  suggestedKeepId: KEPT,
  suggestionReason: 'c’est la plus ancienne',
  moves: ['1 lien de portail, avec son prix et ses vérifications'],
  fills: [
    {
      field: 'propertyTax',
      label: 'Taxe foncière',
      kept: null,
      other: '1 100 €',
    },
  ],
  differences: [
    {
      field: 'surface',
      label: 'Surface Carrez',
      kept: '68 m²',
      other: '69 m²',
    },
  ],
  sellers: ['« [Exemple] Immobilier des Chartrons », réf. EX-2041'],
  leftBehind: ['Son historique des prix reste lisible sur la fiche fusionnée.'],
  refusal: null,
  ...over,
})

const record = (
  over: Partial<ListingMergeRecord> = {}
): ListingMergeRecord => ({
  id: MERGE,
  keptId: KEPT,
  keptTitle: '[Exemple] T3 68 m², balcon sud',
  absorbedId: DOUBLE,
  absorbedTitle: '[Exemple] Appartement 3 pièces Caudéran',
  mergedAt: '2026-11-11T10:00:00.000Z',
  mergedById: null,
  channel: 'web',
  summary:
    'Fusionnée avec « [Exemple] Appartement 3 pièces Caudéran » : 1 lien',
  counts: {
    links: 1,
    sellers: 0,
    visits: 0,
    offers: 0,
    opinions: 0,
    tasks: 0,
    agencyRequests: 0,
    fields: 0,
    notes: false,
  },
  ...over,
})

const otherSeller = (over: Partial<ListingSeller> = {}): ListingSeller => ({
  id: '44444444-4444-4444-8444-444444444444',
  listingId: KEPT,
  sellerType: 'agency',
  sellerName: '[Exemple] Cabinet Bastide',
  sellerReference: 'CB-77',
  sellerReferenceKey: 'CB77',
  origin: 'merge',
  addedById: null,
  createdAt: AT,
  ...over,
})

function fiche(
  over: Partial<Omit<EvaluatedListing, 'listing' | 'evaluation'>> = {},
  listing: Partial<EvaluatedListing['listing']> = {}
): EvaluatedListing {
  return fakeEvaluated(
    {
      id: KEPT,
      title: '[Exemple] T3 68 m², balcon sud',
      updatedAt: AT,
      sellerType: 'agency',
      sellerName: '[Exemple] Immobilier des Chartrons',
      sellerReference: 'EX-2041',
      sellerReferenceKey: 'EX2041',
      ...listing,
    },
    over
  )
}

function plugins() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return [[VueQueryPlugin, { queryClient: client }]] as never
}

const stubs = {
  RouterLink: {
    props: ['to'],
    template: '<a data-router-link :data-to="JSON.stringify(to)"><slot /></a>',
  },
  // Le panneau rendu sur place (sans portail) : titre, contenu, pied.
  SidePanel: {
    props: ['title'],
    emits: ['close'],
    template:
      '<section data-side-panel><h2 data-panel-title>{{ title }}</h2><button data-close-panel @click="$emit(\'close\')" /><slot /><footer><slot name="footer" /></footer></section>',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  apiMock.merges.similar.mockResolvedValue(found([similar()]))
})

describe('lot 27 : la recherche « Déjà vue »', () => {
  function mountPicker(props: Record<string, unknown> = {}) {
    return mount(SimilarListingPicker, {
      props: { target: { listingId: KEPT }, ...props },
      attachTo: document.body,
      global: { plugins: plugins(), stubs },
    })
  }

  it('propose les annonces ressemblantes, avec leur niveau et pourquoi', async () => {
    apiMock.merges.similar.mockResolvedValue(
      found([
        similar(),
        similar({
          listingId: '55555555-5555-4555-8555-555555555555',
          title: '[Exemple] T2 Bastide',
          status: 'discarded',
          level: 'far',
          score: 0.41,
          sellerName: null,
          sellerReference: null,
          matches: [],
          differences: [{ kind: 'surface', text: '45 m² contre 68 m²' }],
        }),
      ])
    )
    const wrapper = mountPicker()
    await flushPromises()
    expect(apiMock.merges.similar).toHaveBeenCalledWith({
      listingId: KEPT,
      q: undefined,
      limit: 8,
    })
    const rows = wrapper.findAll('[data-similar]')
    expect(rows).toHaveLength(2)
    const first = nth(rows, 0)
    expect(first.text()).toContain('[Exemple] Appartement 3 pièces Caudéran')
    expect(first.get('[data-testid="similar-level"]').text()).toBe(
      'Très proche · 94 %'
    )
    expect(n(first.text())).toContain(
      '209 000 € · 68 m² · 3 pièces · Bordeaux · Caudéran'
    )
    expect(
      first.get('[data-testid="similar-status"]').attributes('data-tone')
    ).toBe('neutral')
    expect(first.text()).toContain('[Exemple] Cabinet Bastide · réf. CB-77')
    expect(first.text()).toContain('Même surface (68 m²)')
    expect(first.find('[data-testid="similar-differences"]').exists()).toBe(
      false
    )
    // La fiche s'ouvre à côté, sans quitter la recherche.
    expect(first.get('[data-router-link]').attributes('data-to')).toContain(
      DOUBLE
    )
    // Une annonce écartée le dit ; ce qui diffère est lisible.
    const second = nth(rows, 1)
    expect(
      second.get('[data-testid="similar-status"]').attributes('data-tone')
    ).toBe('warn')
    expect(second.get('[data-testid="similar-differences"]').text()).toBe(
      'Diffère : 45 m² contre 68 m²'
    )
    await first.get('[data-action="pick-similar"]').trigger('click')
    expect(wrapper.emitted('pick')?.[0]?.[0]).toMatchObject({
      listingId: DOUBLE,
    })
  })

  it('cherche un texte après la frappe, en gardant la liste affichée', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const wrapper = mountPicker({ target: { draftId: DOUBLE }, limit: 5 })
      await flushPromises()
      expect(apiMock.merges.similar).toHaveBeenCalledTimes(1)
      await wrapper.get('[data-testid="similar-search"]').setValue('cau')
      await wrapper.get('[data-testid="similar-search"]').setValue('caudéran')
      // Rien tant que la frappe continue.
      vi.advanceTimersByTime(SIMILAR_SEARCH_DELAY_MS - 1)
      await flushPromises()
      expect(apiMock.merges.similar).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(1)
      await flushPromises()
      expect(apiMock.merges.similar).toHaveBeenLastCalledWith({
        draftId: DOUBLE,
        q: 'caudéran',
        limit: 5,
      })
      expect(wrapper.findAll('[data-similar]')).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rien de ressemblant : le dit, et comment chercher', async () => {
    apiMock.merges.similar.mockResolvedValue(
      found([], 'Aucune annonce suivie ne lui ressemble')
    )
    const wrapper = mountPicker({ busy: true, actionLabel: 'Comparer' })
    await flushPromises()
    expect(wrapper.get('[data-testid="similar-empty"]').text()).toContain(
      'Aucune annonce suivie ne lui ressemble. Essaie un mot du titre'
    )
    expect(wrapper.find('[data-similar]').exists()).toBe(false)
  })

  it('une écriture en cours fait attendre les boutons ; un échec propose de réessayer', async () => {
    const wrapper = mountPicker({
      busy: true,
      actionLabel: 'Comparer et fusionner',
    })
    await flushPromises()
    const button = wrapper.get('[data-action="pick-similar"]')
    expect(button.text()).toBe('Comparer et fusionner')
    expect(button.attributes('disabled')).toBeDefined()
    wrapper.unmount()
    apiMock.merges.similar.mockRejectedValue(new Error('réseau coupé'))
    const failed = mountPicker()
    await flushPromises()
    expect(failed.find('[data-testid="retry"]').exists()).toBe(true)
  })
})

describe('lot 27 : le dialogue de fusion', () => {
  function mountDialog(props: Record<string, unknown> = {}) {
    return mount(MergeDialog, {
      props: { item: fiche(), ...props },
      attachTo: document.body,
      global: { plugins: plugins(), stubs },
    })
  }

  it('retrouve l’autre fiche, puis montre ce que la fusion fera', async () => {
    apiMock.merges.preview.mockResolvedValue(preview())
    const wrapper = mountDialog()
    await flushPromises()
    expect(wrapper.get('[data-panel-title]').text()).toBe(
      'Fusionner avec une autre fiche'
    )
    expect(wrapper.get('[data-testid="merge-search"]').text()).toContain(
      'les plus ressemblantes à « [Exemple] T3 68 m², balcon sud »'
    )
    expect(wrapper.find('[data-action="merge-confirm"]').exists()).toBe(false)
    await wrapper.get('[data-action="pick-similar"]').trigger('click')
    await flushPromises()
    expect(apiMock.merges.preview).toHaveBeenCalledWith(KEPT, DOUBLE)
    expect(wrapper.get('[data-panel-title]').text()).toBe(
      'Fusionner les deux fiches'
    )
    const kept = wrapper.get(`[data-side="${KEPT}"]`)
    expect(kept.text()).toContain('Gardée')
    expect(n(kept.text())).toContain('214 000 € · 68 m² · Bordeaux · À étudier')
    expect(kept.text()).toContain('1 lien · 2 tâches')
    expect(kept.get('[data-testid="merge-suggestion"]').text()).toBe(
      'Conseillée : c’est la plus ancienne.'
    )
    expect(wrapper.get(`[data-side="${DOUBLE}"]`).text()).toContain(
      'Fusionnée dedans'
    )
    expect(wrapper.get('[data-testid="merge-moves"]').text()).toContain(
      'Ce qui rejoint « [Exemple] T3 68 m², balcon sud »'
    )
    expect(wrapper.get('[data-testid="merge-moves"]').text()).toContain(
      '1 lien de portail'
    )
    expect(n(wrapper.get('[data-testid="merge-fills"]').text())).toContain(
      'Taxe foncière : 1 100 €'
    )
    expect(wrapper.get('[data-testid="merge-differences"]').text()).toContain(
      'Surface Carrez : 68 m² (l’autre disait 69 m²)'
    )
    expect(wrapper.get('[data-testid="merge-sellers"]').text()).toContain(
      'réf. EX-2041'
    )
    expect(wrapper.get('[data-testid="merge-preview"]').text()).toContain(
      'Rien n’est supprimé'
    )
  })

  it('fusionne avec les garde-fous des deux fiches et prévient le parent', async () => {
    apiMock.merges.preview.mockResolvedValue(preview())
    const result = { merge: record(), listing: fiche(), summary: 'Fusionnée' }
    apiMock.merges.merge.mockResolvedValue(result)
    const wrapper = mountDialog({ otherId: DOUBLE })
    await flushPromises()
    await wrapper.get('[data-action="merge-confirm"]').trigger('click')
    await flushPromises()
    expect(apiMock.merges.merge).toHaveBeenCalledWith(KEPT, {
      absorbedId: DOUBLE,
      expectedUpdatedAt: AT,
      expectedAbsorbedUpdatedAt: '2026-11-11T09:00:00.000Z',
    })
    expect(wrapper.emitted('merged')?.[0]?.[0]).toMatchObject({
      summary: 'Fusionnée',
    })
  })

  it('propose de garder la plus avancée ; le membre peut choisir l’autre', async () => {
    // L'autre fiche est conseillée : elle est gardée par défaut.
    apiMock.merges.preview.mockImplementation(
      (keepId: string, otherId: string) =>
        Promise.resolve(
          keepId === KEPT
            ? preview({
                suggestedKeepId: DOUBLE,
                suggestionReason: 'c’est la plus avancée dans le parcours',
              })
            : preview({
                keep: preview().absorb,
                absorb: preview().keep,
                suggestedKeepId: DOUBLE,
                suggestionReason: 'c’est la plus avancée dans le parcours',
                moves: [`reprises de ${otherId}`],
              })
        )
    )
    const wrapper = mountDialog({ otherId: DOUBLE })
    await flushPromises()
    await flushPromises()
    expect(apiMock.merges.preview).toHaveBeenLastCalledWith(DOUBLE, KEPT)
    expect(wrapper.get(`[data-side="${DOUBLE}"]`).text()).toContain('Gardée')
    expect(wrapper.get('[data-testid="merge-moves"]').text()).toContain(
      `reprises de ${KEPT}`
    )
    // Le membre préfère garder la fiche ouverte.
    await wrapper.get(`[data-keep="${KEPT}"]`).setValue(true)
    await flushPromises()
    expect(apiMock.merges.preview).toHaveBeenLastCalledWith(KEPT, DOUBLE)
    expect(wrapper.get(`[data-side="${KEPT}"]`).text()).toContain('Gardée')
    // « Choisir une autre fiche » revient à la recherche.
    await wrapper.get('[data-action="merge-back"]').trigger('click')
    expect(wrapper.find('[data-testid="merge-search"]').exists()).toBe(true)
  })

  it('une fusion impossible le dit et ne se confirme pas ; un refus du serveur reste affiché', async () => {
    apiMock.merges.preview.mockResolvedValue(
      preview({
        refusal: '« [Exemple] X » a déjà été fusionnée dans une autre fiche.',
        moves: [],
        fills: [],
        differences: [],
        sellers: [],
      })
    )
    const wrapper = mountDialog({ otherId: DOUBLE })
    await flushPromises()
    expect(wrapper.get('[data-testid="merge-refusal"]').text()).toContain(
      'a déjà été fusionnée'
    )
    expect(wrapper.get('[data-testid="merge-moves"]').text()).toContain(
      'Rien à reprendre'
    )
    expect(
      wrapper.get('[data-action="merge-confirm"]').attributes('disabled')
    ).toBeDefined()
    wrapper.unmount()

    apiMock.merges.preview.mockResolvedValue(preview())
    apiMock.merges.merge.mockRejectedValue(
      new ApiError(409, 'L’annonce a changé depuis ta lecture')
    )
    const stale = mountDialog({ otherId: DOUBLE })
    await flushPromises()
    await stale.get('[data-action="merge-confirm"]').trigger('click')
    await flushPromises()
    expect(stale.get('[data-testid="merge-error"]').text()).toContain(
      'L’annonce a changé depuis ta lecture'
    )
    expect(stale.emitted('merged')).toBeUndefined()
  })
})

describe('lot 27 : « Même bien, autre fiche ? »', () => {
  function mountSection(item: EvaluatedListing) {
    return mount(MergeSection, {
      props: { item },
      attachTo: document.body,
      global: { plugins: plugins(), stubs },
    })
  }

  it('signale une fiche très proche et ouvre l’aperçu de la fusion', async () => {
    apiMock.merges.similar.mockResolvedValue(
      found([similar(), similar({ listingId: KEPT, level: 'close' })])
    )
    apiMock.merges.preview.mockResolvedValue(preview())
    const wrapper = mountSection(fiche())
    await flushPromises()
    const suggestions = wrapper.get('[data-testid="merge-suggestions"]')
    // Seules les fiches très proches sont signalées sans qu'on cherche.
    expect(suggestions.findAll('li')).toHaveLength(1)
    expect(suggestions.text()).toContain(
      'Peut-être le même bien que « [Exemple] Appartement 3 pièces Caudéran »'
    )
    await suggestions.get(`[data-suggest="${DOUBLE}"]`).trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-panel-title]').text()).toBe(
      'Fusionner les deux fiches'
    )
    expect(apiMock.merges.preview).toHaveBeenCalledWith(KEPT, DOUBLE)
    await wrapper.get('[data-close-panel]').trigger('click')
    expect(wrapper.find('[data-side-panel]').exists()).toBe(false)
  })

  it('sans fiche proche, explique et ouvre la recherche', async () => {
    apiMock.merges.similar.mockResolvedValue(found([]))
    const wrapper = mountSection(fiche())
    await flushPromises()
    expect(wrapper.find('[data-testid="merge-suggestions"]').exists()).toBe(
      false
    )
    expect(wrapper.text()).toContain('Deux fiches pour le même bien')
    await wrapper.get('[data-action="open-merge"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-panel-title]').text()).toBe(
      'Fusionner avec une autre fiche'
    )
  })

  it('après une fusion : message avec « Annuler », et la fiche gardée s’ouvre si c’est l’autre', async () => {
    apiMock.merges.preview.mockResolvedValue(preview())
    apiMock.merges.merge.mockResolvedValue({
      merge: record({ keptId: DOUBLE, absorbedId: KEPT }),
      listing: fiche(),
      summary: 'Fusionnée avec « [Exemple] T3 68 m², balcon sud » : 1 lien',
    })
    apiMock.merges.undo.mockResolvedValue({
      merge: record(),
      listing: fiche(),
      summary: 'Fusion annulée',
    })
    const wrapper = mountSection(fiche())
    await flushPromises()
    await wrapper.get('[data-action="open-merge"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-action="pick-similar"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-action="merge-confirm"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-side-panel]').exists()).toBe(false)
    const feedback = useFeedbackStore()
    const message = feedback.messages.at(-1)
    expect(message?.text).toBe(
      'Fusionnée avec « [Exemple] T3 68 m², balcon sud » : 1 lien.'
    )
    expect(message?.action?.label).toBe('Annuler')
    // La fiche ouverte a été fusionnée dans l'autre : on y va.
    expect(routerMock.push).toHaveBeenCalledWith({
      name: 'listing',
      params: { id: DOUBLE },
    })
    await message?.action?.run()
    expect(apiMock.merges.undo).toHaveBeenCalledWith(MERGE)
  })

  it('liste les doublons fusionnés ici, chacun annulable après confirmation', async () => {
    apiMock.merges.similar.mockResolvedValue(found([]))
    apiMock.merges.undo.mockResolvedValue({
      merge: record(),
      listing: fiche(),
      summary:
        'Fusion annulée : « [Exemple] Appartement 3 pièces Caudéran » redevient une fiche à part',
    })
    const wrapper = mountSection(
      fiche({ absorbed: [record({ channel: 'mcp' })] })
    )
    await flushPromises()
    const row = wrapper.get(`[data-merge="${MERGE}"]`)
    expect(row.text()).toContain('[Exemple] Appartement 3 pièces Caudéran')
    expect(row.text()).toContain('par Claude')
    expect(row.get('[data-router-link]').attributes('data-to')).toContain(
      DOUBLE
    )
    await row.get('[data-action="undo-merge"]').trigger('click')
    // Rien n'est annulé sans confirmation.
    expect(apiMock.merges.undo).not.toHaveBeenCalled()
    await row.get('[data-action="confirm-undo-merge"]').trigger('click')
    await flushPromises()
    expect(apiMock.merges.undo).toHaveBeenCalledWith(MERGE)
    expect(useFeedbackStore().messages.at(-1)?.text).toContain('Fusion annulée')
  })

  it('une fiche fusionnée dit où elle est passée, sans chercher de doublon', async () => {
    apiMock.merges.undo.mockRejectedValue(
      new ApiError(409, 'Cette fusion a déjà été annulée.')
    )
    const wrapper = mountSection(
      fiche({
        mergedInto: {
          mergeId: MERGE,
          id: DOUBLE,
          title: '[Exemple] Fiche gardée',
          mergedAt: AT,
        },
      })
    )
    await flushPromises()
    expect(apiMock.merges.similar).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="merged-into"]').text()).toContain(
      'Doublon fusionné dans « [Exemple] Fiche gardée »'
    )
    expect(wrapper.find('[data-action="open-merge"]').exists()).toBe(false)
    expect(wrapper.find('[data-action="open-kept"]').exists()).toBe(true)
    await wrapper.get('[data-action="undo-merge"]').trigger('click')
    await wrapper.get('[data-action="confirm-undo-merge"]').trigger('click')
    await flushPromises()
    expect(apiMock.merges.undo).toHaveBeenCalledWith(MERGE)
    expect(wrapper.text()).toContain('Cette fusion a déjà été annulée.')
  })
})

describe('lot 27 : « Autres agences pour ce bien »', () => {
  function mountSeller(item: EvaluatedListing) {
    return mount(SellerSection, {
      props: { item },
      attachTo: document.body,
      global: { plugins: plugins(), stubs },
    })
  }

  it('liste les autres agences avec leur référence et d’où elles viennent', () => {
    const wrapper = mountSeller(
      fiche({
        sellers: [
          otherSeller(),
          otherSeller({
            id: '66666666-6666-4666-8666-666666666666',
            sellerType: 'private',
            sellerName: null,
            sellerReference: null,
            origin: 'manual',
          }),
        ],
      })
    )
    const section = wrapper.get('[data-testid="other-sellers"]')
    expect(section.get('[data-testid="sellers-count"]').text()).toBe(
      'Vendue par 2 agences et en direct'
    )
    const rows = section.findAll('[data-other-seller]')
    expect(nth(rows, 0).text()).toContain(
      '« [Exemple] Cabinet Bastide », réf. CB-77'
    )
    expect(nth(rows, 0).text()).toContain('reprise d’une fiche fusionnée')
    expect(nth(rows, 1).text()).toContain('Particulier (vente directe)')
    expect(nth(rows, 1).text()).toContain('saisie à la main')
  })

  it('ajoute une agence avec sa référence, sous le garde-fou de la fiche', async () => {
    const item = fiche()
    apiMock.merges.addSeller.mockResolvedValue({
      seller: otherSeller({ origin: 'manual' }),
      listing: fiche({ sellers: [otherSeller({ origin: 'manual' })] }),
      summary:
        'Autre agence enregistrée : « [Exemple] Cabinet Bastide », réf. CB-77',
    })
    const wrapper = mountSeller(item)
    expect(wrapper.get('[data-testid="other-sellers"]').text()).toContain(
      'confié à plusieurs agences'
    )
    await wrapper.get('[data-action="add-other-seller"]').trigger('click')
    // Ni nom ni référence : refusé au champ, rien n'est envoyé.
    await wrapper.get('[data-testid="other-seller-form"]').trigger('submit')
    expect(wrapper.get('[data-testid="other-seller-error"]').text()).toBe(
      'Donne le nom de l’agence ou sa référence.'
    )
    expect(apiMock.merges.addSeller).not.toHaveBeenCalled()
    await wrapper
      .get('[data-testid="other-seller-name"]')
      .setValue(' [Exemple] Cabinet Bastide ')
    await wrapper
      .get('[data-testid="other-seller-reference"]')
      .setValue('CB-77')
    await wrapper.get('[data-testid="other-seller-form"]').trigger('submit')
    await flushPromises()
    expect(apiMock.merges.addSeller).toHaveBeenCalledWith(KEPT, {
      sellerType: 'agency',
      sellerName: '[Exemple] Cabinet Bastide',
      sellerReference: 'CB-77',
      expectedUpdatedAt: AT,
    })
    expect(useFeedbackStore().messages.at(-1)?.text).toBe(
      'Autre agence enregistrée : « [Exemple] Cabinet Bastide », réf. CB-77.'
    )
    expect(wrapper.find('[data-testid="other-seller-form"]').exists()).toBe(
      false
    )
  })

  it('une vente directe en parallèle n’a ni nom ni référence ; « Annuler » referme', async () => {
    apiMock.merges.addSeller.mockResolvedValue({
      seller: null,
      listing: fiche(),
      summary: 'Autre agence enregistrée : Particulier (vente directe)',
    })
    const wrapper = mountSeller(fiche())
    await wrapper.get('[data-action="add-other-seller"]').trigger('click')
    await wrapper.get('[data-other-type="private"]').setValue(true)
    expect(wrapper.find('[data-testid="other-seller-name"]').exists()).toBe(
      false
    )
    expect(wrapper.get('[data-testid="other-seller-form"]').text()).toContain(
      'vend aussi en direct'
    )
    await wrapper.get('[data-testid="other-seller-form"]').trigger('submit')
    await flushPromises()
    expect(apiMock.merges.addSeller).toHaveBeenCalledWith(KEPT, {
      sellerType: 'private',
      expectedUpdatedAt: AT,
    })
    await wrapper.get('[data-action="add-other-seller"]').trigger('click')
    await nth(
      wrapper.get('[data-testid="other-seller-form"]').findAll('button'),
      0
    ).trigger('click')
    expect(wrapper.find('[data-testid="other-seller-form"]').exists()).toBe(
      false
    )
  })

  it('un refus se lit sans nom d’outil ; une agence se retire après confirmation', async () => {
    apiMock.merges.addSeller.mockRejectedValue(
      new ApiError(
        409,
        'Cette agence et cette référence sont déjà celles de l’annonce « [Exemple] Doublon » [id 22222222-2222-4222-8222-222222222222] : c’est sans doute le même bien. Fusionne les deux fiches (merge_listings, ou « Fusionner avec une autre fiche ») plutôt que d’ajouter l’agence ici.'
      )
    )
    apiMock.merges.removeSeller.mockResolvedValue({
      seller: null,
      listing: fiche(),
      summary:
        'Agence retirée de la fiche : « [Exemple] Cabinet Bastide », réf. CB-77',
    })
    const wrapper = mountSeller(fiche({ sellers: [otherSeller()] }))
    await wrapper.get('[data-action="add-other-seller"]').trigger('click')
    await wrapper
      .get('[data-testid="other-seller-reference"]')
      .setValue('CB-77')
    await wrapper.get('[data-testid="other-seller-form"]').trigger('submit')
    await flushPromises()
    const error = wrapper.get('[data-testid="other-seller-error"]').text()
    expect(error).toContain('Fusionne les deux fiches')
    expect(error).not.toContain('merge_listings')
    expect(error).not.toContain('[id ')

    const row = wrapper.get('[data-other-seller]')
    await row.get('[data-action="remove-other-seller"]').trigger('click')
    expect(apiMock.merges.removeSeller).not.toHaveBeenCalled()
    await row
      .get('[data-action="confirm-remove-other-seller"]')
      .trigger('click')
    await flushPromises()
    expect(apiMock.merges.removeSeller).toHaveBeenCalledWith(
      KEPT,
      '44444444-4444-4444-8444-444444444444'
    )
  })

  it('sans vendeur connu, l’agence se saisit en haut : pas de « autres agences »', () => {
    const wrapper = mountSeller(
      fiche(
        {},
        { sellerType: 'unknown', sellerName: null, sellerReference: null }
      )
    )
    expect(wrapper.find('[data-testid="other-sellers"]').exists()).toBe(false)
  })
})
