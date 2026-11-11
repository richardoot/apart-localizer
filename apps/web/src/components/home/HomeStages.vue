<script setup lang="ts">
  import { computed } from 'vue'
  import { WORKFLOW_STAGES, WORKFLOW_STAGE_LABELS } from '@apart/contracts'
  import type { WorkflowStageCount } from '@apart/contracts'

  /**
   * Lot 23 (ADR 0033) : les six étapes du suivi sur l'accueil, à la place du
   * « Par statut » (même vocabulaire et mêmes chiffres que la barre de la
   * page Annonces : `workflowOverview`). Chaque étape ouvre la page Annonces
   * sur elle (`?etape=`) ; aucun ancien lien `?status=`.
   */
  const props = defineProps<{ stages: readonly WorkflowStageCount[] }>()
  const items = computed(() =>
    WORKFLOW_STAGES.map(stage => {
      const found = props.stages.find(s => s.stage === stage)
      return {
        stage,
        label: WORKFLOW_STAGE_LABELS[stage],
        count: found?.count ?? 0,
        sub: found?.sub ?? '',
      }
    })
  )
</script>

<template>
  <section
    aria-labelledby="home-stages-title"
    class="grid gap-2"
    data-testid="home-stages"
  >
    <h2 id="home-stages-title" class="font-display text-lg font-bold">
      Tes annonces, étape par étape
    </h2>
    <ol
      class="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 lg:grid-cols-6"
    >
      <li v-for="item in items" :key="item.stage">
        <RouterLink
          :to="{ name: 'listings', query: { etape: item.stage } }"
          class="grid min-h-15 content-center gap-0.5 rounded-xl border border-line bg-surface px-3 py-2 hover:border-accent"
          :data-stage="item.stage"
        >
          <span class="flex items-baseline justify-between gap-2">
            <span class="text-sm font-semibold">{{ item.label }}</span>
            <span
              class="font-display text-xl font-bold tabular-nums"
              data-testid="home-stage-count"
              >{{ item.count }}</span
            >
          </span>
          <span class="truncate text-xs text-muted">{{ item.sub }}</span>
        </RouterLink>
      </li>
    </ol>
  </section>
</template>
