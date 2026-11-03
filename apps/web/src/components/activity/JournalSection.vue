<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useListingActivity } from '@/composables/useActivity'
  import ActivityList from './ActivityList.vue'

  const props = defineProps<{ listingId: string }>()
  const page = ref(1)
  const { data, isPending, error } = useListingActivity(
    computed(() => props.listingId),
    page
  )
</script>

<template>
  <section class="grid gap-3" aria-labelledby="journal-title">
    <header class="flex items-baseline justify-between gap-2">
      <h3 id="journal-title" class="font-display text-base font-semibold">
        Journal de l'annonce
      </h3>
      <span v-if="data" class="text-xs text-muted"
        >{{ data.total }} événement(s)</span
      >
    </header>
    <p v-if="isPending" class="text-sm text-muted">Chargement du journal…</p>
    <p
      v-else-if="error"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ error.message }}
    </p>
    <template v-else-if="data">
      <ActivityList :entries="data.items" />
      <nav
        v-if="data.pageCount > 1"
        class="flex items-center justify-between text-sm"
        aria-label="Pages du journal"
      >
        <button
          type="button"
          class="rounded-lg border border-line px-3 py-1 disabled:opacity-50"
          :disabled="page <= 1"
          @click="page -= 1"
        >
          Plus récents
        </button>
        <span class="text-xs text-muted"
          >{{ page }} / {{ data.pageCount }}</span
        >
        <button
          type="button"
          class="rounded-lg border border-line px-3 py-1 disabled:opacity-50"
          :disabled="page >= data.pageCount"
          @click="page += 1"
        >
          Plus anciens
        </button>
      </nav>
    </template>
  </section>
</template>
