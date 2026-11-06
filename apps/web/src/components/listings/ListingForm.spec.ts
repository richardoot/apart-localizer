import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { emptyForm, formFromListing } from '@/lib/listing-form'
import { fakeListing } from '@/test/fixtures'
import ListingForm from './ListingForm.vue'

function mountForm(initial = emptyForm(), errors: Record<string, string> = {}) {
  const model = ref(initial)
  const wrapper = mount(ListingForm, {
    props: {
      modelValue: model.value,
      'onUpdate:modelValue': (value: typeof model.value) => {
        model.value = value
      },
      errors,
    },
  })
  return { wrapper, model }
}

describe('ListingForm', () => {
  it('écrit les saisies dans le modèle', async () => {
    const { wrapper, model } = mountForm()
    await wrapper.get('#f-title').setValue('T3 fictif')
    await wrapper.get('#f-price').setValue('210 000')
    await wrapper.get('#f-rent').setValue('800')
    await wrapper.get('#f-dpe').setValue('C')
    expect(model.value.title).toBe('T3 fictif')
    expect(model.value.price).toBe('210 000')
    expect(model.value.rentalPlan.targetRent).toBe('800')
    expect(model.value.dpeClass).toBe('C')
  })

  it('affiche les erreurs sur les champs fautifs', () => {
    const { wrapper } = mountForm(emptyForm(), {
      title: 'Le titre est obligatoire.',
      price: 'Le prix FAI est obligatoire (en euros).',
    })
    const alerts = wrapper.findAll('[role="alert"]').map(a => a.text())
    expect(alerts).toContain('Le titre est obligatoire.')
    expect(alerts).toContain('Le prix FAI est obligatoire (en euros).')
  })

  it('travaux : interrupteur, postes suggérés, total, suppression', async () => {
    const { wrapper, model } = mountForm()
    expect(wrapper.text()).toContain('Aucun travaux prévus')
    await wrapper.get('input[type="checkbox"]').setValue(true)
    expect(model.value.renovation.active).toBe(true)
    await nextTick()
    const peinture = wrapper
      .findAll('[aria-label="Postes fréquents"] button')
      .find(b => b.text().includes('Peinture'))
    await peinture?.trigger('click')
    expect(model.value.renovation.items).toHaveLength(1)
    expect(model.value.renovation.items[0]?.label).toBe('Peinture')
    await wrapper.get('[aria-label="Montant du poste"]').setValue('2 500')
    expect(wrapper.get('[data-testid="renovation-total"]').text()).toMatch(
      /2\s?500 €/
    )
    await wrapper.get('[aria-label="Supprimer le poste"]').trigger('click')
    expect(model.value.renovation.items).toHaveLength(0)
  })

  it('se remplit depuis une annonce et cache le statut sur une fiche', () => {
    const wrapper = mount(ListingForm, {
      props: {
        modelValue: formFromListing(fakeListing()),
        errors: {},
        hideStatus: true,
      },
    })
    expect((wrapper.get('#f-title').element as HTMLInputElement).value).toBe(
      'T2 fictif'
    )
    expect((wrapper.get('#f-surface').element as HTMLInputElement).value).toBe(
      '45'
    )
    expect(wrapper.find('#f-status').exists()).toBe(false)
  })

  it('lot 19 : ni année ni type de location, ni hypothèses propres à l’annonce', () => {
    const wrapper = mount(ListingForm, {
      props: { modelValue: formFromListing(fakeListing()), errors: {} },
    })
    expect(wrapper.find('#f-p2-year').exists()).toBe(false)
    expect(wrapper.find('#f-p2-lease').exists()).toBe(false)
    expect(wrapper.find('#f-o-rate').exists()).toBe(false)
    expect(wrapper.find('#f-o-dp').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Hypothèses surchargées')
    expect(wrapper.text()).toContain(
      'L’année et le type de location se règlent pour tout l’espace'
    )
    // La phase 2 garde ce qui dépend du bien.
    expect(wrapper.find('#f-p2-control').exists()).toBe(true)
    expect(wrapper.find('#f-p2-coown').exists()).toBe(true)
  })
})
