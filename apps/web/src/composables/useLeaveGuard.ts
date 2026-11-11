import { getCurrentInstance, onBeforeUnmount } from 'vue'
import type { Router } from 'vue-router'
import { useLeaveGuardStore } from '@/stores/leave-guard'
import type { LeaveGuardSource } from '@/stores/leave-guard'

/**
 * Lot 22 : déclare une saisie à la garde des modifications le temps de vie
 * du composant ; rend `guard(run)`, qui exécute l'action (fermer le
 * panneau) ou attend la confirmation du membre.
 */
export function useLeaveGuard(source: LeaveGuardSource): {
  guard: (run: () => void) => void
} {
  const store = useLeaveGuardStore()
  const unregister = store.register(source)
  if (getCurrentInstance()) onBeforeUnmount(unregister)
  return {
    guard: run => store.guard(run, candidate => candidate === source),
  }
}

/**
 * La garde du routeur : une navigation qui quitte une saisie modifiée est
 * suspendue, puis rejouée si le membre abandonne. Un retour arrière
 * (bouton du navigateur, glissé de l'iPhone) est rejoué en arrière, pour ne
 * pas empiler l'historique.
 */
export function installLeaveGuard(
  router: Router,
  store: () => ReturnType<typeof useLeaveGuardStore>,
  win: Pick<Window, 'addEventListener'> & { history: History } = window
): void {
  router.beforeEach((to, from) => {
    const guards = store()
    const source = guards.blockingNavigation(to, from)
    if (!source) return true
    // Au retour arrière, l'historique est déjà sur la page visée : son
    // « suivant » est la page quittée (vue-router remet l'URL si on refuse).
    const state = win.history.state as {
      current?: string | null
      forward?: string | null
    } | null
    const back =
      state?.current === to.fullPath && state?.forward === from.fullPath
    guards.ask(source, () => {
      if (back) router.back()
      else void router.push(to.fullPath)
    })
    return false
  })

  // Fermer l'onglet ou recharger : la question du navigateur (pas sur
  // Safari iOS, qui n'envoie pas `beforeunload` ; le glissé arrière, lui,
  // passe par la garde du routeur).
  win.addEventListener('beforeunload', event => {
    if (!store().anyDirty()) return
    event.preventDefault()
    ;(event as BeforeUnloadEvent).returnValue = ''
  })
}
