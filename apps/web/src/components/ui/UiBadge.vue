<script setup lang="ts">
  import { computed } from 'vue'
  import { badgeClasses } from '@/lib/ui'
  import type { BadgeVariant, Tone } from '@/lib/ui'
  import type { IconName } from '@/lib/icons'
  import UiIcon from './UiIcon.vue'

  /**
   * Lot 22 : la pastille de l'application (statut, verdict, provenance,
   * compteur), douce, pleine ou au contour, dans un des tons des jetons.
   * Pleine, son encre suit le thème (`text-bad-fg`…), lisible en sombre.
   */
  const props = withDefaults(
    defineProps<{
      tone?: Tone | undefined
      variant?: BadgeVariant | undefined
      icon?: IconName | undefined
    }>(),
    { tone: 'neutral', variant: 'soft', icon: undefined }
  )
  const classes = computed(() => badgeClasses(props.tone, props.variant))
</script>

<template>
  <span :class="classes" :data-tone="tone">
    <UiIcon v-if="icon" :name="icon" />
    <slot />
  </span>
</template>
