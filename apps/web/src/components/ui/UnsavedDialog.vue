<script setup lang="ts">
  import { computed } from 'vue'
  import {
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogOverlay,
    AlertDialogPortal,
    AlertDialogRoot,
    AlertDialogTitle,
  } from 'reka-ui'
  import { useLeaveGuardStore } from '@/stores/leave-guard'
  import UiButton from './UiButton.vue'

  /**
   * Lot 22 : la boîte commune de la garde des modifications (retour arrière,
   * fermeture d'un panneau, mise à jour de l'application) pour ce qui n'a
   * pas son propre bandeau. Mêmes mots que le bandeau de la fiche ; le focus
   * va sur « Continuer la modification », Échap garde la saisie.
   */
  const store = useLeaveGuardStore()
  const open = computed({
    get: () => store.pending !== null,
    set: value => {
      if (!value) store.stay()
    },
  })
</script>

<template>
  <AlertDialogRoot v-model:open="open">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-[70] bg-black/40" />
      <AlertDialogContent
        class="fixed top-1/2 left-1/2 z-[71] grid w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-3 rounded-2xl border border-warn bg-surface p-5 text-sm text-fg shadow-panel"
        data-testid="unsaved-dialog"
      >
        <AlertDialogTitle class="text-base font-semibold"
          >Modifications non enregistrées</AlertDialogTitle
        >
        <AlertDialogDescription>
          « {{ store.pending?.title }} » a des modifications qui seront perdues.
        </AlertDialogDescription>
        <div class="flex flex-wrap justify-end gap-2">
          <UiButton data-testid="unsaved-stay" @click="store.stay()"
            >Continuer la modification</UiButton
          >
          <UiButton
            variant="danger"
            data-testid="unsaved-leave"
            @click="store.confirmLeave()"
            >Abandonner les modifications</UiButton
          >
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
