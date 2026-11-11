<script setup lang="ts">
  import { computed, nextTick, onMounted, ref, watch } from 'vue'
  import type { ExtractionResult } from '@apart/contracts'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiField from '@/components/ui/UiField.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import { useExtraction } from '@/composables/useExtraction'
  import { useMediaQuery } from '@/composables/useMediaQuery'
  import {
    CAPTURE_HINTS,
    CLIPBOARD_FALLBACK,
    captureState,
    clipboardToCapture,
  } from '@/lib/capture'
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
    /** Lot 24 : enregistrer avec le lien seul (cinq champs à compléter). */
    linkOnly: [url: string]
  }>()

  const extraction = useExtraction()
  if (props.initialText) extraction.text.value = props.initialText
  if (props.initialUrl) extraction.url.value = props.initialUrl
  const dragging = ref(false)
  // Lot 22 : en constante (vue-tsc lit mal « https://… » écrit dans l'attribut d'un composant).
  const URL_PLACEHOLDER = 'https://…'
  const fileButton = buttonClasses({ size: 'sm' })
  const bigFileButton = buttonClasses({ block: true })

  /**
   * Lot 24 : au téléphone (iPhone visé), le lien d'abord, avec « Coller » qui
   * lit le presse-papiers (Safari demande de toucher « Coller » ; refusé ou
   * illisible, on le dit et le champ reçoit le focus), puis les captures
   * d'écran depuis la photothèque, le texte en option. Un lien seul ne dit
   * rien à l'IA : l'écran le dit, et propose d'enregistrer le lien et de
   * compléter soi-même.
   */
  const compact = useMediaQuery('(max-width: 639px)')
  const textOpen = ref(Boolean(props.initialText))
  const showText = computed(
    () => !compact.value || textOpen.value || extraction.text.value !== ''
  )
  const state = computed(() =>
    captureState({
      url: extraction.url.value,
      text: extraction.text.value,
      images: extraction.images.value.length,
    })
  )
  const clipboardNote = ref<string | null>(null)
  const canPaste =
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.readText === 'function'
  async function pasteLink(): Promise<void> {
    clipboardNote.value = null
    try {
      const read = clipboardToCapture(await navigator.clipboard.readText())
      if (!read.url && !read.text) {
        clipboardNote.value =
          'Le presse-papiers est vide : copie d’abord le lien de l’annonce.'
        return
      }
      if (read.url) extraction.url.value = read.url
      if (read.text) {
        extraction.text.value = read.text
        textOpen.value = true
      }
      if (!read.url) {
        clipboardNote.value =
          'Pas de lien dans le presse-papiers : le texte est collé ci-dessous.'
      }
    } catch {
      clipboardNote.value = CLIPBOARD_FALLBACK
      await nextTick()
      document.getElementById('x-url')?.focus()
    }
  }

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
    <p
      class="text-sm text-muted"
      data-testid="capture-hint"
      :data-state="state"
    >
      {{ CAPTURE_HINTS[state] }}
    </p>
    <div class="flex items-end gap-2">
      <UiField
        id="x-url"
        v-model="extraction.url.value"
        class="min-w-0 flex-1"
        label="Lien de l’annonce"
        quiet
        type="url"
        inputmode="url"
        align="left"
        :placeholder="URL_PLACEHOLDER"
      />
      <UiButton
        v-if="canPaste"
        icon="clipboard"
        data-testid="paste-link"
        @click="pasteLink"
      >
        Coller
      </UiButton>
    </div>
    <p
      v-if="clipboardNote"
      class="text-sm text-muted"
      data-testid="clipboard-note"
    >
      {{ clipboardNote }}
    </p>
    <label :class="bigFileButton" class="cursor-pointer sm:hidden">
      <UiIcon name="image" />
      Ajouter des captures d’écran
      <!-- Lot 24 : la photothèque de l'iPhone (jpeg en premier : un HEIC y est converti). -->
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        class="sr-only"
        data-testid="file-input-phone"
        @change="onFiles"
      />
    </label>
    <UiButton
      v-if="!showText"
      variant="link"
      class="justify-self-start"
      data-testid="text-toggle"
      @click="textOpen = true"
    >
      Coller aussi le texte de l’annonce (facultatif)
    </UiButton>
    <UiField
      v-if="showText"
      id="x-text"
      v-model="extraction.text.value"
      as="textarea"
      label="Texte de l’annonce (facultatif)"
      quiet
      :rows="compact ? 5 : 10"
      placeholder="Sélectionne tout le texte de la page d’annonce, copie, colle ici."
      @paste="onPaste"
    />
    <div
      class="grid gap-2 rounded-2xl border border-dashed px-3 py-3 text-sm max-sm:border-0 max-sm:p-0"
      :class="dragging ? 'border-accent bg-accent-soft' : 'border-line'"
      data-testid="dropzone"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-muted max-sm:hidden">
          Captures d’écran (jpeg, png, webp ; réduites avant envoi)
        </span>
        <label :class="fileButton" class="cursor-pointer max-sm:hidden">
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
    <div class="flex flex-wrap items-center justify-end gap-3">
      <span
        v-if="extraction.pending.value"
        class="w-full text-sm text-muted sm:w-auto"
        aria-live="polite"
      >
        Analyse en cours, une vingtaine de secondes…
      </span>
      <UiButton
        v-if="extraction.url.value.trim() && !extraction.pending.value"
        class="max-sm:w-full"
        data-testid="link-only"
        @click="emit('linkOnly', extraction.url.value.trim())"
      >
        Enregistrer avec le lien seul
      </UiButton>
      <UiButton
        variant="primary"
        class="max-sm:w-full"
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
