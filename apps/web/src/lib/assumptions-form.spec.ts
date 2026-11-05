import { describe, expect, it } from 'vitest'
import { DEFAULT_ASSUMPTIONS, DEFAULT_NOTARY_SCALE } from '@apart/contracts'
import type { Assumptions } from '@apart/contracts'
import {
  ASSUMPTIONS_SECTIONS,
  CRITERIA_ERROR_KEY,
  draftFromForm,
  fieldInputId,
  fieldLabel,
  fieldLocation,
  fieldSpecs,
  formChanges,
  formFromValues,
  formatFieldValue,
  isDefaultScale,
  readField,
  rebaseForm,
  sameFieldValue,
  scaleFormOf,
  toggleCriterion,
  valuesFromForm,
  writeField,
} from './assumptions-form'
import type { FieldSpec } from './assumptions-form'

const nbsp = (s: string): string => s.replace(/[\u202f\u00a0]/g, ' ')
const spec = (key: string): FieldSpec => {
  const found = fieldSpecs(4).find(s => s.key === key)
  if (!found) throw new Error(key)
  return found
}

describe('formulaire des hypothèses : lecture et écriture', () => {
  it('écrit les nombres à la française, sans changer les valeurs relues', () => {
    const form = formFromValues(DEFAULT_ASSUMPTIONS)
    expect(nbsp(form.downPayment)).toBe('40 000')
    expect(form.interestRatePercent).toBe('3,65')
    expect(form.durationYears).toBe('25')
    expect(form.vacancyMonths).toBe('0,5')
    expect(nbsp(form.fixedCostsAnnual)).toBe('1 050')
    expect(form.rentalYear).toBe('2028')
    expect(form.netYieldThresholdPercent).toBe('')
    expect(form.marginalTaxPercent).toBe('')
    expect(nbsp(form.scale.bands[1]?.upTo ?? '')).toBe('17 000')
    expect(form.scale.bands[3]?.upTo).toBe('')
    expect(form.scale.collectionFeeRatePercent).toBe('2,37')
    const draft = draftFromForm(form)
    expect(draft.downPayment).toBe(40_000)
    expect(draft.interestRate).toBeCloseTo(0.0365, 12)
    expect(draft.notaryScale.emolumentBands[3]?.upTo).toBeNull()
    // La liste des TMI garde des valeurs d'option sans virgule.
    expect(
      formFromValues({ ...DEFAULT_ASSUMPTIONS, marginalTaxRate: 0.11 })
        .marginalTaxPercent
    ).toBe('11')
  })

  it('valide comme avant : mêmes hypothèses que la saisie en vigueur', () => {
    const form = formFromValues(DEFAULT_ASSUMPTIONS)
    const result = valuesFromForm(form, DEFAULT_ASSUMPTIONS)
    expect(result.errors).toBeNull()
    expect(result.values?.downPayment).toBe(40_000)
    expect(result.values?.grossYieldMargin).toBe(0.007)
    expect(result.values?.taxParameters).toEqual(
      DEFAULT_ASSUMPTIONS.taxParameters
    )
  })

  it('erreurs du contrat rattachées au champ, en français, avec l’unité', () => {
    const form = formFromValues(DEFAULT_ASSUMPTIONS)
    form.durationYears = '99'
    form.interestRatePercent = '150'
    form.downPayment = ''
    form.vacancyMonths = '13'
    form.horizonYears = '2,5'
    form.purchaseDate = '2026-02-30'
    form.fixedCostsAnnual = '-1'
    form.scale.bands[0] = { upTo: '-3', ratePercent: '3,87' }
    form.taxRegime = 'inconnu' as never
    const result = valuesFromForm(form, DEFAULT_ASSUMPTIONS)
    expect(result.values).toBeNull()
    expect(result.errors).toMatchObject({
      durationYears: '40 ans au maximum',
      interestRatePercent: '100 % au maximum',
      downPayment: 'nombre attendu',
      vacancyMonths: '12 mois au maximum',
      horizonYears: 'nombre entier attendu',
      purchaseDate: 'date invalide',
      taxRegime: 'choix invalide',
    })
    expect(nbsp(result.errors?.['scale.bands.0.upTo'] ?? '')).toBe(
      'doit être supérieur à 0 €'
    )
    expect(nbsp(result.errors?.fixedCostsAnnual ?? '')).toBe('0 € au minimum')
  })

  it('les deux règles d’avant : seuil net exigé, tendu au moins égal au négociable', () => {
    const form = formFromValues(DEFAULT_ASSUMPTIONS)
    form.targetCriteria = toggleCriterion(
      form.targetCriteria,
      'net_yield',
      true
    )
    form.tightDiscountPercent = '4'
    const result = valuesFromForm(form, DEFAULT_ASSUMPTIONS)
    expect(result.errors).toEqual({
      netYieldThresholdPercent:
        'saisissez un seuil pour retenir ce critère dans le prix cible',
      tightDiscountPercent:
        'doit être au moins égale à la décote « négociable »',
    })
  })

  it('aucun critère retenu : une erreur sur les critères du prix cible', () => {
    const form = formFromValues(DEFAULT_ASSUMPTIONS)
    form.targetCriteria = []
    const result = valuesFromForm(form, DEFAULT_ASSUMPTIONS)
    expect(result.errors?.[CRITERIA_ERROR_KEY]).toBe(
      'retenez au moins un critère pour le prix cible'
    )
    expect(fieldLabel(CRITERIA_ERROR_KEY, 4)).toBe('Critères du prix cible')
    expect(fieldLocation(CRITERIA_ERROR_KEY, 4)).toEqual({
      section: 'criteres',
    })
    expect(fieldInputId(CRITERIA_ERROR_KEY)).toBe('h-crit-gross_yield')
  })

  it('un critère coché passe en fin de liste, décoché il sort', () => {
    expect(
      toggleCriterion(['gross_yield', 'effort'], 'net_yield', true)
    ).toEqual(['gross_yield', 'effort', 'net_yield'])
    expect(toggleCriterion(['gross_yield', 'effort'], 'effort', false)).toEqual(
      ['gross_yield']
    )
    expect(toggleCriterion(['effort', 'gross_yield'], 'effort', true)).toEqual([
      'gross_yield',
      'effort',
    ])
  })
})

