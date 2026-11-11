<script setup lang="ts">
  import {
    PopoverContent,
    PopoverPortal,
    PopoverRoot,
    PopoverTrigger,
  } from 'reka-ui'

  /**
   * Lot 22 : un panneau ancré à un bouton (reka-ui) : Échap et clic ailleurs
   * le ferment, le focus revient au bouton. Le slot `trigger` est le bouton
   * (un seul élément, `UiButton` de préférence) ; le contenu porte son titre
   * (`label`, pour les lecteurs d'écran).
   */
  withDefaults(
    defineProps<{
      label: string
      align?: 'start' | 'end' | 'center' | undefined
      side?: 'top' | 'bottom' | 'left' | 'right' | undefined
      width?: string | undefined
    }>(),
    { align: 'end', side: 'bottom', width: 'w-[min(22rem,calc(100vw-2rem))]' }
  )
  const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :side="side"
        :align="align"
        :side-offset="6"
        :collision-padding="12"
        role="dialog"
        :aria-label="label"
        class="z-50 grid gap-1 rounded-xl border border-line bg-surface p-2 text-sm text-fg shadow-panel"
        :class="width"
      >
        <slot :close="() => (open = false)" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
