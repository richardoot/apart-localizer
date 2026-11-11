<script setup lang="ts">
  import { computed } from 'vue'
  import { OPEN_DATA_STATUS_LABELS } from '@apart/contracts'
  import type { OpenDataStatus } from '@apart/contracts'
  import { useListingContext } from '@/composables/useListingContext'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import { cardClasses } from '@/lib/ui'
  import type { Tone } from '@/lib/ui'
  import {
    formatDate,
    formatDistance,
    formatEuros,
    formatEurosPerM2,
    formatPercent,
    formatSurface,
    plural,
  } from '@/lib/format'
  import type { ListingTab } from '@/lib/listing-tabs'

  /**
   * Lot 19 : les « Ventes comparables » de l'onglet Négocier (venues du
   * Quartier : c'est un argument de prix). La médiane des ventes DVF
   * retenues autour du repère (rayon, période, surfaces proches), le prix de
   * marché pour la surface de l'annonce, l'écart de son prix au m², la liste
   * des ventes datées, et le lien vers la carte du Quartier qui les montre.
   * Tout vient du serveur (DVF importées) ; rien n'est calculé ici.
   */
  const props = defineProps<{ listingId: string }>()
  const emit = defineEmits<{ go: [tab: ListingTab] }>()

  const id = computed(() => props.listingId)
  const contextQuery = useListingContext(id)
  const { data: context } = contextQuery
  const market = computed(() => context.value?.market ?? null)

  const STATUS_TONES: Record<OpenDataStatus, Tone> = {
    ok: 'good',
    to_verify: 'warn',
    not_applicable: 'neutral',
    unavailable: 'neutral',
  }
  const since = computed(() =>
    market.value ? market.value.period.from.slice(0, 4) : null
  )
  /** La carte du Quartier montre les ventes retenues (couche « ventes comparables »). */
  const onMap = computed(
    () =>
      Boolean(context.value?.point) &&
      (market.value?.comparables.length ?? 0) > 0
  )
</script>

<template>
  <section
    class="grid min-w-0 content-start gap-3"
    :class="cardClasses()"
    aria-labelledby="market-sales-title"
    data-testid="market"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2
        id="market-sales-title"
        class="flex flex-wrap items-center gap-2 text-base font-semibold"
      >
        Ventes comparables
        <UiBadge v-if="market" :tone="STATUS_TONES[market.status]">{{
          OPEN_DATA_STATUS_LABELS[market.status]
        }}</UiBadge>
      </h2>
      <span v-if="market?.stats" class="text-sm text-muted">
        DVF, {{ market.stats.count }} vente{{
          market.stats.count > 1 ? 's' : ''
        }}
        à moins de {{ formatDistance(market.radiusMeters) }}
        <template v-if="since">depuis {{ since }}</template>
      </span>
    </div>

    <QueryState
      :query="contextQuery"
      skeleton="rows"
      loading-label="des ventes comparables"
      error-fallback="La lecture des ventes comparables a échoué."
    >
      <template v-if="market">
        <div
          v-if="market.stats"
          class="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm tabular-nums"
        >
          <span data-testid="market-median"
            >Médiane
            <strong>{{
              formatEurosPerM2(market.stats.medianPricePerM2)
            }}</strong
            ><template v-if="market.marketPrice !== null && market.surface"
              >, soit {{ formatEuros(market.marketPrice) }} pour
              {{ formatSurface(market.surface) }}</template
            ></span
          >
          <span
            v-if="
              market.gapToMarket !== null && market.listingPricePerM2 !== null
            "
            :class="market.gapToMarket > 0 ? 'text-warn' : 'text-good'"
            data-testid="market-gap"
            >l’annonce : {{ formatEurosPerM2(market.listingPricePerM2) }},
            {{ market.gapToMarket >= 0 ? '+' : '−'
            }}{{ formatPercent(Math.abs(market.gapToMarket)) }}</span
          >
        </div>
        <p v-if="market.stats" class="text-sm text-muted">
          La moitié centrale des ventes entre
          {{ formatEurosPerM2(market.stats.p25PricePerM2) }} et
          {{ formatEurosPerM2(market.stats.p75PricePerM2) }}, du
          {{ formatDate(market.period.from) }} au
          {{ formatDate(market.period.to) }}.
        </p>

        <div
          v-if="market.comparables.length"
          class="max-w-full overflow-x-auto"
        >
          <table
            class="w-full min-w-[30rem] border-collapse text-sm tabular-nums"
            data-testid="market-sales"
          >
            <caption class="sr-only">
              Ventes comparables retenues, de la plus récente à la plus ancienne
            </caption>
            <thead>
              <tr class="text-left text-xs text-muted">
                <th scope="col" class="py-1.5 font-medium">Distance</th>
                <th scope="col" class="py-1.5 font-medium">Bien</th>
                <th scope="col" class="py-1.5 font-medium">Date</th>
                <th scope="col" class="py-1.5 text-right font-medium">Prix</th>
                <th scope="col" class="py-1.5 text-right font-medium">€/m²</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="sale in market.comparables"
                :key="sale.id"
                class="border-t border-line align-top"
              >
                <td class="py-2 pr-2">
                  {{ formatDistance(sale.distanceMeters) }}
                </td>
                <td class="py-2 pr-2">
                  {{ formatSurface(sale.surface)
                  }}<template v-if="sale.rooms !== null">
                    · {{ sale.rooms }} p.</template
                  >
                  <span v-if="sale.address" class="block text-xs text-muted">{{
                    sale.address
                  }}</span>
                </td>
                <td class="py-2 pr-2">{{ formatDate(sale.mutationDate) }}</td>
                <td class="py-2 pr-2 text-right">
                  {{ formatEuros(sale.price) }}
                </td>
                <td class="py-2 text-right">
                  {{ formatEurosPerM2(sale.pricePerM2) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul
          v-if="market.reasons.length"
          class="grid gap-0.5 text-xs text-muted"
          data-testid="market-reasons"
        >
          <li v-for="reason in market.reasons" :key="reason">{{ reason }}</li>
        </ul>
        <UiButton
          v-if="onMap"
          variant="link"
          class="justify-self-start font-semibold"
          icon-right="arrow-right"
          data-testid="market-map"
          @click="emit('go', 'quartier')"
        >
          Voir {{ market.comparables.length > 1 ? 'les' : 'la' }}
          {{ plural(market.comparables.length, 'vente') }} sur la carte du
          Quartier
        </UiButton>
      </template>
    </QueryState>
  </section>
</template>