describe('formulaire des hypothèses : champs, sections et identifiants', () => {
  it('cinq sections, dans l’ordre, chacune avec « Sert à »', () => {
    expect(ASSUMPTIONS_SECTIONS.map(s => s.id)).toEqual([
      'financement',
      'criteres',
      'calendrier',
      'notaire',
      'fiscalite',
    ])
    for (const section of ASSUMPTIONS_SECTIONS) {
      expect(section.purpose.startsWith('Sert à : ')).toBe(true)
    }
  })

  it('chaque champ a un libellé, une section et un identifiant unique', () => {
    const specs = fieldSpecs(4)
    const ids = specs.map(s => fieldInputId(s.key))
    expect(new Set(ids).size).toBe(ids.length)
    expect(fieldInputId('downPayment')).toBe('h-down')
    expect(fieldInputId('scale.bands.2.upTo')).toBe('h-band-2-up')
    expect(fieldInputId('scale.bands.0.ratePercent')).toBe('h-band-0-rate')
    expect(fieldInputId('targetCriteria.effort')).toBe('h-crit-effort')
    expect(fieldInputId('inconnu.champ')).toBe('h-inconnu-champ')
    expect(fieldLabel('scale.bands.1.ratePercent', 4)).toBe(
      'Barème : tranche 2, taux'
    )
    expect(fieldLabel('inconnu', 4)).toBe('inconnu')
    expect(fieldLocation('scale.disbursements', 4)).toEqual({
      section: 'notaire',
      panel: 'scaleDetail',
    })
    expect(fieldLocation('downPayment', 4)).toEqual({ section: 'financement' })
    expect(fieldLocation('inconnu', 4)).toEqual({ section: 'financement' })
  })

  it('lit et écrit un champ par son chemin', () => {
    const form = formFromValues(DEFAULT_ASSUMPTIONS)
    expect(readField(form, 'targetCriteria.effort')).toBe(true)
    expect(readField(form, 'targetCriteria.rent_x220')).toBe(false)
    expect(readField(form, 'scale.bands.0.ratePercent')).toBe('3,87')
    expect(readField(form, 'scale.bands.9.ratePercent')).toBe('')
    expect(readField(form, 'notaryMode')).toBe('rate')
    writeField(form, 'scale.bands.1.upTo', '18000')
    writeField(form, 'targetCriteria.rent_x220', true)
    writeField(form, 'targetCriteria.effort', false)
    writeField(form, 'scale.bands.9.upTo', '1')
    writeField(form, 'inexistant', 'x')
    expect(form.scale.bands[1]?.upTo).toBe('18000')
    expect(form.targetCriteria).toEqual(['gross_yield', 'rent_x220'])
    expect(form.scale.bands).toHaveLength(4)
    expect('inexistant' in form).toBe(false)
  })

  it('compare les nombres saisis, pas leur écriture', () => {
    const percent = spec('interestRatePercent')
    expect(sameFieldValue(percent, '3,65', '3.65')).toBe(true)
    expect(sameFieldValue(spec('downPayment'), '40\u202f000', '40000')).toBe(
      true
    )
    expect(sameFieldValue(percent, '3,65', '3,6')).toBe(false)
    expect(sameFieldValue(percent, 'abc', 'abc ')).toBe(true)
    expect(sameFieldValue(percent, 'abc', '')).toBe(false)
    expect(sameFieldValue(spec('scale.label'), ' Gironde', 'Gironde ')).toBe(
      true
    )
    expect(sameFieldValue(spec('notaryMode'), 'rate', 'scale')).toBe(false)
    expect(sameFieldValue(spec('targetCriteria.effort'), true, true)).toBe(true)
  })

  it('relit une valeur en clair avec son unité', () => {
    expect(nbsp(formatFieldValue(spec('downPayment'), '35000'))).toBe(
      '35 000 €'
    )
    expect(formatFieldValue(spec('interestRatePercent'), '3,2')).toBe('3,2 %')
    expect(formatFieldValue(spec('maxMonthlyEffort'), '150')).toBe('150 €/mois')
    expect(formatFieldValue(spec('fixedCostsAnnual'), '600')).toBe('600 €/an')
    expect(formatFieldValue(spec('appreciationPercent'), '1')).toBe('1 %/an')
    expect(formatFieldValue(spec('durationYears'), '25')).toBe('25 ans')
    expect(formatFieldValue(spec('vacancyMonths'), '0,5')).toBe('0,5 mois')
    expect(formatFieldValue(spec('rentalYear'), '2028')).toBe('2028')
    expect(formatFieldValue(spec('purchaseDate'), '2026-12-15')).toBe(
      '15 déc. 2026'
    )
    expect(formatFieldValue(spec('purchaseDate'), '')).toBe('date du calcul')
    expect(formatFieldValue(spec('currentRent'), ' ')).toBe('non renseigné')
    expect(formatFieldValue(spec('scale.label'), ' Gironde ')).toBe(
      '« Gironde »'
    )
    expect(formatFieldValue(spec('notaryMode'), 'scale')).toBe(
      'Barème officiel'
    )
    expect(formatFieldValue(spec('marginalTaxPercent'), '')).toBe(
      'non renseignée'
    )
    expect(formatFieldValue(spec('marginalTaxPercent'), '30')).toBe('30 %')
    expect(formatFieldValue(spec('marginalTaxPercent'), '12')).toBe('12')
    expect(formatFieldValue(spec('targetCriteria.effort'), true)).toBe('retenu')
    expect(formatFieldValue(spec('targetCriteria.effort'), false)).toBe(
      'non retenu'
    )
    expect(formatFieldValue(spec('downPayment'), 'beaucoup')).toBe(
      '« beaucoup »'
    )
    expect(formatFieldValue(spec('scale.bands.3.upTo'), '')).toBe('sans limite')
    const plain: FieldSpec = {
      key: 'x',
      label: 'x',
      section: 'financement',
      kind: 'choice',
    }
    expect(formatFieldValue(plain, 'brut')).toBe('brut')
    expect(formatFieldValue({ ...plain, kind: 'year' }, '')).toBe('vide')
  })
})

