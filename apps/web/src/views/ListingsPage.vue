<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import type { CriteriaMatchChanges, PointRadius } from '@apart/contracts'
  import { criteriaChangesMessage } from '@/lib/criteria'
  import CostBasisBadge from '@/components/listings/CostBasisBadge.vue'
  import DraftsTab from '@/components/drafts/DraftsTab.vue'
  import FiltersBar from '@/components/listings/FiltersBar.vue'
  import FitTabs from '@/components/listings/FitTabs.vue'
  import ListingCards from '@/components/listings/ListingCards.vue'
  import ListingCreatePanel from '@/components/listings/ListingCreatePanel.vue'
  import ListingPanel from '@/components/listings/ListingPanel.vue'
  import ListingsMap from '@/components/listings/ListingsMap.vue'
  import ListingsTable from '@/components/listings/ListingsTable.vue'
  import ExportMenu from '@/components/listings/ExportMenu.vue'
  import ViewSwitch from '@/components/listings/ViewSwitch.vue'
  import { useDrafts } from '@/composables/useDrafts'
  import { useListingAreas, useListingList } from '@/composables/useListings'
  import {
    DEFAULT_LAYER_TOGGLES,
    useMapLayers,
  } from '@/composables/useMapLayers'
  import type { MapLayerToggles } from '@/composables/useMapLayers'
  import { useSearchCriteriaList } from '@/composables/useSearchCriteria'
  import {
    listingTabFromQuery,
    listingTabQuery,
    withoutListingTab,
  } from '@/lib/listing-tabs'
  import type { ListingTab } from '@/lib/listing-tabs'
  import { criteriaFeatures } from '@/lib/perimeter'
  import { useFiltersStore } from '@/stores/filters'

  const route = useRoute()
  const router = useRouter()
  const store = useFiltersStore()

  /** L'onglet de la fiche ouverte, lu et écrit dans l'URL : le retour et un lien partagé le gardent. */
  const panelTab = computed<ListingTab>({
    get: () => listingTabFromQuery(route.query),
    set: tab => {
      void router.replace({
        name: route.name ?? 'listing',
        params: route.params,
        query: { ...withoutListingTab(route.query), ...listingTabQuery(tab) },
      })
    },
  })

  // L'URL fait foi : au chargement et à chaque navigation, les filtres se
  // relisent depuis la requête ; chaque changement de filtre réécrit l'URL.
  // L'onglet de la fiche (`onglet`, lot 9) n'est pas un filtre : il est mis
  // de côté pour la comparaison et gardé quand les filtres réécrivent l'URL.
  store.loadFromQuery(withoutListingTab(route.query))
  watch(
    () => route.query,
    query => {
      const filters = withoutListingTab(query)
      if (JSON.stringify(filters) !== JSON.stringify(store.routeQuery)) {
        store.loadFromQuery(filters)
      }
    }
  )
  watch(
    () => store.routeQuery,
    query => {
      if (
        JSON.stringify(query) !== JSON.stringify(withoutListingTab(route.query))
      ) {
        void router.replace({
          name: route.name ?? 'listings',
          params: route.params,
          query: { ...query, ...listingTabQuery(panelTab.value) },
        })
      }
    }
  )

  const filters = computed(() => store.apiFilters())
  const { data, isPending, isFetching, error } = useListingList(filters)
  // Lot 12 : contours des annonces au quartier, chargés pour la carte seulement.
  const listingAreas = useListingAreas(computed(() => store.view === 'map'))
  const items = computed(() => data.value?.items ?? [])
  /** Lot 14 : l'adéquation de la liste (critères actifs, compteurs des onglets). */
  const fit = computed(() => data.value?.fit ?? null)
  const activeCriteria = computed(() => fit.value?.activeCriteria ?? [])
  const outTab = computed(() => store.fitTab === 'out')
  /** Lot 16 : l'onglet « À valider » (brouillons e-mail et explorations de Claude). */
  const draftsTab = computed(() => store.fitTab === 'drafts')
  const { data: pendingDrafts } = useDrafts()
  const draftCount = computed(() => pendingDrafts.value?.length ?? 0)
  const communes = computed(() => {
    const set = new Set<string>()
    for (const item of items.value) {
      if (item.listing.location.commune) set.add(item.listing.location.commune)
    }
    for (const c of store.filters.commune ?? []) set.add(c)
    return [...set]
  })
  const colorBy = ref<'verdict' | 'status'>('verdict')

  // Critères de recherche : sélecteur des filtres et périmètres sur la carte.
  const { data: criteriaData } = useSearchCriteriaList(false)
  const criteria = computed(() => criteriaData.value ?? [])
  const toggles = ref<MapLayerToggles>({ ...DEFAULT_LAYER_TOGGLES })
  const bbox = ref<[number, number, number, number] | null>(null)
  const layerData = useMapLayers(toggles, bbox)
  const mapLayers = computed(() => ({
    ...layerData.value,
    criteria: criteriaFeatures(criteria.value, store.filters.criteriaId),
  }))

  const openedId = computed(() =>
    typeof route.params.id === 'string' ? route.params.id : null
  )
  const creating = computed(() => route.name === 'listing-new')

  /** Le message de création (« entre dans le critère… »), montré à l'ouverture de la fiche. */
  const notice = ref<string | null>(null)

  /** Une autre fiche s'ouvre sur sa synthèse : l'onglet ne suit pas. */
  function open(id: string): void {
    void router.push({
      name: 'listing',
      params: { id },
      query: withoutListingTab(route.query),
    })
  }
  function onCreated(id: string, changes?: CriteriaMatchChanges | null): void {
    notice.value = ['Annonce créée.', criteriaChangesMessage(changes)]
      .filter(Boolean)
      .join(' ')
    open(id)
  }
  function closePanel(): void {
    void router.push({
      name: 'listings',
      query: withoutListingTab(route.query),
    })
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
        <p
          v-if="activeCriteria.length"
          class="text-sm text-muted"
          data-testid="fit-criteria"
        >
          Comparées
          {{
            activeCriteria.length > 1
              ? `aux ${activeCriteria.length} critères actifs`
              : 'au critère actif'
          }}
          :
          <template v-for="(c, index) in activeCriteria" :key="c.id"
            ><template v-if="index > 0"> · </template
            ><RouterLink
              :to="{ name: 'listings', query: { criteriaId: c.id } }"
              class="text-accent underline-offset-2 hover:underline"
              >{{ c.name }}</RouterLink
            ></template
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
        <ExportMenu :filters="filters" />
        <RouterLink
          :to="{ name: 'listing-new', query: withoutListingTab(route.query) }"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
        >
          + Ajouter
        </RouterLink>
      </div>
    </header>

    <FiltersBar v-if="!draftsTab" :communes="communes" :criteria="criteria" />

    <FitTabs :fit="fit" :drafts="draftCount" />

    <DraftsTab v-if="draftsTab" />
    <p
      v-else-if="error"
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
        :out-tab="outTab"
        @open="open"
        @compare="compare"
      />
      <ListingCards
        v-else-if="store.view === 'cards'"
        :items="items"
        :out-tab="outTab"
        @open="open"
      />
      <ListingsMap
        v-else
        v-model:toggles="toggles"
        :items="items"
        :near="store.filters.near"
        :color-by="colorBy"
        :layers="mapLayers"
        :areas="listingAreas.data.value ?? null"
        @open="open"
        @update:near="onNear"
        @bounds="value => (bbox = value)"
      />
    </template>

    <p
      v-if="outTab && activeCriteria.length && !draftsTab"
      class="text-xs text-muted"
    >
      Les annonces écartées ou vendues restent gouvernées par le filtre de
      statut, comme avant.
    </p>

    <p
      v-if="!draftsTab"
      class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"
    >
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
        loyer), ou distance depuis le centre du quartier ou de la commune</span
      >
      <span class="inline-flex items-center gap-1" data-testid="legend-price"
        ><CostBasisBadge basis="price" /> se compare au prix affiché</span
      >
      <span class="inline-flex items-center gap-1" data-testid="legend-all-in"
        ><CostBasisBadge basis="all_in" /> coût tout compris : prix + notaire +
        travaux + mobilier</span
      >
    </p>

    <ListingPanel
      v-if="openedId"
      :id="openedId"
      :key="openedId"
      v-model:tab="panelTab"
      :notice="notice"
      @close="
        () => {
          notice = null
          closePanel()
        }
      "
    />
    <ListingCreatePanel
      v-if="creating"
      @close="closePanel"
      @created="onCreated"
      @open="open"
    />
  </section>
</template>
