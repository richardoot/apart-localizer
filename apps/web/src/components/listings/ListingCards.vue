<script setup lang="ts">
  import type { EvaluatedListing } from '@apart/contracts'
  import {
    formatDistance,
    formatEuros,
    formatEurosPerM2,
    formatEurosPerMonth,
    formatPercent,
    formatSurface,
  } from '@/lib/format'
  import DpeBadge from './DpeBadge.vue'
  import NewBadge from './NewBadge.vue'
  import RentalPill from './RentalPill.vue'
  import StatusBadge from './StatusBadge.vue'
  import VerdictPill from './VerdictPill.vue'

  defineProps<{ items: EvaluatedListing[] }>()
  const emit = defineEmits<{ open: [id: string] }>()

  const openTasks = (item: EvaluatedListing): number =>
    item.tasks.filter(t => !t.done).length
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    <article
      v-for="item in items"
      :key="item.listing.id"
      class="grid cursor-pointer gap-2 rounded-xl border border-line bg-surface p-3 hover:border-accent"
      :class="item.listing.status === 'discarded' ? 'opacity-60' : ''"
      tabindex="0"
      :data-id="item.listing.id"
      @click="emit('open', item.listing.id)"
      @keydown.enter="emit('open', item.listing.id)"
    >
      <header class="flex items-start justify-between gap-2">
        <div class="grid gap-1">
          <h3 class="flex items-center gap-2 font-medium">
            {{ item.listing.title }}
            <NewBadge :is-new="item.isNewForMe" />
          </h3>
          <p class="text-xs text-muted">
            {{
              [item.listing.location.commune, item.listing.location.district]
                .filter(Boolean)
                .join(' · ') || 'Commune inconnue'
            }}
            <template v-if="item.distanceMeters !== null">
              · à {{ formatDistance(item.distanceMeters) }}</template
            >
          </p>
        </div>
        <VerdictPill :verdict="item.evaluation.metrics.verdict" />
      </header>
      <dl class="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt class="text-[11px] text-muted uppercase">Prix</dt>
          <dd class="font-mono text-xs">
            {{ formatEuros(item.listing.price) }}
          </dd>
        </div>
        <div>
          <dt class="text-[11px] text-muted uppercase">€/m²</dt>
          <dd class="font-mono text-xs">
            {{ formatEurosPerM2(item.evaluation.metrics.pricePerM2) }}
          </dd>
        </div>
        <div>
          <dt class="text-[11px] text-muted uppercase">Surface</dt>
          <dd class="font-mono text-xs">
            {{ formatSurface(item.listing.surface) }}
          </dd>
        </div>
        <div>
          <dt class="text-[11px] text-muted uppercase">Loyer HC</dt>
          <dd class="font-mono text-xs">
            {{ formatEurosPerMonth(item.evaluation.metrics.rent) }}
          </dd>
        </div>
        <div>
          <dt class="text-[11px] text-muted uppercase">Brut</dt>
          <dd class="font-mono text-xs">
            {{ formatPercent(item.evaluation.metrics.grossYield) }}
          </dd>
        </div>
        <div>
          <dt class="text-[11px] text-muted uppercase">Effort</dt>
          <dd class="font-mono text-xs">
            {{ formatEurosPerMonth(item.evaluation.metrics.effort) }}
          </dd>
        </div>
      </dl>
      <footer class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <StatusBadge :status="item.listing.status" />
        <DpeBadge :dpe="item.listing.dpeClass" />
        <RentalPill :verdict="item.evaluation.rental.verdict" />
        <span v-if="openTasks(item) > 0"
          >{{ openTasks(item) }} tâche(s) à faire</span
        >
      </footer>
    </article>
    <p
      v-if="items.length === 0"
      class="col-span-full rounded-xl border border-line bg-surface px-4 py-8 text-center text-sm text-muted"
    >
      Aucune annonce ne correspond : élargissez les filtres de statut ou de
      commune.
    </p>
  </div>
</template>
