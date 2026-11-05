import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Ref } from 'vue'

/**
 * La section en cours de lecture, pour le sommaire (lot 13) : la première,
 * dans l'ordre de la page, dont le haut passe dans la bande supérieure de la
 * fenêtre. Sans `IntersectionObserver`, la première section reste active.
 */
export function useActiveSection(
  ids: readonly string[],
  enabled: Ref<boolean>
): Ref<string | null> {
  const active = ref<string | null>(ids[0] ?? null)
  let observer: IntersectionObserver | null = null
  const visible = new Set<string>()

  function stop(): void {
    observer?.disconnect()
    observer = null
    visible.clear()
  }

  function start(): void {
    stop()
    if (typeof IntersectionObserver === 'undefined') return
    observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const first = ids.find(id => visible.has(id))
        if (first) active.value = first
      },
      { rootMargin: '-80px 0px -55% 0px' }
    )
    for (const id of ids) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
  }

  onMounted(() => {
    if (enabled.value) start()
  })
  watch(enabled, on => (on ? start() : stop()), { flush: 'post' })
  onBeforeUnmount(stop)

  return active
}
