<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { OPEN_DATA_STATUS_LABELS } from '@apart/contracts'
  import { trendDirectionLabel } from '@apart/domain'
  import { useListingContext } from '@/composables/useListingContext'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import { cardClasses } from '@/lib/ui'
  import {
    formatDistance,
    formatEuros,
    formatEurosPerM2,
    formatNumber,
    plural,
  } from '@/lib/format'
  import {
    trendChart,
    trendPartialText,
    trendPeakText,
    trendTiles,
    trendYearText,
  } from '@/lib/market-trend'

  /**
   * Lot 29 (ADR 0039) : « Tendance des prix » de l'onglet Négocier, sous les
   * ventes comparables. La médiane au m² de chaque année autour du repère
   * (toutes les ventes d'appartements, toutes surfaces), les écarts sur un,
   * cinq et dix ans, le pic. Tout vient du serveur ; ici, seulement le tracé
   * (`lib/market-trend.ts`). Un indicateur : aucun calcul de la fiche ne le lit.
   *
   * Le tracé : une seule série, donc pas de légende ; une courbe (l'axe des
   * prix ne part pas de zéro), deux valeurs écrites au plus (année de
   * référence, pic), les autres au survol ou au toucher d'une année et dans
   * « Les chiffres par année », toujours lisible au clavier.
   */
  const props = defineProps<{ listingId: string }>()

  const id = computed(() => props.listingId)
  const contextQuery = useListingContext(id)
  const { data: context } = contextQuery
  const trend = computed(() => context.value?.market.trend ?? null)
  const reference = computed(
    () =>
      trend.value?.years.find(y => y.year === trend.value?.referenceYear) ??
      null
  )
  const chart = computed(() => (trend.value ? trendChart(trend.value) : null))
  const tiles = computed(() => (trend.value ? trendTiles(trend.value) : []))
  const peakText = computed(() =>
    trend.value ? trendPeakText(trend.value) : null
  )
  const partialText = computed(() =>
    trend.value ? trendPartialText(trend.value) : null
  )

  /** L'année survolée ou touchée ; sinon l'année de référence. */
  const hovered = ref<number | null>(null)
  const readout = computed(() => {
    const year =
      trend.value?.years.find(y => y.year === hovered.value) ?? reference.value
    return year ? trendYearText(year) : null
  })
  /** Largeur d'une zone de survol : un pas d'année. */
  const hitWidth = computed(() => {
    const count = chart.value?.points.length ?? 1
    return count > 1 ? 100 / (count - 1) : 100
  })
  /** L'étiquette d'un point (année de référence, pic) et son côté ; null sinon. */
  const labelOf = (year: number): { below: boolean } | null =>
    chart.value?.labelled.find(label => label.year === year) ?? null
</script>

