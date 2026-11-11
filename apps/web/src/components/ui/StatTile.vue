<script setup lang="ts">
  import DefinitionButton from './DefinitionButton.vue'

  /** Lot 25 : `term` ajoute le « ? » du glossaire après l'intitulé (TRI, VAN). */
  defineProps<{
    label: string
    value: string
    hint?: string | undefined
    term?: string | undefined
  }>()
</script>

<template>
  <div class="grid gap-0.5 bg-surface px-4 py-3">
    <span
      class="flex items-center gap-1.5 text-xs tracking-[0.08em] text-muted uppercase"
      >{{ label }}<DefinitionButton v-if="term" :term="term"
    /></span>
    <span class="font-display text-2xl font-bold tabular-nums">{{
      value
    }}</span>
    <span v-if="hint" class="text-xs text-muted">{{ hint }}</span>
  </div>
</template>
