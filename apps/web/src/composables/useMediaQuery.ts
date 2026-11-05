import { getCurrentScope, onScopeDispose, ref } from 'vue'
import type { Ref } from 'vue'

/** Largeur à partir de laquelle la page Hypothèses passe en deux colonnes (Tailwind `lg`). */
export const DESKTOP_QUERY = '(min-width: 1024px)'

/**
 * Vrai tant que la requête média correspond, suivi au redimensionnement.
 * Faux sans `matchMedia` (rendu hors navigateur).
 */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false)
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return matches
  const list = window.matchMedia(query)
  matches.value = list.matches
  const update = (event: MediaQueryListEvent): void => {
    matches.value = event.matches
  }
  list.addEventListener('change', update)
  if (getCurrentScope()) {
    onScopeDispose(() => list.removeEventListener('change', update))
  }
  return matches
}
