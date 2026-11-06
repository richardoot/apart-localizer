<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type {
    EvaluatedListing,
    ListingStatus,
    Member,
  } from '@apart/contracts'
  import { useCriteriaFitHistory } from '@/composables/useListings'
  import { useListingChecks } from '@/composables/useListingChecks'
  import {
    TIMELINE_FILTERS,
    filterTimeline,
    historyFooter,
    listingTimeline,
    timelineCounts,
  } from '@/lib/listing-timeline'
  import type { TimelineFilter } from '@/lib/listing-timeline'
  import CheckActions from '../history/CheckActions.vue'
  import TimelineRow from '../history/TimelineRow.vue'
  import { useHistoryJournal } from '../history/useHistoryJournal'

  /**
   * Lot 19 (ADR 0029) : « Historique : que s'est-il passé ? ». Une seule
   * chronologie (`listingTimeline`) : le journal de l'annonce, ses
   * vérifications sur les portails, l'historique des prix, celui de
   * l'adéquation aux critères et les échanges avec l'annonceur, filtrée par
   * type (Prix, Vérifications, Échanges, Fiche). « Vérifier sur les
   * portails » ouvre les constats à la main du lot 15. En pied : l'ajout, la
   * source, les champs lus par l'IA, la dernière modification.
   */
  const props = defineProps<{ item: EvaluatedListing; members: Member[] }>()
  const emit = defineEmits<{ setStatus: [status: ListingStatus] }>()

  const listingId = computed(() => props.item.listing.id)
  const journal = useHistoryJournal(listingId)
  const checks = useListingChecks(listingId)
  const fit = useCriteriaFitHistory(listingId)

  const names = computed(
    () =>
      new Map(props.members.map(m => [m.id, { displayName: m.displayName }]))
  )
  const entries = computed(() =>
    listingTimeline({
      journal: journal.entries.value,
      checks: checks.data.value ?? [],
      priceEvents: props.item.priceEvents,
      fitHistory: fit.data.value?.items ?? [],
      memberNames: names.value,
    })
  )
  const filter = ref<TimelineFilter>('all')
  const shown = computed(() => filterTimeline(entries.value, filter.value))
  const counts = computed(() => timelineCounts(entries.value))
  const loading = computed(
    () => journal.isPending.value || checks.isPending.value
  )
  const checking = ref(false)
  const footer = computed(() =>
    historyFooter(props.item.listing, props.item.links)
  )

  const pill = (on: boolean) =>
    on
      ? 'border-accent bg-accent text-accent-fg'
      : 'border-line bg-surface text-fg hover:bg-surface-2'
</script>

<template>
  <div class="grid gap-4" data-testid="tab-history">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div
        role="group"
        aria-label="Filtrer l’historique"
        class="flex flex-wrap gap-1.5"
        data-testid="history-filters"
      >
        <button
          v-for="choice in TIMELINE_FILTERS"
          :key="choice.id"
          type="button"
          class="inline-flex min-h-11 items-center gap-1 rounded-full border-[1.5px] px-3.5 text-sm"
          :class="pill(filter === choice.id)"
          :aria-pressed="filter === choice.id"
          :data-filter="choice.id"
          @click="filter = choice.id"
        >
          {{ choice.label
          }}<span class="text-xs opacity-80">({{ counts[choice.id] }})</span>
        </button>
      </div>
      <button
        type="button"
        class="inline-flex min-h-11 items-center rounded-lg border border-accent bg-surface px-3.5 text-sm font-semibold text-accent hover:bg-accent-soft"
        :aria-expanded="checking"
        aria-controls="history-check-actions"
        data-testid="history-check"
        @click="checking = !checking"
      >
        Vérifier sur les portails
      </button>
    </div>

    <div id="history-check-actions" :hidden="!checking">
      <CheckActions
        v-if="checking"
        :listing-id="item.listing.id"
        :status="item.listing.status"
        :updated-at="item.listing.updatedAt"
        :created-at="item.listing.createdAt"
        :last-checked-at="item.listing.lastCheckedAt"
        :last-seen-online-at="item.listing.lastSeenOnlineAt"
        :url="item.listing.url"
        :links="item.links"
        @set-status="status => emit('setStatus', status)"
      />
    </div>

    <section
      class="rounded-2xl border border-line bg-surface px-4 pt-1 pb-2 sm:px-5"
      aria-labelledby="history-title"
    >
      <h2 id="history-title" class="sr-only">Chronologie</h2>
      <p
        v-if="journal.error.value"
        role="alert"
        class="my-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
      >
        {{ journal.error.value.message }}
      </p>
      <p v-else-if="loading" class="py-4 text-sm text-muted">
        Chargement de l’historique…
      </p>
      <template v-else>
        <ol v-if="shown.length" data-testid="timeline">
          <TimelineRow
            v-for="(entry, index) in shown"
            :key="entry.key"
            :entry="entry"
            :first="index === 0"
          />
        </ol>
        <p v-else class="py-4 text-sm text-muted" data-testid="timeline-empty">
          Rien de ce type pour cette annonce.
        </p>
        <div
          v-if="journal.hasMore.value"
          class="flex justify-center border-t border-line pt-2"
        >
          <button
            type="button"
            class="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-accent hover:underline disabled:opacity-60"
            :disabled="journal.isFetching.value"
            data-testid="history-more"
            @click="journal.loadMore()"
          >
            Plus anciens
          </button>
        </div>
      </template>
    </section>

    <p class="text-sm text-muted" data-testid="history-footer">{{ footer }}</p>
  </div>
</template>
