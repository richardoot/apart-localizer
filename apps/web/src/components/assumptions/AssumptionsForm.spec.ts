import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import type { Assumptions, AssumptionsImpact } from '@apart/contracts'
import { DESKTOP_QUERY } from '@/composables/useMediaQuery'
import { useLeaveGuardStore } from '@/stores/leave-guard'
import AssumptionsForm from './AssumptionsForm.vue'
import { LEGACY_SAVES } from './legacy-save.fixture'

const nbsp = (s: string): string => s.replace(/[\u202f\u00a0]/g, ' ')
const nth = <T>(list: readonly T[], i: number): T => {
  const item = list[i]
  if (item === undefined) throw new Error(`élément ${i} absent`)
  return item
}
const originalMatchMedia = window.matchMedia

/** Ordinateur (deux colonnes) ou mobile (accordéons) selon la requête média. */
function screen(desktop: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: desktop && query === DESKTOP_QUERY,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

type Saved = { label: string | undefined; values: Assumptions }

function mountForm(
  values: Assumptions = DEFAULT_ASSUMPTIONS,
  props: Record<string, unknown> = {}
): VueWrapper {
  return mount(AssumptionsForm, {
    props: { values, ...props },
    attachTo: document.body,
  })
}

const input = (w: VueWrapper, selector: string): HTMLInputElement =>
  w.get(selector).element as HTMLInputElement

async function submit(w: VueWrapper): Promise<Saved | undefined> {
  await w.get('form').trigger('submit')
  return w.emitted('save')?.at(-1)?.[0] as Saved | undefined
}

let wrapper: VueWrapper | null = null
beforeEach(() => screen(true))
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  window.matchMedia = originalMatchMedia
})

const WITH_OPTIONAL: Assumptions = {
  ...DEFAULT_ASSUMPTIONS,
  currentRent: 900,
  maintenanceAnnual: 300,
  marginalTaxRate: 0.11,
  taxRegime: 'reel_foncier',
  discountRate: 0.02,
  purchaseDate: '2027-01-15',
  rentalStartDate: '2028-03-01',
  netYieldThreshold: 0.04,
  targetCriteria: ['gross_yield', 'net_yield', 'market'],
  notaryMode: 'scale',
}

type Step = { set: string; value: string | boolean } | { open: string }

/** Les saisies du formulaire d'avant, rejouées sur le nouveau (mêmes champs). */
const SCENARIOS: Record<
  keyof typeof LEGACY_SAVES,
  { base: Assumptions; steps: Step[] }
> = {
  financing: {
    base: DEFAULT_ASSUMPTIONS,
    steps: [
      { set: '#h-rate', value: '3,2' },
      { set: '#h-down', value: '50 000' },
      { set: '#h-label', value: 'Taux négocié' },
      { set: '#h-insurance', value: '0,3' },
      { set: '#h-years', value: '20' },
    ],
  },
  notary: {
    base: DEFAULT_ASSUMPTIONS,
    steps: [
      { set: '#h-notary-mode-scale', value: true },
      { open: 'toggle-scale-detail' },
      { set: '#h-dept', value: '4,5' },
      { set: '#h-disbursements', value: '1000' },
      { set: '#h-band-1-rate', value: '1,6' },
      { set: '#h-band-2-up', value: '61000' },
      { set: '#h-csi-min', value: '20' },
      { set: '#h-vat', value: '20' },
      { set: '#h-scale-label', value: 'Mon barème' },
    ],
  },
  criteria: {
    base: DEFAULT_ASSUMPTIONS,
    steps: [
      { set: '#h-net-yield', value: '3,5' },
      { set: '#h-crit-net_yield', value: true },
      { set: '#h-crit-rent_x220', value: true },
      { set: '#h-crit-effort', value: false },
      { open: 'toggle-negotiation' },
      { set: '#h-tight', value: '12' },
      { set: '#h-negotiable', value: '6' },
      { set: '#h-yield', value: '5' },
      { set: '#h-effort', value: '200' },
    ],
  },
  calendarTax: {
    base: DEFAULT_ASSUMPTIONS,
    steps: [
      { open: 'toggle-rental-year' },
      { open: 'toggle-taxation' },
      { set: '#h-current-rent', value: '850' },
      { set: '#h-maintenance', value: '600' },
      { set: '#h-purchase', value: '2026-12-01' },
      { set: '#h-rental-start', value: '2028-09-01' },
      { set: '#h-year', value: '2029' },
      { set: '#h-vacancy', value: '1' },
      { set: '#h-fixed', value: '600' },
      { set: '#h-tmi', value: '30' },
      { set: '#h-regime', value: 'lmnp_reel' },
      { set: '#h-furnished-kind', value: 'tourism_classified' },
      { set: '#h-horizon', value: '20' },
      { set: '#h-appreciation', value: '1,5' },
      { set: '#h-irl', value: '2' },
      { set: '#h-resale', value: '4' },
      { set: '#h-discount', value: '3' },
    ],
  },
  optionalCleared: {
    base: WITH_OPTIONAL,
    steps: [
      { open: 'toggle-scale-detail' },
      { open: 'toggle-taxation' },
      { set: '#h-current-rent', value: '' },
      { set: '#h-maintenance', value: ' ' },
      { set: '#h-tmi', value: '' },
      { set: '#h-regime', value: '' },
      { set: '#h-discount', value: '' },
      { set: '#h-purchase', value: '' },
      { set: '#h-rental-start', value: '' },
      { set: '#h-dept', value: '5,5' },
    ],
  },
}

