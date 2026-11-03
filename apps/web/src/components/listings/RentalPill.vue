<script setup lang="ts">
  import type { RentalVerdict } from '@apart/contracts'
  import { RENTAL_VERDICT_CLASSES, RENTAL_VERDICT_LABELS } from '@/lib/labels'

  defineProps<{ verdict: RentalVerdict }>()
</script>

<template>
  <span
    class="inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
    :class="RENTAL_VERDICT_CLASSES[verdict]"
  >
    {{ RENTAL_VERDICT_LABELS[verdict] }}
  </span>
</template>
