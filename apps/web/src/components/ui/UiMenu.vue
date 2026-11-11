<script setup lang="ts">
  import {
    DropdownMenuContent,
    DropdownMenuPortal,
    DropdownMenuRoot,
    DropdownMenuTrigger,
  } from 'reka-ui'
  import type { ButtonSize, ButtonVariant } from '@/lib/ui'
  import type { IconName } from '@/lib/icons'
  import UiButton from './UiButton.vue'

  /**
   * Lot 22 : un menu déroulant (reka-ui) : flèches, Échap, clic ailleurs, le
   * focus revient au bouton. Les entrées sont des `UiMenuItem` ; le slot
   * `footer` porte une note ou une erreur sous les entrées. Les attributs
   * (`data-testid`, `aria-label`) vont au bouton.
   */
  defineOptions({ inheritAttrs: false })
  withDefaults(
    defineProps<{
      label: string
      variant?: ButtonVariant | undefined
      size?: ButtonSize | undefined
      icon?: IconName | undefined
      align?: 'start' | 'end' | 'center' | undefined
      /** Largeur du menu (classe Tailwind). */
      width?: string | undefined
    }>(),
    {
      icon: undefined,
      variant: 'secondary',
      size: 'md',
      align: 'end',
      width: 'w-72',
    }
  )
  const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <DropdownMenuRoot v-model:open="open" :modal="false">
    <DropdownMenuTrigger as-child>
      <UiButton
        v-bind="$attrs"
        :variant="variant"
        :size="size"
        :icon="icon"
        icon-right="chevron-down"
        >{{ label }}</UiButton
      >
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        :align="align"
        :side-offset="6"
        :collision-padding="12"
        class="z-50 grid max-w-[calc(100vw-2rem)] gap-1 rounded-xl border border-line bg-surface p-2 text-sm text-fg shadow-panel"
        :class="width"
      >
        <slot />
        <slot name="footer" />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
