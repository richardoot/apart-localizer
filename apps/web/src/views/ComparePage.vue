<script setup lang="ts">
  import { computed } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import CompareTable from '@/components/listings/CompareTable.vue'
  import { useCompare } from '@/composables/useListings'

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
  const { data, isPending, error } = useCompare(ids)

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
          {{ ids.length }} annonce(s) côte à côte ; ★ = la meilleure sur
          l'indicateur.
        </p>
      </div>
      <RouterLink
        :to="{ name: 'listings' }"
        class="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2"
        >← Retour aux annonces</RouterLink
      >
    </header>
    <p v-if="ids.length < 2" class="text-sm text-muted">
      Sélectionnez au moins deux annonces dans le tableau pour les comparer.
    </p>
    <p
      v-else-if="error"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ error.message }}
    </p>
    <p v-else-if="isPending" class="text-sm text-muted">Comparaison…</p>
    <CompareTable v-else-if="data" :result="data" @open="open" />
  </section>
</template>
