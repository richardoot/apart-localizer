<script setup lang="ts">
  import { ref } from 'vue'
  import type {
    ExportFormat,
    ExportScope,
    ListingFiltersInput,
  } from '@apart/contracts'
  import { ApiError, api } from '@/lib/api'
  import { saveFile } from '@/lib/download'

  const props = defineProps<{ filters: ListingFiltersInput }>()
  const open = ref(false)
  const busy = ref(false)
  const failure = ref<string | null>(null)

  async function download(
    format: ExportFormat,
    scope: ExportScope
  ): Promise<void> {
    busy.value = true
    failure.value = null
    try {
      saveFile(await api.export(format, scope, props.filters))
      open.value = false
    } catch (error) {
      failure.value =
        error instanceof ApiError ? error.message : "L'export a échoué."
    } finally {
      busy.value = false
    }
  }
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2"
      :aria-expanded="open"
      data-testid="export"
      @click="open = !open"
    >
      Exporter
    </button>
    <div
      v-if="open"
      class="absolute right-0 z-20 mt-2 grid w-64 gap-1 rounded-xl border border-line bg-surface p-2 text-sm shadow-panel"
      role="menu"
    >
      <button
        v-for="choice in [
          {
            format: 'csv',
            scope: 'selection',
            label: 'Sélection affichée · CSV (tableur)',
          },
          {
            format: 'json',
            scope: 'selection',
            label: 'Sélection affichée · JSON',
          },
          {
            format: 'csv',
            scope: 'workspace',
            label: 'Tout l’espace · CSV (tableur)',
          },
          {
            format: 'json',
            scope: 'workspace',
            label: 'Tout l’espace · JSON complet',
          },
        ] as const"
        :key="`${choice.format}-${choice.scope}`"
        type="button"
        role="menuitem"
        class="rounded-lg px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-60"
        :disabled="busy"
        @click="download(choice.format, choice.scope)"
      >
        {{ choice.label }}
      </button>
      <p v-if="failure" role="alert" class="px-2 text-xs text-bad">
        {{ failure }}
      </p>
      <p class="px-2 text-[11px] text-muted">
        CSV : séparateur « ; », UTF-8, pour Excel ou LibreOffice. JSON : tout
        l'espace, sans les photos (docs/export.md).
      </p>
    </div>
  </div>
</template>
