<script setup lang="ts">
  import type {
    ExportFormat,
    ExportScope,
    ListingFiltersInput,
  } from '@apart/contracts'
  import { api } from '@/lib/api'
  import { saveFile } from '@/lib/download'
  import { useAction } from '@/composables/useAction'
  import UiMenu from '@/components/ui/UiMenu.vue'
  import UiMenuItem from '@/components/ui/UiMenuItem.vue'

  /**
   * L'export de l'espace ou de la sélection (lot 6), dans un menu (lot 22 :
   * reka-ui, Échap, flèches, focus rendu au bouton).
   */
  const props = defineProps<{ filters: ListingFiltersInput }>()
  const action = useAction('L’export a échoué.')

  const choices = [
    {
      format: 'csv',
      scope: 'selection',
      label: 'Sélection affichée · CSV (tableur)',
    },
    { format: 'json', scope: 'selection', label: 'Sélection affichée · JSON' },
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
  ] as const

  async function download(
    format: ExportFormat,
    scope: ExportScope
  ): Promise<void> {
    await action.run(async () => {
      saveFile(await api.export(format, scope, props.filters))
    })
  }
</script>

<template>
  <div class="grid justify-items-end gap-1">
    <UiMenu label="Exporter" data-testid="export">
      <UiMenuItem
        v-for="choice in choices"
        :key="`${choice.format}-${choice.scope}`"
        :disabled="action.pending.value"
        @select="download(choice.format, choice.scope)"
      >
        {{ choice.label }}
      </UiMenuItem>
      <template #footer>
        <p class="px-2.5 pt-1 text-xs text-muted">
          CSV : séparateur « ; », UTF-8, pour Excel ou LibreOffice. JSON : tout
          l’espace, sans les photos.
        </p>
      </template>
    </UiMenu>
    <p v-if="action.error.value" role="alert" class="max-w-72 text-sm text-bad">
      {{ action.error.value }}
    </p>
  </div>
</template>
