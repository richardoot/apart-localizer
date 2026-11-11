<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import {
    DEFAULT_STALE_DAYS,
    DpeClassSchema,
    LOCATION_PRECISION_LABELS,
    ListingSortSchema,
    LocationPrecisionFilterSchema,
    OPINIONS_FILTER_LABELS,
    VerdictSchema,
  } from '@apart/contracts'
  import type {
    DpeClass,
    ListingSort,
    LocationPrecisionFilter,
    OpinionsFilter,
    SearchCriteriaSummary,
    Verdict,
  } from '@apart/contracts'
  import { SORT_LABELS, VERDICT_LABELS } from '@/lib/labels'
  import {
    formatDistance,
    numberInputError,
    parseNumberInput,
  } from '@/lib/format'
  import { cardClasses } from '@/lib/ui'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiChip from '@/components/ui/UiChip.vue'
  import UiField from '@/components/ui/UiField.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import { DRAFT_SORTS } from '@/lib/workflow'
  import {
    SELLER_FILTER_CHOICES,
    sellerChoiceOf,
    useFiltersStore,
  } from '@/stores/filters'

  const props = withDefaults(
    defineProps<{
      /** Les communes présentes dans l'espace, pour le sélecteur. */
      communes: readonly string[]
      /** Les critères de recherche de l'espace, pour le sélecteur. */
      criteria?: readonly SearchCriteriaSummary[]
      /** Lot 21 : À valider : seulement ce qui existe pour un brouillon. */
      draftsOnly?: boolean
    }>(),
    { criteria: () => [], draftsOnly: false }
  )

  const store = useFiltersStore()
  const verdicts = VerdictSchema.options
  const dpeClasses = DpeClassSchema.options
  const precisions = LocationPrecisionFilterSchema.options
  const sorts = computed(() =>
    props.draftsOnly ? DRAFT_SORTS : ListingSortSchema.options
  )
  /** Un tri d'une autre étape, sans objet ici, s'affiche comme le tri par défaut. */
  const shownSort = computed(() =>
    sorts.value.includes(store.filters.sort) ? store.filters.sort : 'score'
  )

  function toggleVerdict(verdict: Verdict): void {
    const current = store.filters.verdict ?? []
    const next = current.includes(verdict)
      ? current.filter(v => v !== verdict)
      : [...current, verdict]
    store.patch({ verdict: next.length ? next : undefined })
  }

  function toggleDpe(dpe: DpeClass): void {
    const current = store.filters.dpe ?? []
    const next = current.includes(dpe)
      ? current.filter(d => d !== dpe)
      : [...current, dpe]
    store.patch({ dpe: next.length ? next : undefined })
  }

  /** Lot 12 : annonces exactement localisées ou génériques (quartier, commune). */
  function togglePrecision(precision: LocationPrecisionFilter): void {
    const current = store.filters.precision ?? []
    const next = current.includes(precision)
      ? current.filter(p => p !== precision)
      : [...current, precision]
    store.patch({ precision: next.length ? next : undefined })
  }

  function onCommune(event: Event): void {
    const value = (event.target as HTMLSelectElement).value
    store.patch({ commune: value ? [value] : undefined })
  }

  function onCriteria(event: Event): void {
    const value = (event.target as HTMLSelectElement).value
    store.patch({ criteriaId: value || undefined })
  }

  function onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim()
    store.patch({ search: value || undefined })
  }

  /**
   * Lot 22 : le prix maximal se tape librement ; un nombre illisible
   * (« 250k ») est refusé au champ et le filtre reste tel qu'il était,
   * jamais « pas de filtre » en silence.
   */
  const priceText = ref(
    store.filters.priceMax === undefined ? '' : String(store.filters.priceMax)
  )
  const priceError = ref<string | null>(null)
  watch(
    () => store.filters.priceMax,
    value => {
      if (parseNumberInput(priceText.value) === (value ?? null)) return
      priceText.value = value === undefined ? '' : String(value)
      priceError.value = null
    }
  )
  function onPriceMax(): void {
    priceError.value = numberInputError(priceText.value)
    if (priceError.value) return
    const value = parseNumberInput(priceText.value)
    store.patch({ priceMax: value ?? undefined })
  }

  function onSort(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as ListingSort
    store.setSort(value, defaultOrder(value))
  }

  /** Le sens naturel d'un tri : les plus petits prix et efforts d'abord. */
  function defaultOrder(sort: ListingSort): 'asc' | 'desc' {
    return sort === 'price' ||
      sort === 'pricePerM2' ||
      sort === 'discount' ||
      sort === 'lastCheckedAt'
      ? 'asc'
      : sort === 'effort'
        ? 'desc'
        : 'desc'
  }

  /**
   * Lot 20 : « Avis » : toutes, « À rediscuter » (un désaccord de 2 points ou
   * plus), « Avis en attente » (un avis manque ou est masqué pour moi).
   */
  const OPINION_CHOICES: ReadonlyArray<{
    value: OpinionsFilter | undefined
    label: string
  }> = [
    { value: undefined, label: 'Toutes' },
    { value: 'to_discuss', label: OPINIONS_FILTER_LABELS.to_discuss },
    { value: 'pending', label: OPINIONS_FILTER_LABELS.pending },
  ]

  /** Lot 18 : le choix « Vendeur » courant. */
  const sellerChoice = computed(() => sellerChoiceOf(store.filters.sellerType))

  const communeOptions = computed(() =>
    [...props.communes].sort((a, b) => a.localeCompare(b, 'fr'))
  )
