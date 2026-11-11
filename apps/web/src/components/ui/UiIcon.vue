<script setup lang="ts">
  import { computed } from 'vue'
  import { ICONS } from '@/lib/icons'
  import type { IconName } from '@/lib/icons'

  /**
   * Lot 22 : une icône du jeu de l'application (`lib/icons.ts`), au trait,
   * à la couleur du texte, 1 em par défaut (`class="size-5"` l'emporte sur
   * les attributs `width` et `height`).
   * Décorative : le bouton qui la porte a son libellé ou son `aria-label`.
   */
  const props = defineProps<{ name: IconName; spin?: boolean }>()
  const paths = computed(() => ICONS[props.name])
</script>

<template>
  <svg
    aria-hidden="true"
    focusable="false"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    width="1em"
    height="1em"
    class="shrink-0"
    :class="spin || name === 'spinner' ? 'animate-spin' : ''"
    :data-icon="name"
  >
    <path v-for="d in paths" :key="d" :d="d" />
  </svg>
</template>
