<script setup lang="ts">
  import { COMPARE_MAX } from '@apart/contracts'
  import { plural } from '@/lib/format'
  import UiButton from '@/components/ui/UiButton.vue'

  /**
   * Lot 26 (ADR 0036) : la barre « Comparer (n) », collée en bas de la liste
   * (au-dessus de la barre de navigation au téléphone) dès qu'une annonce est
   * cochée, depuis la liste, les cartes ou le tableau. Six au plus : la page
   * Comparer et le serveur s'arrêtent là (`COMPARE_MAX`).
   */
  defineProps<{ count: number }>()
  const emit = defineEmits<{ compare: []; clear: [] }>()
</script>

<template>
  <div
    v-if="count > 0"
    class="sticky bottom-[calc(var(--bottom-nav,0px)+0.5rem)] z-10 mb-[var(--bottom-safe,0px)] flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border border-accent bg-surface px-3 py-2 shadow-lg"
    role="region"
    aria-label="Comparaison"
    data-testid="compare-bar"
  >
    <span class="text-sm" aria-live="polite"
      >{{ plural(count, 'annonce cochée', 'annonces cochées') }}
      <span class="text-muted">({{ COMPARE_MAX }} au plus)</span></span
    >
    <span class="flex flex-1 justify-end gap-2 sm:flex-none">
      <UiButton size="sm" data-testid="compare-clear" @click="emit('clear')">
        Décocher
      </UiButton>
      <UiButton
        variant="primary"
        size="sm"
        :disabled="count < 2"
        data-testid="compare-go"
        @click="emit('compare')"
      >
        Comparer ({{ count }})
      </UiButton>
    </span>
  </div>
</template>
