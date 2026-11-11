<script setup lang="ts">
  import { onMounted, ref, watch } from 'vue'
  import type { ExtractionResult } from '@apart/contracts'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiField from '@/components/ui/UiField.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import { useExtraction } from '@/composables/useExtraction'
  import { buttonClasses } from '@/lib/ui'

  const props = defineProps<{
    /** Partage depuis le mobile : texte et lien transmis par la feuille de partage. */
    initialText?: string | null
    initialUrl?: string | null
    /** Lance l'analyse dès l'ouverture (partage). */
    autoAnalyze?: boolean
  }>()
  const emit = defineEmits<{
    extracted: [result: ExtractionResult]
    /** L'IA n'est pas configurée (503) : passer à la saisie manuelle. */
    unavailable: []
    /** Lot 22 : un texte, un lien ou une capture attend (garde des modifications). */
    dirty: [value: boolean]
  }>()

  const extraction = useExtraction()
  if (props.initialText) extraction.text.value = props.initialText
  if (props.initialUrl) extraction.url.value = props.initialUrl
  const dragging = ref(false)
  // Lot 22 : en constante (vue-tsc lit mal « https://… » écrit dans l'attribut d'un composant).
  const URL_PLACEHOLDER = 'https://…'
  const fileButton = buttonClasses({ size: 'sm' })

  async function onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    if (input.files) await extraction.addFiles(input.files)
    input.value = ''
  }

  async function onDrop(event: DragEvent): Promise<void> {
    dragging.value = false
    const files = event.dataTransfer?.files
    if (files) await extraction.addFiles(files)
  }

  async function onPaste(event: ClipboardEvent): Promise<void> {
    const files = [...(event.clipboardData?.items ?? [])]
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter((file): file is File => file !== null)
    if (files.length > 0) await extraction.addFiles(files)
  }

  async function analyze(): Promise<void> {
    const result = await extraction.analyze()
    if (result) emit('extracted', result)
    else if (extraction.unavailable.value) emit('unavailable')
  }

  onMounted(() => {
    if (props.autoAnalyze && extraction.canAnalyze.value) void analyze()
  })

  watch(
    () =>
      extraction.text.value.trim() !== '' ||
      extraction.url.value.trim() !== '' ||
      extraction.images.value.length > 0,
    value => emit('dirty', value),
    { immediate: true }
  )
</script>

<template>
  <div class="grid gap-3" data-testid="extraction-pane">
    <p class="text-sm text-muted">
      Colle le texte de la page d’annonce (ou le mail de l’agence) et, si tu
      veux, dépose des captures d’écran. L’IA remplit la fiche ; tu vérifies
      chaque champ avant d’enregistrer. Rien n’est téléchargé depuis le portail.
    </p>
    <UiField
      id="x-url"
      v-model="extraction.url.value"
      label="Lien de l’annonce"
      quiet
      type="url"
      inputmode="url"
      align="left"
      :placeholder="URL_PLACEHOLDER"
    />
    <UiField
      id="x-text"
      v-model="extraction.text.value"
      as="textarea"
      label="Texte de l’annonce"
      quiet
      :rows="10"
      placeholder="Sélectionne tout le texte de la page d’annonce, copie, colle ici."
      @paste="onPaste"
    />
    <div
      class="grid gap-2 rounded-2xl border border-dashed px-3 py-3 text-sm"
      :class="dragging ? 'border-accent bg-accent-soft' : 'border-line'"
      data-testid="dropzone"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-muted">
          Captures d’écran (jpeg, png, webp ; réduites avant envoi)
        </span>
        <label :class="fileButton" class="cursor-pointer">
          Choisir des fichiers
          <!-- Lot 22 : le sélecteur de fichiers du système, caché derrière le bouton. -->
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            class="sr-only"
            data-testid="file-input"
            @change="onFiles"
          />
        </label>
      </div>
      <ul v-if="extraction.images.value.length" class="flex flex-wrap gap-2">
        <li
          v-for="image in extraction.images.value"
          :key="image.key"
          class="flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-2 text-sm"
        >
          <img
            :src="`data:${image.image.mediaType};base64,${image.image.data}`"
            :alt="image.name"
            class="h-6 w-6 rounded object-cover"
          />
          {{ image.name }}
          <UiButton
            variant="ghost"
            size="icon"
            class="hover:text-bad"
            :aria-label="`Retirer ${image.name}`"
            @click="extraction.removeImage(image.key)"
          >
            <UiIcon name="close" />
          </UiButton>
        </li>
      </ul>
    </div>
    <UiAlert v-if="extraction.error.value">{{
      extraction.error.value
    }}</UiAlert>
    <div class="flex items-center justify-end gap-3">
      <span
        v-if="extraction.pending.value"
        class="text-sm text-muted"
        aria-live="polite"
      >
        Analyse en cours, une vingtaine de secondes…
      </span>
      <UiButton
        variant="primary"
        :disabled="!extraction.canAnalyze.value"
        :loading="extraction.pending.value"
        loading-label="Analyse…"
        data-testid="analyze"
        @click="analyze"
      >
        Analyser
      </UiButton>
    </div>
  </div>
</template>
