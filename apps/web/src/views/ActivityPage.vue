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
  const { data, isPending, isFetching, error } = useActivity(filters)
  const channels = ActivityChannelSchema.options
  const kinds = ActivityKindSchema.options
  const selectClass = 'rounded-lg border border-line bg-bg px-2 py-1.5 text-sm'

  function open(listingId: string): void {
    void router.push({ name: 'listing', params: { id: listingId } })
  }
</script>

<template>
  <section class="mx-auto grid max-w-4xl gap-4 px-4 py-6">
    <header class="grid gap-1">
      <h1 class="font-display text-2xl font-bold">Activité</h1>
      <p class="text-sm text-muted">
        Qui a changé quoi, quand, et par quel canal (web, Claude au MCP, import,
        système).
        <template v-if="data">{{ data.total }} événement(s).</template>
        <span v-if="isFetching && !isPending"> · actualisation…</span>
      </p>
    </header>
    <form
      class="flex flex-wrap gap-2"
      aria-label="Filtres du journal"
      @submit.prevent
    >
      <label class="grid gap-1 text-xs text-muted">
        Membre
        <select
          v-model="memberId"
          :class="selectClass"
          data-testid="filter-member"
        >
          <option value="">Tous</option>
          <option v-for="m in members" :key="m.id" :value="m.id">
            {{ m.displayName }}
          </option>
        </select>
      </label>
      <label class="grid gap-1 text-xs text-muted">
        Canal
        <select
          v-model="channel"
          :class="selectClass"
          data-testid="filter-channel"
        >
          <option value="">Tous</option>
          <option v-for="c in channels" :key="c" :value="c">
            {{ ACTIVITY_CHANNEL_LABELS[c] }}
          </option>
        </select>
      </label>
      <label class="grid gap-1 text-xs text-muted">
        Type
        <select v-model="kind" :class="selectClass" data-testid="filter-kind">
          <option value="">Tous</option>
          <option v-for="k in kinds" :key="k" :value="k">
            {{ ACTIVITY_KIND_LABELS[k] }}
          </option>
        </select>
      </label>
    </form>
    <p v-if="isPending" class="text-sm text-muted">Chargement du journal…</p>
    <p
      v-else-if="error"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ error.message }}
    </p>
    <template v-else-if="data">
      <ActivityList :entries="data.items" show-listing @open="open" />
      <nav
        v-if="data.pageCount > 1"
        class="flex items-center justify-between text-sm"
        aria-label="Pages"
      >
        <button
          type="button"
          class="rounded-lg border border-line px-3 py-1 disabled:opacity-50"
          :disabled="page <= 1"
          @click="page -= 1"
        >
          Plus récents
        </button>
        <span class="text-xs text-muted"
          >{{ page }} / {{ data.pageCount }}</span
        >
        <button
          type="button"
          class="rounded-lg border border-line px-3 py-1 disabled:opacity-50"
          :disabled="page >= data.pageCount"
          @click="page += 1"
        >
          Plus anciens
        </button>
      </nav>
    </template>
  </section>
</template>
