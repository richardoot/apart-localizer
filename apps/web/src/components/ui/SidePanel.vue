<script setup lang="ts">
  import {
    DialogContent,
    DialogOverlay,
    DialogPortal,
    DialogRoot,
    DialogTitle,
  } from 'reka-ui'

  defineProps<{ title: string }>()
  const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <DialogRoot :open="true" @update:open="open => !open && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-20 bg-black/30" />
      <DialogContent
        class="fixed inset-y-0 right-0 z-30 flex w-full flex-col bg-surface shadow-panel outline-none sm:w-[min(640px,100%)]"
        :aria-describedby="undefined"
      >
        <header
          class="flex items-start justify-between gap-3 border-b border-line px-4 py-3"
        >
          <DialogTitle class="font-display text-lg font-bold">
            {{ title }}
          </DialogTitle>
          <button
            type="button"
            class="rounded-lg border border-line px-2 py-1 text-sm text-muted hover:bg-surface-2"
            aria-label="Fermer"
            @click="emit('close')"
          >
            ✕
          </button>
        </header>
        <div class="flex-1 overflow-y-auto px-4 py-4">
          <slot />
        </div>
        <footer
          v-if="$slots.footer"
          class="border-t border-line bg-surface px-4 py-3"
        >
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
