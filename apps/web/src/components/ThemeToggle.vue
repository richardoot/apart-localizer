<script setup lang="ts">
  defineProps<{ isDark: boolean }>()
  const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    class="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg"
    :aria-label="isDark ? 'Passer au thème clair' : 'Passer au thème sombre'"
    :aria-pressed="isDark"
    @click="emit('toggle')"
  >
    {{ isDark ? 'Clair' : 'Sombre' }}
  </button>
</template>
