<script setup lang="ts">
  import type { MissingField } from '@apart/contracts'
  import { plural } from '@/lib/format'

  defineProps<{ missing: MissingField[] }>()
</script>

<template>
  <p
    v-if="missing.length > 0"
    class="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted"
    data-testid="missing-fields"
  >
    <strong class="text-fg">
      {{
        plural(missing.length, 'champ indispensable', 'champs indispensables')
      }}
      à compléter :
    </strong>
    {{
      missing
        .map(field =>
          field.reason === 'doubtful'
            ? `${field.label} (lu avec ${Math.round((field.confidence ?? 0) * 100)} % de confiance)`
            : field.label
        )
        .join(', ')
    }}. Chaque champ laissé vide deviendra une tâche de l’annonce.
  </p>
</template>
