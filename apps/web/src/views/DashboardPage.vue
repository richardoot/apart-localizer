<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { CriteriaFitLevelSchema, ListingStatusSchema } from '@apart/contracts'
  import { openTasksSummaryText, summarizeListings } from '@apart/domain'
  import StatTile from '@/components/ui/StatTile.vue'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import ListingCards from '@/components/listings/ListingCards.vue'
  import DraftsInbox from '@/components/drafts/DraftsInbox.vue'
  import PendingMessages from '@/components/agency/PendingMessages.vue'
  import WhatsNewBanner from '@/components/whats-new/WhatsNewBanner.vue'
  import GettingStarted from '@/components/home/GettingStarted.vue'
  import HomeAgenda from '@/components/home/HomeAgenda.vue'
  import HomeStages from '@/components/home/HomeStages.vue'
  import { useListingCovers } from '@/composables/useCovers'
  import { useGettingStarted } from '@/composables/useHome'
  import { useListingList } from '@/composables/useListings'
  import { useMediaQuery } from '@/composables/useMediaQuery'
  import { useSearchCriteriaList } from '@/composables/useSearchCriteria'
  import { useWorkflowOverview } from '@/composables/useWorkflow'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { toSummaryListing } from '@/lib/dashboard'
  import {
    formatEurosPerM2,
    formatPercent,
    plural,
    pluralWord,
  } from '@/lib/format'

  /**
   * Lot 23 (ADR 0033) : l'accueil répond d'abord à « que faire maintenant ? ».
   * En tête, « Ce qui t'attend » (toutes les lignes de `workflowOverview`) ;
   * « Depuis ta dernière visite » en une ligne ; les messages à valider ;
   * les étapes (à la place du « Par statut »), les tâches ; puis les
   * nouvelles annonces et les critères ; les chiffres généraux en bas. Un
   * espace vide montre la mise en route à la place des zéros. Une fiche
   * ouverte d'ici revient ici à la fermeture.
   */
  const router = useRouter()
  const { data: workspace } = useWorkspace()
  const overviewQuery = useWorkflowOverview()
  const overview = computed(() => overviewQuery.data.value ?? null)
  const startQuery = useGettingStarted()
  const start = computed(() => startQuery.data.value ?? null)
  const empty = computed(() => start.value?.mode === 'full')

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
  /**
   * Les trois plus récentes (une au téléphone, où une carte prend un demi-écran),
   * puis toutes à la demande ; de même pour les meilleures.
   */
  const wide = useMediaQuery('(min-width: 640px)')
  const shownCount = computed(() => (wide.value ? 3 : 1))
  const allNew = ref(false)
  const allBest = ref(false)
  /** Lot 25 : les photos de couverture des meilleures annonces montrées. */
  const shownBest = computed(() =>
    allBest.value ? best.value : best.value.slice(0, shownCount.value)
  )
  const covers = useListingCovers(
    computed(() => shownBest.value.map(item => item.listing.id))
  )
  const newOnes = computed(() =>
    items.value.filter(
      item =>
        item.isNewForMe &&
        !['discarded', 'sold_or_withdrawn', 'offer_refused'].includes(
          item.listing.status
        )
    )
  )

  // Critères actifs (besoin G6) : annonces retenues et nouvelles pour moi.
  const { data: criteriaData } = useSearchCriteriaList(false)
  const criteria = computed(() => criteriaData.value ?? [])

  function open(id: string): void {
    void router.push({ name: 'listing', params: { id } })
  }
</script>

<template>
  <section
    class="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-5 px-4 py-5 sm:gap-6 sm:py-6"
  >
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl font-bold">Accueil</h1>
        <p class="text-sm text-muted">
          <template v-if="workspace"
            >{{ workspace.workspace.name }} ·
          </template>
          {{
            plural(summary.activeCount, 'annonce suivie', 'annonces suivies')
          }}.
        </p>
      </div>
      <!-- Lot 23 : au téléphone, « Ajouter » est dans la barre du bas. -->
      <UiButton
        to="/annonces/nouvelle"
        variant="primary"
        icon="plus"
        class="hidden! sm:inline-flex!"
      >
        Ajouter une annonce
      </UiButton>
    </header>

    <!-- Un espace vide : par où commencer, à la place des zéros. -->
    <GettingStarted v-if="start && empty" :data="start" />

    <template v-else>
      <QueryState
        :query="overviewQuery"
        skeleton="rows"
        :skeleton-count="3"
        loading-label="ce qui t’attend"
        error-fallback="Impossible de lire ce qui t’attend."
      >
        <HomeAgenda v-if="overview" :items="overview.agenda" />
      </QueryState>

      <WhatsNewBanner @open="open" />
      <PendingMessages />
      <DraftsInbox />

      <div v-if="overview" class="grid gap-3 lg:grid-cols-[1fr_auto]">
        <HomeStages :stages="overview.stages" />
        <UiCard
          title="Tâches"
          padding="sm"
          class="grid content-start gap-2 lg:w-72"
          data-testid="home-tasks"
        >
          <p class="text-sm" data-testid="open-tasks">
            {{ openTasksSummaryText(overview.tasks) }}.
          </p>
          <UiButton
            :to="{ name: 'tasks' }"
            size="sm"
            icon-right="arrow-right"
            class="w-fit"
            data-testid="home-tasks-open"
            >Toutes les tâches</UiButton
          >
        </UiCard>
      </div>

      <QueryState
        :query="listings"
        skeleton="cards"
        :skeleton-count="2"
        loading-label="des annonces"
      >
        <section v-if="newOnes.length" class="grid gap-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="font-display text-lg font-bold">
              Nouvelles annonces
              <UiBadge tone="accent" variant="solid" class="ml-2">{{
                newOnes.length
              }}</UiBadge>
            </h2>
            <UiButton
              v-if="newOnes.length > shownCount"
              variant="link"
              size="sm"
              :aria-expanded="allNew"
              data-testid="home-new-all"
              @click="allNew = !allNew"
              >{{ allNew ? 'Moins' : `Voir les ${newOnes.length}` }}</UiButton
            >
          </div>
          <ListingCards
            :items="allNew ? newOnes : newOnes.slice(0, shownCount)"
            @open="open"
          />
        </section>

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

        <section v-if="best.length" class="grid gap-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="font-display text-lg font-bold">Meilleures annonces</h2>
            <UiButton
              v-if="best.length > shownCount"
              variant="link"
              size="sm"
              :aria-expanded="allBest"
              data-testid="home-best-all"
              @click="allBest = !allBest"
              >{{ allBest ? 'Moins' : `Voir les ${best.length}` }}</UiButton
            >
          </div>
          <ListingCards
            :items="shownBest"
            :covers="covers.byId.value"
            @open="open"
            @cover-expired="covers.refresh"
          />
        </section>

        <GettingStarted
          v-if="start && start.mode === 'compact'"
          :data="start"
        />

        <section aria-labelledby="home-figures-title" class="grid gap-2">
          <h2 id="home-figures-title" class="font-display text-lg font-bold">
            Les chiffres de l’espace
          </h2>
          <div
            class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6"
            data-testid="home-figures"
          >
            <StatTile
              label="Nouvelles annonces"
              :value="String(summary.newForMeCount)"
              hint="pas encore consultées"
            />
            <StatTile
              label="Annonces suivies"
              :value="String(summary.activeCount)"
              hint="ni écartées, ni vendues"
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
              hint="annonces suivies"
            />
            <StatTile
              label="À visiter"
              :value="String(summary.toVisitCount)"
              hint="visites à caler"
            />
          </div>
        </section>
      </QueryState>
    </template>
  </section>
</template>
