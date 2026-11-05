<script setup lang="ts">
  import { computed } from 'vue'
  import type { AssumptionsImpact } from '@apart/contracts'
  import { impactLine, impactSummary } from '@/lib/assumptions-summary'

  /**
   * L'aperçu d'impact de la saisie sur les annonces actives (« Voir
   * l'impact », calculé par l'API sans rien enregistrer), affiché au-dessus
   * de la barre d'enregistrement.
   */
  const props = defineProps<{
    impact: AssumptionsImpact | null
    previewing?: boolean
    /** La saisie a changé depuis ce calcul. */
    stale?: boolean
  }>()
  const emit = defineEmits<{ hide: [] }>()

  const summary = computed(() =>
    props.impact ? impactSummary(props.impact) : null
  )
</script>

<template>
  <section
    class="grid max-h-[40vh] gap-1.5 overflow-y-auto rounded-xl border border-line bg-surface px-3.5 py-3 text-sm shadow-sm"
    aria-labelledby="impact-title"
    aria-live="polite"
    data-testid="impact"
  >
    <div class="flex items-start justify-between gap-2">
      <p id="impact-title" class="pt-2.5 font-semibold">
        {{
          summary
            ? summary.headline
            : "Calcul de l'impact sur les annonces actives…"
        }}
      </p>
      <button
        type="button"
        class="min-h-11 shrink-0 rounded-lg px-2.5 text-sm text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        @click="emit('hide')"
      >
        Masquer
      </button>
    </div>
    <template v-if="impact && summary">
      <p class="text-xs text-muted">{{ summary.distribution }}</p>
      <ul v-if="impact.changes.length" class="grid gap-0.5">
        <li v-for="change in impact.changes" :key="change.listingId">
          {{ impactLine(change) }}
        </li>
      </ul>
      <p v-if="stale" class="text-xs font-medium text-warn">
        Saisie modifiée depuis ce calcul : relancez « Voir l'impact ».
      </p>
    </template>
  </section>
</template>
