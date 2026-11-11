<script setup lang="ts">
  import type { WorkflowAgendaItem, WorkflowStage } from '@apart/contracts'

  /**
   * Lot 21 (ADR 0031) : « Ce qui t'attend », propre au membre connecté.
   * Chaque élément ouvre le bon travail : le tri, la confirmation, « À
   * trancher ensemble », ou l'étape concernée. Les chiffres viennent de
   * `domain` (`workflowOverview`), sans aucune note révélée.
   */
  defineProps<{ items: readonly WorkflowAgendaItem[] }>()
  const emit = defineEmits<{ stage: [stage: WorkflowStage] }>()

  const TONES: Record<WorkflowAgendaItem['key'], string> = {
    to_sort: 'sm:bg-accent-soft sm:text-accent',
    to_confirm: 'sm:bg-warn-soft sm:text-warn',
    to_settle: 'sm:bg-ai-soft sm:text-ai',
    ready: 'sm:bg-info-soft sm:text-info',
    visits_to_plan: 'sm:bg-surface-2 sm:text-fg',
    opinions_to_give: 'sm:bg-surface-2 sm:text-fg',
  }

  /** Où mène un élément : le tri, la confirmation, ou « À trancher ensemble ». */
  function target(
    item: WorkflowAgendaItem
  ): { name: string; query?: Record<string, string> } | null {
    if (item.key === 'to_sort' && item.stage) {
      return { name: 'triage', query: { etape: item.stage } }
    }
    if (item.key === 'to_confirm') {
      return { name: 'triage', query: { mode: 'confirmer' } }
    }
    if (item.key === 'to_settle') return { name: 'settle' }
    return null
  }

  const itemClass =
    'flex min-h-11 w-full items-center justify-between gap-2 border-t border-line text-left sm:inline-flex sm:w-auto sm:justify-start sm:rounded-[10px] sm:border-0 sm:px-3'
</script>

<template>
  <section
    v-if="items.length"
    aria-labelledby="agenda-title"
    class="flex flex-col rounded-2xl border border-line bg-surface px-3.5 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2 sm:px-4 sm:py-3"
    data-testid="workflow-agenda"
  >
    <h2 id="agenda-title" class="my-1.5 mr-2 text-base font-semibold sm:my-0">
      Ce qui t’attend
    </h2>
    <template v-for="item in items" :key="item.key">
      <RouterLink
        v-if="target(item)"
        :to="target(item)!"
        :class="[itemClass, TONES[item.key]]"
        :data-agenda="item.key"
      >
        <span class="inline-flex items-center gap-2">
          <strong class="font-display text-xl font-bold">{{
            item.count
          }}</strong>
          {{ item.label }}
        </span>
        <span aria-hidden="true" class="text-sm text-accent sm:hidden">{{
          item.key === 'to_sort' ? 'Commencer' : 'Voir'
        }}</span>
      </RouterLink>
      <!-- Lot 22 : contrôle spécialisé (ligne de « Ce qui t'attend », même habit que le lien voisin). -->
      <button
        v-else
        type="button"
        :class="[itemClass, TONES[item.key]]"
        :data-agenda="item.key"
        @click="item.stage && emit('stage', item.stage)"
      >
        <span class="inline-flex items-center gap-2">
          <strong class="font-display text-xl font-bold">{{
            item.count
          }}</strong>
          {{ item.label }}
        </span>
        <span aria-hidden="true" class="text-sm text-accent sm:hidden"
          >Voir</span
        >
      </button>
    </template>
  </section>
</template>
