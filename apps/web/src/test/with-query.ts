import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

/**
 * Monte un composable dans un composant minimal muni de TanStack Query, pour
 * le tester comme il tourne dans la page. Rend le résultat du composable, le
 * client (pour observer les invalidations) et `unmount`.
 */
export function withQuery<T>(composable: () => T): {
  result: T
  client: QueryClient
  unmount: () => void
} {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  let result: T | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        result = composable()
        return () => h('div')
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } }
  )
  return { result: result as T, client, unmount: () => wrapper.unmount() }
}
