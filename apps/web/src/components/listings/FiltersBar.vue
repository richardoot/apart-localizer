<script setup lang="ts">
  import { computed } from 'vue'
  import {
    ACTIVE_LISTING_STATUSES,
    DEFAULT_STALE_DAYS,
    DpeClassSchema,
    LOCATION_PRECISION_LABELS,
    ListingSortSchema,
    ListingStatusSchema,
    LocationPrecisionFilterSchema,
    VerdictSchema,
  } from '@apart/contracts'
  import type {
    DpeClass,
    ListingSort,
    LocationPrecisionFilter,
    SearchCriteriaSummary,
    Verdict,
  } from '@apart/contracts'
  import {
    LISTING_STATUS_LABELS,
    SORT_LABELS,
    VERDICT_LABELS,
  } from '@/lib/labels'
  import { formatDistance, parseNumberInput } from '@/lib/format'
  import { useFiltersStore } from '@/stores/filters'

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
  const statuses = ListingStatusSchema.options
  const verdicts = VerdictSchema.options
  const dpeClasses = DpeClassSchema.options
  const precisions = LocationPrecisionFilterSchema.options
  const sorts = ListingSortSchema.options

  const selectedStatuses = computed(
    () => store.filters.status ?? [...ACTIVE_LISTING_STATUSES]
  )
  const isActiveDefault = computed(() => store.filters.status === undefined)

  function toggleStatus(status: (typeof statuses)[number]): void {
    if (isActiveDefault.value) {
      // Partir de la sélection implicite (actives) plutôt que de rien.
      store.patch({ status: [...ACTIVE_LISTING_STATUSES] })
    }
    store.toggleStatus(status)
  }

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
        placeholder="Titre, commune, quartier, notes…"
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

    <div class="grid gap-1 sm:col-span-2 lg:col-span-4">
      <span class="text-xs font-medium text-muted">Statut</span>
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Statuts">
        <button
          v-for="status in statuses"
          :key="status"
          type="button"
          class="rounded-full border px-2.5 py-0.5 text-xs"
          :class="
            selectedStatuses.includes(status)
              ? 'border-accent bg-accent-soft text-fg'
              : 'border-line text-muted hover:text-fg'
          "
          :aria-pressed="selectedStatuses.includes(status)"
          :data-status="status"
          @click="toggleStatus(status)"
        >
          {{ LISTING_STATUS_LABELS[status] }}
        </button>
      </div>
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

    <div class="grid gap-1 sm:col-span-2 lg:col-span-4">
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