describe('suivi des modifications', () => {
  it('rien de modifié tant que la saisie vaut la version en vigueur', () => {
    const initial = formFromValues(DEFAULT_ASSUMPTIONS)
    const current = structuredClone(initial)
    current.downPayment = '40000'
    current.interestRatePercent = '3.65'
    current.label = 'un nom'
    expect(formChanges(initial, current)).toEqual([])
  })

  it('liste les champs modifiés, dans l’ordre de la page, avec la valeur d’avant', () => {
    const initial = formFromValues(DEFAULT_ASSUMPTIONS)
    const current = structuredClone(initial)
    current.taxRegime = 'lmnp_reel'
    current.downPayment = '35000'
    current.scale.bands[1] = { upTo: '17000', ratePercent: '1,6' }
    current.targetCriteria = ['gross_yield']
    const changes = formChanges(initial, current)
    expect(changes.map(c => c.key)).toEqual([
      'downPayment',
      'targetCriteria.effort',
      'taxRegime',
      'scale.bands.1.ratePercent',
    ])
    expect(nbsp(changes[0]?.before ?? '')).toBe('40 000 €')
    expect(changes[1]).toMatchObject({
      label: 'Prix cible : effort mensuel',
      section: 'criteres',
      before: 'retenu',
    })
    expect(changes[2]).toMatchObject({
      section: 'fiscalite',
      panel: 'taxation',
      before: 'selon le bail (micro)',
    })
    expect(changes[3]).toMatchObject({
      panel: 'scaleDetail',
      before: '1,596 %',
    })
  })

  it('une nouvelle version : la saisie reste, le reste suit la version', () => {
    const oldValues = DEFAULT_ASSUMPTIONS
    const newValues: Assumptions = {
      ...DEFAULT_ASSUMPTIONS,
      interestRate: 0.031,
      durationYears: 20,
    }
    const oldInitial = formFromValues(oldValues)
    const current = structuredClone(oldInitial)
    current.downPayment = '50000'
    current.label = 'apport revu'
    const merged = rebaseForm(oldInitial, current, formFromValues(newValues))
    expect(merged.downPayment).toBe('50000')
    expect(merged.interestRatePercent).toBe('3,1')
    expect(merged.durationYears).toBe('20')
    expect(merged.label).toBe('apport revu')
    expect(
      formChanges(formFromValues(newValues), merged).map(c => c.key)
    ).toEqual(['downPayment'])
  })

  it('reconnaît le barème par défaut, origine mise à part', () => {
    const scale = scaleFormOf(DEFAULT_NOTARY_SCALE)
    expect(isDefaultScale(scale)).toBe(true)
    expect(isDefaultScale({ ...scale, label: 'autre origine' })).toBe(true)
    expect(isDefaultScale({ ...scale, departmentalRatePercent: '4.5' })).toBe(
      false
    )
    expect(isDefaultScale({ ...scale, bands: scale.bands.slice(0, 3) })).toBe(
      false
    )
  })
})
