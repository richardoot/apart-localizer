<script setup lang="ts">
  import UiBadge from '@/components/ui/UiBadge.vue'

  defineProps<{ isNew: boolean }>()
</script>

<template>
  <UiBadge
    v-if="isNew"
    tone="accent"
    variant="solid"
    class="tracking-wide uppercase"
    title="Tu n’as pas encore ouvert cette annonce"
  >
    nouvelle
  </UiBadge>
</template>
