/**
 * Lot 19 : l'onglet « Le bien » et ses sections modifiables sur place
 * (travaux, caractéristiques, énergie, copropriété, annonce et adresse,
 * description et notes). L'éditeur de la fiche est fourni par un hôte de
 * test ; l'enregistrement est un espion (la charge utile est celle de
 * `sectionPatch`, testée en non-régression dans `listing-sections.spec.ts`).
 * Données fictives, aucun appel réseau.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
import type { Component } from 'vue'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import type { EvaluatedListing, Listing } from '@apart/contracts'
import {
  createListingEditor,
  provideListingEditor,
} from '@/composables/useListingEditor'
import type { ListingEditor } from '@/composables/useListingEditor'
import { useLivePreview } from '@/composables/useLivePreview'
import { sectionPatch } from '@/lib/listing-sections'
import type { ListingSectionId } from '@/lib/listing-sections'
import { fakeContext } from '@/test/criteria-fixtures'
import { fakeEvaluated, fakeListing, fakeTask } from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  listings: {
    context: vi.fn(),
    searchDpe: vi.fn(),
    verifyDpe: vi.fn(),
    regeocode: vi.fn(),
  },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import CoproSection from './CoproSection.vue'
import EnergySection from './EnergySection.vue'
import FeaturesSection from './FeaturesSection.vue'
import ListingInfoSection from './ListingInfoSection.vue'
import NotesSection from './NotesSection.vue'
import WorksSection from './WorksSection.vue'
import PropertyTab from '../tabs/PropertyTab.vue'

enableAutoUnmount(afterEach)

interface Mounted {
  editor: ListingEditor
  submit: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
}

/** Monte un composant de « Le bien » sous un éditeur de fiche fourni. */
function mountWith(
  child: Component,
  props: Record<string, unknown>,
  listing: Listing,
  options: { changedFields?: string[] } = {}
) {
  const out = {} as Mounted
  const submit = vi.fn(() => Promise.resolve())
  const focus = vi.fn()
  const Host = defineComponent({
    setup() {
      const listingRef = ref<Listing | null>(listing)
      const editor = createListingEditor({
        listing: listingRef,
        changedFields: computed(() => options.changedFields ?? []),
        preview: draft => useLivePreview(draft, ref(DEFAULT_ASSUMPTIONS)),
        submit,
        focus,
      })
      provideListingEditor(editor)
      out.editor = editor
      return () => h(child, props)
    },
  })
  out.submit = submit
  out.focus = focus
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = mount(Host, {
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  })
  return { wrapper, ...out }
}

const text = (s: string): string => s.replace(/[\u202f\u00a0]/g, ' ')

