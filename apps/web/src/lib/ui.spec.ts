import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { OFFLINE_MESSAGE, errorMessage, isConflict } from './errors'
import {
  isUnreadableNumber,
  numberInputError,
  unreadableNumberMessage,
} from './format'
import {
  alertClasses,
  badgeClasses,
  buttonClasses,
  cardClasses,
  chipClasses,
  controlBoxClasses,
  controlFocusClasses,
} from './ui'

describe('recettes des composants partagés (lot 22)', () => {
  it('un bouton fait 44 px au téléphone et au toucher, focus visible', () => {
    const classes = buttonClasses({ variant: 'primary' })
    expect(classes).toContain('min-h-11')
    expect(classes).toContain('pointer-coarse:min-h-11')
    expect(classes).toContain('focus-visible:outline-accent')
    expect(buttonClasses({ size: 'icon' })).toContain('size-11')
    expect(buttonClasses({ variant: 'link', size: 'inline' })).not.toContain(
      'min-h-11'
    )
    expect(buttonClasses({ block: true })).toContain('w-full')
  })

  it('fonds pleins : l’encre suit le thème, jamais `text-white`', () => {
    for (const tone of ['good', 'warn', 'bad'] as const) {
      expect(badgeClasses(tone, 'solid')).toContain(`text-${tone}-fg`)
    }
    expect(buttonClasses({ variant: 'danger' })).toContain('text-bad-fg')
    expect(badgeClasses('info', 'outline')).toContain('border-info')
    expect(alertClasses('bad')).toContain('bg-bad-soft')
    expect(alertClasses('neutral')).toContain('text-fg')
  })

  it('une case de champ dit l’erreur et la modification ; une carte, une recette', () => {
    expect(controlBoxClasses({ invalid: true })).toContain('border-bad')
    expect(controlBoxClasses({ changed: true, invalid: true })).toContain(
      'border-accent'
    )
    expect(controlBoxClasses({})).toContain('text-base')
    expect(cardClasses()).toBe(
      'rounded-2xl border border-line bg-surface p-4 sm:px-5'
    )
    expect(cardClasses('accent', 'none')).toContain('border-accent')
    expect(cardClasses('muted', 'sm')).toContain('p-3')
    expect(chipClasses(true)).toContain('bg-accent-soft')
    expect(chipClasses(false)).toContain('text-muted')
  })
})

describe('messages d’échec (lib/errors)', () => {
  it('le message du serveur, le réseau coupé, sinon le repli', () => {
    expect(errorMessage(new ApiError(409, 'Déjà pris.'))).toBe('Déjà pris.')
    expect(errorMessage(new TypeError('Failed to fetch'))).toBe(OFFLINE_MESSAGE)
    expect(errorMessage(new TypeError('Load failed'))).toBe(OFFLINE_MESSAGE)
    expect(errorMessage(new Error('x'), 'L’export a échoué.')).toBe(
      'L’export a échoué.'
    )
    expect(errorMessage('quoi')).toBe('L’action a échoué.')
    expect(isConflict(new ApiError(409, 'x'))).toBe(true)
    expect(isConflict(new ApiError(400, 'x'))).toBe(false)
  })
})

describe('nombres illisibles (lot 22)', () => {
  it('refusés avec ce qui a été tapé, jamais vidés', () => {
    expect(isUnreadableNumber('45 m²')).toBe(true)
    expect(isUnreadableNumber('250k')).toBe(true)
    expect(isUnreadableNumber('environ 300')).toBe(true)
    expect(isUnreadableNumber('45,5')).toBe(false)
    expect(isUnreadableNumber('1 050')).toBe(false)
    expect(isUnreadableNumber('')).toBe(false)
    expect(isUnreadableNumber('  ')).toBe(false)
    expect(isUnreadableNumber(null)).toBe(false)
    expect(isUnreadableNumber(12)).toBe(false)
    expect(isUnreadableNumber(Number.NaN)).toBe(true)
    expect(numberInputError('45 m²')).toBe(
      '« 45 m² » n’est pas un nombre : écris-le en chiffres, sans unité (ex. 45 ou 45,5).'
    )
    expect(numberInputError('45')).toBeNull()
    expect(numberInputError(undefined)).toBeNull()
    expect(unreadableNumberMessage('x'.repeat(40))).toContain('…')
  })
})

describe('pluriels accordés (lot 22)', () => {
  it('jamais « (s) » : 0 et 1 au singulier, 2 et plus au pluriel', async () => {
    const { plural, pluralWord } = await import('./format')
    expect(plural(0, 'annonce')).toBe('0 annonce')
    expect(plural(1, 'annonce')).toBe('1 annonce')
    expect(plural(3, 'annonce')).toBe('3 annonces')
    expect(plural(2, 'prix', 'prix')).toBe('2 prix')
    expect(plural(1200, 'vente')).toBe('1 200 ventes')
    expect(pluralWord(2, 'nouvelle')).toBe('nouvelles')
    expect(pluralWord(1, 'nouvelle')).toBe('nouvelle')
  })
})

describe('lot 23 : le focus d’une case', () => {
  it('un seul trait de couleur : rouge sur un champ en erreur, vert sinon', () => {
    expect(controlFocusClasses(false)).toContain('focus-within:outline-accent')
    expect(controlFocusClasses(true)).toContain('focus-within:outline-bad')
    expect(controlFocusClasses(true)).not.toContain('outline-accent')
    expect(controlFocusClasses(true, 'visible')).toContain(
      'focus-visible:outline-bad'
    )
    expect(controlFocusClasses(false, 'visible')).toContain(
      'focus-visible:outline-accent'
    )
  })
})
