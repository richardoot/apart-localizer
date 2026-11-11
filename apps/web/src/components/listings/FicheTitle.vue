<script setup lang="ts">
  import { DialogTitle } from 'reka-ui'

  /**
   * Lot 25 : le titre de la fiche, celui du dialogue dans le panneau du
   * téléphone (reka-ui l'annonce), un simple h1 dans la pleine page.
   */
  defineProps<{ page: boolean }>()
</script>

<template>
  <h1 v-if="page"><slot /></h1>
  <DialogTitle v-else as="h1"><slot /></DialogTitle>
</template>
