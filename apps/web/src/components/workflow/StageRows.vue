<script setup lang="ts">
  import { computed } from 'vue'
  import type { ListingCover as Cover } from '@apart/contracts'
  import JudgementPills from '@/components/listings/JudgementPills.vue'
  import ListingCover from '@/components/listings/ListingCover.vue'
  import { useMediaQuery } from '@/composables/useMediaQuery'
  import type { StageRowView } from '@/lib/workflow'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'

  /**
   * Lot 21 (ADR 0031) : les lignes d'une étape : le titre, les chiffres
   * propres à l'étape, la pastille d'état, le bouton d'action. Un brouillon
   * (qui n'a pas de fiche) se déplie sur place (`#expanded`).
   * Lot 25 : sous le titre, les trois jugements étiquetés (formes courtes au
   * téléphone) ; devant, la photo de couverture quand l'annonce en a une.
   */
  const props = withDefaults(
    defineProps<{
      rows: readonly StageRowView[]
      /** Les lignes dépliées (brouillons). */
      expanded?: readonly string[]
      /** Lot 25 : les couvertures par annonce (une lecture pour toute la liste). */
      covers?: ReadonlyMap<string, Cover> | null
    }>(),
    { expanded: () => [], covers: null }
  )
  const emit = defineEmits<{
    open: [row: StageRowView]
    action: [row: StageRowView]
  }>()

  const isExpanded = (id: string): boolean => props.expanded.includes(id)
  const compact = (row: StageRowView): string =>
    row.stats.map(s => s.value).join(' · ')
  const empty = computed(() => props.rows.length === 0)
  const phone = useMediaQuery('(max-width: 639px)')
  const coverOf = (row: StageRowView): Cover | null =>
    row.kind === 'listing' ? (props.covers?.get(row.id) ?? null) : null
</script>

<template>
  <section
    v-if="!empty"
    aria-label="Annonces de cette étape"
    class="overflow-hidden rounded-2xl border border-line bg-surface"
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
          <div class="flex min-w-0 items-start gap-3 sm:flex-[3_1_280px]">
            <ListingCover :cover="coverOf(row)" size="row" class="mt-0.5" />
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <UiButton
                variant="link"
                class="w-fit justify-start text-left font-semibold no-underline hover:underline"
                :aria-expanded="
                  row.kind === 'draft' ? isExpanded(row.id) : undefined
                "
                data-testid="row-title"
                @click="emit('open', row)"
              >
                {{ row.title }}
              </UiButton>
              <span class="hidden text-xs text-muted sm:inline">{{
                row.meta
              }}</span>
              <!-- Lot 25 : au téléphone, les chiffres et le lieu sur une ligne, pour garder trois annonces à l'écran malgré les jugements. -->
              <p class="text-sm sm:hidden">
                <span class="text-fg tabular-nums">{{ compact(row) }}</span
                ><span class="text-xs text-muted"> · {{ row.meta }}</span>
              </p>
              <JudgementPills
                :judgements="row.judgements"
                :compact="phone"
                class="mt-0.5"
              />
            </div>
          </div>
          <div
            v-for="stat in row.stats"
            :key="stat.label"
            class="hidden min-w-0 flex-col gap-px sm:flex sm:flex-[1_1_108px]"
          >
            <span class="text-xs text-muted">{{ stat.label }}</span>
            <span class="tabular-nums">{{ stat.value }}</span>
          </div>
          <!-- Lot 23 : au téléphone, l'état et le bouton sur une même ligne (trois annonces à l'écran). -->
          <div class="flex items-center gap-3 sm:contents">
            <div
              class="flex min-w-0 flex-1 flex-col items-start gap-0.5 sm:flex-[2_1_210px]"
            >
              <UiBadge :tone="row.pillTone" data-testid="row-pill">{{
                row.pill
              }}</UiBadge>
              <span class="text-xs text-muted sm:text-sm">{{
                row.detail
              }}</span>
            </div>
            <UiButton
              class="flex-[0_0_auto] whitespace-nowrap sm:min-w-[104px]"
              :data-action="row.action.kind"
              @click="emit('action', row)"
            >
              {{ row.action.label }}
            </UiButton>
          </div>
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
