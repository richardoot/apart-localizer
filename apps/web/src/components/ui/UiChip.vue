<script setup lang="ts">
  import { computed } from 'vue'
  import { chipClasses } from '@/lib/ui'

  /**
   * Lot 22 : une puce (filtre, choix rapide, raison) : un bouton à bascule
   * (`aria-pressed`), 44 px au toucher. `count` ajoute un compteur.
   */
  const props = withDefaults(
    defineProps<{
      selected?: boolean | undefined
      count?: number | null | undefined
      disabled?: boolean | undefined
      /** Une puce qui n'est pas une bascule (action, lien d'une raison). */
      toggle?: boolean | undefined
    }>(),
    { selected: false, count: null, disabled: false, toggle: true }
  )
  const classes = computed(() => chipClasses(props.selected))
</script>

<template>
  <button
    type="button"
    :class="[classes, 'disabled:cursor-not-allowed disabled:opacity-60']"
    :aria-pressed="toggle ? (selected ? 'true' : 'false') : undefined"
    :disabled="disabled"
  >
    <slot />
    <span
      v-if="count !== null"
      class="rounded-full bg-surface-2 px-1.5 text-xs font-semibold text-fg tabular-nums"
      >{{ count }}</span
    >
  </button>
</template>
