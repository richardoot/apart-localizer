<script setup lang="ts">
  defineProps<{
    label: string
    forId: string
    hint?: string | undefined
    error?: string | undefined
    full?: boolean
  }>()
</script>

<template>
  <div class="grid gap-1" :class="full ? 'sm:col-span-2' : ''">
    <label :for="forId" class="text-xs font-medium text-muted">{{
      label
    }}</label>
    <slot />
    <p v-if="error" class="text-xs text-bad" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="text-xs text-muted">{{ hint }}</p>
  </div>
</template>
