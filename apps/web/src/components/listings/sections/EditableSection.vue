<script setup lang="ts">
  import { computed } from 'vue'
  import { useListingEditor } from '@/composables/useListingEditor'
  import type { ListingSectionId } from '@/lib/listing-sections'
  import PreviewLine from './PreviewLine.vue'

  /**
   * Lot 19 : une section de la fiche qui se lit, puis se modifie sur place
   * (« Modifier » → les champs de la section, l'aperçu en direct, « Annuler »
   * et « Enregistrer »). Une seule section s'édite à la fois ; en quitter
   * une modifiée demande confirmation (bandeau de la fiche).
   */
  const props = withDefaults(
    defineProps<{
      section: ListingSectionId
      title: string
      /** Libellé du bouton (« Modifier les travaux ») ; « Modifier » par défaut. */
      editLabel?: string
      /** Mise en avant (les travaux, en tête du bien). */
      highlight?: boolean
      /** Montrer l'aperçu en direct (coût, mensualité, verdict) pendant l'édition. */
      preview?: boolean
      /** Le niveau du titre (h2 dans un onglet, h3 dans un bloc). */
      level?: 'h2' | 'h3'
    }>(),
    { editLabel: 'Modifier', highlight: false, preview: false, level: 'h2' }
  )
  const editor = useListingEditor()
  const open = computed(() => editor.editing.value === props.section)
  const titleId = computed(() => `section-${props.section}-title`)
  const editId = computed(() => `section-${props.section}-edit`)
  const sectionError = computed(() => editor.errors.value._section ?? null)

  const button =
    'inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2 disabled:opacity-60 sm:min-h-10'
</script>

<template>
  <section
    class="grid gap-3 rounded-2xl bg-surface p-4 sm:px-5"
    :class="highlight ? 'border-[1.5px] border-accent' : 'border border-line'"
    :aria-labelledby="titleId"
    :data-section="section"
    :data-editing="open ? 'true' : undefined"
  >
    <header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <component :is="level" :id="titleId" class="text-base font-semibold">{{
        title
      }}</component>
      <div class="flex flex-wrap items-center gap-2">
        <slot name="actions" />
        <button
          v-if="!open"
          type="button"
          :class="button"
          :aria-expanded="false"
          :aria-controls="editId"
          :data-testid="`edit-${section}`"
          @click="editor.start(section)"
        >
          {{ editLabel }}
        </button>
      </div>
    </header>

    <div v-if="!open" class="grid gap-3">
      <slot />
    </div>
    <form
      v-else
      :id="editId"
      class="grid gap-3"
      :aria-label="`Modifier : ${title}`"
      novalidate
      @submit.prevent="editor.save(section)"
    >
      <slot
        name="edit"
        :draft="editor.draft.value"
        :errors="editor.errors.value"
      />
      <PreviewLine v-if="preview" />
      <p
        v-if="sectionError"
        role="alert"
        class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
      >
        {{ sectionError }}
      </p>
      <div class="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          :class="button"
          :aria-expanded="true"
          :aria-controls="editId"
          :data-testid="`cancel-${section}`"
          @click="editor.cancel()"
        >
          Annuler
        </button>
        <button
          type="submit"
          class="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-60 sm:min-h-10"
          :disabled="editor.saving.value"
          :data-testid="`save-${section}`"
        >
          {{ editor.saving.value ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </form>
  </section>
</template>
