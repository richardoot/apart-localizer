<script setup lang="ts">
  import { nextTick, ref, watch } from 'vue'
  import { useListingEditor } from '@/composables/useListingEditor'

  /**
   * Lot 19 : quitter une section modifiée sans l'enregistrer (autre section,
   * autre onglet, fermeture de la fiche) demande confirmation, ici, dans la
   * fiche : jamais de `window.confirm`. Le focus vient sur le choix ; Échap
   * garde les modifications.
   */
  const editor = useListingEditor()
  const stayButton = ref<HTMLButtonElement | null>(null)

  watch(
    () => editor.pending.value,
    value => {
      if (value) void nextTick(() => stayButton.value?.focus())
    }
  )
</script>

<template>
  <div
    v-if="editor.pending.value"
    role="alertdialog"
    aria-modal="false"
    aria-labelledby="unsaved-title"
    aria-describedby="unsaved-text"
    class="sticky top-14 z-10 mb-4 grid gap-2 rounded-xl border border-warn bg-warn-soft px-4 py-3 text-sm text-fg shadow-panel sm:flex sm:items-center sm:justify-between"
    data-testid="unsaved-changes"
    @keydown.escape.stop.prevent="editor.stay()"
  >
    <div class="grid gap-0.5">
      <strong id="unsaved-title" class="font-semibold"
        >Modifications non enregistrées</strong
      >
      <span id="unsaved-text"
        >La section « {{ editor.titleOf(editor.pending.value.section) }} » a des
        modifications qui seront perdues.</span
      >
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        ref="stayButton"
        type="button"
        class="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2 sm:min-h-10"
        data-testid="unsaved-stay"
        @click="editor.stay()"
      >
        Continuer la modification
      </button>
      <button
        type="button"
        class="inline-flex min-h-11 items-center rounded-lg bg-bad px-3 text-sm font-semibold text-surface sm:min-h-10"
        data-testid="unsaved-leave"
        @click="editor.confirmLeave()"
      >
        Abandonner les modifications
      </button>
    </div>
  </div>
</template>
