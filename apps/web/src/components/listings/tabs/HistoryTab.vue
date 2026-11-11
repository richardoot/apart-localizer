<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type {
    EvaluatedListing,
    ListingStatus,
    Member,
  } from '@apart/contracts'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import UiChip from '@/components/ui/UiChip.vue'
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
  const checking = ref(false)
  const footer = computed(() =>
    historyFooter(props.item.listing, props.item.links)
  )
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
        <UiChip
          v-for="choice in TIMELINE_FILTERS"
          :key="choice.id"
          :selected="filter === choice.id"
          :count="counts[choice.id]"
          :data-filter="choice.id"
          @click="filter = choice.id"
        >
          {{ choice.label }}
        </UiChip>
      </div>
      <UiButton
        variant="outline"
        :aria-expanded="checking"
        aria-controls="history-check-actions"
        data-testid="history-check"
        @click="checking = !checking"
      >
        Vérifier sur les portails
      </UiButton>
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

    <UiCard class="pt-1 pb-2" aria-labelledby="history-title">
      <h2 id="history-title" class="sr-only">Chronologie</h2>
      <QueryState
        :query="[journal, checks]"
        :empty="shown.length === 0"
        :empty-text="
          filter === 'all'
            ? 'Rien dans l’historique de cette annonce pour l’instant.'
            : 'Rien de ce type pour cette annonce : choisis « Tout » pour voir le reste.'
        "
        skeleton="lines"
        :skeleton-count="4"
        loading-label="l’historique"
        class="py-3"
      >
        <template #empty>
          <p class="py-4 text-sm text-muted" data-testid="timeline-empty">
            {{
              filter === 'all'
                ? 'Rien dans l’historique de cette annonce pour l’instant.'
                : 'Rien de ce type pour cette annonce : choisis « Tout » pour voir le reste.'
            }}
          </p>
        </template>
        <ol data-testid="timeline">
          <TimelineRow
            v-for="(entry, index) in shown"
            :key="entry.key"
            :entry="entry"
            :first="index === 0"
          />
        </ol>
        <div
          v-if="journal.hasMore.value"
          class="flex justify-center border-t border-line pt-2"
        >
          <UiButton
            variant="ghost"
            class="font-semibold text-accent"
            :loading="journal.isFetching.value"
            data-testid="history-more"
            @click="journal.loadMore()"
          >
            Plus anciens
          </UiButton>
        </div>
      </QueryState>
    </UiCard>

    <p class="text-sm text-muted" data-testid="history-footer">{{ footer }}</p>
  </div>
</template>
