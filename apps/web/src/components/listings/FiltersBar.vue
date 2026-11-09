<script setup lang="ts">
  import { computed } from 'vue'
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
  import { formatDistance, parseNumberInput } from '@/lib/format'
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
    }>(),
    { criteria: () => [] }
  )

  const store = useFiltersStore()
  const verdicts = VerdictSchema.options
  const dpeClasses = DpeClassSchema.options
  const precisions = LocationPrecisionFilterSchema.options
  const sorts = ListingSortSchema.options

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

  function onPriceMax(event: Event): void {
    const value = parseNumberInput((event.target as HTMLInputElement).value)
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
    class="grid gap-3 rounded-xl border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4"
    aria-label="Filtres"
  >
    <div class="grid gap-1">
      <label for="f-search" class="text-xs font-medium text-muted"
        >Rechercher</label
      >
      <input
        id="f-search"
        type="search"
        class="rounded-lg border border-line bg-bg px-3 py-1.5 text-sm"
        placeholder="Titre, quartier, agence, référence…"
        :value="store.filters.search ?? ''"
        @change="onSearch"
      />
    </div>
    <div class="grid gap-1">
      <label for="f-commune" class="text-xs font-medium text-muted"
        >Commune</label
      >
      <select
        id="f-commune"
        class="rounded-lg border border-line bg-bg px-3 py-1.5 text-sm"
        :value="store.filters.commune?.[0] ?? ''"
        @change="onCommune"
      >
        <option value="">Toutes</option>
        <option v-for="commune in communeOptions" :key="commune">
          {{ commune }}
        </option>
      </select>
    </div>
    <div class="grid gap-1">
      <label for="f-criteria" class="text-xs font-medium text-muted"
        >Critère enregistré</label
      >
      <select
        id="f-criteria"
        class="rounded-lg border border-line bg-bg px-3 py-1.5 text-sm"
        :value="store.filters.criteriaId ?? ''"
        @change="onCriteria"
      >
        <option value="">Aucun</option>
        <option v-for="c in props.criteria" :key="c.id" :value="c.id">
          {{ c.name }} ({{ c.listingCount }})
        </option>
      </select>
    </div>
    <div class="grid gap-1">
      <label for="f-price-max" class="text-xs font-medium text-muted"
        >Prix maximal (€)</label
      >
      <input
        id="f-price-max"
        type="number"
        min="0"
        step="5000"
        class="rounded-lg border border-line bg-bg px-3 py-1.5 text-sm"
        :value="store.filters.priceMax ?? ''"
        @change="onPriceMax"
      />
    </div>
    <div class="grid gap-1">
      <label for="f-sort" class="text-xs font-medium text-muted"
        >Trier par</label
      >
      <select
        id="f-sort"
        class="rounded-lg border border-line bg-bg px-3 py-1.5 text-sm"
        :value="store.filters.sort"
        @change="onSort"
      >
        <option v-for="sort in sorts" :key="sort" :value="sort">
          {{ SORT_LABELS[sort] }}
        </option>
      </select>
    </div>

    <div class="grid gap-1 sm:col-span-2">
      <span class="text-xs font-medium text-muted">Verdict</span>
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Verdicts">
        <button
          v-for="verdict in verdicts"
          :key="verdict"
          type="button"
          class="rounded-full border px-2.5 py-0.5 text-xs"
          :class="
            store.filters.verdict?.includes(verdict)
              ? 'border-accent bg-accent-soft text-fg'
              : 'border-line text-muted hover:text-fg'
          "
          :aria-pressed="store.filters.verdict?.includes(verdict) ?? false"
          @click="toggleVerdict(verdict)"
        >
          {{ VERDICT_LABELS[verdict] }}
        </button>
      </div>
    </div>

    <div class="grid gap-1">
      <span class="text-xs font-medium text-muted">DPE</span>
      <div class="flex flex-wrap gap-1" role="group" aria-label="Classes DPE">
        <button
          v-for="dpe in dpeClasses"
          :key="dpe"
          type="button"
          class="h-6 w-6 rounded border font-mono text-xs"
          :class="
            store.filters.dpe?.includes(dpe)
              ? 'border-accent bg-accent-soft text-fg'
              : 'border-line text-muted hover:text-fg'
          "
          :aria-pressed="store.filters.dpe?.includes(dpe) ?? false"
          @click="toggleDpe(dpe)"
        >
          {{ dpe }}
        </button>
      </div>
    </div>

    <div class="grid gap-1 sm:col-span-2 lg:col-span-1">
      <span id="f-seller-label" class="text-xs font-medium text-muted"
        >Vendeur</span
      >
      <div
        class="flex flex-wrap gap-1.5"
        role="group"
        aria-labelledby="f-seller-label"
        data-testid="filter-seller"
      >
        <button
          v-for="option in SELLER_FILTER_CHOICES"
          :key="option.choice"
          type="button"
          class="rounded-full border px-2.5 py-0.5 text-xs"
          :class="
            sellerChoice === option.choice
              ? 'border-accent bg-accent-soft text-fg'
              : 'border-line text-muted hover:text-fg'
          "
          :aria-pressed="sellerChoice === option.choice"
          :data-seller="option.choice"
          @click="store.setSellerChoice(option.choice)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <div class="grid gap-1 sm:col-span-2 lg:col-span-2">
      <span id="f-opinions-label" class="text-xs font-medium text-muted"
        >Avis</span
      >
      <div
        class="flex flex-wrap gap-1.5"
        role="group"
        aria-labelledby="f-opinions-label"
        data-testid="filter-opinions"
      >
        <button
          v-for="option in OPINION_CHOICES"
          :key="option.label"
          type="button"
          class="inline-flex min-h-11 items-center rounded-full border px-3 text-xs sm:min-h-8"
          :class="
            store.filters.opinions === option.value
              ? 'border-accent bg-accent-soft text-fg'
              : 'border-line text-muted hover:text-fg'
          "
          :aria-pressed="store.filters.opinions === option.value"
          :data-opinions="option.value ?? 'all'"
          @click="store.patch({ opinions: option.value })"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <div class="grid gap-1 sm:col-span-2 lg:col-span-2">
      <span class="text-xs font-medium text-muted">Repère</span>
      <div
        class="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Précision du repère"
      >
        <button
          v-for="precision in precisions"
          :key="precision"
          type="button"
          class="rounded-full border px-2.5 py-0.5 text-xs"
          :class="
            store.filters.precision?.includes(precision)
              ? 'border-accent bg-accent-soft text-fg'
              : 'border-line text-muted hover:text-fg'
          "
          :aria-pressed="store.filters.precision?.includes(precision) ?? false"
          :data-precision="precision"
          @click="togglePrecision(precision)"
        >
          {{ LOCATION_PRECISION_LABELS[precision] }}
        </button>
      </div>
    </div>

    <div class="flex flex-wrap items-end gap-2">
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          class="accent-accent"
          :checked="store.filters.newForMe ?? false"
          @change="
            store.patch({
              newForMe:
                ($event.target as HTMLInputElement).checked || undefined,
            })
          "
        />
        Nouvelles pour moi
      </label>
      <label
        class="flex items-center gap-2 text-sm"
        :title="`Annonces actives sans vérification sur le portail depuis plus de ${DEFAULT_STALE_DAYS} jours (à défaut, depuis leur ajout)`"
      >
        <input
          type="checkbox"
          class="accent-accent"
          data-testid="filter-stale"
          :checked="store.filters.staleDays !== undefined"
          @change="
            store.patch({
              staleDays: ($event.target as HTMLInputElement).checked
                ? DEFAULT_STALE_DAYS
                : undefined,
            })
          "
        />
        À revérifier
      </label>
      <label
        class="flex items-center gap-2 text-sm"
        title="Annonces publiées sur au moins deux portails (lot 18)"
      >
        <input
          type="checkbox"
          class="accent-accent"
          data-testid="filter-multi-portal"
          :checked="store.filters.multiPortal ?? false"
          @change="
            store.patch({
              multiPortal:
                ($event.target as HTMLInputElement).checked || undefined,
            })
          "
        />
        Sur plusieurs portails
      </label>
      <button
        v-if="store.filters.near"
        type="button"
        class="rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-xs"
        title="Retirer le filtre par point et rayon"
        @click="store.setNear(undefined)"
      >
        Rayon {{ formatDistance(store.filters.near.radiusMeters) }} ✕
      </button>
      <button
        v-if="store.activeCount > 0"
        type="button"
        class="text-xs text-muted underline hover:text-fg"
        @click="store.reset()"
      >
        Effacer les filtres ({{ store.activeCount }})
      </button>
    </div>
  </section>
</template>
