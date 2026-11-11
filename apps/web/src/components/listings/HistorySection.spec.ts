import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { formatEuros } from '@/lib/format'
import { fakeEvaluated, fakeOffer } from '@/test/fixtures'
import HistorySection from './HistorySection.vue'

describe('HistorySection', () => {
  it('mêle prix et offres du plus récent au plus ancien, avec réponse et contre-proposition', () => {
    const item = fakeEvaluated()
    const wrapper = mount(HistorySection, {
      props: {
        events: item.priceEvents,
        offers: [
          fakeOffer({ madeAt: '2026-11-04T10:00:00.000Z' }),
          fakeOffer({
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            madeAt: '2026-10-20T10:00:00.000Z',
            amount: 140_000,
            response: 'counter_offer',
            counterAmount: 165_000,
            respondedAt: '2026-10-22T10:00:00.000Z',
            notes: 'Trop bas selon l’agence',
          }),
        ],
        currentPrice: 200_000,
      },
    })
    const entries = wrapper.findAll('ol li')
    expect(entries.map(e => e.attributes('data-kind'))).toEqual([
      'offer',
      'price',
      'offer',
    ])
    expect(entries[0]?.text()).toContain('En attente')
    expect(entries[1]?.text()).toContain('premier prix')
    expect(entries[2]?.text()).toContain('Contre-proposition')
    expect(entries[2]?.text()).toMatch(/165\s000 €/)
    expect(entries[2]?.text()).toContain('Trop bas')
    expect(entries[2]?.text()).toContain('réponse le')
  })

  it('enregistre un nouveau prix différent du prix courant', async () => {
    const item = fakeEvaluated()
    const wrapper = mount(HistorySection, {
      props: { events: item.priceEvents, offers: [], currentPrice: 200_000 },
    })
    const form = wrapper.get('form[aria-label="Nouveau prix constaté"]')
    await form.get('input').setValue('200000')
    await form.trigger('submit')
    expect(form.get('[data-testid="field-error"]').text()).toContain('déjà')
    await form.get('input').setValue('185 000')
    await form.trigger('submit')
    const [value, done] = wrapper.emitted('record')?.[0] as [
      number,
      (ok: boolean) => void,
    ]
    expect(value).toBe(185_000)
    // Lot 25 : la saisie reste jusqu'à la réponse du serveur ; un refus la garde.
    done(false)
    await flushPromises()
    expect(form.get('input').element.value).toBe('185 000')
    await form.trigger('submit')
    ;(wrapper.emitted('record')?.[1]?.[1] as (ok: boolean) => void)(true)
    await flushPromises()
    expect(form.get('input').element.value).toBe('')
  })

  it('prépare une offre avec canal, date et commentaire', async () => {
    const wrapper = mount(HistorySection, {
      props: { events: [], offers: [], currentPrice: 200_000 },
    })
    expect(wrapper.get('h2').text()).toBe('Prix et offres')
    expect(wrapper.text()).toContain('Aucun prix ni aucune offre enregistrés.')
    const form = wrapper.get('form[aria-label="Préparer une offre"]')
    // Sans entrée financière, aucun montant n'est évalué.
    await form
      .get('input[aria-label="Montant de l\'offre"]')
      .setValue('150 000')
    expect(form.find('[data-testid="offer-outcome"]').exists()).toBe(false)
    await form.get('input[aria-label="Montant de l\'offre"]').setValue('')
    await form.trigger('submit')
    expect(form.get('[data-testid="field-error"]').text()).toContain('montant')
    // Lot 22 : un montant illisible est refusé au champ, jamais envoyé.
    await form.get('input[aria-label="Montant de l\'offre"]').setValue('150k')
    await form.trigger('submit')
    expect(form.get('[data-testid="field-error"]').text()).toContain(
      '« 150k » n’est pas un nombre'
    )
    expect(
      form
        .get('input[aria-label="Montant de l\'offre"]')
        .attributes('aria-invalid')
    ).toBe('true')
    expect(wrapper.emitted('addOffer')).toBeUndefined()
    await form
      .get('input[aria-label="Montant de l\'offre"]')
      .setValue('150 000')
    await form.get('select[aria-label="Canal de l\'offre"]').setValue('agency')
    await form
      .get('input[aria-label="Date de l\'offre"]')
      .setValue('2026-11-02')
    await form
      .get('input[aria-label="Commentaire de l\'offre"]')
      .setValue('Offre écrite remise à l’agence')
    await form.trigger('submit')
    const [input, done] = wrapper.emitted('addOffer')?.[0] as [
      { amount: number; channel: string; notes: string; madeAt: string },
      (ok: boolean) => void,
    ]
    expect(input.amount).toBe(150_000)
    expect(input.channel).toBe('agency')
    expect(input.notes).toBe('Offre écrite remise à l’agence')
    expect(input.madeAt).toMatch(/^2026-11-02T/)
    // Lot 25 : rien ne se vide avant la réponse du serveur ; un refus garde tout.
    const amountInput = () =>
      form.get<HTMLInputElement>('input[aria-label="Montant de l\'offre"]')
        .element
    expect(amountInput().value).toBe('150 000')
    done(false)
    await flushPromises()
    expect(amountInput().value).toBe('150 000')
    await form.trigger('submit')
    ;(wrapper.emitted('addOffer')?.[1]?.[1] as (ok: boolean) => void)(true)
    await flushPromises()
    expect(amountInput().value).toBe('')
  })

  it('met à jour la réponse du vendeur avec garde-fou, exige le montant d’une contre-proposition, propose le statut', async () => {
    const offer = fakeOffer()
    const wrapper = mount(HistorySection, {
      props: {
        events: [],
        offers: [offer],
        currentPrice: 200_000,
        suggestedStatus: 'offer_made',
      },
    })
    const select = wrapper.get(
      `select[aria-label="Réponse à l'offre de ${formatEuros(150_000)}"]`
    )
    // Lot 25 : choisir ne fait que demander confirmation.
    await select.setValue('counter_offer')
    expect(wrapper.emitted('updateOffer')).toBeUndefined()
    const confirm = () => wrapper.get('[data-testid="response-confirm"]')
    expect(confirm().text()).toContain('Contre-proposition')
    await confirm().trigger('submit')
    expect(wrapper.emitted('updateOffer')).toBeUndefined()
    expect(confirm().get('[data-testid="field-error"]').text()).toContain(
      'contre-proposition'
    )
    await confirm().get('input').setValue('165000')
    await confirm().trigger('submit')
    const [offerId, update, done] = wrapper.emitted('updateOffer')?.[0] as [
      string,
      unknown,
      (ok: boolean) => void,
    ]
    expect([offerId, update]).toEqual([
      offer.id,
      {
        response: 'counter_offer',
        counterAmount: 165_000,
        expectedResponse: 'pending',
      },
    ])
    // Un refus du serveur garde la confirmation ouverte ; une réussite la ferme.
    done(false)
    await flushPromises()
    expect(wrapper.find('[data-testid="response-confirm"]').exists()).toBe(true)
    done(true)
    await flushPromises()
    expect(wrapper.find('[data-testid="response-confirm"]').exists()).toBe(
      false
    )
    // « Annuler » remet le choix d'avant sans rien envoyer.
    await select.setValue('refused')
    await wrapper.get('[data-testid="response-cancel"]').trigger('click')
    expect(wrapper.find('[data-testid="response-confirm"]').exists()).toBe(
      false
    )
    expect((select.element as HTMLSelectElement).value).toBe('pending')
    await select.setValue('accepted')
    await confirm().trigger('submit')
    expect(wrapper.emitted('updateOffer')?.[1]?.slice(0, 2)).toEqual([
      offer.id,
      { response: 'accepted', expectedResponse: 'pending' },
    ])
    const suggestion = wrapper.get('[data-testid="suggested-status"]')
    expect(suggestion.text()).toContain('Offre faite')
    await suggestion.get('button').trigger('click')
    expect(wrapper.emitted('setStatus')).toEqual([['offer_made']])
  })
})
