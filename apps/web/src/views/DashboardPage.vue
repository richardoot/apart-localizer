<script setup lang="ts">
  import { computed } from 'vue'
  import { ListingStatusSchema } from '@apart/contracts'
  import { summarizeListings } from '@apart/domain'
  import StatTile from '@/components/ui/StatTile.vue'
  import ListingCards from '@/components/listings/ListingCards.vue'
  import DraftsInbox from '@/components/drafts/DraftsInbox.vue'
  import WhatsNewBanner from '@/components/whats-new/WhatsNewBanner.vue'
  import { useListingList } from '@/composables/useListings'
  import { useSearchCriteriaList } from '@/composables/useSearchCriteria'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { toSummaryListing } from '@/lib/dashboard'
  import { formatEurosPerM2, formatPercent } from '@/lib/format'
  import { LISTING_STATUS_LABELS } from '@/lib/labels'
  import { useRouter } from 'vue-router'

  const router = useRouter()
  const { data: workspace } = useWorkspace()
  // Tous les statuts : la synthèse compte aussi les écartées et les vendues.
  const { data, isPending, error } = useListingList({
    status: [...ListingStatusSchema.options],
    sort: 'score',
    limit: 200,
  })

  const items = computed(() => data.value?.items ?? [])
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
        <h1 class="font-display text-2xl font-bold">
          {{ workspace?.workspace.name ?? 'Synthèse' }}
        </h1>
        <p class="text-sm text-muted">
          Comparateur d'annonces : {{ summary.activeCount }} annonce(s)
          active(s).
        </p>
      </div>
      <RouterLink
        to="/annonces/nouvelle"
        class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
      >
        + Ajouter une annonce
      </RouterLink>
    </header>

    <WhatsNewBanner @open="open" />
    <DraftsInbox />

    <p v-if="isPending" class="text-sm text-muted">Chargement des annonces…</p>
    <p
      v-else-if="error"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ error.message }}
    </p>
    <template v-else>
      <div
        class="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6"
        aria-label="Synthèse"
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
          hint="selon vos seuils"
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
        <section class="rounded-xl border border-line bg-surface p-4">
          <h2 class="font-display text-base font-semibold">Par statut</h2>
          <ul class="mt-2 grid gap-1 text-sm">
            <li
              v-for="status in statuses"
              :key="status"
              class="flex justify-between"
            >
              <RouterLink
                :to="{ name: 'listings', query: { status } }"
                class="hover:text-accent"
                >{{ LISTING_STATUS_LABELS[status] }}</RouterLink
              >
              <span class="font-mono" :data-status-count="status">{{
                summary.byStatus[status]
              }}</span>
            </li>
          </ul>
        </section>
        <section class="rounded-xl border border-line bg-surface p-4">
          <h2 class="font-display text-base font-semibold">Tâches</h2>
          <p class="mt-2 text-sm">
            <span class="font-mono text-2xl" data-testid="open-tasks">{{
              summary.openTasks
            }}</span>
            tâche(s) ouverte(s) sur les annonces actives,
            <span
              class="font-mono"
              :class="summary.overdueTasks > 0 ? 'text-warn' : ''"
              >{{ summary.overdueTasks }}</span
            >
            en retard (plus de 14 jours).
          </p>
          <p class="mt-2 text-xs text-muted">
            Les tâches se cochent dans la fiche de chaque annonce.
          </p>
        </section>
      </div>

      <section
        v-if="criteria.length"
        class="rounded-xl border border-line bg-surface p-4"
        aria-label="Critères de recherche"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="font-display text-base font-semibold">
            Critères de recherche
          </h2>
          <RouterLink to="/criteres" class="text-xs text-muted hover:text-fg"
            >Gérer les critères</RouterLink
          >
        </div>
        <ul class="mt-2 grid gap-1 text-sm">
          <li
            v-for="c in criteria"
            :key="c.id"
            class="flex flex-wrap items-baseline justify-between gap-2"
            :data-criteria-count="c.id"
          >
            <RouterLink
              :to="{ name: 'listings', query: { criteriaId: c.id } }"
              class="hover:text-accent"
              >{{ c.name }}</RouterLink
            >
            <span>
              <span class="font-mono">{{ c.listingCount }}</span> annonce(s)
              <span
                v-if="c.newCount"
                class="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-fg"
                >{{ c.newCount }} nouvelle(s)</span
              >
              <span v-if="c.approximateCount" class="ml-1 text-xs text-muted"
                >dont {{ c.approximateCount }} sous réserve</span
              >
            </span>
          </li>
        </ul>
      </section>

      <section v-if="newOnes.length" class="grid gap-3">
        <h2 class="font-display text-lg font-semibold">
          Nouvelles annonces
          <span
            class="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-fg"
            >{{ newOnes.length }}</span
          >
        </h2>
        <ListingCards :items="newOnes" @open="open" />
      </section>

      <section class="grid gap-3">
        <h2 class="font-display text-lg font-semibold">Meilleures annonces</h2>
        <ListingCards :items="best" @open="open" />
      </section>
    </template>
  </section>
</template>
