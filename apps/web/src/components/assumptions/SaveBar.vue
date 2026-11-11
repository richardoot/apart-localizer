<script setup lang="ts">
  import { computed } from 'vue'
  import type { AssumptionsImpact } from '@apart/contracts'
  import type { FieldChange } from '@/lib/assumptions-form'
  import { pendingChangesLabel } from '@/lib/assumptions-summary'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiInput from '@/components/ui/UiInput.vue'
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
            <UiButton
              variant="link"
              size="inline"
              class="font-medium text-bad"
              @click="emit('reveal', error.key)"
            >
              {{ error.label }}</UiButton
            >&nbsp;: {{ error.message }}
          </li>
        </ul>
      </div>
      <UiAlert v-if="failure">
        {{ failure }}
      </UiAlert>
      <p v-if="rebased && pending" class="text-xs text-muted">
        Une nouvelle version est en vigueur : tes modifications sont gardées,
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
          <UiButton
            v-if="pending"
            class="shrink-0 font-semibold lg:order-3"
            data-testid="cancel"
            @click="emit('cancel')"
          >
            Annuler
          </UiButton>
        </div>
        <label
          v-if="pending"
          class="flex min-w-0 items-center gap-2 text-sm text-muted lg:order-2 lg:flex-[1_1_15rem]"
        >
          <span class="sr-only lg:not-sr-only lg:whitespace-nowrap"
            >Nom de la version</span
          >
          <UiInput
            id="h-label"
            v-model="label"
            maxlength="120"
            autocomplete="off"
            placeholder="facultatif, ex. « apport revu »"
            class="min-w-0 flex-1"
          />
        </label>
        <div
          v-if="pending"
          class="grid grid-cols-2 gap-2 lg:order-4 lg:flex lg:gap-2.5"
        >
          <UiButton
            variant="outline"
            :loading="previewing"
            loading-label="Calcul…"
            data-testid="preview"
            @click="emit('preview')"
          >
            Voir l'impact
          </UiButton>
          <UiButton
            type="submit"
            variant="primary"
            class="px-5"
            :loading="saving"
            loading-label="Enregistrement…"
            data-testid="save"
          >
            Enregistrer
          </UiButton>
        </div>
      </div>
    </div>
  </div>
</template>
