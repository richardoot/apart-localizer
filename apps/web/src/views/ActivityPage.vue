<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    ACTIVITY_CHANNEL_LABELS,
    ACTIVITY_KIND_LABELS,
    ActivityChannelSchema,
    ActivityKindSchema,
  } from '@apart/contracts'
  import type { ActivityChannel, ActivityKind } from '@apart/contracts'
  import ActivityList from '@/components/activity/ActivityList.vue'
  import { useActivity } from '@/composables/useActivity'
  import { useWorkspace } from '@/composables/useWorkspace'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiField from '@/components/ui/UiField.vue'
  import { plural } from '@/lib/format'

  const router = useRouter()
  const { members } = useWorkspace()
  const memberId = ref('')
  const channel = ref<ActivityChannel | ''>('')
  const kind = ref<ActivityKind | ''>('')
  const page = ref(1)
  const filters = computed(() => ({
    ...(memberId.value ? { memberId: memberId.value } : {}),
    ...(channel.value ? { channel: channel.value } : {}),
    ...(kind.value ? { kind: kind.value } : {}),
    page: page.value,
    limit: 50,
  }))
  watch([memberId, channel, kind], () => {
    page.value = 1
  })
  const activity = useActivity(filters)
  const { data, isPending, isFetching } = activity
  const channels = ActivityChannelSchema.options
  const kinds = ActivityKindSchema.options
  const filtered = computed(
    () => !!memberId.value || !!channel.value || !!kind.value
  )
  function clearFilters(): void {
    memberId.value = ''
    channel.value = ''
    kind.value = ''
  }

  function open(listingId: string): void {
    void router.push({ name: 'listing', params: { id: listingId } })
  }
</script>

<template>
  <section class="mx-auto grid max-w-4xl gap-4 px-4 py-6">
    <header class="grid gap-1">
      <h1 class="font-display text-2xl font-bold">Activité</h1>
      <p class="text-sm text-muted">
        Qui a changé quoi, quand, et par quel canal (web, Claude, import,
        système).
        <template v-if="data">{{ plural(data.total, 'événement') }}.</template>
        <span v-if="isFetching && !isPending"> · actualisation…</span>
      </p>
    </header>
    <form
      class="grid gap-3 sm:grid-cols-3"
      aria-label="Filtres du journal"
      @submit.prevent
    >
      <UiField
        id="activity-member"
        v-model="memberId"
        as="select"
        label="Membre"
        quiet
        :options="[
          { value: '', label: 'Tous' },
          ...members.map(m => ({ value: m.id, label: m.displayName })),
        ]"
        data-testid="filter-member"
      />
      <UiField
        id="activity-channel"
        v-model="channel"
        as="select"
        label="Canal"
        quiet
        :options="[
          { value: '', label: 'Tous' },
          ...channels.map(c => ({
            value: c,
            label: ACTIVITY_CHANNEL_LABELS[c],
          })),
        ]"
        data-testid="filter-channel"
      />
      <UiField
        id="activity-kind"
        v-model="kind"
        as="select"
        label="Type"
        quiet
        :options="[
          { value: '', label: 'Tous' },
          ...kinds.map(k => ({ value: k, label: ACTIVITY_KIND_LABELS[k] })),
        ]"
        data-testid="filter-kind"
      />
    </form>
    <QueryState
      :query="activity"
      :empty="data?.items.length === 0"
      empty-title="Rien dans le journal."
      empty-text="Chaque changement fait par un membre ou par Claude s’inscrit ici."
      :filtered="filtered"
      skeleton="rows"
      loading-label="du journal"
      @clear-filters="clearFilters"
    >
      <template v-if="data">
        <ActivityList :entries="data.items" show-listing @open="open" />
        <nav
          v-if="data.pageCount > 1"
          class="flex items-center justify-between text-sm"
          aria-label="Pages"
        >
          <UiButton
            size="sm"
            icon="chevron-left"
            :disabled="page <= 1"
            @click="page -= 1"
          >
            Plus récents
          </UiButton>
          <span class="text-xs text-muted"
            >{{ page }} / {{ data.pageCount }}</span
          >
          <UiButton
            size="sm"
            icon-right="chevron-right"
            :disabled="page >= data.pageCount"
            @click="page += 1"
          >
            Plus anciens
          </UiButton>
        </nav>
      </template>
    </QueryState>
  </section>
</template>
