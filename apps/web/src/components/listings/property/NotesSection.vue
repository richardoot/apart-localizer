<script setup lang="ts">
  import { computed } from 'vue'
  import type { Listing } from '@apart/contracts'
  import UiField from '@/components/ui/UiField.vue'
  import { useListingEditor } from '@/composables/useListingEditor'
  import { provenanceOf } from '@/lib/provenance'
  import AiMark from '../sections/AiMark.vue'
  import EditableSection from '../sections/EditableSection.vue'
  import { fieldMeta } from './field-meta'

  /**
   * Lot 19 : nos notes et la description de l'annonce (section `notes`).
   * Lot 25 (ADR 0035) : « Nos notes » se lisent sans rien déplier, juste
   * après les travaux ; la description brute de l'annonce, souvent longue,
   * reste repliée. « Modifier » ouvre l'édition sur place, comme les autres
   * sections (même charge utile).
   */
  defineProps<{ listing: Listing }>()

  const editor = useListingEditor()
  const form = computed(() => editor.draft.value)
  const meta = (path: string) =>
    fieldMeta(
      editor.fieldSources.value,
      editor.changedFields.value,
      path,
      editor.errors.value
    )
  const descriptionSource = computed(() =>
    provenanceOf(editor.fieldSources.value, 'description')
  )
</script>

<template>
  <EditableSection section="notes" title="Nos notes">
    <p
      v-if="listing.notes"
      class="text-sm leading-relaxed whitespace-pre-line"
      data-testid="notes-text"
    >
      {{ listing.notes }}
    </p>
    <p v-else class="text-sm text-muted">
      Aucune note pour l’instant : ce que vous avez vu, ce qu’il faut demander.
    </p>
    <details class="rounded-xl bg-bg px-3" data-testid="notes-description-fold">
      <summary
        class="flex min-h-11 cursor-pointer items-center gap-1.5 text-sm font-medium text-muted"
        data-testid="notes-summary"
      >
        Description de l’annonce <AiMark :provenance="descriptionSource" />
      </summary>
      <p
        v-if="listing.description"
        class="pb-3 text-sm leading-relaxed whitespace-pre-line"
        data-testid="notes-description"
      >
        {{ listing.description }}
      </p>
      <p v-else class="pb-3 text-sm text-muted">
        Pas de description enregistrée.
      </p>
    </details>
    <template #edit>
      <UiField
        id="f-notes"
        v-model="form.notes"
        as="textarea"
        label="Notes (visite, copro, points d'attention)"
        v-bind="meta('notes')"
        rows="4"
        placeholder="PV d'AG à demander, ravalement prévu ?"
      />
      <UiField
        id="f-description"
        v-model="form.description"
        as="textarea"
        label="Description brute de l'annonce"
        v-bind="meta('description')"
        rows="6"
      />
    </template>
  </EditableSection>
</template>
