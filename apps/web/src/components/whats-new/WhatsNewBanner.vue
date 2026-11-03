<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { WHATS_NEW_KIND_LABELS } from '@apart/contracts'
  import type { WhatsNewKind } from '@apart/contracts'
  import { useWhatsNew } from '@/composables/useWhatsNew'

  const emit = defineEmits<{ open: [listingId: string] }>()
  const { data, markSeen } = useWhatsNew()
  const expanded = ref(false)

  const counts = computed(() =>
    Object.entries(data.value?.counts ?? {})
      .filter(([, n]) => n > 0)
      .map(
        ([kind, n]) => `${WHATS_NEW_KIND_LABELS[kind as WhatsNewKind]} : ${n}`
      )
  )
  const since = computed(() =>
    data.value
      ? new Date(data.value.since).toLocaleString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        })
      : ''
  )
</script>

<template>
  <section
    v-if="data && data.total > 0"
    class="grid gap-2 rounded-xl border border-accent bg-accent-soft/50 px-4 py-3"
    aria-labelledby="whats-new-title"
    data-testid="whats-new"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="whats-new-title" class="font-display text-base font-semibold">
        Depuis votre dernière visite
        <span class="text-sm font-normal text-muted">({{ since }})</span>
      </h2>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-lg border border-line bg-surface px-3 py-1 text-xs"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? 'Masquer' : 'Voir le détail' }}
        </button>
        <button
          type="button"
          class="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-fg disabled:opacity-60"
          :disabled="markSeen.isPending.value"
          data-testid="mark-all-seen"
          @click="markSeen.mutate()"
        >
          Tout marquer comme vu
        </button>
      </div>
    </div>
    <p class="text-sm" data-testid="whats-new-counts">
      {{ counts.join(' · ') }}
    </p>
    <ul v-if="expanded" class="grid gap-1 text-sm">
      <li v-for="(item, index) in data.items" :key="index">
        <button
          type="button"
          class="text-left hover:text-accent"
          @click="emit('open', item.listingId)"
        >
          <strong>{{ item.listingTitle }}</strong> — {{ item.summary }}
        </button>
      </li>
    </ul>
  </section>
</template>
