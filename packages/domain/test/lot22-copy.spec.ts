import { describe, expect, it } from 'vitest'
import { plural, pluralWord } from '../src/index.js'

describe('lot 22 : pluriels accordés', () => {
  it('0 et 1 au singulier, 2 et plus au pluriel, jamais « (s) »', () => {
    expect(plural(0, 'annonce')).toBe('0 annonce')
    expect(plural(1, 'annonce')).toBe('1 annonce')
    expect(plural(2, 'annonce')).toBe('2 annonces')
    expect(plural(3, 'aléa', 'aléas')).toBe('3 aléas')
    expect(plural(1500, 'vente')).toBe('1 500 ventes')
    expect(pluralWord(2, 'reçue')).toBe('reçues')
    expect(pluralWord(1, 'reçue')).toBe('reçue')
  })
})
