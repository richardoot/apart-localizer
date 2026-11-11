<script setup lang="ts">
  import { computed } from 'vue'
  import { DpeClassSchema } from '@apart/contracts'
  import type { DpeCandidate, Listing } from '@apart/contracts'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiField from '@/components/ui/UiField.vue'
  import { useAction } from '@/composables/useAction'
  import {
    useContextMutations,
    useListingContext,
  } from '@/composables/useListingContext'
  import { useListingEditor } from '@/composables/useListingEditor'
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
    fieldMeta(
      editor.fieldSources.value,
      editor.changedFields.value,
      path,
      editor.errors.value
    )
  const DPE_OPTIONS = [
    { value: '', label: 'Inconnu' },
    ...DpeClassSchema.options.map(c => ({ value: c, label: c })),
  ]

  const id = computed(() => props.listing.id)
  const { data: context } = useListingContext(id)
  const mutations = useContextMutations()
  // Lot 22 : l'échec de la recherche ou du choix se dit sous ses boutons.
  const action = useAction('La recherche à l’ADEME a échoué.')
  const busy = computed(
    () =>
      mutations.searchDpe.isPending.value || mutations.verifyDpe.isPending.value
  )

  function search(): void {
    void action.run(() => mutations.searchDpe.mutateAsync(props.listing.id))
  }

  function retain(candidate: DpeCandidate): void {
    void action.run(
      () =>
        mutations.verifyDpe.mutateAsync({
          id: props.listing.id,
          number: candidate.number,
          expectedUpdatedAt: props.listing.updatedAt,
        }),
      { success: 'DPE retenu.', fallback: 'L’enregistrement a échoué.' }
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
      <UiBadge v-if="dpe?.verified" tone="accent" data-testid="energy-ademe"
        >Retrouvé à l’ADEME</UiBadge
      >
    </div>
    <ul v-if="dpe?.validity.messages.length" class="grid gap-1">
      <li
        v-for="message in dpe.validity.messages"
        :key="message"
        :class="CHECK_LEVEL_CLASSES[dpe.validity.level]"
        class="w-fit rounded-md px-2 py-0.5 text-sm"
      >
        {{ message }}
      </li>
    </ul>
    <p v-if="dpe?.search?.message" class="text-sm text-muted">
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
        class="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"
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
        <UiButton
          variant="outline"
          size="sm"
          class="ml-auto"
          :disabled="busy"
          @click="retain(candidate)"
        >
          Retenir
        </UiButton>
      </li>
    </ul>
    <div class="flex flex-wrap items-center gap-2">
      <UiButton
        size="sm"
        :disabled="busy"
        :loading="mutations.searchDpe.isPending.value"
        loading-label="Recherche…"
        data-action="search-dpe"
        @click="search"
      >
        Rechercher le DPE à l’ADEME
      </UiButton>
    </div>
    <UiAlert v-if="action.error.value">{{ action.error.value }}</UiAlert>

    <template #edit>
      <div class="grid gap-3 sm:grid-cols-3">
        <UiField
          id="f-dpe"
          v-model="form.dpeClass"
          as="select"
          label="DPE"
          :options="DPE_OPTIONS"
          v-bind="meta('dpeClass')"
        />
        <UiField
          id="f-ges"
          v-model="form.gesClass"
          as="select"
          label="GES"
          :options="DPE_OPTIONS"
          v-bind="meta('gesClass')"
        />
        <UiField
          id="f-dpe-date"
          v-model="form.dpeDate"
          label="Date du DPE"
          type="date"
          align="left"
          v-bind="meta('dpeDate')"
        />
      </div>
    </template>
  </EditableSection>
</template>
