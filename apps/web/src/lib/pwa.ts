import type { RegisterSWOptions } from 'virtual:pwa-register'

/**
 * Le service worker de l'application (vite-plugin-pwa, `autoUpdate`) :
 * après un déploiement, la nouvelle version s'installe et prend la main
 * aussitôt (skipWaiting, clientsClaim), mais la page déjà ouverte garde
 * l'ancienne coquille précachée. On la recharge une fois quand le nouveau
 * worker est actif (`onNeedReload`), jamais deux fois de suite : un second
 * signal dans les `RELOAD_GUARD_MS` qui suivent un rechargement est ignoré
 * (pas de boucle si le navigateur rejoue l'événement). Les mises à jour sont
 * aussi cherchées toutes les heures quand l'application reste ouverte.
 */

/** La clé (stockage de session) du dernier rechargement dû à une mise à jour. */
export const RELOAD_GUARD_KEY = 'apart-localizer-sw-reloaded-at'
/** Pas de second rechargement automatique avant ce délai, en millisecondes. */
export const RELOAD_GUARD_MS = 30_000
/** Intervalle de recherche d'une nouvelle version, en millisecondes. */
export const UPDATE_CHECK_MS = 60 * 60 * 1000

export interface PwaDeps {
  register: (options: RegisterSWOptions) => unknown
  /** Le stockage de session ; null s'il est inaccessible. */
  storage: Pick<Storage, 'getItem' | 'setItem'> | null
  reload: () => void
  now: () => number
  setInterval: (callback: () => void, ms: number) => unknown
}

/** Vrai si la page peut se recharger maintenant ; note l'instant du rechargement. */
export function shouldReload(
  storage: PwaDeps['storage'],
  now: number
): boolean {
  try {
    const last = Number(storage?.getItem(RELOAD_GUARD_KEY) ?? 0)
    if (last > 0 && now - last >= 0 && now - last < RELOAD_GUARD_MS) {
      return false
    }
    storage?.setItem(RELOAD_GUARD_KEY, String(now))
  } catch {
    // Stockage refusé (navigation privée) : rechargement simple, comme le
    // ferait vite-plugin-pwa ; le worker actif ne redemande rien ensuite.
  }
  return true
}

/** Enregistre le service worker et recharge une fois la nouvelle version active. */
export function installServiceWorker(deps: PwaDeps): unknown {
  return deps.register({
    immediate: true,
    onNeedReload: () => {
      if (shouldReload(deps.storage, deps.now())) deps.reload()
    },
    onRegisteredSW: (_url, registration) => {
      if (!registration) return
      deps.setInterval(() => {
        void registration.update().catch(() => undefined)
      }, UPDATE_CHECK_MS)
    },
  })
}

/** Le stockage de session du navigateur, s'il est accessible. */
export function sessionStorageOrNull(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}
