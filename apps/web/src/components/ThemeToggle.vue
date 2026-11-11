<script setup lang="ts">
  import UiButton from '@/components/ui/UiButton.vue'

  defineProps<{ isDark: boolean }>()
  const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <UiButton
    variant="ghost"
    size="sm"
    class="border border-line"
    :aria-label="isDark ? 'Passer au thème clair' : 'Passer au thème sombre'"
    :aria-pressed="isDark"
    @click="emit('toggle')"
  >
    {{ isDark ? 'Clair' : 'Sombre' }}
  </UiButton>
</template>
