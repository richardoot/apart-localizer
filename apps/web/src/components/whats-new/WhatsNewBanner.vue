<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { WHATS_NEW_KIND_LABELS } from '@apart/contracts'
  import type { WhatsNewKind } from '@apart/contracts'
  import { useWhatsNew } from '@/composables/useWhatsNew'
  import UiButton from '@/components/ui/UiButton.vue'

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
  <!--
    Lot 23 : une seule ligne (ce qui a changé, compté), le détail à la
    demande : la date, les changements par annonce et « Tout marquer comme vu ».
  -->
  <section
    v-if="data && data.total > 0"
    class="grid min-w-0 gap-2 rounded-2xl border border-accent bg-accent-soft/50 px-3.5 py-1.5 sm:px-4"
    aria-labelledby="whats-new-title"
    data-testid="whats-new"
  >
    <div class="flex min-h-11 min-w-0 items-center gap-2">
      <p class="min-w-0 flex-1 truncate text-sm">
        <strong id="whats-new-title">Depuis ta dernière visite</strong>
        <span data-testid="whats-new-counts"> · {{ counts.join(' · ') }}</span>
      </p>
      <UiButton
        size="sm"
        variant="ghost"
        :icon-right="expanded ? 'chevron-up' : 'chevron-down'"
        :aria-expanded="expanded"
        aria-controls="whats-new-detail"
        data-testid="whats-new-toggle"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Masquer' : 'Détail' }}
      </UiButton>
    </div>
    <div
      v-if="expanded"
      id="whats-new-detail"
      class="grid gap-2 pb-2"
      data-testid="whats-new-detail"
    >
      <p class="text-sm text-muted">Depuis {{ since }}.</p>
      <ul class="grid gap-1 text-sm">
        <li v-for="(item, index) in data.items" :key="index">
          <UiButton
            variant="ghost"
            size="sm"
            class="justify-start! px-1 text-left text-fg"
            @click="emit('open', item.listingId)"
          >
            <span
              ><strong>{{ item.listingTitle }}</strong> —
              {{ item.summary }}</span
            >
          </UiButton>
        </li>
      </ul>
      <UiButton
        variant="primary"
        size="sm"
        class="w-fit"
        :loading="markSeen.isPending.value"
        data-testid="mark-all-seen"
        @click="markSeen.mutate()"
      >
        Tout marquer comme vu
      </UiButton>
    </div>
  </section>
</template>
