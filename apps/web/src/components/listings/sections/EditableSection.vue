<script setup lang="ts">
  import { computed, nextTick, ref } from 'vue'
  import { useListingEditor } from '@/composables/useListingEditor'
  import type { ListingSectionId } from '@/lib/listing-sections'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import { cardClasses } from '@/lib/ui'
  import PreviewLine from './PreviewLine.vue'

  /**
   * Lot 19 : une section de la fiche qui se lit, puis se modifie sur place
   * (« Modifier » → les champs de la section, l'aperçu en direct, « Annuler »
   * et « Enregistrer »). Une seule section s'édite à la fois ; en quitter
   * une modifiée demande confirmation (bandeau de la fiche). Lot 22 : à
   * l'échec, le premier champ en erreur reçoit le focus.
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
  const sectionError = computed(
    () => editor.errors.value._section ?? editor.errors.value._submit ?? null
  )
  const formRef = ref<HTMLFormElement | null>(null)

  async function submit(): Promise<void> {
    const saved = await editor.save(props.section)
    if (saved) return
    await nextTick()
    const invalid =
      formRef.value?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      formRef.value?.querySelector<HTMLElement>('[role="alert"]')
    invalid?.focus?.({ preventScroll: true })
    invalid?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }
</script>

<template>
  <section
    class="grid gap-3"
    :class="cardClasses(highlight ? 'accent' : 'default')"
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
        <UiButton
          v-if="!open"
          :aria-expanded="false"
          :aria-controls="editId"
          :data-testid="`edit-${section}`"
          @click="editor.start(section)"
        >
          {{ editLabel }}
        </UiButton>
      </div>
    </header>

    <div v-if="!open" class="grid gap-3">
      <slot />
    </div>
    <form
      v-else
      :id="editId"
      ref="formRef"
      class="grid gap-3"
      :aria-label="`Modifier : ${title}`"
      novalidate
      @submit.prevent="submit"
    >
      <slot
        name="edit"
        :draft="editor.draft.value"
        :errors="editor.errors.value"
      />
      <PreviewLine v-if="preview" />
      <UiAlert v-if="sectionError" tabindex="-1">
        {{ sectionError }}
      </UiAlert>
      <slot name="feedback" />
      <div class="flex flex-wrap justify-end gap-2">
        <UiButton
          :aria-expanded="true"
          :aria-controls="editId"
          :data-testid="`cancel-${section}`"
          @click="editor.cancel()"
        >
          Annuler
        </UiButton>
        <UiButton
          type="submit"
          variant="primary"
          :loading="editor.saving.value"
          loading-label="Enregistrement…"
          :data-testid="`save-${section}`"
        >
          Enregistrer
        </UiButton>
      </div>
    </form>
  </section>
</template>