</script>

<template>
  <section
    class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    :class="cardClasses('default', 'sm')"
    aria-label="Filtres"
  >
    <UiField
      id="f-search"
      label="Rechercher"
      type="search"
      align="left"
      placeholder="Titre, quartier, agence, référence…"
      :model-value="store.filters.search ?? ''"
      @change="onSearch"
    />
    <UiField
      id="f-commune"
      label="Commune"
      as="select"
      :model-value="store.filters.commune?.[0] ?? ''"
      :options="[
        { value: '', label: 'Toutes' },
        ...communeOptions.map(commune => ({ value: commune, label: commune })),
      ]"
      @change="onCommune"
    />
    <UiField
      id="f-criteria"
      label="Critère enregistré"
      as="select"
      :model-value="store.filters.criteriaId ?? ''"
      :options="[
        { value: '', label: 'Aucun' },
        ...props.criteria.map(c => ({
          value: c.id,
          label: `${c.name} (${c.listingCount})`,
        })),
      ]"
      @change="onCriteria"
    />
    <UiField
      id="f-price-max"
      v-model="priceText"
      label="Prix maximal"
      unit="€"
      inputmode="numeric"
      :error="priceError"
      @change="onPriceMax"
    />
    <UiField
      id="f-sort"
      label="Trier par"
      as="select"
      :model-value="shownSort"
      :options="sorts.map(sort => ({ value: sort, label: SORT_LABELS[sort] }))"
      @change="onSort"
    />

    <div class="grid content-start gap-1.5 sm:col-span-2">
      <span id="f-verdict-label" class="text-sm font-semibold"
        >Rentabilité</span
      >
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Rentabilité">
        <UiChip
          v-for="verdict in verdicts"
          :key="verdict"
          :selected="store.filters.verdict?.includes(verdict) ?? false"
          @click="toggleVerdict(verdict)"
        >
          {{ VERDICT_LABELS[verdict] }}
        </UiChip>
      </div>
    </div>

    <div class="grid content-start gap-1.5">
      <span class="text-sm font-semibold">DPE</span>
      <div class="flex flex-wrap gap-1" role="group" aria-label="Classes DPE">
        <UiChip
          v-for="dpe in dpeClasses"
          :key="dpe"
          class="min-w-11 justify-center px-2! font-mono sm:min-w-8"
          :selected="store.filters.dpe?.includes(dpe) ?? false"
          @click="toggleDpe(dpe)"
        >
          {{ dpe }}
        </UiChip>
      </div>
    </div>

    <div class="grid content-start gap-1.5 sm:col-span-2 lg:col-span-1">
      <span id="f-seller-label" class="text-sm font-semibold">Vendeur</span>
      <div
        class="flex flex-wrap gap-1.5"
        role="group"
        aria-labelledby="f-seller-label"
        data-testid="filter-seller"
      >
        <UiChip
          v-for="option in SELLER_FILTER_CHOICES"
          :key="option.choice"
          :selected="sellerChoice === option.choice"
          :data-seller="option.choice"
          @click="store.setSellerChoice(option.choice)"
        >
          {{ option.label }}
        </UiChip>
      </div>
    </div>

    <div
      v-if="!draftsOnly"
      class="grid content-start gap-1.5 sm:col-span-2 lg:col-span-2"
    >
      <span id="f-opinions-label" class="text-sm font-semibold">Avis</span>
      <div
        class="flex flex-wrap gap-1.5"
        role="group"
        aria-labelledby="f-opinions-label"
        data-testid="filter-opinions"
      >
        <UiChip
          v-for="option in OPINION_CHOICES"
          :key="option.label"
          :selected="store.filters.opinions === option.value"
          :data-opinions="option.value ?? 'all'"
          @click="store.patch({ opinions: option.value })"
        >
          {{ option.label }}
        </UiChip>
      </div>
    </div>

    <div class="grid content-start gap-1.5 sm:col-span-2 lg:col-span-2">
      <span class="text-sm font-semibold">Repère</span>
      <div
        class="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Précision du repère"
      >
        <UiChip
          v-for="precision in precisions"
          :key="precision"
          :selected="store.filters.precision?.includes(precision) ?? false"
          :data-precision="precision"
          @click="togglePrecision(precision)"
        >
          {{ LOCATION_PRECISION_LABELS[precision] }}
        </UiChip>
      </div>
    </div>

    <div class="flex flex-wrap items-end gap-x-4 gap-y-1 sm:col-span-2">
      <UiCheckbox
        v-if="!draftsOnly"
        label="Nouvelles pour moi"
        :model-value="store.filters.newForMe ?? false"
        @update:model-value="
          value => store.patch({ newForMe: value === true || undefined })
        "
      />
      <UiCheckbox
        v-if="!draftsOnly"
        label="À revérifier"
        :hint="`Pas vue sur le portail depuis plus de ${DEFAULT_STALE_DAYS} jours`"
        data-testid="filter-stale"
        :model-value="store.filters.staleDays !== undefined"
        @update:model-value="
          value =>
            store.patch({
              staleDays: value === true ? DEFAULT_STALE_DAYS : undefined,
            })
        "
      />
      <UiCheckbox
        v-if="!draftsOnly"
        label="Sur plusieurs portails"
        data-testid="filter-multi-portal"
        :model-value="store.filters.multiPortal ?? false"
        @update:model-value="
          value => store.patch({ multiPortal: value === true || undefined })
        "
      />
      <UiChip
        v-if="store.filters.near"
        selected
        :toggle="false"
        title="Retirer le filtre par point et rayon"
        :aria-label="`Retirer le filtre : rayon de ${formatDistance(store.filters.near.radiusMeters)}`"
        @click="store.setNear(undefined)"
      >
        Rayon {{ formatDistance(store.filters.near.radiusMeters) }}
        <UiIcon name="close" />
      </UiChip>
      <UiButton
        v-if="store.activeCount > 0"
        variant="link"
        size="sm"
        @click="store.reset()"
      >
        Effacer les filtres ({{ store.activeCount }})
      </UiButton>
    </div>
  </section>
</template>