describe('Le bien : travaux avant d’emménager', () => {
  it('lecture : total, ampleur, durée, postes ; le total mène au Budget ; marque IA', async () => {
    const listing = fakeListing({
      fieldSources: { renovation: { source: 'ai', confidence: 0.8 } },
    })
    const { wrapper } = mountWith(WorksSection, { listing }, listing)
    expect(text(wrapper.get('[data-testid="works-total"]').text())).toBe(
      '2 500 €'
    )
    expect(wrapper.text()).toContain('Rafraîchissement · 1 mois estimé')
    const rows = wrapper.findAll('[data-testid="works-items"] tr')
    expect(
      rows.map(r => [text(r.get('th').text()), text(r.get('td').text())])
    ).toEqual([
      ['Peinture', '2 500 €'],
      ['Sols', 'à chiffrer'],
    ])
    expect(wrapper.find('[data-testid="ai-mark"]').exists()).toBe(true)
    // La section est mise en avant (bord accent).
    expect(wrapper.get('[data-section="works"]').classes()).toContain(
      'border-accent'
    )
    await wrapper.get('[data-testid="works-to-budget"]').trigger('click')
    expect(wrapper.findComponent(WorksSection).emitted('go')).toEqual([
      ['budget'],
    ])
  })

  it('sans travaux : le dit', () => {
    const listing = fakeListing({ renovation: null })
    const { wrapper } = mountWith(WorksSection, { listing }, listing)
    expect(wrapper.get('[data-testid="works-none"]').text()).toContain(
      'Aucuns travaux prévus'
    )
  })

  it('édition sur place : poste fréquent, montant, suppression, total, aperçu, Annuler et Enregistrer', async () => {
    const listing = fakeListing()
    const { wrapper, editor, submit } = mountWith(
      WorksSection,
      { listing },
      listing
    )
    const edit = wrapper.get('[data-testid="edit-works"]')
    expect(edit.text()).toBe('Modifier les travaux')
    expect(edit.attributes('aria-expanded')).toBe('false')
    await edit.trigger('click')
    expect(editor.editing.value).toBe('works')
    expect(wrapper.findAll('[data-testid="works-item"]')).toHaveLength(2)
    const cuisine = wrapper
      .findAll('[aria-label="Postes fréquents"] button')
      .find(b => b.text() === 'Cuisine')
    await cuisine?.trigger('click')
    expect(editor.draft.value.renovation.items).toHaveLength(3)
    expect(editor.draft.value.renovation.items[2]?.label).toBe('Cuisine')
    const amounts = wrapper.findAll('[aria-label="Montant du poste"]')
    await amounts[2]?.setValue('6 500')
    expect(text(wrapper.get('[data-testid="renovation-total"]').text())).toBe(
      '9 000 €'
    )
    // L'aperçu en direct suit la saisie (coût tout compris, mensualité, verdict).
    const preview = wrapper.get('[data-testid="section-preview"]')
    expect(preview.text()).toContain('coût tout compris')
    expect(preview.find('[data-verdict]').exists()).toBe(true)
    expect(editor.dirty.value).toBe(true)
    await wrapper
      .findAll('[aria-label="Supprimer le poste"]')[0]
      ?.trigger('click')
    expect(editor.draft.value.renovation.items.map(i => i.label)).toEqual([
      'Sols',
      'Cuisine',
    ])
    const expected = sectionPatch('works', editor.draft.value)
    await wrapper.get('[data-testid="save-works"]').trigger('submit')
    await flushPromises()
    expect(submit).toHaveBeenCalledWith('works', expected)
    expect(expected.renovation?.items).toEqual([
      { label: 'Sols', amount: null },
      { label: 'Cuisine', amount: 6500 },
    ])
  })

  it('Annuler rend la lecture et oublie la saisie', async () => {
    const listing = fakeListing()
    const { wrapper, editor } = mountWith(WorksSection, { listing }, listing)
    await wrapper.get('[data-testid="edit-works"]').trigger('click')
    await wrapper.get('#f-ren-notes').setValue('Autre devis')
    await wrapper.get('[data-testid="cancel-works"]').trigger('click')
    expect(editor.editing.value).toBeNull()
    expect(editor.draft.value.renovation.notes).toBe('')
    expect(wrapper.find('[data-testid="edit-works"]').exists()).toBe(true)
  })

  it('« Autre poste » ajoute un poste libre et coche les travaux', async () => {
    const listing = fakeListing({ renovation: null })
    const { wrapper, editor } = mountWith(WorksSection, { listing }, listing)
    await wrapper.get('[data-testid="edit-works"]').trigger('click')
    expect(editor.draft.value.renovation.active).toBe(false)
    const other = wrapper
      .findAll('[aria-label="Postes fréquents"] button')
      .find(b => b.text() === 'Autre poste')
    await other?.trigger('click')
    expect(editor.draft.value.renovation.active).toBe(true)
    expect(editor.draft.value.renovation.items[0]?.label).toBe('')
  })
})

