<script setup lang="ts">
  import type { MissingField } from '@apart/contracts'

  defineProps<{ missing: MissingField[] }>()
</script>

<template>
  <p
    v-if="missing.length > 0"
    class="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted"
    data-testid="missing-fields"
  >
    <strong class="text-fg">
      {{ missing.length }} champ(s) indispensable(s) à compléter :
    </strong>
    {{
      missing
        .map(field =>
          field.reason === 'doubtful'
            ? `${field.label} (lu avec ${Math.round((field.confidence ?? 0) * 100)} % de confiance)`
            : field.label
        )
        .join(', ')
    }}. Chaque champ laissé vide deviendra une tâche de l'annonce.
  </p>
</template>
