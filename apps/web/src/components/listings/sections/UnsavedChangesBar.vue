<script setup lang="ts">
  import { nextTick, ref, watch } from 'vue'
  import { useListingEditor } from '@/composables/useListingEditor'
  import UiButton from '@/components/ui/UiButton.vue'

  /**
   * Lot 19 : quitter une section modifiée sans l'enregistrer (autre section,
   * autre onglet, fermeture de la fiche) demande confirmation, ici, dans la
   * fiche : jamais de `window.confirm`. Le focus vient sur le choix ; Échap
   * garde les modifications. Lot 22 : le bouton retour du navigateur ou du
   * téléphone passe par la même question (garde du routeur) ; le bandeau
   * est ramené à l'écran.
   */
  const editor = useListingEditor()
  const bar = ref<HTMLElement | null>(null)

  watch(
    () => editor.pending.value,
    value => {
      if (!value) return
      void nextTick(() => {
        bar.value?.scrollIntoView?.({ block: 'nearest' })
        bar.value
          ?.querySelector<HTMLElement>('[data-testid="unsaved-stay"]')
          ?.focus({ preventScroll: true })
      })
    }
  )
</script>

<template>
  <div
    v-if="editor.pending.value"
    ref="bar"
    role="alertdialog"
    aria-modal="false"
    aria-labelledby="unsaved-title"
    aria-describedby="unsaved-text"
    class="sticky top-14 z-10 mb-4 grid gap-2 rounded-2xl border border-warn bg-warn-soft px-4 py-3 text-sm text-fg shadow-panel sm:flex sm:items-center sm:justify-between"
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
      <UiButton data-testid="unsaved-stay" @click="editor.stay()">
        Continuer la modification
      </UiButton>
      <UiButton
        variant="danger"
        data-testid="unsaved-leave"
        @click="editor.confirmLeave()"
      >
        Abandonner les modifications
      </UiButton>
    </div>
  </div>
</template>