describe('Le bien : caractéristiques', () => {
  it('valeurs, marque IA, « modifié », et « préciser » ouvre l’adresse sur son champ', async () => {
    const listing = fakeListing({
      bedrooms: 1,
      floorLabel: null,
      floor: 2,
      floorsTotal: 4,
      elevator: false,
      heatingType: 'Individuel gaz',
      outdoor: 'Balcon 6 m², sud',
      parking: null,
      cellar: true,
      location: {
        ...fakeListing().location,
        addressRaw: null,
        precision: 'district',
      },
      fieldSources: { heatingType: { source: 'ai', confidence: 0.9 } },
    })
    const { wrapper, editor, focus } = mountWith(
      FeaturesSection,
      { listing },
      listing,
      { changedFields: ['surface'] }
    )
    const dl = wrapper.get('[data-testid="features"]')
    const items = dl.findAll('dl > div')
    const byLabel = new Map(
      items.map(i => [i.get('dt').text(), text(i.get('dd').text())])
    )
    expect(byLabel.get('Surface Carrez')).toBe('45 m²modifié')
    expect(byLabel.get('Pièces')).toBe('2, dont 1 chambre')
    expect(byLabel.get('Étage')).toBe('2e sur 4, sans ascenseur')
    expect(byLabel.get('Construction')).toBe('1975')
    expect(byLabel.get('Stationnement')).toBe('cave')
    expect(byLabel.get('Chauffage')).toContain('Individuel gaz')
    expect(
      items
        .find(i => i.get('dt').text() === 'Chauffage')
        ?.find('[data-testid="ai-mark"]')
        .exists()
    ).toBe(true)
    expect(byLabel.get('Adresse')).toContain('préciser')
    await wrapper.get('[data-testid="features-precise"]').trigger('click')
    expect(editor.editing.value).toBe('listing')
    expect(focus).toHaveBeenCalledWith('f-address')
  })

  it('édition : les champs de la section, l’ascenseur en oui / non / inconnu', async () => {
    const listing = fakeListing({ elevator: true })
    const { wrapper, editor, submit } = mountWith(
      FeaturesSection,
      { listing },
      listing
    )
    await wrapper.get('[data-testid="edit-features"]').trigger('click')
    await wrapper.get('#f-surface').setValue('47,5')
    expect(
      (wrapper.get('#f-elevator').element as HTMLSelectElement).value
    ).toBe('yes')
    await wrapper.get('#f-elevator').setValue('no')
    expect(editor.draft.value.elevator).toBe(false)
    await wrapper.get('#f-elevator').setValue('')
    expect(editor.draft.value.elevator).toBeNull()
    await wrapper.get('[data-testid="save-features"]').trigger('submit')
    await flushPromises()
    const [section, patch] = submit.mock.calls[0] as [
      ListingSectionId,
      Record<string, unknown>,
    ]
    expect(section).toBe('features')
    expect(patch).toMatchObject({ surface: 47.5, elevator: null })
    expect(Object.keys(patch)).not.toContain('price')
  })
})

describe('Le bien : énergie', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.listings.context.mockResolvedValue(fakeContext())
    apiMock.listings.verifyDpe.mockResolvedValue(fakeEvaluated())
    apiMock.listings.searchDpe.mockResolvedValue(fakeContext())
  })

  it('DPE, validité, candidats ADEME : retenir (garde-fou) et relancer la recherche', async () => {
    const listing = fakeListing({ dpeConsumption: 210, gesClass: 'B' })
    const { wrapper } = mountWith(EnergySection, { listing }, listing)
    await flushPromises()
    expect(wrapper.get('[data-testid="energy-dpe"]').text()).toBe('DPE D')
    expect(wrapper.text()).toContain('210 kWh/m²/an · GES B')
    expect(wrapper.text()).toContain('Date du DPE inconnue.')
    expect(wrapper.find('[data-testid="energy-ademe"]').exists()).toBe(false)
    const candidates = wrapper.get('[data-testid="energy-candidates"]').text()
    expect(candidates).toContain('2633E0000001X')
    expect(candidates).toContain('ressemblance 85 %')
    const retain = wrapper.findAll('button').find(b => b.text() === 'Retenir')
    await retain?.trigger('click')
    await flushPromises()
    expect(apiMock.listings.verifyDpe).toHaveBeenCalledWith(listing.id, {
      number: '2633E0000001X',
      expectedUpdatedAt: listing.updatedAt,
    })
    await wrapper.get('[data-action="search-dpe"]').trigger('click')
    await flushPromises()
    expect(apiMock.listings.searchDpe).toHaveBeenCalledWith(listing.id)
  })

  it('retrouvé à l’ADEME : la pastille, sans candidats ; une erreur est dite', async () => {
    const base = fakeContext()
    apiMock.listings.context.mockResolvedValue({
      ...base,
      dpe: { ...base.dpe, verified: true },
    })
    apiMock.listings.searchDpe.mockRejectedValueOnce(new Error('réseau'))
    const listing = fakeListing({ dpeClass: null })
    const { wrapper } = mountWith(EnergySection, { listing }, listing)
    await flushPromises()
    expect(wrapper.get('[data-testid="energy-dpe"]').text()).toBe('DPE inconnu')
    expect(wrapper.find('[data-testid="energy-ademe"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="energy-candidates"]').exists()).toBe(
      false
    )
    await wrapper.get('[data-action="search-dpe"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Échec.')
  })

  it('édition : DPE, GES et date', async () => {
    const listing = fakeListing()
    const { wrapper, submit } = mountWith(EnergySection, { listing }, listing)
    await flushPromises()
    await wrapper.get('[data-testid="edit-energy"]').trigger('click')
    await wrapper.get('#f-dpe').setValue('C')
    await wrapper.get('#f-ges').setValue('A')
    await wrapper.get('#f-dpe-date').setValue('2024-03-15')
    await wrapper.get('[data-testid="save-energy"]').trigger('submit')
    await flushPromises()
    expect(submit).toHaveBeenCalledWith('energy', {
      dpeClass: 'C',
      gesClass: 'A',
      dpeDate: '2024-03-15',
    })
  })
})

