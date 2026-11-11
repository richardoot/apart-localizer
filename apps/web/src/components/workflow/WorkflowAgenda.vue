<script setup lang="ts">
  import { computed } from 'vue'
  import { STAGE_AGENDA_KEYS } from '@apart/contracts'
  import type {
    WorkflowAgendaItem,
    WorkflowAgendaKey,
    WorkflowStage,
  } from '@apart/contracts'

  /**
   * Lot 21 (ADR 0031) : « Ce qui t'attend », propre au membre connecté.
   * Chaque élément ouvre le bon travail : le tri, la confirmation, « À
   * trancher ensemble », ou l'étape concernée. Les chiffres viennent de
   * `domain` (`workflowOverview`), sans aucune note révélée. Lot 23 : la
   * page Annonces ne montre que les lignes de ses étapes
   * (`STAGE_AGENDA_KEYS`, l'accueil a les autres) ; au téléphone, une seule
   * ligne de pastilles qui défile.
   */
  const props = defineProps<{ items: readonly WorkflowAgendaItem[] }>()
  const emit = defineEmits<{ stage: [stage: WorkflowStage] }>()
  const shown = computed(() =>
    props.items.filter(item => STAGE_AGENDA_KEYS.includes(item.key))
  )

  const TONES: Partial<Record<WorkflowAgendaKey, string>> = {
    to_sort: 'bg-accent-soft text-accent',
    to_confirm: 'bg-warn-soft text-warn',
    to_settle: 'bg-ai-soft text-ai',
    ready: 'bg-info-soft text-info',
    visits_to_plan: 'bg-surface-2 text-fg',
    opinions_to_give: 'bg-surface-2 text-fg',
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
    'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-left whitespace-nowrap sm:rounded-[10px]'
</script>

<template>
  <section
    v-if="shown.length"
    aria-labelledby="agenda-title"
    class="-mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:gap-x-3 sm:gap-y-2 sm:overflow-visible sm:rounded-2xl sm:border sm:border-line sm:bg-surface sm:px-4 sm:py-3"
    data-testid="workflow-agenda"
  >
    <h2
      id="agenda-title"
      class="shrink-0 text-sm font-semibold whitespace-nowrap sm:mr-2 sm:text-base"
    >
      Ce qui t’attend
    </h2>
    <template v-for="item in shown" :key="item.key">
      <RouterLink
        v-if="target(item)"
        :to="target(item)!"
        :class="[itemClass, TONES[item.key]]"
        :data-agenda="item.key"
      >
        <strong class="font-display text-lg font-bold sm:text-xl">{{
          item.count
        }}</strong>
        {{ item.label }}
      </RouterLink>
      <!-- Lot 22 : contrôle spécialisé (ligne de « Ce qui t'attend », même habit que le lien voisin). -->
      <button
        v-else
        type="button"
        :class="[itemClass, TONES[item.key]]"
        :data-agenda="item.key"
        @click="item.stage && emit('stage', item.stage)"
      >
        <strong class="font-display text-lg font-bold sm:text-xl">{{
          item.count
        }}</strong>
        {{ item.label }}
      </button>
    </template>
  </section>
</template>
