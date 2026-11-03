<script setup lang="ts">
  defineProps<{ isNew: boolean }>()
</script>

<template>
  <span
    v-if="isNew"
    class="inline-block rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold tracking-wide text-accent-fg uppercase"
    title="Vous n'avez pas encore ouvert cette annonce"
  >
    nouvelle
  </span>
</template>