<template>
  <section
    class="@container grid min-w-0 content-start gap-3"
    :class="cardClasses()"
    aria-labelledby="market-trend-title"
    data-testid="market-trend"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2
        id="market-trend-title"
        class="flex flex-wrap items-center gap-2 text-base font-semibold"
      >
        Tendance des prix
        <UiBadge
          v-if="trend?.direction"
          tone="neutral"
          data-testid="market-trend-direction"
          >{{ trendDirectionLabel(trend.direction) }}</UiBadge
        >
        <UiBadge
          v-if="trend && trend.status !== 'ok'"
          :tone="trend.status === 'to_verify' ? 'warn' : 'neutral'"
          >{{ OPEN_DATA_STATUS_LABELS[trend.status] }}</UiBadge
        >
      </h2>
      <span v-if="trend && reference" class="text-sm text-muted">
        DVF, appartements à moins de
        {{ formatDistance(trend.radiusMeters) }}, toutes surfaces
      </span>
    </div>

    <QueryState
      :query="contextQuery"
      skeleton="rows"
      loading-label="de la tendance des prix"
      error-fallback="La lecture de la tendance des prix a échoué."
    >
      <template v-if="trend">
        <template v-if="reference && reference.medianPricePerM2 !== null">
          <p class="text-sm tabular-nums" data-testid="market-trend-reference">
            Médiane
            <strong>{{ formatEurosPerM2(reference.medianPricePerM2) }}</strong>
            en {{ reference.year }}, sur {{ plural(reference.count, 'vente') }}.
          </p>

          <dl
            v-if="tiles.length"
            class="m-0 grid grid-cols-1 gap-2 @md:grid-cols-3"
            data-testid="market-trend-changes"
          >
            <!-- Étroit : une ligne par écart ; large : trois tuiles côte à côte. -->
            <div
              v-for="tile in tiles"
              :key="tile.key"
              class="flex flex-wrap items-baseline gap-x-2 rounded-xl bg-surface-2 px-3 py-2 @md:grid @md:content-start @md:gap-0.5"
            >
              <dt class="order-2 text-xs text-muted">{{ tile.label }}</dt>
              <dd class="order-1 m-0 text-lg font-semibold tabular-nums">
                {{ tile.value }}
              </dd>
              <dd class="order-3 m-0 text-xs text-muted tabular-nums">
                {{ tile.detail }}
              </dd>
            </div>
          </dl>

          <figure
            v-if="chart"
            class="m-0 grid gap-1"
            data-testid="market-trend-chart"
          >
            <figcaption class="text-xs text-muted">
              Prix médian au m² par année.
              <span
                class="tabular-nums text-fg"
                aria-live="polite"
                data-testid="market-trend-readout"
                >{{ readout }}</span
              >
            </figcaption>
            <div
              class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 pr-3 pt-5"
              aria-hidden="true"
            >
              <div class="relative h-36 w-11 text-right text-xs text-muted">
                <span
                  v-for="tick in chart.ticks"
                  :key="tick.value"
                  class="absolute right-0 -translate-y-1/2 tabular-nums"
                  :style="{ top: `${tick.y}%` }"
                  >{{ formatNumber(tick.value) }}</span
                >
              </div>
              <div class="relative h-36" @pointerleave="hovered = null">
                <div
                  v-for="tick in chart.ticks"
                  :key="tick.value"
                  class="absolute inset-x-0 border-t border-line"
                  :style="{ top: `${tick.y}%` }"
                />
                <svg
                  class="absolute inset-0 h-full w-full overflow-visible"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <path
                    v-for="segment in chart.segments"
                    :key="segment.d"
                    :d="segment.d"
                    fill="none"
                    stroke-width="2"
                    stroke-linecap="round"
                    vector-effect="non-scaling-stroke"
                    :class="segment.partial ? 'stroke-muted' : 'stroke-accent'"
                    :stroke-dasharray="segment.partial ? '4 4' : undefined"
                  />
                </svg>
                <template v-for="point in chart.points" :key="point.year">
                  <span
                    v-if="point.y !== null"
                    class="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                    :class="[
                      point.partial
                        ? 'border-2 border-muted bg-surface'
                        : 'bg-accent',
                      hovered === point.year ? 'scale-150' : '',
                    ]"
                    :style="{ left: `${point.x}%`, top: `${point.y}%` }"
                    data-point
                  />
                  <span
                    v-if="point.value !== null && labelOf(point.year)"
                    class="absolute text-xs font-medium tabular-nums whitespace-nowrap"
                    :class="[
                      labelOf(point.year)?.below
                        ? 'pt-2'
                        : '-translate-y-full pb-2',
                      point.x > 90 ? '-translate-x-full' : '-translate-x-1/2',
                    ]"
                    :style="{ left: `${point.x}%`, top: `${point.y}%` }"
                    data-point-label
                    >{{ formatEuros(point.value) }}</span
                  >
                  <!-- Zone de survol et de toucher, plus large que le point ; au clavier, « Les chiffres par année ». -->
                  <span
                    class="absolute inset-y-0 -translate-x-1/2"
                    :style="{ left: `${point.x}%`, width: `${hitWidth}%` }"
                    data-hit
                    @pointerenter="hovered = point.year"
                    @click="hovered = point.year"
                  />
                </template>
              </div>
              <span />
              <div class="relative h-5 text-xs text-muted">
                <span
                  v-for="label in chart.xLabels"
                  :key="label.year"
                  class="absolute top-1 -translate-x-1/2 tabular-nums"
                  :style="{ left: `${label.x}%` }"
                  >{{ label.year }}</span
                >
              </div>
            </div>
          </figure>

          <p
            v-if="peakText || partialText"
            class="text-sm text-muted tabular-nums"
            data-testid="market-trend-peak"
          >
            {{ [peakText, partialText].filter(Boolean).join(' ') }}
          </p>

          <details class="text-sm" data-testid="market-trend-table">
            <summary class="cursor-pointer text-accent">
              Les chiffres par année
            </summary>
            <table class="mt-2 w-full border-collapse tabular-nums">
              <caption class="sr-only">
                Prix médian au m² et nombre de ventes par année
              </caption>
              <thead>
                <tr class="text-left text-xs text-muted">
                  <th scope="col" class="py-1.5 font-medium">Année</th>
                  <th scope="col" class="py-1.5 text-right font-medium">
                    Ventes
                  </th>
                  <th scope="col" class="py-1.5 text-right font-medium">
                    Médiane
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="year in [...trend.years].reverse()"
                  :key="year.year"
                  class="border-t border-line"
                >
                  <th scope="row" class="py-1.5 text-left font-normal">
                    {{ year.year
                    }}<span v-if="year.partial" class="text-xs text-muted">
                      (incomplète)</span
                    >
                  </th>
                  <td class="py-1.5 text-right">
                    {{ formatNumber(year.count) }}
                  </td>
                  <td class="py-1.5 text-right">
                    {{
                      year.medianPricePerM2 === null
                        ? 'trop peu de ventes'
                        : formatEurosPerM2(year.medianPricePerM2)
                    }}
                  </td>
                </tr>
              </tbody>
            </table>
          </details>
        </template>

        <ul
          v-if="trend.reasons.length || trend.notes.length"
          class="grid gap-0.5 text-xs text-muted"
          data-testid="market-trend-notes"
        >
          <li v-for="reason in trend.reasons" :key="reason">{{ reason }}</li>
          <li v-for="note in trend.notes" :key="note">{{ note }}</li>
        </ul>
      </template>
    </QueryState>
  </section>
</template>
