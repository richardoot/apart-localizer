import { describe, expect, it, vi } from 'vitest'
import { lazyModule } from './lazy-module'

describe('lazyModule', () => {
  it('ne charge rien avant le premier usage, puis une seule fois', () => {
    const load = vi.fn(() => ({ name: 'sdk' }))
    const sdk = lazyModule(load)
    expect(load).not.toHaveBeenCalled()
    const first = sdk()
    expect(sdk()).toBe(first)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('garde aussi une valeur fausse', () => {
    const load = vi.fn(() => 0)
    const value = lazyModule(load)
    expect(value()).toBe(0)
    expect(value()).toBe(0)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('réessaie au prochain usage quand le chargement échoue', () => {
    const load = vi
      .fn<() => string>()
      .mockImplementationOnce(() => {
        throw new Error('absent')
      })
      .mockReturnValue('ok')
    const value = lazyModule(load)
    expect(() => value()).toThrow('absent')
    expect(value()).toBe('ok')
  })
})
