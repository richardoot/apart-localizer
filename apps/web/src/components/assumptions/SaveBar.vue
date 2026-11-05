<script setup lang="ts">
  import { computed } from 'vue'
  import type { AssumptionsImpact } from '@apart/contracts'
  import type { FieldChange } from '@/lib/assumptions-form'
  import { pendingChangesLabel } from '@/lib/assumptions-summary'
  import ImpactPanel from './ImpactPanel.vue'

  /**
   * La barre d'enregistrement collée en bas de la page Hypothèses (lot 13) :
   * nombre et liste des modifications non enregistrées, nom facultatif de la
   * version, Annuler, « Voir l'impact » (aperçu au-dessus de la barre) et
   * Enregistrer. Sans modification, une ligne d'état seulement (et le
   * message du dernier enregistrement).
   */
  const props = defineProps<{
    changes: FieldChange[]
    errors: { key: string; label: string; message: string }[]
    saving?: boolean
    previewing?: boolean
    message?: string | null
    failure?: string | null
    rebased?: boolean
    impact: AssumptionsImpact | null
    impactVisible: boolean
    impactStale: boolean
  }>()
  const emit = defineEmits<{
    cancel: []
    preview: []
    hideImpact: []
    reveal: [key: string]
  }>()
  const label = defineModel<string>('label', { required: true })

  const pending = computed(() => props.changes.length > 0)
  const changedLabels = computed(() =>
    props.changes.map(change => change.label).join(', ')
  )

  const secondary =
    'min-h-12 rounded-lg border px-3.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 lg:min-h-11'
</script>

<template>
  <div
    class="sticky bottom-0 z-10 border-t border-line bg-bg/95 backdrop-blur"
    data-testid="save-bar"
  >
    <div
      class="mx-auto grid max-w-6xl gap-2.5 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <ImpactPanel
        v-if="impactVisible && (impact || previewing)"
        :impact="impact"
        :previewing="previewing"
        :stale="impactStale"
        @hide="emit('hideImpact')"
      />
      <div
        v-if="errors.length"
        role="alert"
        class="grid gap-1 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
        data-testid="form-errors"
      >
        <p class="font-semibold">À corriger avant d'enregistrer :</p>
        <ul class="grid gap-0.5">
          <li v-for="error in errors" :key="error.key">
            <button
              type="button"
              class="min-h-6 font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
              @click="emit('reveal', error.key)"
            >
              {{ error.label }}</button
            >&nbsp;: {{ error.message }}
          </li>
        </ul>
      </div>
      <p
        v-if="failure"
        role="alert"
        class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
      >
        {{ failure }}
      </p>
      <p v-if="rebased && pending" class="text-xs text-muted">
        Une nouvelle version est en vigueur : vos modifications sont gardées,
        les autres valeurs sont celles de cette version.
      </p>

      <div class="grid gap-2 lg:flex lg:flex-wrap lg:items-center lg:gap-2.5">
        <div
          class="flex min-w-0 items-center justify-between gap-2 lg:contents"
        >
          <p
            class="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm lg:flex-[1_1_14rem]"
            aria-live="polite"
            data-testid="save-status"
          >
            <strong>{{ pendingChangesLabel(changes.length) }}</strong>
            <span
              v-if="pending"
              class="min-w-0 truncate text-muted"
              data-testid="pending-list"
              >{{ changedLabels }}</span
            >
            <span v-else-if="message" class="text-good">{{ message }}</span>
          </p>
          <button
            v-if="pending"
            type="button"
            class="shrink-0 border-line bg-surface text-fg hover:bg-surface-2 lg:order-3"
            :class="secondary"
            data-testid="cancel"
            @click="emit('cancel')"
          >
            Annuler
          </button>
        </div>
        <label
          v-if="pending"
          class="flex min-w-0 items-center gap-2 text-sm text-muted lg:order-2 lg:flex-[1_1_15rem]"
        >
          <span class="sr-only lg:not-sr-only lg:whitespace-nowrap"
            >Nom de la version</span
          >
          <input
            id="h-label"
            v-model="label"
            maxlength="120"
            autocomplete="off"
            placeholder="facultatif, ex. « apport revu »"
            class="h-12 min-w-0 flex-1 rounded-lg border border-muted/70 bg-surface px-3 text-base text-fg lg:h-11 placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          />
        </label>
        <div
          v-if="pending"
          class="grid grid-cols-2 gap-2 lg:order-4 lg:flex lg:gap-2.5"
        >
          <button
            type="button"
            class="border-accent bg-surface text-accent hover:bg-accent-soft"
            :class="secondary"
            :disabled="previewing"
            data-testid="preview"
            @click="emit('preview')"
          >
            {{ previewing ? 'Calcul…' : "Voir l'impact" }}
          </button>
          <button
            type="submit"
            class="min-h-12 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 lg:min-h-11"
            :disabled="saving"
            data-testid="save"
          >
            {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
