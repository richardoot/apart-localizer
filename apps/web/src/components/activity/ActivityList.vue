<script setup lang="ts">
  import type { ActivityEntry } from '@apart/contracts'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import type { Tone } from '@/lib/ui'

  defineProps<{
    entries: ActivityEntry[]
    /** Montre l'annonce concernée (journal de l'espace) ; inutile dans une fiche. */
    showListing?: boolean
  }>()
  const emit = defineEmits<{ open: [listingId: string] }>()

  const CHANNEL_TONES: Record<ActivityEntry['channel'], Tone> = {
    web: 'neutral',
    mcp: 'accent',
    import: 'warn',
    system: 'neutral',
  }

  function when(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  function who(entry: ActivityEntry): string {
    if (entry.channel === 'mcp')
      return entry.actor ? `Claude pour ${entry.actor.displayName}` : 'Claude'
    return entry.actor?.displayName ?? entry.channelLabel
  }
</script>

<template>
  <ol class="grid gap-2" data-testid="activity-list">
    <li
      v-for="entry in entries"
      :key="entry.id"
      class="grid gap-1 rounded-lg border border-line px-3 py-2 text-sm"
    >
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <strong>{{ who(entry) }}</strong>
        <span>{{ entry.summary }}</span>
        <UiButton
          v-if="showListing && entry.listing"
          variant="link"
          size="inline"
          @click="emit('open', entry.listing.id)"
        >
          {{ entry.listing.title }}
        </UiButton>
        <span class="ml-auto flex items-center gap-2 text-xs text-muted">
          <UiBadge :tone="CHANNEL_TONES[entry.channel]">{{
            entry.channelLabel
          }}</UiBadge>
          <time :datetime="entry.createdAt">{{ when(entry.createdAt) }}</time>
        </span>
      </div>
      <dl
        v-if="entry.changes.length"
        class="grid grid-cols-[minmax(0,auto)_1fr] gap-x-3 gap-y-0.5 text-sm"
      >
        <template v-for="change in entry.changes" :key="change.field">
          <dt class="text-muted">{{ change.label }}</dt>
          <dd>
            <span class="text-muted line-through">{{
              change.before ?? '—'
            }}</span>
            <UiIcon name="arrow-right" class="mx-0.5 inline align-[-0.125em]" />
            <span class="sr-only">devient</span>
            <span>{{ change.after ?? '—' }}</span>
          </dd>
        </template>
      </dl>
    </li>
  </ol>
  <p v-if="entries.length === 0" class="text-sm text-muted">
    Rien dans le journal.
  </p>
</template>
