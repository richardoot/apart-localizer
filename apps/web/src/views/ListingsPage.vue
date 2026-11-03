<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import type { PointRadius } from '@apart/contracts'
  import FiltersBar from '@/components/listings/FiltersBar.vue'
  import ListingCards from '@/components/listings/ListingCards.vue'
  import ListingCreatePanel from '@/components/listings/ListingCreatePanel.vue'
  import ListingPanel from '@/components/listings/ListingPanel.vue'
  import ListingsMap from '@/components/listings/ListingsMap.vue'
  import ListingsTable from '@/components/listings/ListingsTable.vue'
  import ViewSwitch from '@/components/listings/ViewSwitch.vue'
  import { useListingList } from '@/composables/useListings'
  import { useFiltersStore } from '@/stores/filters'

  const route = useRoute()
  const router = useRouter()
  const store = useFiltersStore()

  // L'URL fait foi : au chargement et à chaque navigation, les filtres se
  // relisent depuis la requête ; chaque changement de filtre réécrit l'URL.
  store.loadFromQuery(route.query)
  watch(
    () => route.query,
    query => {
      if (JSON.stringify(query) !== JSON.stringify(store.routeQuery)) {
        store.loadFromQuery(query)
      }
    }
  )
  watch(
    () => store.routeQuery,
    query => {
      if (JSON.stringify(query) !== JSON.stringify(route.query)) {
        void router.replace({
          name: route.name ?? 'listings',
          params: route.params,
          query,
        })
      }
    }
  )

  const filters = computed(() => store.apiFilters())
  const { data, isPending, isFetching, error } = useListingList(filters)
  const items = computed(() => data.value?.items ?? [])
  const communes = computed(() => {
    const set = new Set<string>()
    for (const item of items.value) {
      if (item.listing.location.commune) set.add(item.listing.location.commune)
    }
    for (const c of store.filters.commune ?? []) set.add(c)
    return [...set]
  })
  const colorBy = ref<'verdict' | 'status'>('verdict')

  const openedId = computed(() =>
    typeof route.params.id === 'string' ? route.params.id : null
  )
  const creating = computed(() => route.name === 'listing-new')

  function open(id: string): void {
    void router.push({ name: 'listing', params: { id }, query: route.query })
  }
  function closePanel(): void {
    void router.push({ name: 'listings', query: route.query })
  }
  function onNear(near: PointRadius | undefined): void {
    store.setNear(near)
  }
  function compare(ids: string[]): void {
    void router.push({ name: 'compare', query: { ids: ids.join(',') } })
  }
</script>

<template>
  <section class="mx-auto grid max-w-7xl gap-4 px-4 py-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl font-bold">Annonces</h1>
        <p class="text-sm text-muted">
          <template v-if="data">{{ data.total }} annonce(s)</template>
          <template v-else>Chargement…</template>
          <span v-if="isFetching && !isPending" class="ml-1"
            >· actualisation…</span
          >
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <ViewSwitch v-model="store.view" />
        <label
          v-if="store.view === 'map'"
          class="flex items-center gap-1 text-xs text-muted"
        >
          Couleur
          <select
            v-model="colorBy"
            class="rounded-lg border border-line bg-bg px-2 py-1 text-xs"
          >
            <option value="verdict">par verdict</option>
            <option value="status">par statut</option>
          </select>
        </label>
        <RouterLink
          :to="{ name: 'listing-new', query: route.query }"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
        >
          + Ajouter
        </RouterLink>
      </div>
    </header>

    <FiltersBar :communes="communes" />

    <p
      v-if="error"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ error.message }}
    </p>
    <p v-else-if="isPending" class="text-sm text-muted">
      Chargement des annonces…
    </p>
    <template v-else>
      <ListingsTable
        v-if="store.view === 'table'"
        :items="items"
        @open="open"
        @compare="compare"
      />
      <ListingCards
        v-else-if="store.view === 'cards'"
        :items="items"
        @open="open"
      />
      <ListingsMap
        v-else
        :items="items"
        :near="store.filters.near"
        :color-by="colorBy"
        @open="open"
        @update:near="onNear"
      />
    </template>

    <p class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <span
        ><span class="rounded-full bg-good-soft px-2 text-good">Cible</span>
        rendement brut ≥ seuil, effort ≤ maximum, DPE A à D</span
      >
      <span
        ><span class="rounded-full bg-warn-soft px-2 text-warn">À creuser</span>
        un critère manque de peu</span
      >
      <span
        ><span class="rounded-full bg-bad-soft px-2 text-bad">Hors cible</span>
        rendement trop faible, DPE E à G ou effort trop lourd</span
      >
      <span
        >« ≈ » : valeur estimée faute de saisie (taxe foncière = 1 mois de
        loyer)</span
      >
    </p>

    <ListingPanel v-if="openedId" :id="openedId" @close="closePanel" />
    <ListingCreatePanel
      v-if="creating"
      @close="closePanel"
      @created="open"
      @open="open"
    />
  </section>
</template>