describe('Le bien : copropriété et charges', () => {
  it('charges et part non récupérable, honoraires ; taxe foncière demandée → suivre dans À faire', async () => {
    const listing = fakeListing({
      lotsCount: 24,
      syndic: 'professionnel',
      annualCharges: 1440,
      nonRecoverableChargesMonthly: 40,
      votedWorks: 'Ravalement 2025',
      feesAmount: 8000,
      feesPayer: 'buyer',
    })
    const tasks = [
      fakeTask({
        field: 'propertyTax',
        requestedAt: '2026-11-04T09:00:00.000Z',
      }),
    ]
    const { wrapper } = mountWith(CoproSection, { listing, tasks }, listing)
    const copro = text(wrapper.get('[data-testid="copro"]').text())
    expect(copro).toContain('24 lots · syndic professionnel')
    expect(copro).toContain('1 440 €/an')
    expect(copro).toContain('dont 40 €/mois non récupérables')
    expect(copro).toContain('Ravalement 2025')
    expect(copro).toContain('8 000 €, à charge de l’acquéreur')
    expect(wrapper.get('[data-testid="property-tax"]').text()).toContain(
      'Demandée à l’annonceur'
    )
    await wrapper.get('[data-testid="tax-to-todo"]').trigger('click')
    expect(wrapper.findComponent(CoproSection).emitted('go')).toEqual([
      ['a-faire'],
    ])
  })

  it('taxe à demander, inconnue sinon ; charges estimées ou inconnues', () => {
    const listing = fakeListing({ annualCharges: 1200 })
    const open = mountWith(
      CoproSection,
      { listing, tasks: [fakeTask({ field: 'propertyTax' })] },
      listing
    )
    expect(open.wrapper.get('[data-testid="property-tax"]').text()).toContain(
      'Inconnue, à demander · À faire'
    )
    expect(open.wrapper.text()).toContain('part non récupérable estimée à 25 %')
    open.wrapper.unmount()
    const bare = fakeListing({ annualCharges: null })
    const none = mountWith(
      CoproSection,
      {
        listing: bare,
        tasks: [
          fakeTask({ field: 'annualCharges', requestedAt: null }),
          fakeTask({ id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', done: true }),
        ],
      },
      bare
    )
    expect(none.wrapper.get('[data-testid="property-tax"]').text()).toBe(
      'Inconnue, estimée à un mois de loyer'
    )
    expect(none.wrapper.find('[data-testid="charges-to-todo"]').text()).toBe(
      'À faire'
    )
    expect(none.wrapper.text()).toContain('Inclus ou à charge du vendeur')
  })

  it('édition : les champs de copropriété partent ensemble', async () => {
    const listing = fakeListing()
    const { wrapper, submit } = mountWith(
      CoproSection,
      { listing, tasks: [] },
      listing
    )
    await wrapper.get('[data-testid="edit-copro"]').trigger('click')
    await wrapper.get('#f-tax').setValue('950')
    await wrapper.get('#f-fees-payer').setValue('seller')
    await wrapper.get('[data-testid="save-copro"]').trigger('submit')
    await flushPromises()
    const [, patch] = submit.mock.calls[0] as [string, Record<string, unknown>]
    expect(patch).toMatchObject({
      propertyTax: 950,
      feesPayer: 'seller',
      annualCharges: 1200,
    })
    expect(Object.keys(patch).sort()).toEqual(
      [
        'annualCharges',
        'feesAmount',
        'feesPayer',
        'lotsCount',
        'nonRecoverableChargesMonthly',
        'proceedings',
        'propertyTax',
        'syndic',
        'votedWorks',
      ].sort()
    )
  })
})

describe('Le bien : l’annonce et son adresse', () => {
  it('lecture : lien principal (nouvel onglet), source, repère ; édition avec l’adresse et une erreur', async () => {
    const listing = fakeListing({ sourceLabel: '[Exemple] Agence' })
    const { wrapper, submit, editor } = mountWith(
      ListingInfoSection,
      { listing },
      listing
    )
    const link = wrapper.get('[data-testid="listing-url"]')
    expect(link.attributes('href')).toBe('https://exemple.invalid/annonce/1')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    expect(wrapper.text()).toContain('Leboncoin · [Exemple] Agence')
    expect(wrapper.text()).toContain('Adresse exacte')
    await wrapper.get('[data-testid="edit-listing"]').trigger('click')
    await wrapper.get('#f-address').setValue('2 rue [Exemple]')
    await wrapper.get('#f-lng').setValue('500')
    await wrapper.get('[data-testid="save-listing"]').trigger('submit')
    await flushPromises()
    expect(submit).not.toHaveBeenCalled()
    expect(editor.errors.value['location.point']).toBeTruthy()
    expect(wrapper.text()).toContain('coordonnées valides')
    await wrapper.get('#f-lng').setValue('-0.59')
    await wrapper.get('[data-testid="save-listing"]').trigger('submit')
    await flushPromises()
    const [, patch] = submit.mock.calls[0] as [
      string,
      { location: Record<string, unknown> },
    ]
    expect(patch.location).toMatchObject({
      addressRaw: '2 rue [Exemple]',
      commune: 'Talence',
    })
  })
})

describe('Le bien : description et notes', () => {
  it('dépli : lecture, puis édition ouverte ; l’enregistrement envoie notes et description', async () => {
    const listing = fakeListing({ description: '[Exemple] T2 lumineux.' })
    const { wrapper, editor, submit } = mountWith(
      NotesSection,
      { listing },
      listing
    )
    const details = wrapper.get('details').element as HTMLDetailsElement
    expect(details.open).toBe(false)
    expect(wrapper.get('[data-testid="notes-description"]').text()).toBe(
      '[Exemple] T2 lumineux.'
    )
    expect(wrapper.get('[data-testid="notes-text"]').text()).toBe(
      'PV à demander'
    )
    await wrapper.get('[data-testid="edit-notes"]').trigger('click')
    await nextTick()
    expect(editor.editing.value).toBe('notes')
    expect(details.open).toBe(true)
    await wrapper.get('#f-notes').setValue('Demander l’âge de la chaudière.')
    await wrapper.get('[data-testid="save-notes"]').trigger('submit')
    await flushPromises()
    expect(submit).toHaveBeenCalledWith('notes', {
      notes: 'Demander l’âge de la chaudière.',
      description: '[Exemple] T2 lumineux.',
    })
  })

  it('Annuler ferme l’édition', async () => {
    const listing = fakeListing()
    const { wrapper, editor } = mountWith(NotesSection, { listing }, listing)
    await wrapper.get('[data-testid="edit-notes"]').trigger('click')
    await wrapper.get('[data-testid="cancel-notes"]').trigger('click')
    expect(editor.editing.value).toBeNull()
  })
})

describe('onglet « Le bien »', () => {
  function evaluated(over: Partial<Listing> = {}): EvaluatedListing {
    return fakeEvaluated(over)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.listings.context.mockResolvedValue(fakeContext())
  })

  it('travaux en tête, puis les sections ; à droite où la trouver et qui la vend ; légende IA', async () => {
    const item = evaluated({
      fieldSources: { surface: { source: 'ai', confidence: 0.9 } },
    })
    const { wrapper } = mountWith(PropertyTab, { item }, item.listing)
    await flushPromises()
    const sections = wrapper
      .findAll('[data-section]')
      .map(s => s.attributes('data-section'))
    expect(sections).toEqual([
      'works',
      'features',
      'energy',
      'copro',
      'listing',
      'notes',
    ])
    expect(wrapper.find('[data-testid="ai-legend"]').text()).toContain(
      'valeur lue par l’IA dans l’annonce, à confirmer'
    )
    const aside = wrapper.get('aside').text()
    expect(aside).toContain('Où la trouver')
    expect(aside).toContain('Qui la vend')
  })

  it('sans champ lu par l’IA : pas de légende ; une seule section en édition à la fois', async () => {
    const item = evaluated()
    const { wrapper, editor } = mountWith(PropertyTab, { item }, item.listing)
    await flushPromises()
    expect(wrapper.find('[data-testid="ai-legend"]').exists()).toBe(false)
    await wrapper.get('[data-testid="edit-works"]').trigger('click')
    expect(wrapper.find('[data-testid="edit-features"]').exists()).toBe(true)
    await wrapper.get('[data-testid="edit-features"]').trigger('click')
    expect(editor.editing.value).toBe('features')
    expect(wrapper.findAll('[data-editing="true"]')).toHaveLength(1)
    // Modifiée puis quittée : la confirmation attend (aucun window.confirm).
    await wrapper.get('#f-surface').setValue('50')
    await wrapper.get('[data-testid="edit-copro"]').trigger('click')
    expect(editor.pending.value?.section).toBe('features')
    expect(editor.editing.value).toBe('features')
  })
})
