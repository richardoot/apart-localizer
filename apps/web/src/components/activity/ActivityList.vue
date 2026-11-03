<script setup lang="ts">
  import type { ActivityEntry } from '@apart/contracts'

  defineProps<{
    entries: ActivityEntry[]
    /** Montre l'annonce concernée (journal de l'espace) ; inutile dans une fiche. */
    showListing?: boolean
  }>()
  const emit = defineEmits<{ open: [listingId: string] }>()

  const CHANNEL_CLASSES: Record<ActivityEntry['channel'], string> = {
    web: 'bg-surface-2 text-muted',
    mcp: 'bg-accent-soft text-fg',
    import: 'bg-warn-soft text-warn',
    system: 'bg-surface-2 text-muted',
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
        <button
          v-if="showListing && entry.listing"
          type="button"
          class="text-accent underline"
          @click="emit('open', entry.listing.id)"
        >
          {{ entry.listing.title }}
        </button>
        <span class="ml-auto flex items-center gap-2 text-xs text-muted">
          <span
            class="rounded-full px-2 py-0.5 text-[11px]"
            :class="CHANNEL_CLASSES[entry.channel]"
            >{{ entry.channelLabel }}</span
          >
          <time :datetime="entry.createdAt">{{ when(entry.createdAt) }}</time>
        </span>
      </div>
      <dl
        v-if="entry.changes.length"
        class="grid grid-cols-[minmax(0,auto)_1fr] gap-x-3 gap-y-0.5 text-xs"
      >
        <template v-for="change in entry.changes" :key="change.field">
          <dt class="text-muted">{{ change.label }}</dt>
          <dd>
            <span class="text-muted line-through">{{
              change.before ?? '—'
            }}</span>
            → <span>{{ change.after ?? '—' }}</span>
          </dd>
        </template>
      </dl>
    </li>
  </ol>
  <p v-if="entries.length === 0" class="text-sm text-muted">
    Rien dans le journal.
  </p>
</template>
