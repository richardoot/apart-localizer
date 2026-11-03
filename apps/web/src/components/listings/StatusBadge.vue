<script setup lang="ts">
  import type { ListingStatus } from '@apart/contracts'
  import { LISTING_STATUS_LABELS, STATUS_CLASSES } from '@/lib/labels'

  defineProps<{ status: ListingStatus }>()
</script>

<template>
  <span
    class="inline-block rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap"
    :class="STATUS_CLASSES[status]"
  >
    {{ LISTING_STATUS_LABELS[status] }}
  </span>
</template>
