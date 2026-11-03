<script setup lang="ts">
  import { ref } from 'vue'
  import type { ExtractionResult } from '@apart/contracts'
  import { useExtraction } from '@/composables/useExtraction'

  const emit = defineEmits<{ extracted: [result: ExtractionResult] }>()

  const extraction = useExtraction()
  const dragging = ref(false)
  const inputClass =
    'rounded-lg border border-line bg-bg px-3 py-1.5 text-sm w-full'

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
  }
</script>

<template>
  <div class="grid gap-3" data-testid="extraction-pane">
    <p class="text-sm text-muted">
      Collez le texte de la page d'annonce (ou le mail de l'agence) et, si vous
      voulez, déposez des captures d'écran. L'IA remplit la fiche ; vous
      vérifiez chaque champ avant d'enregistrer. Rien n'est téléchargé depuis le
      portail.
    </p>
    <div class="grid gap-1">
      <label for="x-url" class="text-xs font-medium text-muted">
        Lien de l'annonce
      </label>
      <input
        id="x-url"
        v-model="extraction.url.value"
        type="url"
        :class="inputClass"
        placeholder="https://…"
      />
    </div>
    <div class="grid gap-1">
      <label for="x-text" class="text-xs font-medium text-muted">
        Texte de l'annonce
      </label>
      <textarea
        id="x-text"
        v-model="extraction.text.value"
        :class="inputClass"
        rows="10"
        placeholder="Sélectionnez tout le texte de la page d'annonce, copiez, collez ici."
        @paste="onPaste"
      />
    </div>
    <div
      class="grid gap-2 rounded-lg border border-dashed px-3 py-3 text-sm"
      :class="dragging ? 'border-accent bg-accent-soft' : 'border-line'"
      data-testid="dropzone"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-muted">
          Captures d'écran (jpeg, png, webp ; réduites avant envoi)
        </span>
        <label
          class="cursor-pointer rounded-lg border border-line px-3 py-1 text-xs"
        >
          Choisir des fichiers
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
          class="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs"
        >
          <img
            :src="`data:${image.image.mediaType};base64,${image.image.data}`"
            :alt="image.name"
            class="h-6 w-6 rounded object-cover"
          />
          {{ image.name }}
          <button
            type="button"
            class="text-muted hover:text-bad"
            :aria-label="`Retirer ${image.name}`"
            @click="extraction.removeImage(image.key)"
          >
            ✕
          </button>
        </li>
      </ul>
    </div>
    <p
      v-if="extraction.error.value"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ extraction.error.value }}
    </p>
    <div class="flex items-center justify-end gap-3">
      <span
        v-if="extraction.pending.value"
        class="text-xs text-muted"
        aria-live="polite"
      >
        Analyse en cours, une vingtaine de secondes…
      </span>
      <button
        type="button"
        class="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-60"
        :disabled="!extraction.canAnalyze.value"
        data-testid="analyze"
        @click="analyze"
      >
        {{ extraction.pending.value ? 'Analyse…' : 'Analyser' }}
      </button>
    </div>
  </div>
</template>
