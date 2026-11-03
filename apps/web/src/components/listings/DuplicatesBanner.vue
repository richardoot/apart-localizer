<script setup lang="ts">
  import { DUPLICATE_REASON_LABELS } from '@apart/contracts'
  import type { DuplicateCandidate } from '@apart/contracts'
  import { formatEuros, formatSurface } from '@/lib/format'
  import { LISTING_STATUS_LABELS } from '@/lib/labels'

  defineProps<{ duplicates: DuplicateCandidate[] }>()
  const emit = defineEmits<{ open: [id: string]; ignore: [] }>()
</script>

<template>
  <section
    v-if="duplicates.length > 0"
    role="alert"
    class="grid gap-2 rounded-xl border border-warn bg-warn-soft px-4 py-3 text-sm"
    data-testid="duplicates-banner"
  >
    <h3 class="font-display text-base font-semibold text-warn">
      {{
        duplicates.length === 1
          ? 'Cette annonce ressemble à une annonce déjà suivie'
          : `Cette annonce ressemble à ${duplicates.length} annonces déjà suivies`
      }}
    </h3>
    <ul class="grid gap-1">
      <li
        v-for="candidate in duplicates"
        :key="candidate.listingId"
        class="flex flex-wrap items-center justify-between gap-2"
      >
        <span>
          <RouterLink
            :to="{ name: 'listing', params: { id: candidate.listingId } }"
            class="font-medium underline"
            >{{ candidate.title }}</RouterLink
          >
          <span class="text-muted">
            · {{ LISTING_STATUS_LABELS[candidate.status] }} ·
            {{ formatEuros(candidate.price) }} ·
            {{ formatSurface(candidate.surface) }}
          </span>
          <span class="block text-xs text-muted">
            {{
              candidate.reasons
                .map(reason => DUPLICATE_REASON_LABELS[reason.kind])
                .join(', ')
            }}
            (score {{ Math.round(candidate.score * 100) }} %)
          </span>
        </span>
        <button
          type="button"
          class="rounded-lg border border-line bg-surface px-3 py-1 text-xs"
          @click="emit('open', candidate.listingId)"
        >
          C'est un doublon, ouvrir l'existante
        </button>
      </li>
    </ul>
    <div class="flex justify-end">
      <button
        type="button"
        class="rounded-lg border border-warn px-3 py-1 text-xs text-warn"
        @click="emit('ignore')"
      >
        Créer quand même
      </button>
    </div>
  </section>
</template>
