import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'

/**
 * Lot 22 (ADR 0032) : la garde des modifications, une seule pour toute
 * l'application. Ce qui a une saisie en cours (une section de la fiche, la
 * nouvelle annonce remplie par l'IA, un critère dessiné) s'y déclare
 * (`useLeaveGuard`). Le bouton retour du navigateur et du téléphone (garde
 * du routeur), la fermeture d'un panneau, le rechargement après une mise à
 * jour de l'application et la fermeture de l'onglet (`beforeunload`)
 * passent par elle : l'action attend que le membre choisisse « Continuer la
 * modification » ou « Abandonner les modifications ». Jamais de
 * `window.confirm`.
 *
 * Une source peut demander avec sa propre interface (`prompt`) : la fiche
 * garde son bandeau « Modifications non enregistrées » ; les autres passent
 * par la boîte commune (`UnsavedDialog`).
 */
export interface LeaveGuardSource {
  /** Le nom de ce qui serait perdu (« Nouvelle annonce », « Caractéristiques »). */
  title: () => string
  isDirty: () => boolean
  /** Abandonne les modifications. */
  discard: () => void
  /** Demande avec l'interface de la source ; `proceed` abandonne puis agit. */
  prompt?: (proceed: () => void) => void
  /** Cette navigation quitte-t-elle la saisie ? Par défaut : le chemin change. */
  leaves?: (
    to: RouteLocationNormalized,
    from: RouteLocationNormalized
  ) => boolean
}

export interface PendingLeave {
  title: string
  proceed: () => void
}

export const useLeaveGuardStore = defineStore('leave-guard', () => {
  const sources = shallowRef<LeaveGuardSource[]>([])
  const pending = ref<PendingLeave | null>(null)

  function register(source: LeaveGuardSource): () => void {
    sources.value = [...sources.value, source]
    return () => {
      sources.value = sources.value.filter(s => s !== source)
    }
  }

  /** La dernière source déclarée qui a des modifications (la plus au-dessus). */
  function dirtySource(
    filter?: (source: LeaveGuardSource) => boolean
  ): LeaveGuardSource | null {
    for (let i = sources.value.length - 1; i >= 0; i--) {
      const source = sources.value[i]
      if (source && source.isDirty() && (!filter || filter(source))) {
        return source
      }
    }
    return null
  }

  function anyDirty(): boolean {
    return dirtySource() !== null
  }

  /** Demande à quitter `source` ; `run` s'exécute après l'abandon. */
  function ask(source: LeaveGuardSource, run: () => void): void {
    const proceed = () => {
      pending.value = null
      source.discard()
      run()
    }
    if (source.prompt) {
      source.prompt(proceed)
      return
    }
    pending.value = { title: source.title(), proceed }
  }

  /** Exécute `run`, ou attend la confirmation s'il y a des modifications. */
  function guard(
    run: () => void,
    filter?: (source: LeaveGuardSource) => boolean
  ): void {
    const source = dirtySource(filter)
    if (!source) {
      run()
      return
    }
    ask(source, run)
  }

  /** La source qu'une navigation quitterait avec des modifications. */
  function blockingNavigation(
    to: RouteLocationNormalized,
    from: RouteLocationNormalized
  ): LeaveGuardSource | null {
    return dirtySource(source =>
      source.leaves ? source.leaves(to, from) : to.path !== from.path
    )
  }

  function confirmLeave(): void {
    pending.value?.proceed()
  }
  function stay(): void {
    pending.value = null
  }

  return {
    sources,
    pending,
    register,
    dirtySource,
    anyDirty,
    ask,
    guard,
    blockingNavigation,
    confirmLeave,
    stay,
  }
})
