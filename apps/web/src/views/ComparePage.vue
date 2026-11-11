<script setup lang="ts">
  import { computed } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import CompareTable from '@/components/listings/CompareTable.vue'
  import { useCompare } from '@/composables/useListings'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { plural } from '@/lib/format'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiButton from '@/components/ui/UiButton.vue'

  const route = useRoute()
  const router = useRouter()

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
    ].slice(0, 6)
  })
  const compare = useCompare(ids)
  const data = compare.data
  const { me } = useWorkspace()

  function open(id: string): void {
    void router.push({ name: 'listing', params: { id } })
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
      <UiButton :to="{ name: 'listings' }" icon="arrow-left"
        >Retour aux annonces</UiButton
      >
    </header>
    <p v-if="ids.length < 2" class="text-sm text-muted">
      Sélectionne au moins deux annonces dans le tableau pour les comparer.
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
        @open="open"
      />
    </QueryState>
  </section>
</template>
