<script setup lang="ts">
  import { computed } from 'vue'
  import type { StageRowView } from '@/lib/workflow'

  /**
   * Lot 21 (ADR 0031) : les lignes d'une étape : le titre, les chiffres
   * propres à l'étape, la pastille d'état, le bouton d'action. Un brouillon
   * (qui n'a pas de fiche) se déplie sur place (`#expanded`).
   */
  const props = withDefaults(
    defineProps<{
      rows: readonly StageRowView[]
      /** Les lignes dépliées (brouillons). */
      expanded?: readonly string[]
    }>(),
    { expanded: () => [] }
  )
  const emit = defineEmits<{
    open: [row: StageRowView]
    action: [row: StageRowView]
  }>()

  const isExpanded = (id: string): boolean => props.expanded.includes(id)
  const compact = (row: StageRowView): string =>
    row.stats.map(s => s.value).join(' · ')
  const empty = computed(() => props.rows.length === 0)
</script>

<template>
  <section
    v-if="!empty"
    aria-label="Annonces de cette étape"
    class="overflow-hidden rounded-[14px] border border-line bg-surface"
    data-testid="stage-rows"
  >
    <ul class="m-0 list-none p-0">
      <li
        v-for="(row, index) in rows"
        :key="row.id"
        :class="index ? 'border-t border-line' : ''"
        :data-row="row.id"
        :data-row-kind="row.rowKind"
      >
        <div
          class="flex flex-col gap-1 px-3.5 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2 sm:px-4 sm:py-3"
        >
          <div class="flex min-w-0 flex-col gap-0.5 sm:flex-[3_1_280px]">
            <button
              type="button"
              class="w-fit text-left font-semibold text-accent underline-offset-2 hover:underline"
              :aria-expanded="
                row.kind === 'draft' ? isExpanded(row.id) : undefined
              "
              data-testid="row-title"
              @click="emit('open', row)"
            >
              {{ row.title }}
            </button>
            <span class="text-xs text-muted">{{ row.meta }}</span>
          </div>
          <p class="text-sm text-fg tabular-nums sm:hidden">
            {{ compact(row) }}
          </p>
          <div
            v-for="stat in row.stats"
            :key="stat.label"
            class="hidden min-w-0 flex-col gap-px sm:flex sm:flex-[1_1_108px]"
          >
            <span class="text-xs text-muted">{{ stat.label }}</span>
            <span class="tabular-nums">{{ stat.value }}</span>
          </div>
          <div
            class="flex min-w-0 flex-col items-start gap-0.5 sm:flex-[2_1_210px]"
          >
            <span
              class="rounded-full px-2.5 py-0.5 text-xs font-semibold"
              :class="row.pillClass"
              data-testid="row-pill"
              >{{ row.pill }}</span
            >
            <span class="text-xs text-muted sm:text-[13px]">{{
              row.detail
            }}</span>
          </div>
          <button
            type="button"
            class="mt-1 inline-flex min-h-11 flex-[0_0_auto] items-center justify-center rounded-[10px] border border-line bg-surface px-3 text-[13px] font-medium whitespace-nowrap text-fg hover:border-accent sm:mt-0 sm:min-w-[104px]"
            :data-action="row.action.kind"
            @click="emit('action', row)"
          >
            {{ row.action.label }}
          </button>
        </div>
        <div
          v-if="isExpanded(row.id)"
          class="border-t border-line bg-bg p-3 sm:p-4"
        >
          <slot name="expanded" :row="row" />
        </div>
      </li>
    </ul>
  </section>
</template>
