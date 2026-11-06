<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { DpeClassSchema } from '@apart/contracts'
  import type { DpeCandidate, Listing } from '@apart/contracts'
  import FormField from '@/components/ui/FormField.vue'
  import {
    useContextMutations,
    useListingContext,
  } from '@/composables/useListingContext'
  import { useListingEditor } from '@/composables/useListingEditor'
  import { ApiError } from '@/lib/api'
  import { formatDate, formatDay, formatSurface } from '@/lib/format'
  import { CHECK_LEVEL_CLASSES, DPE_CLASSES } from '@/lib/labels'
  import { provenanceOf } from '@/lib/provenance'
  import DpeBadge from '../DpeBadge.vue'
  import AiMark from '../sections/AiMark.vue'
  import EditableSection from '../sections/EditableSection.vue'
  import { fieldMeta } from './field-meta'

  /**
   * Lot 19 : « Énergie » (venu de Quartier) : le DPE en grand, sa
   * consommation, le GES, la date et la validité du diagnostic, « Retrouvé à
   * l'ADEME » quand la fiche vient de l'observatoire, et la recherche à
   * l'ADEME avec ses candidats à retenir (garde-fou `expectedUpdatedAt`).
   * Tout vient du serveur (données ouvertes, règles de `domain`).
   */
  const props = defineProps<{ listing: Listing }>()

  const editor = useListingEditor()
  const form = computed(() => editor.draft.value)
  const meta = (path: string) =>
    fieldMeta(editor.fieldSources.value, editor.changedFields.value, path)
  const dpeClasses = DpeClassSchema.options

  const id = computed(() => props.listing.id)
  const { data: context } = useListingContext(id)
  const mutations = useContextMutations()
  const failure = ref<string | null>(null)
  const busy = computed(
    () =>
      mutations.searchDpe.isPending.value || mutations.verifyDpe.isPending.value
  )

  async function run(action: Promise<unknown>): Promise<void> {
    failure.value = null
    try {
      await action
    } catch (err) {
      failure.value = err instanceof ApiError ? err.message : 'Échec.'
    }
  }

  function retain(candidate: DpeCandidate): void {
    void run(
      mutations.verifyDpe.mutateAsync({
        id: props.listing.id,
        number: candidate.number,
        expectedUpdatedAt: props.listing.updatedAt,
      })
    )
  }

  const dpe = computed(() => context.value?.dpe ?? null)
  const provenance = computed(() =>
    provenanceOf(editor.fieldSources.value, 'dpeClass')
  )
  const candidates = computed(() =>
    dpe.value?.search && !dpe.value.verified
      ? dpe.value.search.candidates.slice(0, 8)
      : []
  )
  const facts = computed(() => {
    const l = props.listing
    return [
      l.dpeConsumption !== null ? `${l.dpeConsumption} kWh/m²/an` : null,
      l.gesClass ? `GES ${l.gesClass}` : null,
    ].filter((v): v is string => v !== null)
  })

  const inputClass =
    'min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg sm:min-h-10'
</script>

<template>
  <EditableSection section="energy" title="Énergie">
    <div
      class="flex flex-wrap items-center gap-x-6 gap-y-2"
      data-testid="energy"
    >
      <span
        v-if="listing.dpeClass"
        class="inline-flex items-center rounded-lg px-3 py-1 font-display text-[22px] font-bold"
        :class="DPE_CLASSES[listing.dpeClass]"
        data-testid="energy-dpe"
        >DPE {{ listing.dpeClass }}</span
      >
      <span v-else class="text-sm font-semibold" data-testid="energy-dpe"
        >DPE inconnu</span
      >
      <AiMark :provenance="provenance" />
      <span v-if="facts.length" class="text-sm tabular-nums">{{
        facts.join(' · ')
      }}</span>
      <span v-if="listing.dpeDate" class="text-sm text-muted"
        >établi le {{ formatDay(listing.dpeDate) }}</span
      >
      <span
        v-if="dpe?.verified"
        class="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent"
        data-testid="energy-ademe"
        >Retrouvé à l’ADEME</span
      >
    </div>
    <ul v-if="dpe?.validity.messages.length" class="grid gap-1">
      <li
        v-for="message in dpe.validity.messages"
        :key="message"
        :class="CHECK_LEVEL_CLASSES[dpe.validity.level]"
        class="w-fit rounded-md px-2 py-0.5 text-xs"
      >
        {{ message }}
      </li>
    </ul>
    <p v-if="dpe?.search?.message" class="text-xs text-muted">
      {{ dpe.search.message }} ({{ formatDate(dpe.search.searchedAt) }})
    </p>
    <ul
      v-if="candidates.length"
      class="grid gap-1.5"
      aria-label="DPE candidats"
      data-testid="energy-candidates"
    >
      <li
        v-for="candidate in candidates"
        :key="candidate.number"
        class="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs"
      >
        <DpeBadge :dpe="candidate.dpeClass" />
        <span
          >n° {{ candidate.number }} du
          {{ formatDate(candidate.issuedAt) }}</span
        >
        <span class="text-muted">
          {{ formatSurface(candidate.surface) }}
          <template v-if="candidate.floor !== null">
            · étage {{ candidate.floor }}</template
          >
          <template v-if="candidate.consumption !== null">
            · {{ candidate.consumption }} kWh/m²/an</template
          >
          <template v-if="candidate.complement">
            · {{ candidate.complement }}</template
          >
          · ressemblance {{ Math.round(candidate.matchScore * 100) }} %
        </span>
        <button
          type="button"
          class="ml-auto inline-flex min-h-11 items-center rounded-lg border border-accent px-3 text-sm text-accent disabled:opacity-60 sm:min-h-9"
          :disabled="busy"
          @click="retain(candidate)"
        >
          Retenir
        </button>
      </li>
    </ul>
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2 disabled:opacity-60 sm:min-h-9"
        :disabled="busy"
        data-action="search-dpe"
        @click="run(mutations.searchDpe.mutateAsync(listing.id))"
      >
        {{
          mutations.searchDpe.isPending.value
            ? 'Recherche…'
            : 'Rechercher le DPE à l’ADEME'
        }}
      </button>
    </div>
    <p
      v-if="failure"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ failure }}
    </p>

    <template #edit>
      <div class="grid gap-3 sm:grid-cols-3">
        <FormField label="DPE" for-id="f-dpe" v-bind="meta('dpeClass')">
          <select id="f-dpe" v-model="form.dpeClass" :class="inputClass">
            <option value="">Inconnu</option>
            <option v-for="c in dpeClasses" :key="c" :value="c">
              {{ c }}
            </option>
          </select>
        </FormField>
        <FormField label="GES" for-id="f-ges" v-bind="meta('gesClass')">
          <select id="f-ges" v-model="form.gesClass" :class="inputClass">
            <option value="">Inconnu</option>
            <option v-for="c in dpeClasses" :key="c" :value="c">
              {{ c }}
            </option>
          </select>
        </FormField>
        <FormField
          label="Date du DPE"
          for-id="f-dpe-date"
          v-bind="meta('dpeDate')"
          :error="editor.errors.value.dpeDate"
        >
          <input
            id="f-dpe-date"
            v-model="form.dpeDate"
            type="date"
            :class="inputClass"
          />
        </FormField>
      </div>
    </template>
  </EditableSection>
</template>
