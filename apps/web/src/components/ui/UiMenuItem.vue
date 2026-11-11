<script setup lang="ts">
  import { DropdownMenuItem } from 'reka-ui'

  /** Lot 22 : une entrée de `UiMenu` (44 px au toucher) ; `select` à l'activation. */
  defineProps<{ disabled?: boolean }>()
  const emit = defineEmits<{ select: [event: Event] }>()
</script>

<template>
  <DropdownMenuItem
    :disabled="disabled"
    class="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60 data-[highlighted]:bg-surface-2 sm:min-h-9 sm:pointer-coarse:min-h-11"
    @select="event => emit('select', event)"
  >
    <slot />
  </DropdownMenuItem>
</template>
