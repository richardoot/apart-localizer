import { computed, unref } from 'vue'
import type { MaybeRef } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/lib/api'
import { openTasksKey } from '@/composables/useListings'

export const gettingStartedKey = ['workspace', 'getting-started'] as const

/**
 * Lot 23 (ADR 0033) : toutes les tâches ouvertes des annonces suivies, par
 * annonce et par retard (`GET /tasks/open`). Une tâche cochée (ici ou dans
 * la fiche) relit cette liste (`useListingMutations`).
 */
export function useOpenTasks(enabled: MaybeRef<boolean> = true) {
  return useQuery({
    queryKey: openTasksKey,
    queryFn: api.tasks.open,
    staleTime: 15_000,
    enabled: computed(() => unref(enabled)),
  })
}

/**
 * Lot 23 : la mise en route de l'espace (hypothèses, critères, première
 * annonce, Claude). Relue à chaque retour sur l'accueil.
 */
export function useGettingStarted() {
  return useQuery({
    queryKey: gettingStartedKey,
    queryFn: api.gettingStarted,
    staleTime: 0,
  })
}