describe('AssumptionsForm : non-régression de l’enregistrement', () => {
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    it(`même saisie, mêmes hypothèses qu'avant le lot 13 : ${name}`, async () => {
      wrapper = mountForm(scenario.base)
      for (const step of scenario.steps) {
        if ('open' in step)
          await wrapper.get(`[data-testid="${step.open}"]`).trigger('click')
        else await wrapper.get(step.set).setValue(step.value)
      }
      const saved = await submit(wrapper)
      const legacy = LEGACY_SAVES[name as keyof typeof LEGACY_SAVES]
      expect(saved?.label).toBe(legacy.label ?? undefined)
      expect(saved?.values).toEqual({ ...scenario.base, ...legacy.diff })
    })
  }
})

describe('AssumptionsForm : sections et sommaire (ordinateur)', () => {
  it('cinq sections en questions avec « Sert à », un sommaire d’ancres résumées', () => {
    wrapper = mountForm()
    const titles = wrapper
      .findAll('section[data-section] h2')
      .map(h => h.text())
    expect(titles).toEqual([
      "Comment finances-tu l'achat ?",
      "Qu'est-ce qu'une bonne affaire pour toi ?",
      'Quel est ton calendrier ?',
      'Frais de notaire',
      'Fiscalité et revente',
    ])
    for (const section of wrapper.findAll('section[data-section]')) {
      expect(section.text()).toContain('Sert à : ')
      expect(section.attributes('aria-labelledby')).toBe(
        `${section.attributes('id')}-title`
      )
    }
    const nav = wrapper.get('[data-testid="assumptions-nav"]')
    expect(nav.attributes('aria-label')).toBe('Sections des hypothèses')
    const links = nav.findAll('a')
    expect(links.map(a => a.attributes('href'))).toEqual([
      '#financement',
      '#criteres',
      '#calendrier',
      '#notaire',
      '#fiscalite',
      '#historique',
    ])
    expect(nbsp(nth(links, 0).text())).toContain('1 · Financement')
    expect(nbsp(nth(links, 0).text())).toContain('40 000 € · 3,65 % · 25 ans')
    expect(nth(links, 0).attributes('aria-current')).toBe('location')
    expect(nth(links, 3).text()).toContain('taux forfaitaire 7,5 %')
  })

  it('un lien du sommaire porte le focus sur le titre de sa section', async () => {
    wrapper = mountForm()
    await wrapper.get('a[href="#notaire"]').trigger('click')
    expect(document.activeElement?.id).toBe('notaire-title')
    expect(wrapper.get('a[href="#notaire"]').attributes('aria-current')).toBe(
      'location'
    )
  })

  it('le résumé et le sommaire suivent la saisie ; le repère des 100 000 € aussi', async () => {
    const form = mountForm()
    wrapper = form
    const reference = () =>
      nbsp(form.get('[data-testid="reference-payment"]').text())
    expect(reference()).toContain('Pour 100 000 € empruntés')
    expect(reference()).toContain('≈ 517 €/mois, assurance comprise')
    await wrapper.get('#h-rate').setValue('3,2')
    await wrapper.get('#h-insurance').setValue('0,3')
    expect(reference()).toContain('≈ 510 €/mois')
    expect(wrapper.get('a[href="#financement"]').text()).toContain('3,2 %')
    expect(wrapper.get('a[href="#financement"]').text()).toContain(
      '● 2 modifiés'
    )
    await wrapper.get('#h-years').setValue('')
    expect(reference()).toContain('à calculer')
  })

  it('unités dans la case, chiffres à droite, clavier adapté, « ? » du glossaire', () => {
    wrapper = mountForm()
    const down = wrapper.get('#h-down')
    expect(down.attributes('inputmode')).toBe('numeric')
    expect(down.classes()).toContain('text-right')
    expect(down.attributes('aria-describedby')).toContain('h-down-unit')
    expect(wrapper.get('#h-down-unit').text()).toBe('€')
    expect(wrapper.get('#h-rate').attributes('inputmode')).toBe('decimal')
    expect(wrapper.get('label[for="h-rate"]').text()).toBe('Taux du crédit')
    expect(wrapper.text()).toContain('taux nominal, hors assurance')
    for (const term of [
      'loan_insurance',
      'monthly_payment',
      'gross_yield',
      'effort',
      'net_yield',
      'rule_220',
      'discount',
      'vacancy',
      'fixed_costs',
      'rental_phases',
      'occupancy_cost',
    ]) {
      expect(wrapper.find(`[data-term="${term}"]`).exists(), term).toBe(true)
    }
  })
})

