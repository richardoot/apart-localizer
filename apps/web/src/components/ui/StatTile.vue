<script setup lang="ts">
  defineProps<{ label: string; value: string; hint?: string | undefined }>()
</script>

<template>
  <div class="grid gap-0.5 bg-surface px-4 py-3">
    <span class="text-[11px] tracking-[0.08em] text-muted uppercase">{{
      label
    }}</span>
    <span class="font-display text-2xl font-semibold tabular-nums">{{
      value
    }}</span>
    <span v-if="hint" class="text-xs text-muted">{{ hint }}</span>
  </div>
</template>
