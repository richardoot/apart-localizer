<script setup lang="ts">
  import { computed } from 'vue'
  import { CriteriaFitLevelSchema, ListingStatusSchema } from '@apart/contracts'
  import { summarizeListings } from '@apart/domain'
  import StatTile from '@/components/ui/StatTile.vue'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import ListingCards from '@/components/listings/ListingCards.vue'
  import DraftsInbox from '@/components/drafts/DraftsInbox.vue'
  import PendingMessages from '@/components/agency/PendingMessages.vue'
  import WhatsNewBanner from '@/components/whats-new/WhatsNewBanner.vue'
  import { useListingList } from '@/composables/useListings'
  import { useSearchCriteriaList } from '@/composables/useSearchCriteria'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { toSummaryListing } from '@/lib/dashboard'
  import {
    formatEurosPerM2,
    formatPercent,
    plural,
    pluralWord,
  } from '@/lib/format'
  import { LISTING_STATUS_LABELS } from '@/lib/labels'
  import { useRouter } from 'vue-router'

  const router = useRouter()
  const { data: workspace } = useWorkspace()
  // Tous les statuts : la synthèse compte aussi les écartées et les vendues ;
  // et toute l'adéquation (lot 14) : les annonces hors critères aussi.
  const listings = useListingList({
    status: [...ListingStatusSchema.options],
    fit: [...CriteriaFitLevelSchema.options],
    sort: 'score',
    limit: 200,
  })

  const items = computed(() => listings.data.value?.items ?? [])
  const summary = computed(() =>
    summarizeListings(items.value.map(toSummaryListing), { bestCount: 3 })
  )
  const best = computed(() => {
    const ids = new Set(summary.value.best.map(b => b.id))
    return items.value.filter(item => ids.has(item.listing.id))
  })
  const newOnes = computed(() =>
    items.value.filter(
      item =>
        item.isNewForMe &&
        !['discarded', 'sold_or_withdrawn', 'offer_refused'].includes(
          item.listing.status
        )
    )
  )
  const statuses = ListingStatusSchema.options

  // Critères actifs (besoin G6) : annonces retenues et nouvelles pour moi.
  const { data: criteriaData } = useSearchCriteriaList(false)
  const criteria = computed(() => criteriaData.value ?? [])

  function open(id: string): void {
    void router.push({ name: 'listing', params: { id } })
  }
</script>

<template>
  <section class="mx-auto grid max-w-6xl gap-6 px-4 py-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl font-bold">Accueil</h1>
        <p class="text-sm text-muted">
          <template v-if="workspace"
            >{{ workspace.workspace.name }} ·
          </template>
          {{
            plural(summary.activeCount, 'annonce active', 'annonces actives')
          }}.
        </p>
      </div>
      <UiButton to="/annonces/nouvelle" variant="primary" icon="plus">
        Ajouter une annonce
      </UiButton>
    </header>

    <WhatsNewBanner @open="open" />
    <DraftsInbox />
    <PendingMessages />

    <QueryState
      :query="listings"
      skeleton="cards"
      :skeleton-count="2"
      loading-label="des annonces"
    >
      <div
        class="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6"
        aria-label="Chiffres de l’espace"
      >
        <StatTile
          label="Nouvelles annonces"
          :value="String(summary.newForMeCount)"
          hint="pas encore consultées"
        />
        <StatTile
          label="Annonces suivies"
          :value="String(summary.activeCount)"
          hint="annonces actives"
        />
        <StatTile
          label="Dans la cible"
          :value="String(summary.byVerdict.target)"
          hint="selon tes seuils"
        />
        <StatTile
          label="Meilleur rendement brut"
          :value="
            summary.bestGrossYield
              ? formatPercent(summary.bestGrossYield.grossYield)
              : '—'
          "
          :hint="summary.bestGrossYield?.title"
        />
        <StatTile
          label="Prix moyen au m²"
          :value="
            summary.averagePricePerM2 === null
              ? '—'
              : formatEurosPerM2(summary.averagePricePerM2)
          "
          hint="annonces actives"
        />
        <StatTile
          label="À visiter"
          :value="String(summary.toVisitCount)"
          hint="visites à caler"
        />
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <UiCard title="Par statut">
          <ul class="grid gap-1 text-sm">
            <li
              v-for="status in statuses"
              :key="status"
              class="flex items-center justify-between"
            >
              <RouterLink
                :to="{ name: 'listings', query: { status } }"
                class="inline-flex min-h-11 items-center hover:text-accent sm:min-h-8"
                >{{ LISTING_STATUS_LABELS[status] }}</RouterLink
              >
              <span class="font-mono" :data-status-count="status">{{
                summary.byStatus[status]
              }}</span>
            </li>
          </ul>
        </UiCard>
        <UiCard title="Tâches">
          <p class="text-sm">
            <span class="font-mono text-2xl" data-testid="open-tasks">{{
              summary.openTasks
            }}</span>
            {{ summary.openTasks >= 2 ? 'tâches ouvertes' : 'tâche ouverte' }}
            sur les annonces actives,
            <span
              class="font-mono"
              :class="summary.overdueTasks > 0 ? 'text-warn' : ''"
              >{{ summary.overdueTasks }}</span
            >
            en retard (plus de 14 jours).
          </p>
          <p class="mt-2 text-sm text-muted">
            Les tâches se cochent dans l’onglet « À faire » de chaque annonce.
          </p>
        </UiCard>
      </div>

      <UiCard
        v-if="criteria.length"
        title="Critères de recherche"
        aria-label="Critères de recherche"
      >
        <template #actions>
          <UiButton to="/criteres" variant="ghost" size="sm"
            >Gérer les critères</UiButton
          >
        </template>
        <ul class="grid gap-1 text-sm">
          <li
            v-for="c in criteria"
            :key="c.id"
            class="flex flex-wrap items-baseline justify-between gap-2"
            :data-criteria-count="c.id"
          >
            <RouterLink
              :to="{ name: 'listings', query: { criteriaId: c.id } }"
              class="inline-flex min-h-11 items-center hover:text-accent sm:min-h-8"
              >{{ c.name }}</RouterLink
            >
            <span>
              <span class="font-mono">{{ c.listingCount }}</span>
              {{ pluralWord(c.listingCount, 'annonce') }}
              <UiBadge
                v-if="c.newCount"
                tone="accent"
                variant="solid"
                class="ml-1"
                >{{ plural(c.newCount, 'nouvelle') }}</UiBadge
              >
              <span v-if="c.approximateCount" class="ml-1 text-xs text-muted"
                >dont {{ c.approximateCount }} à confirmer</span
              >
            </span>
          </li>
        </ul>
      </UiCard>

      <section v-if="newOnes.length" class="grid gap-3">
        <h2 class="font-display text-lg font-bold">
          Nouvelles annonces
          <UiBadge tone="accent" variant="solid" class="ml-2">{{
            newOnes.length
          }}</UiBadge>
        </h2>
        <ListingCards :items="newOnes" @open="open" />
      </section>

      <section class="grid gap-3">
        <h2 class="font-display text-lg font-bold">Meilleures annonces</h2>
        <ListingCards :items="best" @open="open" />
      </section>
    </QueryState>
  </section>
</template>
