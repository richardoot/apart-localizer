/**
 * Lot 19 : l'édition section par section de la fiche (section modifiable
 * sur place, aperçu en direct, confirmation avant de perdre des
 * modifications, marques « IA » et « modifié ») et l'en-tête allégé.
 * Annonces fictives, évaluées par le vrai paquet `domain`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import type { Listing } from '@apart/contracts'
import {
  LISTING_EDITOR,
  createListingEditor,
} from '@/composables/useListingEditor'
import type { ListingEditor } from '@/composables/useListingEditor'
import { useLivePreview } from '@/composables/useLivePreview'
import { fakeEvaluated, fakeLink, fakeListing } from '@/test/fixtures'
import ListingIdentity from '../ListingIdentity.vue'
import ListingHeader from '../ListingHeader.vue'
import AiMark from './AiMark.vue'
import EditableSection from './EditableSection.vue'
import ReadItem from './ReadItem.vue'
import UnsavedChangesBar from './UnsavedChangesBar.vue'

enableAutoUnmount(afterEach)

function makeEditor(listing: Listing = fakeListing()) {
  const submit = vi.fn().mockResolvedValue(undefined)
  const editor = createListingEditor({
    listing: ref(listing),
    changedFields: computed(() => ['surface']),
    preview: draft => useLivePreview(draft, ref(DEFAULT_ASSUMPTIONS)),
    submit,
  })
  return { editor, submit }
}

/** Monte des sections avec l'éditeur fourni, comme la fiche le fait. */
function host(editor: ListingEditor, render: () => ReturnType<typeof h>) {
  return mount(
    defineComponent({
      setup: () => render,
    }),
    {
      global: { provide: { [LISTING_EDITOR as symbol]: editor } },
      attachTo: document.body,
    }
  )
}

describe('EditableSection', () => {
  it('se lit, se modifie sur place avec l’aperçu, s’annule ou s’enregistre', async () => {
    const { editor, submit } = makeEditor()
    const wrapper = host(editor, () =>
      h(
        EditableSection,
        {
          section: 'notes',
          title: 'Nos notes',
          editLabel: 'Modifier les notes',
          preview: true,
        },
        {
          default: () => h('p', { 'data-testid': 'read' }, 'lecture'),
          edit: () =>
            h('input', {
              id: 'f-notes',
              value: editor.draft.value.notes,
              onInput: (e: Event) => {
                editor.draft.value.notes = (e.target as HTMLInputElement).value
              },
            }),
        }
      )
    )
    expect(wrapper.find('[data-testid="read"]').exists()).toBe(true)
    const edit = wrapper.get('[data-testid="edit-notes"]')
    expect(edit.text()).toBe('Modifier les notes')
    expect(edit.attributes('aria-expanded')).toBe('false')
    await edit.trigger('click')
    expect(wrapper.find('[data-testid="read"]').exists()).toBe(false)
    expect(wrapper.get('section').attributes('data-editing')).toBe('true')
    expect(wrapper.get('[data-testid="section-preview"]').text()).toMatch(
      /coût tout compris.*mensualité.*verdict/
    )
    await wrapper.get('#f-notes').setValue('Vu en visite')
    await wrapper.get('[data-testid="cancel-notes"]').trigger('click')
    expect(editor.editing.value).toBeNull()
    expect(editor.draft.value.notes).toBe('PV à demander')
    await wrapper.get('[data-testid="edit-notes"]').trigger('click')
    await wrapper.get('#f-notes').setValue('Vu en visite')
    await wrapper.get('form').trigger('submit')
    await nextTick()
    expect(submit).toHaveBeenCalledWith('notes', {
      notes: 'Vu en visite',
      description: null,
    })
  })

  it('l’erreur d’une autre partie de la fiche se dit dans la section', async () => {
    const { editor } = makeEditor(fakeListing({ title: '' }))
    const wrapper = host(editor, () =>
      h(EditableSection, { section: 'energy', title: 'Énergie' })
    )
    await wrapper.get('[data-testid="edit-energy"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    await nextTick()
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'La section « L’annonce et son adresse » a une erreur (Le titre est obligatoire.)'
    )
  })
})

describe('UnsavedChangesBar', () => {
  it('demande avant de perdre des modifications : continuer ou abandonner, Échap garde', async () => {
    const { editor } = makeEditor()
    const run = vi.fn()
    const wrapper = host(editor, () => h(UnsavedChangesBar))
    expect(wrapper.find('[data-testid="unsaved-changes"]').exists()).toBe(false)
    editor.start('copro')
    editor.draft.value.syndic = 'Syndic [Exemple]'
    editor.guard(run)
    await nextTick()
    await nextTick()
    const bar = wrapper.get('[data-testid="unsaved-changes"]')
    expect(bar.attributes('role')).toBe('alertdialog')
    expect(bar.text()).toContain('« Copropriété et charges »')
    expect(document.activeElement?.getAttribute('data-testid')).toBe(
      'unsaved-stay'
    )
    await bar.trigger('keydown', { key: 'Escape' })
    expect(editor.pending.value).toBeNull()
    expect(run).not.toHaveBeenCalled()
    editor.guard(run)
    await nextTick()
    await wrapper.get('[data-testid="unsaved-stay"]').trigger('click')
    expect(editor.editing.value).toBe('copro')
    editor.guard(run)
    await nextTick()
    await wrapper.get('[data-testid="unsaved-leave"]').trigger('click')
    expect(run).toHaveBeenCalledTimes(1)
    expect(editor.editing.value).toBeNull()
  })
})

