<script setup lang="ts">
  import type { Verdict } from '@apart/contracts'
  import { VERDICT_CLASSES, VERDICT_LABELS } from '@/lib/labels'

  defineProps<{ verdict: Verdict }>()
</script>

<template>
  <span
    class="inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
    :class="VERDICT_CLASSES[verdict]"
    :data-verdict="verdict"
  >
    {{ VERDICT_LABELS[verdict] }}
  </span>
</template>
