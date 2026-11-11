<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import type { Listing } from '@apart/contracts'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiField from '@/components/ui/UiField.vue'
  import { useListingEditor } from '@/composables/useListingEditor'
  import { provenanceOf } from '@/lib/provenance'
  import AiMark from '../sections/AiMark.vue'
  import { fieldMeta } from './field-meta'

  /**
   * Lot 19 : le dépli « Description de l'annonce et nos notes », en bas du
   * bien : la description brute de l'annonce et les notes des membres.
   * « Modifier » ouvre l'édition sur place (section `notes`) ; le dépli reste
   * ouvert tant que la section est en édition.
   */
  defineProps<{ listing: Listing }>()

  const editor = useListingEditor()
  const form = computed(() => editor.draft.value)
  const editing = computed(() => editor.editing.value === 'notes')
  const meta = (path: string) =>
    fieldMeta(
      editor.fieldSources.value,
      editor.changedFields.value,
      path,
      editor.errors.value
    )
  const opened = ref(false)
  watch(editing, value => {
    if (value) opened.value = true
  })
  const descriptionSource = computed(() =>
    provenanceOf(editor.fieldSources.value, 'description')
  )

  function onToggle(event: Event): void {
    const open = (event.target as HTMLDetailsElement).open
    // Une section en édition ne se replie pas.
    if (!open && editing.value) {
      ;(event.target as HTMLDetailsElement).open = true
      return
    }
    opened.value = open
  }

  /** Lot 22 : le refus du serveur ou l'erreur d'une autre section, ici. */
  const sectionError = computed(
    () => editor.errors.value._section ?? editor.errors.value._submit ?? null
  )
</script>

<template>
  <details
    class="rounded-2xl border border-line bg-surface px-4 sm:px-5"
    :open="opened || editing"
    data-section="notes"
    :data-editing="editing ? 'true' : undefined"
    @toggle="onToggle"
  >
    <summary
      class="flex min-h-13 cursor-pointer items-center text-base font-semibold"
      data-testid="notes-summary"
    >
      Description de l’annonce et nos notes
    </summary>
    <div v-if="!editing" class="grid gap-3 pb-4 leading-relaxed">
      <div class="grid gap-1">
        <h3 class="text-sm font-medium text-muted">
          Description de l’annonce <AiMark :provenance="descriptionSource" />
        </h3>
        <p
          v-if="listing.description"
          class="text-sm whitespace-pre-line"
          data-testid="notes-description"
        >
          {{ listing.description }}
        </p>
        <p v-else class="text-sm text-muted">Pas de description enregistrée.</p>
      </div>
      <div class="grid gap-1">
        <h3 class="text-sm font-medium text-muted">Nos notes</h3>
        <p
          v-if="listing.notes"
          class="text-sm whitespace-pre-line"
          data-testid="notes-text"
        >
          {{ listing.notes }}
        </p>
        <p v-else class="text-sm text-muted">Aucune note pour l’instant.</p>
      </div>
      <div class="flex justify-end">
        <UiButton
          :aria-expanded="false"
          aria-controls="section-notes-edit"
          data-testid="edit-notes"
          @click="editor.start('notes')"
        >
          Modifier
        </UiButton>
      </div>
    </div>
    <form
      v-else
      id="section-notes-edit"
      class="grid gap-3 pb-4"
      aria-label="Modifier : Description de l’annonce et nos notes"
      novalidate
      @submit.prevent="editor.save('notes')"
    >
      <UiField
        id="f-notes"
        v-model="form.notes"
        as="textarea"
        label="Notes (visite, copro, points d'attention)"
        v-bind="meta('notes')"
        rows="3"
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
      <UiAlert v-if="sectionError">{{ sectionError }}</UiAlert>
      <div class="flex flex-wrap justify-end gap-2">
        <UiButton
          :aria-expanded="true"
          aria-controls="section-notes-edit"
          data-testid="cancel-notes"
          @click="editor.cancel()"
        >
          Annuler
        </UiButton>
        <UiButton
          type="submit"
          variant="primary"
          :loading="editor.saving.value"
          loading-label="Enregistrement…"
          data-testid="save-notes"
        >
          Enregistrer
        </UiButton>
      </div>
    </form>
  </details>
</template>