describe('AssumptionsForm : bonne affaire et prix cible', () => {
  it('une ligne par seuil, sa case « prix cible » sur la même ligne', () => {
    wrapper = mountForm()
    const rows = wrapper.findAll('[data-criterion]')
    expect(rows.map(r => r.attributes('data-criterion'))).toEqual([
      'gross_yield',
      'effort',
      'net_yield',
      'rent_x220',
    ])
    const gross = nth(rows, 0)
    expect(gross.find('#h-yield').exists()).toBe(true)
    expect(input(wrapper, '#h-yield').value).toBe('5,5')
    expect(
      (gross.get('#h-crit-gross_yield').element as HTMLInputElement).checked
    ).toBe(true)
    expect(gross.get('#h-crit-gross_yield').attributes('aria-labelledby')).toBe(
      'crit-gross_yield-label h-crit-gross_yield-text'
    )
    expect(nth(rows, 3).find('input:not([type="checkbox"])').exists()).toBe(
      false
    )
  })

  it('le net reste grisé tant que son seuil est vide, puis se coche', async () => {
    const form = mountForm()
    wrapper = form
    const net = () => input(form, '#h-crit-net_yield')
    expect(net().disabled).toBe(true)
    await wrapper.get('#h-net-yield').setValue('3,5')
    expect(net().disabled).toBe(false)
    await wrapper.get('#h-crit-net_yield').setValue(true)
    // Coché puis seuil vidé : la case reste décochable et l'enregistrement est refusé.
    await wrapper.get('#h-net-yield').setValue('')
    expect(net().disabled).toBe(false)
    expect(await submit(wrapper)).toBeUndefined()
    expect(wrapper.get('[data-testid="form-errors"]').text()).toContain(
      'Rendement net minimum'
    )
    expect(wrapper.get('[data-criterion="net_yield"]').text()).toContain(
      'saisis un seuil pour retenir ce critère dans le prix cible'
    )
    expect(input(wrapper, '#h-net-yield').getAttribute('aria-invalid')).toBe(
      'true'
    )
  })

  it('aucun critère retenu : refusé avec un message', async () => {
    wrapper = mountForm()
    await wrapper.get('#h-crit-gross_yield').setValue(false)
    await wrapper.get('#h-crit-effort').setValue(false)
    expect(await submit(wrapper)).toBeUndefined()
    expect(wrapper.text()).toContain(
      'Prix cible : retiens au moins un critère pour le prix cible'
    )
  })

  it('« Marché (DVF) » reçu par le MCP : signalé, gardé', async () => {
    wrapper = mountForm({
      ...DEFAULT_ASSUMPTIONS,
      targetCriteria: ['gross_yield', 'market'],
    })
    expect(wrapper.text()).toContain('« Marché (DVF) » est aussi retenu')
    await wrapper.get('#h-crit-effort').setValue(true)
    const saved = await submit(wrapper)
    expect(saved?.values.targetCriteria).toEqual([
      'gross_yield',
      'market',
      'effort',
    ])
  })

  it('marge de négociation repliée : barre en trois plages et deux décotes', async () => {
    wrapper = mountForm()
    const toggle = wrapper.get('[data-testid="toggle-negotiation"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.text()).toContain(
      "négociable jusqu'à 5 %, tendue jusqu'à 10 %"
    )
    expect(wrapper.find('#h-negotiable').exists()).toBe(false)
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    const scale = wrapper.get('[data-testid="discount-scale"]')
    expect(scale.text()).toContain('négociable')
    expect(scale.text()).toContain('tendue')
    expect(scale.text()).toContain('hors de portée')
    expect(scale.findAll('.bg-good, .bg-warn, .bg-bad')).toHaveLength(3)
    await wrapper.get('#h-tight').setValue('4')
    expect(wrapper.find('[data-testid="discount-scale"]').exists()).toBe(false)
    expect(await submit(wrapper)).toBeUndefined()
    expect(wrapper.get('[data-testid="form-errors"]').text()).toContain(
      'Décote tendue'
    )
  })
})

