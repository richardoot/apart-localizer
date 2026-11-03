import { describe, expect, it } from 'vitest'
import { DEFAULT_TASKS, REQUIRED_LISTING_FIELDS } from '@apart/contracts'
import type { MissingField } from '@apart/contracts'
import {
  missingFieldTaskLabels,
  normalizeTaskLabel,
} from './missing-field-tasks'

const missing = (field: string): MissingField => {
  const required = REQUIRED_LISTING_FIELDS.find(f => f.field === field)
  if (!required) throw new Error(field)
  return {
    field,
    label: required.label,
    reason: 'missing',
    confidence: null,
    taskLabel: required.taskLabel,
  }
}

describe('missingFieldTaskLabels', () => {
  it('ne recrée pas une tâche déjà dans la checklist par défaut', () => {
    const labels = missingFieldTaskLabels(
      [
        missing('annualCharges'),
        missing('propertyTax'),
        missing('location.addressRaw'),
        missing('dpeClass'),
      ],
      DEFAULT_TASKS
    )
    expect(labels).toEqual([
      "Demander l'adresse exacte du bien",
      'Demander le DPE (classe, consommation, date du diagnostic)',
    ])
  })

  it('compare les libellés sans casse, accents ni ponctuation finale, et dédoublonne', () => {
    const labels = missingFieldTaskLabels(
      [missing('floor'), missing('floor')],
      ["  demander l'etage et la presence d'un ascenseur. "]
    )
    expect(labels).toEqual([])
    expect(normalizeTaskLabel('Demander le DPE…')).toBe('demander le dpe')
  })
})
