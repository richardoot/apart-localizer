<script setup lang="ts">
  import { computed } from 'vue'
  import { useRoute } from 'vue-router'
  import type { LocationQuery, RouteLocationRaw } from 'vue-router'
  import { COMPARE_MAX } from '@apart/contracts'
  import CompareTable from '@/components/listings/CompareTable.vue'
  import { useCompare } from '@/composables/useListings'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { plural } from '@/lib/format'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiButton from '@/components/ui/UiButton.vue'

  const route = useRoute()

  /** `?ids=a,b,c` : 2 à 6 identifiants, dans l'ordre choisi. */
  const ids = computed(() => {
    const raw = route.query.ids
    const text = Array.isArray(raw) ? raw.join(',') : (raw ?? '')
    return [
      ...new Set(
        text
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      ),
    ].slice(0, COMPARE_MAX)
  })
  const compare = useCompare(ids)
  const data = compare.data
  const { me } = useWorkspace()

  /**
   * Lot 26 : la page Annonces d'où l'on vient (étape, vue, filtres), que la
   * comparaison emporte dans sa requête ; le retour y ramène, la sélection
   * cochée comprise.
   */
  const origin = computed<LocationQuery>(() => {
    const { ids: _ids, ...rest } = route.query
    return rest
  })
  const backTo = computed<RouteLocationRaw>(() => ({
    name: 'listings',
    query: { ...origin.value, comparer: ids.value.join(',') },
  }))
  /** Ouvrir une annonce : sa fiche ; la fermer revient ici (l'historique). */
  function linkOf(id: string): RouteLocationRaw {
    return { name: 'listing', params: { id }, query: { ...origin.value } }
  }
</script>

<template>
  <section class="mx-auto grid max-w-7xl gap-4 px-4 py-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl font-bold">Comparer</h1>
        <p class="text-sm text-muted">
          {{ plural(ids.length, 'annonce') }} côte à côte ; ★ = la meilleure sur
          l’indicateur.
        </p>
      </div>
      <UiButton :to="backTo" icon="arrow-left" data-testid="compare-back"
        >Retour aux annonces</UiButton
      >
    </header>
    <p v-if="ids.length < 2" class="text-sm text-muted">
      Coche au moins deux annonces dans la liste, les cartes ou le tableau pour
      les comparer ({{ COMPARE_MAX }} au plus).
    </p>
    <QueryState
      v-else
      :query="compare"
      skeleton="block"
      loading-label="la comparaison"
      error-fallback="La comparaison a échoué."
    >
      <CompareTable
        v-if="data"
        :result="data"
        :me-id="me?.id ?? null"
        :link-of="linkOf"
      />
    </QueryState>
  </section>
</template>
