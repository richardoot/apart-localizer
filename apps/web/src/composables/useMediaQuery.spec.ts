import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useMediaQuery } from './useMediaQuery'

const original = window.matchMedia

afterEach(() => {
  window.matchMedia = original
})

describe('useMediaQuery', () => {
  it('suit la requête et cesse d’écouter quand la portée se termine', () => {
    const listeners: ((event: MediaQueryListEvent) => void)[] = []
    const remove = vi.fn()
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: (
        _: string,
        fn: (event: MediaQueryListEvent) => void
      ) => {
        listeners.push(fn)
      },
      removeEventListener: remove,
    })) as unknown as typeof window.matchMedia
    const scope = effectScope()
    const matches = scope.run(() => useMediaQuery('(min-width: 1024px)'))
    expect(matches?.value).toBe(true)
    for (const fn of listeners) fn({ matches: false } as MediaQueryListEvent)
    expect(matches?.value).toBe(false)
    scope.stop()
    expect(remove).toHaveBeenCalled()
  })

  it('sans matchMedia : faux', () => {
    // @ts-expect-error retiré pour le test
    window.matchMedia = undefined
    expect(useMediaQuery('(min-width: 1024px)').value).toBe(false)
  })
})
