import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { DEFAULT_ASSUMPTIONS, DEFAULT_REGULATORY_RULES } from '@apart/contracts'
import { DEFAULT_ASSUMPTIONS as A } from '@apart/contracts'
import {
  complianceReport,
  financialsFromListing,
  sensitivityGrid,
} from '@apart/domain'
import {
  MEMBERS,
  fakeEvaluated,
  fakeOffer,
  fakeTargetPriceReport,
} from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  workspace: vi.fn(),
  assumptions: { current: vi.fn() },
  listings: {
    get: vi.fn(),
    markSeen: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    recordPriceChange: vi.fn(),
    targetPrice: vi.fn(),
    sensitivity: vi.fn(),
    context: vi.fn(),
  },
  study: { compliance: vi.fn() },
  opinions: { upsertMine: vi.fn() },
  tasks: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  offers: { create: vi.fn(), update: vi.fn() },
  whatsNew: { listingChanges: vi.fn() },
  visits: { list: vi.fn() },
  activity: { forListing: vi.fn() },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import { fakeContext } from '@/test/criteria-fixtures'
import ListingPanel from './ListingPanel.vue'

const item = fakeEvaluated({}, { isNewForMe: true })

// Un test en échec ne laisse pas sa fiche dans le document pour les suivants.
enableAutoUnmount(afterEach)

function mountPanel(props: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(ListingPanel, {
    props: { id: item.listing.id, ...props },
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
    },
  })
}

const text = (): string => document.body.textContent ?? ''
const query = (selector: string): HTMLElement | null =>
  document.body.querySelector<HTMLElement>(selector)

async function openTab(id: string): Promise<void> {
  query(`[data-testid="tab-${id}"]`)?.click()
  await flushPromises()
}

