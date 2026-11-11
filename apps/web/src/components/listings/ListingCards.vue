<script setup lang="ts">
  import type {
    EvaluatedListing,
    ListingCover as Cover,
  } from '@apart/contracts'
  import {
    judgementsOfListing,
    locationApproximation,
    priceRangeText,
    sellerListLabel,
  } from '@apart/domain'
  import {
    formatDistance,
    formatEuros,
    formatEurosPerM2,
    formatEurosPerMonth,
    formatPercent,
    formatSurface,
    plural,
  } from '@/lib/format'
  import { cardClasses } from '@/lib/ui'
  import CostBasisBadge from './CostBasisBadge.vue'
  import DpeBadge from './DpeBadge.vue'
  import FitSummary from './FitSummary.vue'
  import CheckFreshnessBadge from './CheckFreshnessBadge.vue'
  import NewBadge from './NewBadge.vue'
  import PortalChips from './PortalChips.vue'
  import PrecisionBadge from './PrecisionBadge.vue'
  import JudgementPills from './JudgementPills.vue'
  import ListingCover from './ListingCover.vue'
  import StatusBadge from './StatusBadge.vue'

  /**
   * Les cartes des annonces. Lot 25 (ADR 0035) : la photo de couverture en
   * bandeau quand l'annonce en a une (photo de visite, jamais du portail),
   * les trois jugements étiquetés sous le titre, la raison de l'adéquation
   * dessous.
   */
  withDefaults(
    defineProps<{
      items: EvaluatedListing[]
      /** Lot 14 : l'onglet « Hors critères » (depuis quand). */
      outTab?: boolean
      /** Lot 25 : les couvertures par annonce. */
      covers?: ReadonlyMap<string, Cover> | null
    }>(),
    { outTab: false, covers: null }
  )
  const emit = defineEmits<{ open: [id: string]; coverExpired: [] }>()

  const openTasks = (item: EvaluatedListing): number =>
    item.tasks.filter(t => !t.done).length
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    <article
      v-for="item in items"
      :key="item.listing.id"
      class="grid cursor-pointer gap-2 hover:border-accent"
      :class="
        cardClasses(item.listing.status === 'discarded' ? 'muted' : 'default')
      "
      tabindex="0"
      :data-id="item.listing.id"
      @click="emit('open', item.listing.id)"
      @keydown.enter="emit('open', item.listing.id)"
    >
      <ListingCover
        :cover="covers?.get(item.listing.id) ?? null"
        size="card"
        @expired="emit('coverExpired')"
      />
      <header class="flex items-start justify-between gap-2">
        <div class="grid min-w-0 gap-1">
          <h3 class="flex items-center gap-2 font-medium">
            {{ item.listing.title }}
            <NewBadge :is-new="item.isNewForMe" />
          </h3>
          <JudgementPills :judgements="judgementsOfListing(item)" />
          <FitSummary :fit="item.criteriaFit" :since="outTab" :badge="false" />
          <p class="text-xs text-muted">
            {{
              [item.listing.location.commune, item.listing.location.district]
                .filter(Boolean)
                .join(' · ') || 'Commune inconnue'
            }}
            <template v-if="item.distanceMeters !== null">
              · à
              {{
                locationApproximation(item.listing.location).approximate
                  ? '≈ '
                  : ''
              }}{{ formatDistance(item.distanceMeters) }}</template
            >
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <PrecisionBadge :location="item.listing.location" />
            <CheckFreshnessBadge
              :listing="item.listing"
              :last-outcome="item.lastCheck?.outcome ?? null"
            />
          </div>
          <div
            class="flex flex-wrap items-center gap-1.5 text-xs text-muted"
            data-testid="card-seller"
          >
            <PortalChips :links="item.links" short />
            <span>{{ sellerListLabel(item.listing.sellerType) }}</span>
            <span v-if="item.listing.sellerReference" class="font-mono"
              >· réf. {{ item.listing.sellerReference }}</span
            >
          </div>
        </div>
      </header>
      <dl class="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt
            class="inline-flex items-center gap-1 text-xs text-muted uppercase"
          >
            Prix <CostBasisBadge basis="price" compact />
          </dt>
          <dd class="font-mono text-sm">
            {{ formatEuros(item.listing.price) }}
          </dd>
          <dd
            v-if="priceRangeText(item.links)"
            class="text-xs text-warn"
            data-testid="card-price-range"
          >
            {{ priceRangeText(item.links) }}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-muted uppercase">€/m²</dt>
          <dd class="font-mono text-sm">
            {{ formatEurosPerM2(item.evaluation.metrics.pricePerM2) }}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-muted uppercase">Surface</dt>
          <dd class="font-mono text-sm">
            {{ formatSurface(item.listing.surface) }}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-muted uppercase">Loyer HC</dt>
          <dd class="font-mono text-sm">
            {{ formatEurosPerMonth(item.evaluation.metrics.rent) }}
          </dd>
        </div>
        <div>
          <dt
            class="inline-flex items-center gap-1 text-xs text-muted uppercase"
          >
            Brut <CostBasisBadge basis="all_in" compact />
          </dt>
          <dd class="font-mono text-sm">
            {{ formatPercent(item.evaluation.metrics.grossYield) }}
          </dd>
        </div>
        <div>
          <dt
            class="inline-flex items-center gap-1 text-xs text-muted uppercase"
          >
            Effort <CostBasisBadge basis="all_in" compact />
          </dt>
          <dd class="font-mono text-sm">
            {{ formatEurosPerMonth(item.evaluation.metrics.effort) }}
          </dd>
        </div>
      </dl>
      <footer class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <StatusBadge :status="item.listing.status" />
        <DpeBadge :dpe="item.listing.dpeClass" />
        <span v-if="openTasks(item) > 0"
          >{{ plural(openTasks(item), 'tâche') }} à faire</span
        >
      </footer>
    </article>
    <p
      v-if="items.length === 0"
      class="col-span-full rounded-2xl border border-line bg-surface px-4 py-8 text-center text-sm text-muted"
    >
      Aucune annonce dans cette étape avec ces filtres : change d’étape ou
      élargis les filtres.
    </p>
  </div>
</template>
