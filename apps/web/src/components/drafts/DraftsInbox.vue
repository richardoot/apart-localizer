<script setup lang="ts">
  import { useRouter } from 'vue-router'
  import { useDrafts } from '@/composables/useDrafts'
  import { formatEuros, formatRelativeDays } from '@/lib/format'

  const router = useRouter()
  const { data, decide } = useDrafts()

  function validate(id: string): void {
    void router.push({ name: 'listing-new', query: { brouillon: id } })
  }
</script>

<template>
  <section
    v-if="data && data.length"
    id="brouillons"
    class="grid gap-2 rounded-xl border border-line bg-surface p-4"
    aria-labelledby="drafts-title"
    data-testid="drafts"
  >
    <h2 id="drafts-title" class="font-display text-base font-semibold">
      Reçues par e-mail, à valider
      <span
        class="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-fg"
        >{{ data.length }}</span
      >
    </h2>
    <ul class="grid gap-2">
      <li
        v-for="draft in data"
        :key="draft.id"
        class="flex flex-wrap items-center justify-between gap-2 text-sm"
      >
        <span>
          <strong>{{ draft.listing.title }}</strong>
          <span class="text-muted">
            ·
            {{
              draft.listing.price ? formatEuros(draft.listing.price) : 'prix ?'
            }}
            <template v-if="draft.listing.location.commune">
              · {{ draft.listing.location.commune }}</template
            >
            ·
            {{
              draft.extractedBy === 'ai' ? 'lu par l’IA' : 'analyseur simple'
            }}
            · {{ formatRelativeDays(draft.receivedAt) }}
          </span>
          <span
            v-if="draft.duplicates.length"
            class="ml-1 rounded-full bg-warn-soft px-2 py-0.5 text-xs text-warn"
            >doublon probable</span
          >
        </span>
        <span class="flex gap-2">
          <button
            type="button"
            class="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-fg"
            @click="validate(draft.id)"
          >
            Valider
          </button>
          <button
            type="button"
            class="rounded-lg border border-line px-3 py-1 text-xs"
            @click="
              decide.mutate({ id: draft.id, decision: { status: 'dismissed' } })
            "
          >
            Écarter
          </button>
        </span>
      </li>
    </ul>
  </section>
</template>
