<script setup lang="ts">
  import type { FieldChange } from '@/lib/assumptions-form'

  /** « ● modifié · avant 35 000 € » sous un champ modifié (lot 13). */
  defineProps<{
    change: FieldChange | null
    id?: string
    /** Ce qui est modifié, quand le champ n'est pas seul (« prix cible »). */
    subject?: string
  }>()
</script>

<template>
  <p
    v-if="change"
    :id="id"
    class="text-xs font-medium text-accent"
    data-testid="change-note"
  >
    <span aria-hidden="true">●</span>
    {{ subject ? `${subject} modifié` : 'modifié' }} · avant
    {{ change.before }}
  </p>
</template>
