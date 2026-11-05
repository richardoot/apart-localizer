import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useActiveSection } from './useActiveSection'

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void

const original = globalThis.IntersectionObserver

afterEach(() => {
  globalThis.IntersectionObserver = original
})

function host(enabled: ReturnType<typeof ref<boolean>>) {
  let active: ReturnType<typeof useActiveSection> | null = null
  const wrapper = mount(
    defineComponent({
      setup() {
        active = useActiveSection(['a', 'b', 'c'], enabled as never)
        return () =>
          h('div', [
            h('section', { id: 'a' }),
            h('section', { id: 'b' }),
            h('section', { id: 'c' }),
          ])
      },
    }),
    { attachTo: document.body }
  )
  return { wrapper, active: () => active?.value ?? null }
}

describe('useActiveSection', () => {
  it('la première section visible, dans l’ordre de la page', async () => {
    const callbacks: Callback[] = []
    const observed: string[] = []
    const disconnect = vi.fn()
    globalThis.IntersectionObserver = vi.fn().mockImplementation(function (
      callback: Callback
    ) {
      callbacks.push(callback)
      return {
        observe: (el: Element) => observed.push(el.id),
        disconnect,
      }
    }) as unknown as typeof IntersectionObserver
    const enabled = ref(true)
    const { wrapper, active } = host(enabled)
    expect(active()).toBe('a')
    expect(observed).toEqual(['a', 'b', 'c'])
    const target = (id: string) => document.getElementById(id) as Element
    callbacks[0]?.([
      { target: target('c'), isIntersecting: true },
      { target: target('b'), isIntersecting: true },
    ])
    expect(active()).toBe('b')
    callbacks[0]?.([{ target: target('b'), isIntersecting: false }])
    expect(active()).toBe('c')
    enabled.value = false
    await nextTick()
    expect(disconnect).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('sans IntersectionObserver : la première section reste active', () => {
    // @ts-expect-error retiré pour le test
    globalThis.IntersectionObserver = undefined
    const { wrapper, active } = host(ref(true))
    expect(active()).toBe('a')
    wrapper.unmount()
  })
})