describe('ReadItem et AiMark', () => {
  it('une valeur lue, « — » sinon, marque IA (confiance, extrait) et « modifié »', () => {
    const { editor } = makeEditor(
      fakeListing({
        fieldSources: {
          surface: { source: 'ai', confidence: 0.82, evidence: '45 m² Carrez' },
          rooms: { source: 'user' },
        },
      })
    )
    const wrapper = host(editor, () =>
      h('dl', [
        h(ReadItem, {
          label: 'Surface Carrez',
          value: '45 m²',
          source: 'surface',
          changedKeys: ['surface'],
        }),
        h(ReadItem, { label: 'Pièces', value: '2', source: 'rooms' }),
        h(ReadItem, { label: 'Étage', tone: 'warn' }),
      ])
    )
    const items = wrapper.findAll('dd')
    expect(items[0]?.text()).toContain('45 m²')
    const mark = items[0]?.get('[data-testid="ai-mark"]')
    expect(mark?.attributes('title')).toContain('confiance 82 %')
    expect(mark?.attributes('title')).toContain('« 45 m² Carrez »')
    expect(mark?.text()).toContain('IA')
    expect(items[0]?.text()).toContain('modifié')
    expect(items[1]?.find('[data-testid="ai-mark"]').exists()).toBe(false)
    expect(items[2]?.text()).toBe('—')
    expect(items[2]?.classes()).toContain('text-warn')
    expect(mount(AiMark, { props: { provenance: null } }).html()).toBe(
      '<!--v-if-->'
    )
  })
})

describe('ListingHeader (lot 19)', () => {
  it('retour, statut, titre, prix et faits, pastilles, portails, fraîcheur ; ni dates ni « Modifier la fiche »', async () => {
    const item = fakeEvaluated(
      {
        title: '[Exemple] T2 lot 19',
        rooms: 2,
        floorLabel: null,
        floor: 3,
        lastCheckedAt: new Date(Date.now() - 86_400_000).toISOString(),
        status: 'discarded',
        discardReason: 'Trop loin',
      },
      {
        isNewForMe: true,
        links: [fakeLink()],
        distanceMeters: 420,
      }
    )
    // Lot 25 : la ligne d'identité collée (retour, titre, prix, jugements),
    // puis l'en-tête qui défile (faits, pastilles, statut au téléphone).
    const identity = mount(ListingIdentity, {
      props: { item, evaluation: item.evaluation, layout: 'panel' },
      global: {
        stubs: {
          DialogTitle: {
            props: ['as'],
            setup:
              (
                _p: unknown,
                { slots }: { slots: { default?: () => unknown } }
              ) =>
              () =>
                h('h1', slots.default?.() as never),
          },
        },
      },
    })
    expect(identity.get('h1').text()).toBe('[Exemple] T2 lot 19')
    expect(
      identity
        .get('[data-testid="header-price"]')
        .text()
        .replace(/[\u202f\u00a0]/g, ' ')
    ).toBe('200 000 €')
    // Au téléphone, la ligne collée reste courte : les jugements sont dessous.
    expect(identity.find('[data-judgement]').exists()).toBe(false)
    await identity.get('[data-testid="listing-back"]').trigger('click')
    expect(identity.emitted('back')).toHaveLength(1)
    await identity.get('[data-testid="edit-price"]').trigger('click')
    expect(identity.emitted('editPrice')).toHaveLength(1)
    expect(identity.find('select').exists()).toBe(false)
    const page = mount(ListingIdentity, {
      props: { item, evaluation: item.evaluation, layout: 'page' },
    })
    expect(page.get('h1').text()).toBe('[Exemple] T2 lot 19')
    expect(
      page.findAll('[data-judgement]').map(j => j.attributes('data-judgement'))
    ).toEqual(['profitability', 'rental'])
    // Sur ordinateur, le statut est dans la ligne collée.
    await page.get('select').setValue('to_visit')
    expect(page.emitted('status')).toEqual([
      [{ status: 'to_visit', reason: null }],
    ])

    const wrapper = mount(ListingHeader, {
      props: { item, evaluation: item.evaluation, layout: 'panel' },
    })
    const facts = wrapper
      .get('[data-testid="listing-facts"]')
      .text()
      .replace(/[\u202f\u00a0]/g, ' ')
    expect(facts).toContain('4 444 €/m²')
    expect(facts).toContain('45 m²')
    expect(facts).toContain('2 pièces')
    expect(facts).toContain('3e étage')
    expect(facts).toContain('Talence · Forum')
    expect(facts).toContain('à 420 m')
    // Les trois jugements étiquetés, en entier, sous la ligne collée.
    expect(wrapper.get('[data-judgement="profitability"]').text()).toContain(
      'Rentabilité'
    )
    const pills = wrapper.get('[data-testid="listing-pills"]')
    expect(pills.text()).toContain('LBC')
    expect(pills.get('[data-testid="check-freshness"]').text()).toBe(
      'Vérifiée hier'
    )
    expect(wrapper.get('[data-testid="discard-reason"]').text()).toBe(
      'Écartée : Trop loin'
    )
    expect(wrapper.text()).not.toContain('Ajoutée le')
    expect(wrapper.text()).not.toContain('Modifier la fiche')
    await wrapper.get('select').setValue('to_visit')
    expect(wrapper.emitted('status')).toEqual([
      [{ status: 'to_visit', reason: null }],
    ])
  })
})
