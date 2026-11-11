<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import {
    WORKFLOW_STAGE_INTROS,
    WORKFLOW_STAGE_QUESTIONS,
  } from '@apart/contracts'
  import type {
    CriteriaMatchChanges,
    EvaluatedListing,
    PointRadius,
    WorkflowStage,
  } from '@apart/contracts'
  import {
    decisionRowKind,
    defaultStage,
    isFoldedOut,
    stageOfDecision,
    stageOfStatus,
  } from '@apart/domain'
  import { criteriaChangesMessage } from '@/lib/criteria'
  import CostBasisBadge from '@/components/listings/CostBasisBadge.vue'
  import DraftsTab from '@/components/drafts/DraftsTab.vue'
  import FiltersBar from '@/components/listings/FiltersBar.vue'
  import ListingCards from '@/components/listings/ListingCards.vue'
  import ListingCreatePanel from '@/components/listings/ListingCreatePanel.vue'
  import ListingPanel from '@/components/listings/ListingPanel.vue'
  import ListingsMap from '@/components/listings/ListingsMap.vue'
  import ListingsTable from '@/components/listings/ListingsTable.vue'
  import ExportMenu from '@/components/listings/ExportMenu.vue'
  import ViewSwitch from '@/components/listings/ViewSwitch.vue'
  import OutOfCriteria from '@/components/workflow/OutOfCriteria.vue'
  import PropertyFacts from '@/components/workflow/PropertyFacts.vue'
  import StageBar from '@/components/workflow/StageBar.vue'
  import StageRows from '@/components/workflow/StageRows.vue'
  import WorkflowAgenda from '@/components/workflow/WorkflowAgenda.vue'
  import { useDismissedDrafts, useDrafts } from '@/composables/useDrafts'
  import {
    useListingAreas,
    useListingList,
    useListingMutations,
  } from '@/composables/useListings'
  import {
    DEFAULT_LAYER_TOGGLES,
    useMapLayers,
  } from '@/composables/useMapLayers'
  import type { MapLayerToggles } from '@/composables/useMapLayers'
  import { useSearchCriteriaList } from '@/composables/useSearchCriteria'
  import { useWorkflowOverview } from '@/composables/useWorkflow'
  import { useWorkspace } from '@/composables/useWorkspace'
  import {
    legacyTabRedirect,
    listingTabFromQuery,
    listingTabQuery,
    withoutListingTab,
  } from '@/lib/listing-tabs'
  import type { ListingTab } from '@/lib/listing-tabs'
  import { criteriaFeatures } from '@/lib/perimeter'
  import { useAction } from '@/composables/useAction'
  import type { ActionOptions } from '@/composables/useAction'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import UiField from '@/components/ui/UiField.vue'
  import { useFeedbackStore } from '@/stores/feedback'
  import {
    confirmLabel,
    dismissedDraftRow,
    draftMapItem,
    draftMatchesFilters,
    isDraftSortApplied,
    legacyStageRedirect,
    listingRow,
    orderedRows,
    outLabel,
    outReasonOfDraft,
    outReasonOfListing,
    propertyFacts,
    sortDrafts,
    stageCta,
    tabOfAction,
    STAGE_EMPTY_TEXT,
  } from '@/lib/workflow'
  import type { StageRowView } from '@/lib/workflow'
  import { stageApiFilters, useFiltersStore } from '@/stores/filters'

  const route = useRoute()
  const router = useRouter()
  const store = useFiltersStore()
  // Lot 20 : une colonne d'avis par membre actif.
  const { me, activeMembers } = useWorkspace()

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

  // Lot 19 : un ancien identifiant d'onglet (`?onglet=suivi`, `financer`,
  // `echanges`) d'un lien partagé, d'une notification ou d'un e-mail mène au
  // nouvel onglet, et l'URL se réécrit. Lot 21 : de même `?vue=a-valider`,
  // `?fit=` et `?status=` mènent à leur étape.
  watch(
    () => route.query,
    query => {
      const next = legacyTabRedirect(query) ?? legacyStageRedirect(query)
      if (next) {
        void router.replace({
          name: route.name ?? 'listing',
          params: route.params,
          query: next,
        })
      }
    },
    { immediate: true }
  )

  // L'URL fait foi : au chargement et à chaque navigation, les filtres se
  // relisent depuis la requête ; chaque changement de filtre réécrit l'URL.
  // L'onglet de la fiche (`onglet`, lot 9) n'est pas un filtre : il est mis
  // de côté pour la comparaison et gardé quand les filtres réécrivent l'URL.
  /** La requête de la page, sans ce qui n'est pas un filtre. */
  function pageQuery(query: typeof route.query): typeof route.query {
    const { hors: _hors, ...rest } = withoutListingTab(query)
    return rest
  }
  store.loadFromQuery(pageQuery(route.query))
  watch(
    () => route.query,
    query => {
      const filters = pageQuery(query)
      if (JSON.stringify(filters) !== JSON.stringify(store.routeQuery)) {
        store.loadFromQuery(filters)
      }
    }
  )
  watch(
    () => store.routeQuery,
    query => {
      if (JSON.stringify(query) !== JSON.stringify(pageQuery(route.query))) {
        void router.replace({
          name: route.name ?? 'listings',
          params: route.params,
          query: { ...query, ...listingTabQuery(panelTab.value) },
        })
      }
    }
  )

  // Lot 21 : les compteurs de la barre et « Ce qui t'attend ».
  // Lot 22 : un échec des compteurs se dit (avec « Réessayer ») et
  // n'empêche pas la liste de se lire.
  const overviewQuery = useWorkflowOverview()
  const overview = overviewQuery.data
  const overviewReady = overviewQuery.isSuccess
  const overviewFailed = computed(() => overviewQuery.isError?.value === true)
  /** L'étape ouverte : celle de l'URL, sinon la première qui a quelque chose. */
  const stage = computed<WorkflowStage>(
    () => store.stage ?? defaultStage(overview.value?.stages ?? [])
  )
  const stages = computed(() => overview.value?.stages ?? [])
  const stageCount = computed(() =>
    stages.value.find(s => s.stage === stage.value)
  )
  const agreement = computed(() => overview.value?.agreementRequired ?? false)

  const draftsStage = computed(() => stage.value === 'a-valider')
  const listFilters = computed(() => ({
    ...store.apiFilters(),
    ...stageApiFilters(stage.value),
  }))
  /** À valider : pas d'appel de liste ; sinon, l'étape est connue. */
  const listEnabled = computed(
    () =>
      !draftsStage.value &&
      (store.stage !== null || overviewReady.value || overviewFailed.value)
  )
  const listQuery = useListingList(listFilters, listEnabled)
  const { data, isPending, isFetching, isPlaceholderData, error } = listQuery
  // Lot 12 : contours des annonces au quartier, chargés pour la carte seulement.
  const listingAreas = useListingAreas(computed(() => store.view === 'map'))
  /** Les annonces de l'étape (les précédentes s'effacent le temps du chargement). */
  const items = computed(() =>
    (data.value?.items ?? []).filter(
      item => stageOfStatus(item.listing.status) === stage.value
    )
  )
  const switching = computed(
    () => (isPlaceholderData?.value ?? false) && items.value.length === 0
  )
  /** Lot 14 : les critères actifs, l'adéquation de chaque annonce. */
  const fit = computed(() => data.value?.fit ?? null)
  const activeCriteria = computed(() => fit.value?.activeCriteria ?? [])
  const mainItems = computed(() =>
    items.value.filter(item => !isFoldedOut(item.criteriaFit, item.decision))
  )
  const outItems = computed(() =>
    items.value.filter(item => isFoldedOut(item.criteriaFit, item.decision))
  )

  const draftQueries = useDrafts()
  const draftsData = draftQueries.data
  const filteredDrafts = computed(() =>
    (draftsData.value ?? []).filter(d => draftMatchesFilters(d, store.filters))
  )
  const sortedDrafts = computed(() =>
    sortDrafts(filteredDrafts.value, store.filters.sort, store.filters.order)
  )
  const draftsKeepOrder = computed(() => isDraftSortApplied(store.filters.sort))

  // Un brouillon écarté n'a jamais été une annonce suivie : les archives le
  // montrent à côté des annonces écartées, et « Repêcher » le remet À valider.
  const { data: dismissedData } = useDismissedDrafts(
    computed(() => stage.value === 'archives')
  )
  const dismissedDrafts = computed(() =>
    stage.value === 'archives'
      ? (dismissedData.value ?? []).filter(d =>
          draftMatchesFilters(d, store.filters)
        )
      : []
  )

  const communes = computed(() => {
    const set = new Set<string>()
    for (const item of items.value) {
      if (item.listing.location.commune) set.add(item.listing.location.commune)
    }
    for (const d of draftsData.value ?? []) {
      if (d.listing.location.commune) set.add(d.listing.location.commune)
    }
    for (const c of store.filters.commune ?? []) set.add(c)
    return [...set]
  })
  const colorBy = ref<'verdict' | 'status'>('verdict')
  const filtersOpen = ref(false)

  const context = computed(() => ({
    members: activeMembers.value,
    meId: me.value?.id ?? null,
  }))
  const listingRows = computed<StageRowView[]>(() =>
    mainItems.value.map(item => listingRow(stage.value, item, context.value))
  )
  const dismissedRows = computed<StageRowView[]>(() =>
    dismissedDrafts.value.map(d => dismissedDraftRow(d, context.value))
  )
  /** L'ordre de l'étape, sauf si un tri a été demandé dans les filtres. */
  const rows = computed(() => {
    const all = [...listingRows.value, ...dismissedRows.value]
    return store.filters.sort === 'score' ? orderedRows(stage.value, all) : all
  })
  /** Le brouillon écarté déplié dans les archives (il n'a pas de fiche). */
  const expandedDismissed = ref<string | null>(null)
  const expandedDismissedIds = computed(() =>
    expandedDismissed.value ? [expandedDismissed.value] : []
  )
  const factsOpen = ref(true)
  const dismissedOf = (id: string) =>
    dismissedDrafts.value.find(d => d.id === id) ?? null
  /** Le titre d'une ligne : la fiche, ou le détail d'un brouillon écarté. */
  function openRow(row: StageRowView): void {
    if (row.kind === 'draft') {
      expandedDismissed.value =
        expandedDismissed.value === row.id ? null : row.id
      return
    }
    open(row.id)
  }
  /** Archives : les vingt plus récentes, puis « Voir les autres ». */
  const ARCHIVE_PAGE = 20
  const showAllArchives = ref(false)
  const visibleRows = computed(() =>
    stage.value === 'archives' && !showAllArchives.value
      ? rows.value.slice(0, ARCHIVE_PAGE)
      : rows.value
  )
  const hiddenArchives = computed(
    () => rows.value.length - visibleRows.value.length
  )

  const outRows = computed(() =>
    outItems.value.map(item => ({
      id: item.listing.id,
      title: item.listing.title,
      why: outReasonOfListing(item),
    }))
  )
  const outOpenByDefault = computed(() => route.query.hors === '1')

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
  /** Carte de l'étape « À valider » : les brouillons repérés. */
  const mapItems = computed<EvaluatedListing[]>(() =>
    draftsStage.value
      ? filteredDrafts.value.flatMap(d => {
          const item = draftMapItem(d)
          return item ? [item] : []
        })
      : mainItems.value
  )

  const openedId = computed(() =>
    typeof route.params.id === 'string' ? route.params.id : null
  )
  const creating = computed(() => route.name === 'listing-new')

  /** Le message de création (« entre dans le critère… »), montré à l'ouverture de la fiche. */
  const notice = ref<string | null>(null)
  /** Lot 22 : les échecs des actions de la page, dits près des lignes. */
  const pageAction = useAction('L’action a échoué.')
  const feedback = useFeedbackStore()

  /** Une autre fiche s'ouvre sur sa synthèse : l'onglet ne suit pas. */
  function open(id: string, tab?: ListingTab): void {
    void router.push({
      name: 'listing',
      params: { id },
      query: {
        ...withoutListingTab(route.query),
        ...listingTabQuery(tab ?? 'synthese'),
      },
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

  /** Lot 21 : changer d'étape referme les hors critères et les filtres ouverts restent. */
  function selectStage(next: WorkflowStage): void {
    store.setStage(next)
    showAllArchives.value = false
    pageAction.clear()
  }

  const mutations = useListingMutations()

  /** Ce que fait le bouton d'une ligne. */
  function onRowAction(row: StageRowView): void {
    pageAction.clear()
    switch (row.action.kind) {
      case 'sort':
        void router.push({
          name: 'triage',
          query: { etape: stage.value, carte: row.id },
        })
        return
      case 'confirm':
        void router.push({
          name: 'triage',
          query: { mode: 'confirmer', carte: row.decision?.id ?? row.id },
        })
        return
      case 'settle':
        void router.push({ name: 'settle' })
        return
      case 'rescue':
        void rescue(row)
        return
      default:
        open(row.id, tabOfAction(row.action.kind) ?? 'synthese')
    }
  }

  /**
   * « Repêcher » : un fait, appliqué tout de suite, retour À étudier ou À
   * valider. Lot 22 : « Annuler » le remet aux archives comme il était
   * (même statut, même raison), par les mêmes routes.
   */
  async function rescue(row: StageRowView): Promise<void> {
    if (row.kind === 'draft') {
      const before = dismissedOf(row.id)
      await pageAction.run(
        () =>
          draftQueries.decide.mutateAsync({
            id: row.id,
            decision: { status: 'pending' },
          }),
        {
          success: `« ${row.title} » revient À valider.`,
          undo: () =>
            draftQueries.decide.mutateAsync({
              id: row.id,
              decision: before?.dismissReason
                ? { status: 'dismissed', reason: before.dismissReason }
                : { status: 'dismissed' },
            }),
        }
      )
      return
    }
    const before = items.value.find(i => i.listing.id === row.id)?.listing
    const options: ActionOptions<unknown> = {
      success: `« ${row.title} » revient À étudier.`,
    }
    if (before) {
      options.undo = async () => {
        const saved = await mutations.setStatus.mutateAsync({
          id: row.id,
          change: {
            status: before.status,
            reason: before.discardReason,
            expectedStatus: 'to_study',
          },
        })
        // À plusieurs, écarter de nouveau est une proposition.
        if (saved?.decision && saved.listing.status !== before.status) {
          feedback.notify(
            `« ${row.title} » : la remise aux archives est proposée aux autres membres.`,
            { tone: 'info' }
          )
        }
      }
    }
    await pageAction.run(
      () =>
        mutations.setStatus.mutateAsync({
          id: row.id,
          change: { status: 'to_study', reason: null },
        }),
      options
    )
  }

  const draftsExpandedId = ref<string | null>(null)

  /** Le bouton principal d'une étape. */
  const ctaLabel = computed(() => {
    const count = stageCount.value
    if (!count) return null
    return stageCta(
      stage.value,
      count.toSort,
      rows.value.filter(r => r.rowKind === 'no_date').length,
      rows.value.filter(r => r.rowKind === 'to_rate').length
    )
  })
  function runCta(): void {
    if (stage.value === 'a-valider' || stage.value === 'a-etudier') {
      void router.push({ name: 'triage', query: { etape: stage.value } })
      return
    }
    const kind = stage.value === 'a-visiter' ? 'no_date' : 'to_rate'
    const first = rows.value.find(r => r.rowKind === kind)
    if (first) onRowAction(first)
  }

  /** Les propositions de cette étape qui attendent ma réponse. */
  const toConfirm = computed(
    () =>
      (overview.value?.proposals ?? []).filter(
        p =>
          p.viewer.canRespond &&
          decisionRowKind(p) === 'to_confirm' &&
          stageOfDecision(p) === stage.value
      ).length
  )

  const outDraftRows = computed(() =>
    filteredDrafts.value
      .filter(d => isFoldedOut(d.fit, d.decision))
      .map(d => ({
        id: d.id,
        title: d.listing.title,
        why: outReasonOfDraft(d),
      }))
  )

  const stageEmpty = computed(
    () =>
      !draftsStage.value &&
      !isPending.value &&
      !error.value &&
      rows.value.length === 0
  )
  /** Lot 22 : les filtres actifs sont nommés quand l'étape paraît vide. */
  const filtered = computed(() => store.activeCount > 0)
  const COLOR_OPTIONS = [
    { value: 'verdict', label: 'par verdict' },
    { value: 'status', label: 'par statut' },
  ]
</script>

<template>
  <section class="mx-auto grid max-w-7xl min-w-0 gap-3.5 px-4 py-5">
    <header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div>
        <h1 class="font-display text-3xl font-bold">Annonces</h1>
        <p
          v-if="isFetching && !isPending"
          class="text-sm text-muted"
          aria-live="polite"
        >
          actualisation…
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <ExportMenu :filters="draftsStage ? store.apiFilters() : listFilters" />
        <UiButton
          :to="{ name: 'listing-new', query: withoutListingTab(route.query) }"
          variant="primary"
          icon="plus"
        >
          Ajouter
        </UiButton>
      </div>
    </header>

    <WorkflowAgenda :items="overview?.agenda ?? []" @stage="selectStage" />

    <StageBar :stages="stages" :current="stage" @select="selectStage" />
    <UiAlert
      v-if="overviewFailed"
      tone="warn"
      retry
      :retrying="overviewQuery.isFetching?.value ?? false"
      data-testid="overview-error"
      @retry="overviewQuery.refetch?.()"
    >
      Les compteurs des étapes et « Ce qui t’attend » n’ont pas pu être lus :
      les chiffres affichés sont peut-être faux.
    </UiAlert>

    <div
      class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5"
      data-testid="stage-head"
    >
      <div class="flex min-w-0 flex-[1_1_380px] flex-col gap-0.5">
        <h2 class="font-display text-xl font-bold" data-testid="stage-question">
          {{ WORKFLOW_STAGE_QUESTIONS[stage] }}
        </h2>
        <p class="text-sm text-muted">{{ WORKFLOW_STAGE_INTROS[stage] }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UiButton
          icon="filter"
          :aria-expanded="filtersOpen"
          data-testid="filters-toggle"
          @click="filtersOpen = !filtersOpen"
        >
          Filtres<template v-if="store.activeCount">
            ({{ store.activeCount }})</template
          >
        </UiButton>
        <ViewSwitch v-model="store.view" />
        <UiField
          v-if="store.view === 'map'"
          id="map-color-by"
          v-model="colorBy"
          as="select"
          label="Couleur des repères"
          sr-label
          :options="COLOR_OPTIONS"
        />
        <UiButton
          v-if="toConfirm > 0"
          :to="{ name: 'triage', query: { mode: 'confirmer' } }"
          variant="outline"
          data-testid="stage-confirm"
          >{{ confirmLabel(toConfirm) }}</UiButton
        >
        <UiButton
          v-if="ctaLabel"
          variant="primary"
          class="min-h-13! w-full sm:min-h-11! sm:w-auto"
          data-testid="stage-cta"
          @click="runCta"
        >
          {{ ctaLabel }}
        </UiButton>
      </div>
    </div>

    <div v-if="filtersOpen" class="grid gap-2" data-testid="filters-panel">
      <FiltersBar
        :communes="communes"
        :criteria="criteria"
        :drafts-only="draftsStage"
      />
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
      <UiButton
        v-if="!draftsStage"
        variant="link"
        class="w-fit"
        data-testid="full-table"
        @click="store.view = store.view === 'table' ? 'list' : 'table'"
      >
        {{
          store.view === 'table'
            ? 'Revenir à la liste'
            : 'Voir le tableau complet (toutes les colonnes, comparer)'
        }}
      </UiButton>
    </div>

    <template v-if="draftsStage && store.view !== 'map'">
      <DraftsTab
        :view="store.view === 'cards' ? 'cards' : 'list'"
        :drafts="sortedDrafts"
        :keep-order="draftsKeepOrder"
        :agreement="agreement"
        :expanded="draftsExpandedId"
        :filtered="filtered"
        @update:expanded="draftsExpandedId = $event"
        @clear-filters="store.reset()"
      />
      <OutOfCriteria
        :label="outLabel('draft', outDraftRows.length)"
        :rows="outDraftRows"
        :default-open="outOpenByDefault"
        @open="id => (draftsExpandedId = id)"
      />
    </template>
    <template v-else-if="draftsStage">
      <ListingsMap
        v-model:toggles="toggles"
        :items="mapItems"
        :near="store.filters.near"
        :color-by="colorBy"
        :layers="mapLayers"
        :areas="null"
        @open="
          id => {
            draftsExpandedId = id
            store.view = 'list'
          }
        "
        @update:near="onNear"
        @bounds="value => (bbox = value)"
      />
    </template>
    <QueryState
      v-else
      :query="listQuery"
      :pending="switching"
      :skeleton="store.view === 'cards' ? 'cards' : 'rows'"
      loading-label="les annonces"
      error-fallback="Impossible de lire les annonces."
    >
      <UiCard
        v-if="stageEmpty && !switching"
        padding="sm"
        class="grid gap-2 text-sm"
        data-testid="stage-empty"
      >
        <p class="text-muted">{{ STAGE_EMPTY_TEXT[stage] }}</p>
        <template v-if="filtered">
          <p class="text-muted" data-testid="stage-empty-filters">
            Des filtres sont actifs ({{ store.activeCount }}) : ils cachent
            peut-être des annonces de cette étape.
          </p>
          <UiButton
            size="sm"
            class="w-fit"
            data-testid="clear-filters"
            @click="store.reset()"
            >Effacer les filtres</UiButton
          >
        </template>
      </UiCard>
      <UiAlert v-if="pageAction.error.value" data-testid="page-failure">
        {{ pageAction.error.value }}
      </UiAlert>
      <StageRows
        v-if="store.view === 'list'"
        :rows="visibleRows"
        :expanded="expandedDismissedIds"
        @open="openRow"
        @action="onRowAction"
      >
        <template #expanded="{ row }">
          <div class="flex flex-col gap-2.5">
            <UiButton
              v-if="dismissedOf(row.id)?.url"
              :href="dismissedOf(row.id)?.url ?? undefined"
              variant="link"
              icon-right="external"
              class="w-fit font-semibold"
              target="_blank"
              rel="noopener noreferrer"
              >Voir l’annonce en ligne
              <span class="sr-only">(nouvel onglet)</span></UiButton
            >
            <PropertyFacts
              v-if="dismissedOf(row.id)"
              v-model:open="factsOpen"
              :facts="propertyFacts(dismissedOf(row.id)!.listing)"
              :description="dismissedOf(row.id)!.listing.description"
            />
          </div>
        </template>
      </StageRows>
      <ListingsTable
        v-else-if="store.view === 'table'"
        :items="items"
        :members="activeMembers"
        :me-id="me?.id ?? null"
        @open="open"
        @compare="compare"
      />
      <ListingCards
        v-else-if="store.view === 'cards'"
        :items="mainItems"
        @open="open"
      />
      <ListingsMap
        v-else
        v-model:toggles="toggles"
        :items="mapItems"
        :near="store.filters.near"
        :color-by="colorBy"
        :layers="mapLayers"
        :areas="listingAreas.data.value ?? null"
        @open="open"
        @update:near="onNear"
        @bounds="value => (bbox = value)"
      />
      <section
        v-if="
          (store.view === 'table' || store.view === 'cards') &&
          dismissedRows.length
        "
        class="grid gap-2"
        data-testid="dismissed-drafts"
      >
        <h3 class="text-base font-semibold">Écartées à l’étape À valider</h3>
        <StageRows
          :rows="dismissedRows"
          :expanded="expandedDismissedIds"
          @open="openRow"
          @action="onRowAction"
        >
          <template #expanded="{ row }">
            <PropertyFacts
              v-if="dismissedOf(row.id)"
              v-model:open="factsOpen"
              :facts="propertyFacts(dismissedOf(row.id)!.listing)"
              :description="dismissedOf(row.id)!.listing.description"
            />
          </template>
        </StageRows>
      </section>
      <UiButton
        v-if="store.view === 'list' && hiddenArchives > 0"
        variant="link"
        class="w-fit"
        data-testid="archives-more"
        @click="showAllArchives = true"
      >
        {{
          hiddenArchives > 1
            ? `Voir les ${hiddenArchives} autres`
            : 'Voir l’autre'
        }}
      </UiButton>
      <OutOfCriteria
        v-if="store.view !== 'table'"
        :label="outLabel('listing', outRows.length)"
        :rows="outRows"
        :default-open="outOpenByDefault"
        @open="open"
      />
    </QueryState>

    <p
      v-if="store.view === 'table' && !draftsStage"
      class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"
    >
      <span
        ><UiBadge tone="good">Cible</UiBadge> rendement brut ≥ seuil, effort ≤
        maximum, DPE A à D</span
      >
      <span
        ><UiBadge tone="warn">À creuser</UiBadge> un critère manque de peu</span
      >
      <span
        ><UiBadge tone="bad">Hors cible</UiBadge> rendement trop faible, DPE E à
        G ou effort trop lourd</span
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