describe('AssumptionsForm : calendrier, notaire, fiscalité', () => {
  it('phase 1 puis phase 2, l’année par défaut sous la date et dans le détail', async () => {
    wrapper = mountForm()
    expect(wrapper.get('[data-testid="phase-1"]').text()).toContain(
      'Tu y habites'
    )
    const phase2 = wrapper.get('[data-testid="phase-2"]')
    expect(phase2.text()).toContain('Tu le loues')
    expect(phase2.text()).toContain(
      'vide = 1er janvier 2028 (année par défaut)'
    )
    expect(wrapper.text()).toContain(
      'La taxe foncière et les charges de copropriété se saisissent dans chaque annonce.'
    )
    expect(wrapper.find('#h-year').exists()).toBe(false)
    await wrapper.get('[data-testid="toggle-rental-year"]').trigger('click')
    await wrapper.get('#h-year').setValue('2029')
    expect(phase2.text()).toContain('vide = 1er janvier 2029')
  })

  it('lot 19 : le type de location de l’espace se règle dans la phase 2 et s’enregistre', async () => {
    wrapper = mountForm()
    const select = wrapper.get('#h-lease-type')
    expect((select.element as HTMLSelectElement).value).toBe('unfurnished')
    expect(select.findAll('option').map(o => o.text())).toEqual([
      'Location vide',
      'Location meublée',
      'Colocation',
    ])
    expect(wrapper.get('[data-testid="phase-2"]').text()).toContain(
      'pour toutes les annonces'
    )
    await select.setValue('furnished')
    expect(wrapper.get('a[href="#calendrier"]').text()).toContain('meublée')
    const saved = await submit(wrapper)
    expect(saved?.values.leaseType).toBe('furnished')
    expect(saved?.values.rentalYear).toBe(DEFAULT_ASSUMPTIONS.rentalYear)
    expect(saved?.values.downPayment).toBe(DEFAULT_ASSUMPTIONS.downPayment)
  })

  it('frais de notaire : forfait, puis barème résumé et détail replié', async () => {
    wrapper = mountForm()
    expect(input(wrapper, '#h-notary').value).toBe('7,5')
    expect(input(wrapper, '#h-notary-mode-rate').checked).toBe(true)
    await wrapper.get('#h-notary-mode-scale').setValue(true)
    expect(wrapper.find('#h-notary').exists()).toBe(false)
    const summary = nbsp(
      wrapper.get('[data-testid="notary-scale-summary"]').text()
    )
    expect(summary).toContain('Logement ancien · Gironde')
    expect(summary).toContain('≈ 8,0 % sur un bien à 200 000 €')
    const toggle = wrapper.get('[data-testid="toggle-scale-detail"]')
    expect(toggle.text()).toContain('7 paramètres et 4 tranches')
    expect(wrapper.find('[data-testid="notary-scale"]').exists()).toBe(false)
    await toggle.trigger('click')
    const detail = wrapper.get('[data-testid="notary-scale"]')
    expect(detail.text()).toContain('Droits de mutation')
    expect(detail.text()).toContain(
      'Émoluments du notaire, par tranche de prix'
    )
    expect(detail.text()).toContain('Autres frais')
    expect(detail.findAll('tbody tr')).toHaveLength(4)
    expect(input(wrapper, '#h-dept').value).toBe('5')
    expect(wrapper.find('[data-testid="restore-default-scale"]').exists()).toBe(
      false
    )
    await wrapper.get('#h-dept').setValue('4,5')
    expect(wrapper.get('a[href="#notaire"]').text()).toContain(
      'barème personnalisé'
    )
    await wrapper.get('[data-testid="restore-default-scale"]').trigger('click')
    expect(input(wrapper, '#h-dept').value).toBe('5')
    await wrapper.get('#h-band-0-rate').setValue('')
    expect(wrapper.text()).toContain('barème incomplet')
  })

  it('fiscalité repliée en pastilles ; dépliée : impôt, revente, paramètres datés', async () => {
    wrapper = mountForm({ ...DEFAULT_ASSUMPTIONS, marginalTaxRate: 0.3 })
    const pills = wrapper.get('[data-testid="taxation-pills"]')
    expect(pills.findAll('li').map(li => li.text())).toEqual([
      'TMI 30 %',
      'régime selon le bail',
      'horizon 15 ans',
      'bien à valeur constante',
      'loyers +1,57 %/an',
    ])
    expect(wrapper.text()).toContain('Estimations, pas un conseil fiscal.')
    const toggle = wrapper.get('[data-testid="toggle-taxation"]')
    expect(toggle.text()).toBe('Modifier')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.text()).toBe('Replier')
    expect(wrapper.find('[data-testid="taxation-pills"]').exists()).toBe(false)
    expect((wrapper.get('#h-tmi').element as HTMLSelectElement).value).toBe(
      '30'
    )
    expect(input(wrapper, '#h-irl').value).toBe('1,57')
    expect(input(wrapper, '#h-discount').placeholder).toBe('= taux du crédit')
    expect(wrapper.get('[data-testid="tax-parameters"]').text()).toContain(
      '17,2 %'
    )
    expect(wrapper.find('[data-term="marginal_tax_rate"]').exists()).toBe(true)
    expect(wrapper.find('[data-term="npv"]').exists()).toBe(true)
  })
})

