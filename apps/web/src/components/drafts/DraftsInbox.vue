<script setup lang="ts">
  import { computed } from 'vue'
  import { useDrafts } from '@/composables/useDrafts'
  import { draftSourceLabel, draftWhen, pendingDuplicate } from '@/lib/drafts'
  import { formatEuros } from '@/lib/format'

  /**
   * La boîte « À valider » de la Synthèse : combien d'annonces attendent
   * (reçues par e-mail ou trouvées par Claude en explorant les portails), les
   * trois plus récentes, et un lien vers l'onglet « À valider » de la page
   * Annonces, où se décide chacune (lot 16).
   */
  const { data } = useDrafts()
  const drafts = computed(() => data.value ?? [])
  const shown = computed(() => drafts.value.slice(0, 3))
</script>

<template>
  <section
    v-if="drafts.length"
    id="brouillons"
    class="grid gap-2 rounded-xl border border-line bg-surface p-4"
    aria-labelledby="drafts-title"
    data-testid="drafts"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 id="drafts-title" class="font-display text-base font-semibold">
        À valider
        <span
          class="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-fg"
          >{{ drafts.length }}</span
        >
      </h2>
      <RouterLink
        :to="{ name: 'listings', query: { etape: 'a-valider' } }"
        class="inline-flex min-h-10 items-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg"
        data-testid="drafts-open"
      >
        Voir dans Annonces › À valider
      </RouterLink>
    </div>
    <ul class="grid gap-1.5">
      <li
        v-for="draft in shown"
        :key="draft.id"
        class="flex flex-wrap items-center gap-x-2 text-sm"
      >
        <strong>{{ draft.listing.title }}</strong>
        <span class="text-muted">
          ·
          {{
            draft.listing.price ? formatEuros(draft.listing.price) : 'prix ?'
          }}
          <template v-if="draft.listing.location.commune">
            · {{ draft.listing.location.commune }}</template
          >
          · {{ draftSourceLabel(draft) }} · {{ draftWhen(draft) }}
        </span>
        <span
          v-if="pendingDuplicate(draft)"
          class="rounded-full bg-warn-soft px-2 py-0.5 text-xs text-warn"
          >doublon probable</span
        >
      </li>
    </ul>
    <p v-if="drafts.length > shown.length" class="text-xs text-muted">
      Et {{ drafts.length - shown.length }} autre(s).
    </p>
    <p class="text-xs text-muted">
      Rien n’est ajouté à la liste sans votre choix : ajoutez, écartez ou
      tranchez un doublon depuis l’onglet.
    </p>
  </section>
</template>
