<script setup lang="ts">
  import type { DpeClass } from '@apart/contracts'
  import { DPE_CLASSES } from '@/lib/labels'

  defineProps<{ dpe: DpeClass | null }>()
</script>

<template>
  <span
    v-if="dpe"
    class="inline-flex h-6 w-6 items-center justify-center rounded font-mono text-xs font-bold"
    :class="DPE_CLASSES[dpe]"
    :title="`DPE ${dpe}`"
  >
    {{ dpe }}
  </span>
  <span v-else class="text-xs text-muted" title="DPE inconnu">?</span>
</template>
