<script setup lang="ts">
  /**
   * Lot 22 : le squelette d'un chargement (lignes, cartes ou tableau), à la
   * place des « Chargement… ». Décoratif ; `QueryState` annonce l'attente
   * aux lecteurs d'écran.
   */
  withDefaults(
    defineProps<{
      variant?: 'lines' | 'cards' | 'rows' | 'block' | undefined
      count?: number | undefined
    }>(),
    { variant: 'lines', count: 3 }
  )
</script>

<template>
  <div aria-hidden="true" class="grid gap-3" :data-skeleton="variant">
    <template v-if="variant === 'cards'">
      <div
        v-for="index in count"
        :key="index"
        class="grid gap-3 rounded-2xl border border-line bg-surface p-4"
      >
        <div class="h-4 w-2/3 animate-pulse rounded bg-surface-2" />
        <div class="h-3 w-1/2 animate-pulse rounded bg-surface-2" />
        <div class="h-8 w-full animate-pulse rounded-lg bg-surface-2" />
      </div>
    </template>
    <template v-else-if="variant === 'rows'">
      <div
        v-for="index in count"
        :key="index"
        class="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
      >
        <div class="size-10 shrink-0 animate-pulse rounded-lg bg-surface-2" />
        <div class="grid flex-1 gap-2">
          <div class="h-3.5 w-3/5 animate-pulse rounded bg-surface-2" />
          <div class="h-3 w-2/5 animate-pulse rounded bg-surface-2" />
        </div>
      </div>
    </template>
    <div
      v-else-if="variant === 'block'"
      class="h-40 w-full animate-pulse rounded-2xl bg-surface-2"
    />
    <template v-else>
      <div
        v-for="index in count"
        :key="index"
        class="h-3.5 animate-pulse rounded bg-surface-2"
        :class="index === count ? 'w-3/5' : 'w-full'"
      />
    </template>
  </div>
</template>
