<script setup lang="ts">
  import type { ListingChanges } from '@apart/contracts'
  import { formatDate } from '@/lib/format'
  import ActivityList from './ActivityList.vue'

  defineProps<{ changes: ListingChanges }>()
</script>

<template>
  <section
    v-if="changes.entries.length"
    class="grid gap-2 rounded-2xl border border-accent bg-accent-soft/40 p-4"
    data-testid="listing-changes"
    aria-labelledby="changes-title"
  >
    <h3 id="changes-title" class="font-display text-sm font-bold">
      Depuis ta dernière ouverture ({{ formatDate(changes.since) }})
    </h3>
    <ActivityList :entries="changes.entries" />
  </section>
</template>
