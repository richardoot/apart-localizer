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
  import { useCriteriaFitHistory } from '@/composables/useListings'
  import { useSearchCriteriaList } from '@/composables/useSearchCriteria'
  import type { ListingTab } from '@/lib/listing-tabs'
  import FitBadge from './FitBadge.vue'

  /**
   * « Correspond-elle à ce qu'on cherche ? » (lot 14, synthèse de la fiche) :
   * le meilleur niveau parmi les critères actifs et ce qu'il veut dire,
   * « Préciser l'adresse » quand la localisation reste à confirmer, le
   * détail de chaque critère filtre par filtre (valeur, seuil, marge), les
   * marges appliquées, et l'historique daté tiré du journal.
   */
  const props = defineProps<{ listingId: string; fit: ListingCriteriaFit }>()
  const emit = defineEmits<{ precise: []; go: [tab: ListingTab] }>()

  const { data: criteriaData } = useSearchCriteriaList(false)
  const criteria = computed(
    () => new Map((criteriaData.value ?? []).map(c => [c.id, c]))
  )
  const history = useCriteriaFitHistory(computed(() => props.listingId))
  const items = computed(() => history.data.value?.items ?? [])

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

  const BOX: Record<CriteriaFitLevel, string> = {
    in: 'border border-accent bg-accent-soft',
    to_confirm: 'border-[1.5px] border-dashed border-accent bg-accent-soft/50',
    margin: 'border border-warn bg-warn-soft',
    out: 'border border-muted bg-surface-2',
  }
  const ICON_STROKE: Record<CriteriaFitLevel, string> = {
    in: 'text-accent',
    to_confirm: 'text-accent',
    margin: 'text-warn',
    out: 'text-muted',
  }
  const day = (iso: string): string =>
    new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
    })
</script>

<template>
  <section
    class="@container grid gap-4 rounded-2xl border border-line bg-surface px-4 py-4"
    aria-labelledby="criteria-fit-title"
    data-testid="criteria-fit"
  >
    <header class="flex flex-wrap items-baseline justify-between gap-2">
      <h3
        id="criteria-fit-title"
        class="inline-flex items-center gap-2 font-display text-lg font-semibold"
      >
        Correspond-elle à ce qu’on cherche ?
        <DefinitionButton term="criteria_fit" />
      </h3>
      <span v-if="fit.activeCriteria > 0" class="text-sm text-muted"
        >Meilleur niveau parmi {{ fit.activeCriteria }} critère(s)
        actif(s)</span
      >
    </header>

    <div class="grid gap-4 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div class="grid content-start gap-3">
        <div
          class="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
          :class="BOX[fit.level]"
          data-testid="fit-verdict"
        >
          <div class="grid flex-[1_1_18rem] gap-1">
            <strong class="text-base">{{
              fit.activeCriteria > 0
                ? CRITERIA_FIT_LEVEL_LABELS[fit.level]
                : 'Aucun critère actif'
            }}</strong>
            <span class="text-sm leading-relaxed">{{
              fitExplanation(fit)
            }}</span>
          </div>
          <button
            v-if="fit.locationPending"
            type="button"
            class="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg"
            data-testid="fit-precise"
            @click="emit('precise')"
          >
            Préciser l’adresse
          </button>
          <RouterLink
            v-else-if="fit.activeCriteria === 0"
            :to="{ name: 'criteria' }"
            class="inline-flex min-h-11 items-center rounded-lg border border-accent px-4 text-sm font-semibold text-accent"
          >
            Créer un critère
          </RouterLink>
        </div>

        <article
          v-for="entry in fit.criteria"
          :key="entry.criteriaId"
          class="grid gap-2 rounded-xl border border-line px-4 py-3"
          :data-criteria="entry.criteriaId"
        >
          <header class="flex flex-wrap items-center justify-between gap-2">
            <h4 class="text-sm font-semibold">{{ entry.name }}</h4>
            <FitBadge :level="entry.level" />
          </header>
          <p
            v-if="entry.level === 'out' && entry.reasons.length"
            class="text-sm"
          >
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
                <path
                  v-if="check.level === 'in'"
                  d="M5.5 9.3l2.3 2.2 4.7-4.8"
                />
                <path
                  v-else-if="check.level === 'margin'"
                  d="M9 5v5M9 12.5v.5"
                />
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

      <aside class="grid content-start gap-3">
        <section
          class="grid gap-2 rounded-xl border border-line px-4 py-3"
          aria-labelledby="fit-history-title"
          data-testid="fit-history"
        >
          <h4 id="fit-history-title" class="text-sm font-semibold">
            Historique de l’adéquation
          </h4>
          <p v-if="history.isPending.value" class="text-xs text-muted">
            Chargement…
          </p>
          <ol v-else-if="items.length" class="grid">
            <li
              v-for="(h, index) in items"
              :key="`${h.at}-${index}`"
              class="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 border-t border-line/60 py-2 first:border-t-0"
            >
              <span class="text-xs text-muted tabular-nums">{{
                day(h.at)
              }}</span>
              <span class="text-sm">
                <strong class="font-semibold">{{ h.what }}</strong>
                <span v-if="h.why" class="block text-xs text-muted">{{
                  h.why
                }}</span>
              </span>
            </li>
          </ol>
          <p v-else class="text-xs text-muted">Aucun changement enregistré.</p>
          <button
            type="button"
            class="inline-flex min-h-11 items-center justify-self-start text-sm font-semibold text-accent underline-offset-2 hover:underline"
            @click="emit('go', 'suivi')"
          >
            Tout le journal dans l’onglet Suivi →
          </button>
        </section>
        <button
          v-if="hasPerimeter"
          type="button"
          class="inline-flex min-h-11 items-center justify-self-start text-sm font-semibold text-accent underline-offset-2 hover:underline"
          data-testid="fit-map"
          @click="emit('go', 'quartier')"
        >
          Le périmètre et le quartier sur la carte →
        </button>
      </aside>
    </div>
  </section>
</template>
