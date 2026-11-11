import { useRouter } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { backTarget } from '@/lib/navigation'

/**
 * Lot 23 : le lien « retour » d'une page ouverte depuis une autre (compte
 * rendu d'exploration, toutes les tâches) : la page d'où l'on vient, par
 * l'historique ; ouverte directement (lien, notification), sa page parente.
 */
export function useBackLink(fallback: RouteLocationRaw, fallbackLabel: string) {
  const router = useRouter()
  const back: unknown =
    typeof window === 'undefined' ? null : window.history.state?.back
  const fromApp = backTarget(back, '').kind === 'history'
  const label = fromApp ? 'Retour' : fallbackLabel
  function go(): void {
    if (fromApp) router.back()
    else void router.push(fallback)
  }
  return { label, go, fromApp }
}
