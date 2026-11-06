<script setup lang="ts">
  import { computed } from 'vue'
  import { CRITERIA_FIT_LEVEL_LABELS } from '@apart/contracts'
  import type {
    CriteriaFitEntry,
    CriteriaFitLevel,
    ListingCriteriaFit,
  } from '@apart/contracts'
  import {
    fitExplanation,
    fitReasonsText,
    toleranceSummary,
  } from '@apart/domain'
  import DefinitionButton from '@/components/ui/DefinitionButton.vue'
  import { useSearchCriteriaList } from '@/composables/useSearchCriteria'
  import type { ListingTab } from '@/lib/listing-tabs'
  import FitBadge from './FitBadge.vue'

  /**
   * Le détail de l'adéquation aux critères actifs (lot 14), déplié depuis la
   * ligne « Correspond-elle ? » de la Synthèse (lot 19) : ce que veut dire le
   * meilleur niveau, « Préciser l'adresse » quand la localisation reste à
   * confirmer, chaque critère filtre par filtre (valeur, seuil, marge) et les
   * marges appliquées. L'historique daté de l'adéquation est dans l'onglet
   * Historique.
   */
  const props = defineProps<{ fit: ListingCriteriaFit }>()
  const emit = defineEmits<{ precise: []; go: [tab: ListingTab] }>()

  const { data: criteriaData } = useSearchCriteriaList(false)
  const criteria = computed(
    () => new Map((criteriaData.value ?? []).map(c => [c.id, c]))
  )

  function margins(entry: CriteriaFitEntry): string | null {
    const c = criteria.value.get(entry.criteriaId)
    return c
      ? toleranceSummary({
          perimeterType: c.perimeterType,
          filters: c.filters,
          tolerance: c.tolerance,
        })
      : null
  }
  const hasPerimeter = computed(() =>
    props.fit.criteria.some(
      c => criteria.value.get(c.criteriaId)?.perimeter != null
    )
  )

  const ICON_STROKE: Record<CriteriaFitLevel, string> = {
    in: 'text-accent',
    to_confirm: 'text-accent',
    margin: 'text-warn',
    out: 'text-muted',
  }
  const linkClass =
    'inline-flex min-h-11 items-center justify-self-start text-sm font-semibold text-accent underline-offset-2 hover:underline sm:min-h-9'
</script>

<template>
  <div class="@container grid gap-3" data-testid="criteria-fit">
    <div
      class="flex flex-wrap items-center gap-3 text-sm"
      data-testid="fit-verdict"
    >
      <span class="flex-[1_1_18rem] leading-relaxed text-muted">
        {{ fitExplanation(fit) }}
        <DefinitionButton term="criteria_fit" />
      </span>
      <button
        v-if="fit.locationPending"
        type="button"
        class="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg sm:min-h-10"
        data-testid="fit-precise"
        @click="emit('precise')"
      >
        Préciser l’adresse
      </button>
      <RouterLink
        v-else-if="fit.activeCriteria === 0"
        :to="{ name: 'criteria' }"
        class="inline-flex min-h-11 items-center rounded-lg border border-accent px-4 text-sm font-semibold text-accent sm:min-h-10"
      >
        Créer un critère
      </RouterLink>
    </div>

    <div
      v-if="fit.criteria.length"
      class="grid gap-3 @3xl:grid-cols-2 @3xl:items-start"
    >
      <article
        v-for="entry in fit.criteria"
        :key="entry.criteriaId"
        class="grid gap-2 rounded-xl border border-line px-4 py-3"
        :data-criteria="entry.criteriaId"
      >
        <header class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold">{{ entry.name }}</h3>
          <FitBadge :level="entry.level" />
        </header>
        <p v-if="entry.level === 'out' && entry.reasons.length" class="text-sm">
          {{ fitReasonsText(entry.reasons) }}.
        </p>
        <ul
          v-if="entry.checks.length"
          class="grid tabular-nums"
          :aria-label="`Filtres du critère « ${entry.name} »`"
        >
          <li
            v-for="check in entry.checks"
            :key="check.key"
            class="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-2.5 border-t border-line/60 py-2 first:border-t-0"
            :data-check="check.key"
            :data-level="check.level"
          >
            <svg
              role="img"
              :aria-label="CRITERIA_FIT_LEVEL_LABELS[check.level]"
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              :class="ICON_STROKE[check.level]"
            >
              <circle
                cx="9"
                cy="9"
                r="7.5"
                :stroke-dasharray="
                  check.level === 'to_confirm' ? '3 2.4' : undefined
                "
              />
              <path v-if="check.level === 'in'" d="M5.5 9.3l2.3 2.2 4.7-4.8" />
              <path v-else-if="check.level === 'margin'" d="M9 5v5M9 12.5v.5" />
              <path
                v-else-if="check.level === 'out'"
                d="M6.5 6.5l5 5M11.5 6.5l-5 5"
              />
            </svg>
            <span class="text-sm">
              <strong class="font-semibold">{{ check.label }}</strong>
              <span class="block text-xs text-muted">{{ check.detail }}</span>
              <span
                v-if="check.reason && check.level !== 'to_confirm'"
                class="block text-xs font-medium"
                :class="check.level === 'margin' ? 'text-warn' : 'text-fg'"
                >{{ fitReasonsText([check.reason]) }}</span
              >
            </span>
            <span class="text-sm font-semibold whitespace-nowrap">{{
              check.value ?? '—'
            }}</span>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">
          Ni filtre ni périmètre : toute annonce y est.
        </p>
        <p v-if="margins(entry)" class="text-xs text-muted">
          {{ margins(entry) }} Elles se règlent dans la page
          <RouterLink
            :to="{ name: 'criteria' }"
            class="text-accent underline-offset-2 hover:underline"
            >Critères</RouterLink
          >.
        </p>
      </article>
    </div>

    <div class="flex flex-wrap gap-x-4">
      <button
        v-if="hasPerimeter"
        type="button"
        :class="linkClass"
        data-testid="fit-map"
        @click="emit('go', 'quartier')"
      >
        Le périmètre et le quartier sur la carte →
      </button>
      <button
        type="button"
        :class="linkClass"
        data-testid="fit-history-link"
        @click="emit('go', 'historique')"
      >
        L’historique de l’adéquation →
      </button>
    </div>
  </div>
</template>