describe('ListingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.listings.context.mockResolvedValue(fakeContext())
    apiMock.study.compliance.mockResolvedValue(
      complianceReport(
        {
          dpeClass: 'D',
          dpeDate: '2023-01-01',
          constructionYear: 1975,
          leaseType: 'unfurnished',
          inseeCode: '33522',
          commune: 'Talence',
          surface: 45,
          rentControlled: false,
          targetRent: 750,
          rentCap: null,
          heatingType: null,
          coOwnershipAllowsRental: 'unknown',
          decencyCompliant: 'unknown',
          rentalPermitRequired: 'unknown',
        },
        DEFAULT_REGULATORY_RULES,
        null,
        {
          rentalStartDate: '2028-01-01',
          at: new Date('2026-11-03T10:00:00Z'),
        }
      )
    )
    apiMock.workspace.mockResolvedValue({
      workspace: {
        id: MEMBERS[0]?.workspaceId,
        name: 'Espace',
        createdAt: '2026-11-03T10:00:00.000Z',
        members: MEMBERS,
      },
      me: MEMBERS[0],
    })
    apiMock.assumptions.current.mockResolvedValue({
      id: 'v1',
      workspaceId: MEMBERS[0]?.workspaceId,
      label: null,
      effectiveFrom: '2026-11-03T10:00:00.000Z',
      createdAt: '2026-11-03T10:00:00.000Z',
      values: DEFAULT_ASSUMPTIONS,
    })
    apiMock.listings.get.mockResolvedValue(item)
    apiMock.listings.targetPrice.mockResolvedValue(fakeTargetPriceReport(item))
    apiMock.listings.sensitivity.mockImplementation(
      (
        _id: string,
        request: {
          rowAxis: 'price'
          colAxis: 'rent'
          includeTargetPrice: boolean
        }
      ) =>
        Promise.resolve(
          sensitivityGrid(financialsFromListing(item.listing), A, request)
        )
    )
    apiMock.offers.create.mockResolvedValue({
      offer: fakeOffer(),
      offers: [fakeOffer()],
      currentStatus: 'to_study',
      suggestedStatus: 'offer_made',
    })
    apiMock.listings.markSeen.mockResolvedValue({ ...item, isNewForMe: false })
    apiMock.whatsNew.listingChanges.mockResolvedValue({
      listingId: item.listing.id,
      since: null,
      changedFields: [],
      entries: [],
    })
    apiMock.visits.list.mockResolvedValue([])
    apiMock.activity.forListing.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 30,
      pageCount: 0,
    })
    apiMock.listings.setStatus.mockResolvedValue({
      ...item,
      listing: { ...item.listing, status: 'to_visit' },
    })
  })

  it("ouvre sur la synthèse : deux bases, trois blocs, « Et au prix cible ? », et marque l'annonce vue", async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(apiMock.listings.get).toHaveBeenCalledWith(item.listing.id)
    expect(text()).toContain('T2 fictif')
    expect(apiMock.listings.markSeen).toHaveBeenCalledTimes(1)
    expect(apiMock.listings.markSeen).toHaveBeenCalledWith(item.listing.id)
    expect(apiMock.listings.targetPrice).toHaveBeenCalledWith(item.listing.id)
    // Lot 9 : les onglets, la synthèse par défaut.
    const tabs = [...document.body.querySelectorAll('[role="tab"]')]
    expect(tabs.map(t => t.getAttribute('data-testid'))).toEqual([
      'tab-synthese',
      'tab-negocier',
      'tab-financer',
      'tab-quartier',
      'tab-suivi',
    ])
    expect(
      query('[data-testid="tab-synthese"]')?.getAttribute('aria-selected')
    ).toBe('true')
    expect(query('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(
      'listing-tab-synthese'
    )
    expect(query('[data-testid="open-tasks-count"]')?.textContent).toContain(
      '1 tâche'
    )
    expect(query('[data-testid="cost-bases"]')?.textContent).toContain(
      'Deux bases de calcul'
    )
    for (const id of ['block-price', 'block-cost', 'block-yield', 'at-target'])
      expect(query(`[data-testid="${id}"]`), id).not.toBeNull()
    expect(query('[data-testid="block-price"]')?.textContent).toContain(
      'sur le prix'
    )
    expect(query('[data-testid="block-cost"]')?.textContent).toContain(
      'tout compris'
    )
    expect(query('[data-testid="at-target-verdict"]')?.textContent).toContain(
      'entre dans la cible'
    )
    expect(text()).toContain('Louabilité (phase 2)')
    // Rien d'autre n'est demandé tant que les onglets restent fermés.
    expect(apiMock.listings.sensitivity).not.toHaveBeenCalled()
    expect(apiMock.listings.context).not.toHaveBeenCalled()
    expect(apiMock.visits.list).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('Négocier : prix cible par critère, sensibilité avec la ligne du prix cible, historique', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    await openTab('negocier')
    expect(apiMock.listings.sensitivity).toHaveBeenCalledWith(item.listing.id, {
      rowAxis: 'price',
      colAxis: 'rent',
      includeTargetPrice: true,
    })
    expect(text()).toContain('À partir de quel prix ?')
    expect(query('[data-testid="rank"]')?.textContent).toContain('sur 3')
    expect(query('[data-testid="target-criteria"]')).not.toBeNull()
    expect(query('[data-testid="sensitivity-grid"]')).not.toBeNull()
    expect(query('tr[data-target="true"]')?.textContent).toContain('prix cible')
    expect(text()).toContain('Historique des prix et des offres')
    wrapper.unmount()
  })

  it('Quartier : contexte, carte et risques à l’adresse', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    await openTab('quartier')
    expect(apiMock.listings.context).toHaveBeenCalledWith(item.listing.id)
    expect(text()).toContain('Contexte (données ouvertes)')
    expect(text()).toContain('Arrêt fictif')
    expect(text()).toContain('Risques à l’adresse')
    expect(apiMock.study.compliance).toHaveBeenCalledWith(item.listing.id)
    wrapper.unmount()
  })

  it('Financer et louer : louabilité, étude et saisie', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    await openTab('financer')
    expect(text()).toContain('Compatibilité location')
    expect(text()).toContain("Coût d'occupation")
    expect(text()).toContain('Fiche et saisie')
    wrapper.unmount()
  })

  it('l’onglet est un v-model : il se lit dans la prop et se signale au changement', async () => {
    const wrapper = mountPanel({ tab: 'negocier' })
    await flushPromises()
    expect(
      query('[data-testid="tab-negocier"]')?.getAttribute('aria-selected')
    ).toBe('true')
    expect(text()).toContain('À partir de quel prix ?')
    await openTab('suivi')
    expect(wrapper.emitted('update:tab')).toEqual([['suivi']])
    wrapper.unmount()
  })

  it('« Voir le détail par critère » mène à l’onglet Négocier', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    query('[data-testid="go-negotiate"]')?.click()
    await flushPromises()
    expect(
      query('[data-testid="tab-negocier"]')?.getAttribute('aria-selected')
    ).toBe('true')
    expect(text()).toContain('À partir de quel prix ?')
    wrapper.unmount()
  })

  it('« Modifier la fiche » ouvre la saisie ; la synthèse montre alors l’aperçu en direct', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    query('[data-testid="edit-listing"]')?.click()
    await flushPromises()
    expect(
      query('[data-testid="tab-financer"]')?.getAttribute('aria-selected')
    ).toBe('true')
    expect(query('details')?.hasAttribute('open')).toBe(true)
    const price = query('#f-price') as HTMLInputElement
    price.value = '150000'
    price.dispatchEvent(new Event('input'))
    await flushPromises()
    await openTab('synthese')
    expect(query('[data-testid="live-badge"]')).not.toBeNull()
    expect(query('[data-testid="summary-listed-price"]')?.textContent).toMatch(
      /150\s000 €/
    )
    wrapper.unmount()
  })

  it('lot 12 : pastille de précision et « Préciser l’adresse » qui ouvre la saisie sur l’adresse', async () => {
    const atCommune = fakeEvaluated({
      location: {
        ...item.listing.location,
        precision: 'commune',
        placement: null,
      },
    })
    apiMock.listings.get.mockResolvedValue(atCommune)
    apiMock.listings.markSeen.mockResolvedValue(atCommune)
    const wrapper = mountPanel()
    await flushPromises()
    expect(
      query('[data-testid="precision-badge"]')?.getAttribute('data-precision')
    ).toBe('commune')
    query('[data-testid="precise-address"]')?.click()
    await flushPromises()
    expect(
      query('[data-testid="tab-financer"]')?.getAttribute('aria-selected')
    ).toBe('true')
    expect(document.activeElement?.id).toBe('f-address')
    expect(query('[data-testid="precise-address"]')).toBeNull()
    wrapper.unmount()
  })

  it('enregistre une offre puis propose le statut suggéré sans le forcer', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    await openTab('negocier')
    const amount = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Montant de l\'offre"]'
    )
    expect(amount).not.toBeNull()
    if (amount) {
      amount.value = '150000'
      amount.dispatchEvent(new Event('input'))
    }
    document.body
      .querySelector<HTMLFormElement>('form[aria-label="Nouvelle offre"]')
      ?.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()
    expect(apiMock.offers.create).toHaveBeenCalledWith(item.listing.id, {
      amount: 150_000,
      channel: null,
      notes: null,
    })
    const suggestion = document.body.querySelector(
      '[data-testid="suggested-status"]'
    )
    expect(suggestion?.textContent).toContain('Offre faite')
    expect(apiMock.listings.setStatus).not.toHaveBeenCalled()
    suggestion?.querySelector('button')?.click()
    await flushPromises()
    expect(apiMock.listings.setStatus).toHaveBeenCalledWith(item.listing.id, {
      status: 'offer_made',
      reason: null,
      expectedStatus: 'to_study',
    })
    wrapper.unmount()
  })

  it('change le statut avec le garde-fou du statut courant', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const select = document.body.querySelector<HTMLSelectElement>(
      'select[aria-label="Changer le statut"]'
    )
    expect(select).not.toBeNull()
    if (select) {
      select.value = 'to_visit'
      select.dispatchEvent(new Event('change'))
    }
    await flushPromises()
    expect(apiMock.listings.setStatus).toHaveBeenCalledWith(item.listing.id, {
      status: 'to_visit',
      reason: null,
      expectedStatus: 'to_study',
    })
    wrapper.unmount()
  })

  it('retient le loyer de marché estimé dans la phase 2, avec le garde-fou', async () => {
    apiMock.listings.update.mockResolvedValue(item)
    const wrapper = mountPanel()
    await flushPromises()
    await openTab('financer')
    const study = wrapper.findComponent({ name: 'StudySection' })
    study.vm.$emit('retainMarketRent', 765)
    await flushPromises()
    expect(apiMock.listings.update).toHaveBeenCalledWith(item.listing.id, {
      rentalPlan: { ...item.listing.rentalPlan, marketRent: 765 },
      expectedUpdatedAt: item.listing.updatedAt,
    })
    expect(text()).toContain('Loyer de marché retenu')
    wrapper.unmount()
  })

  it('sans phase 2 : invite à la créer avant de retenir un loyer de marché', async () => {
    const withoutPlan = fakeEvaluated(
      { rentalPlan: null },
      { isNewForMe: false }
    )
    apiMock.listings.get.mockResolvedValueOnce(withoutPlan)
    apiMock.listings.markSeen.mockResolvedValueOnce(withoutPlan)
    const wrapper = mountPanel()
    await flushPromises()
    await openTab('financer')
    wrapper
      .findComponent({ name: 'StudySection' })
      .vm.$emit('retainMarketRent', 700)
    await flushPromises()
    expect(apiMock.listings.update).not.toHaveBeenCalled()
    expect(text()).toContain('Ajoutez d’abord la phase 2')
    wrapper.unmount()
  })

  it('montre les critères de l’annonce et le message de création', async () => {
    const matched = {
      ...item,
      isNewForMe: false,
      criteriaMatches: [
        {
          criteriaId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          name: 'Talence fictif',
          matchedAt: '2026-11-03T10:00:00.000Z',
          approximate: false,
          level: 'in' as const,
          reasons: [],
        },
      ],
      criteriaFit: {
        ...item.criteriaFit,
        level: 'in' as const,
        activeCriteria: 1,
        criteriaId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        name: 'Talence fictif',
      },
    }
    apiMock.listings.get.mockResolvedValue(matched)
    apiMock.listings.markSeen.mockResolvedValue(matched)
    const wrapper = mountPanel({
      notice: 'Annonce créée. Entre dans le critère « Talence fictif ».',
    })
    await flushPromises()
    // Lot 14 : la pastille d'adéquation dans l'en-tête de la fiche.
    expect(query('header [data-testid="fit-badge"]')?.textContent).toContain(
      'Dans les critères'
    )
    expect(text()).toContain('Entre dans le critère « Talence fictif »')
    wrapper.unmount()
  })

  it('lit ce qui a changé avant de marquer la fiche vue, et met les champs en évidence', async () => {
    const seen = fakeEvaluated({}, { isNewForMe: false })
    apiMock.listings.get.mockResolvedValue(seen)
    apiMock.listings.markSeen.mockResolvedValue(seen)
    let resolveChanges: (value: unknown) => void = () => undefined
    apiMock.whatsNew.listingChanges.mockReturnValue(
      new Promise(resolve => {
        resolveChanges = resolve
      })
    )
    const wrapper = mountPanel()
    await flushPromises()
    // Tant que les changements ne sont pas lus, la fiche n'est pas marquée vue.
    expect(apiMock.listings.markSeen).not.toHaveBeenCalled()
    resolveChanges({
      listingId: seen.listing.id,
      since: '2026-11-02T10:00:00.000Z',
      changedFields: ['price', 'rentalPlan', 'rentalPlan.targetRent'],
      entries: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          createdAt: '2026-11-03T09:00:00.000Z',
          action: 'listing.price_changed',
          kind: 'price',
          channel: 'web',
          channelLabel: 'Web',
          actor: { id: MEMBERS[1]?.id, handle: 'chloe', displayName: 'Chloé' },
          listing: { id: seen.listing.id, title: 'T2 fictif' },
          summary: 'a enregistré un nouveau prix',
          changes: [
            {
              field: 'price',
              label: 'Prix',
              before: '210 000 €',
              after: '200 000 €',
            },
          ],
        },
      ],
    })
    await flushPromises()
    expect(apiMock.listings.markSeen).toHaveBeenCalledTimes(1)
    const box = query('[data-testid="listing-changes"]')
    expect(box?.textContent).toContain('Chloé')
    expect(box?.textContent).toContain('a enregistré un nouveau prix')
    expect(box?.textContent).toContain('210 000 €')
    expect(query('[data-testid="changed-count"]')?.textContent).toContain(
      '3 champ(s) modifié(s)'
    )
    await openTab('financer')
    const changed = [...document.body.querySelectorAll('[data-changed="true"]')]
    expect(
      changed.map(el => el.querySelector('label')?.getAttribute('for'))
    ).toEqual(['f-price', 'f-rent'])
    wrapper.unmount()
  })

  it('Suivi : avis, tâches, visites et journal ensemble', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    await openTab('suivi')
    expect(text()).toContain('Nos avis')
    expect(text()).toContain('À faire pour cette annonce')
    expect(apiMock.visits.list).toHaveBeenCalledWith(item.listing.id)
    expect(text()).toContain("Aucune visite pour l'instant.")
    expect(apiMock.activity.forListing).toHaveBeenCalledWith(item.listing.id, {
      page: 1,
      limit: 30,
    })
    expect(text()).toContain('Rien dans le journal.')
    wrapper.unmount()
  })
})