describe('AssumptionsForm : modifications, barre d’enregistrement, impact', () => {
  it('sans modification : une ligne d’état, ni nom ni boutons', () => {
    wrapper = mountForm(
      { ...DEFAULT_ASSUMPTIONS },
      {
        message:
          'Hypothèses enregistrées : aucun verdict ne change sur 3 annonces actives.',
      }
    )
    const bar = wrapper.get('[data-testid="save-bar"]')
    expect(bar.text()).toContain('Aucune modification non enregistrée')
    expect(bar.text()).toContain('Hypothèses enregistrées')
    expect(bar.find('#h-label').exists()).toBe(false)
    expect(bar.find('[data-testid="save"]').exists()).toBe(false)
  })

  it('Entrée sans modification : aucune version identique', async () => {
    wrapper = mountForm()
    expect(await submit(wrapper)).toBeUndefined()
  })

  it('chaque champ modifié dit « modifié · avant … » ; la barre compte et liste', async () => {
    wrapper = mountForm()
    await wrapper.get('#h-down').setValue('35000')
    await wrapper.get('#h-crit-rent_x220').setValue(true)
    const field = wrapper.get('[data-field="h-down"]')
    expect(field.attributes('data-changed')).toBe('true')
    expect(nbsp(field.text())).toContain('● modifié · avant 40 000 €')
    expect(wrapper.get('[data-criterion="rent_x220"]').text()).toContain(
      'prix cible modifié · avant non retenu'
    )
    const bar = wrapper.get('[data-testid="save-bar"]')
    expect(bar.get('[data-testid="save-status"]').text()).toContain(
      '2 modifications non enregistrées'
    )
    expect(bar.get('[data-testid="pending-list"]').text()).toBe(
      'Apport, Prix cible : repère 220 × loyer'
    )
    expect(bar.get('#h-label').attributes('placeholder')).toContain(
      'facultatif'
    )
    // Revenir à la valeur d'avant efface la modification.
    await wrapper.get('#h-down').setValue('40 000')
    expect(bar.text()).toContain('1 modification non enregistrée')
  })

  it('Annuler revient aux valeurs en vigueur', async () => {
    wrapper = mountForm()
    await wrapper.get('#h-down').setValue('35000')
    await wrapper.get('#h-label').setValue('essai')
    await wrapper.get('[data-testid="cancel"]').trigger('click')
    expect(nbsp(input(wrapper, '#h-down').value)).toBe('40 000')
    expect(wrapper.get('[data-testid="save-bar"]').text()).toContain(
      'Aucune modification non enregistrée'
    )
    expect(wrapper.emitted('discard')).toHaveLength(1)
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('erreur : message en français dans la barre, lien vers le champ', async () => {
    wrapper = mountForm()
    await wrapper.get('#h-years').setValue('99')
    expect(await submit(wrapper)).toBeUndefined()
    const errors = wrapper.get('[data-testid="form-errors"]')
    expect(errors.attributes('role')).toBe('alert')
    expect(nbsp(errors.text())).toContain('Durée du crédit : 40 ans au maximum')
    expect(wrapper.get('[data-field="h-years"]').text()).toContain(
      '40 ans au maximum'
    )
    await flushPromises()
    expect(document.activeElement?.id).toBe('h-years')
    // Corrigé : l'erreur disparaît en direct.
    await wrapper.get('#h-years').setValue('20')
    expect(wrapper.find('[data-testid="form-errors"]').exists()).toBe(false)
  })

  it('« Voir l’impact » émet les valeurs saisies, l’aperçu s’affiche au-dessus de la barre', async () => {
    wrapper = mountForm()
    await wrapper.get('#h-yield').setValue('4')
    await wrapper.get('[data-testid="preview"]').trigger('click')
    const [values] = wrapper.emitted('preview')?.[0] as [Assumptions]
    expect(values.grossYieldThreshold).toBeCloseTo(0.04, 10)
    await wrapper.setProps({ previewing: true })
    expect(wrapper.get('[data-testid="impact"]').text()).toContain(
      "Calcul de l'impact"
    )
    expect(wrapper.get('[data-testid="preview"]').text()).toBe('Calcul…')
    const impact: AssumptionsImpact = {
      total: 3,
      changedVerdicts: 1,
      changes: [
        {
          listingId: '11111111-1111-4111-8111-111111111111',
          title: 'T2 fictif',
          before: 'off_target',
          after: 'target',
          targetPriceBefore: 147_568,
          targetPriceAfter: 199_000,
        },
      ],
      byVerdictBefore: { target: 1, to_dig: 1, off_target: 1 },
      byVerdictAfter: { target: 2, to_dig: 1, off_target: 0 },
    }
    await wrapper.setProps({ previewing: false, impact })
    const panel = wrapper.get('[data-testid="impact"]')
    expect(panel.text()).toContain(
      'Avec ces changements : 1 annonce change de verdict, 2 inchangées.'
    )
    expect(nbsp(panel.text())).toContain(
      'T2 fictif : Hors cible → Cible · prix cible 199 000 €'
    )
    expect(panel.text()).not.toContain('Saisie modifiée depuis ce calcul')
    await wrapper.get('#h-yield').setValue('4,5')
    expect(wrapper.get('[data-testid="impact"]').text()).toContain(
      'Saisie modifiée depuis ce calcul'
    )
    await wrapper.get('[data-testid="impact"] button').trigger('click')
    expect(wrapper.find('[data-testid="impact"]').exists()).toBe(false)
  })

  it('une nouvelle version pendant la saisie : modifications gardées, le reste à jour', async () => {
    wrapper = mountForm()
    await wrapper.get('#h-down').setValue('50000')
    await wrapper.setProps({
      values: { ...DEFAULT_ASSUMPTIONS, interestRate: 0.031 },
    })
    expect(input(wrapper, '#h-down').value).toBe('50000')
    expect(input(wrapper, '#h-rate').value).toBe('3,1')
    expect(wrapper.get('[data-testid="save-bar"]').text()).toContain(
      'Une nouvelle version est en vigueur'
    )
    // Après l'enregistrement, la version reçue vaut la saisie : tout repart à neuf.
    await wrapper.setProps({
      values: {
        ...DEFAULT_ASSUMPTIONS,
        interestRate: 0.031,
        downPayment: 50_000,
      },
    })
    expect(wrapper.get('[data-testid="save-bar"]').text()).toContain(
      'Aucune modification non enregistrée'
    )
  })
})

describe('AssumptionsForm : mobile', () => {
  beforeEach(() => screen(false))

  it('chaque section est un accordéon dont l’en-tête porte le résumé', async () => {
    wrapper = mountForm()
    expect(wrapper.find('[data-testid="assumptions-nav"]').exists()).toBe(false)
    const toggles = wrapper.findAll('section[data-section] h2 button')
    expect(toggles).toHaveLength(5)
    expect(toggles.map(t => t.attributes('aria-expanded'))).toEqual([
      'true',
      'true',
      'false',
      'false',
      'false',
    ])
    const notary = wrapper.get('[data-testid="toggle-notaire"]')
    expect(notary.text()).toContain('Frais de notaire')
    expect(notary.text()).toContain('taux forfaitaire 7,5 %')
    expect(notary.attributes('aria-controls')).toBe('notaire-panel')
    expect(wrapper.find('#notaire-panel').exists()).toBe(false)
    await notary.trigger('click')
    expect(notary.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#notaire-panel').text()).toContain('Sert à : ')
    await wrapper.get('#h-down').setValue('35000')
    expect(wrapper.get('[data-testid="toggle-financement"]').text()).toContain(
      '● 1 modifié'
    )
  })

  it('fiscalité : ouverte, l’accordéon montre directement les champs', async () => {
    wrapper = mountForm()
    expect(wrapper.find('[data-testid="toggle-taxation"]').exists()).toBe(false)
    await wrapper.get('[data-testid="toggle-fiscalite"]').trigger('click')
    expect(wrapper.find('#h-tmi').exists()).toBe(true)
    expect(wrapper.find('[data-testid="taxation-pills"]').exists()).toBe(false)
  })

  it('une erreur dans une section fermée l’ouvre et y porte le focus', async () => {
    wrapper = mountForm()
    await wrapper.get('[data-testid="toggle-calendrier"]').trigger('click')
    await wrapper.get('#h-vacancy').setValue('13')
    await wrapper.get('[data-testid="toggle-calendrier"]').trigger('click')
    expect(wrapper.find('#h-vacancy').exists()).toBe(false)
    expect(await submit(wrapper)).toBeUndefined()
    await flushPromises()
    expect(
      wrapper
        .get('[data-testid="toggle-calendrier"]')
        .attributes('aria-expanded')
    ).toBe('true')
    expect(document.activeElement?.id).toBe('h-vacancy')
    await wrapper.get('[data-testid="form-errors"] button').trigger('click')
    expect(document.activeElement?.id).toBe('h-vacancy')
  })
})

describe('AssumptionsForm : garde des modifications (lot 22)', () => {
  it('une saisie non enregistrée est gardée ; Annuler la libère', async () => {
    wrapper = mountForm()
    const guard = useLeaveGuardStore()
    expect(guard.anyDirty()).toBe(false)
    await wrapper.get('#h-rate').setValue('3,2')
    expect(guard.anyDirty()).toBe(true)
    expect(guard.dirtySource()?.title()).toBe('Hypothèses')
    await wrapper.get('[data-testid="cancel"]').trigger('click')
    expect(guard.anyDirty()).toBe(false)
  })
})
