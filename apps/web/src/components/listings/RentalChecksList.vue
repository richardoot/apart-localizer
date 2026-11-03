<script setup lang="ts">
  import type { RentalChecksResult } from '@apart/contracts'
  import { CHECK_LEVEL_CLASSES, CHECK_LEVEL_SYMBOLS } from '@/lib/labels'
  import RentalPill from './RentalPill.vue'

  defineProps<{ rental: RentalChecksResult }>()
</script>

<template>
  <section class="grid gap-2" aria-label="Compatibilité location (phase 2)">
    <header class="flex items-center justify-between gap-2">
      <h3 class="font-display text-base font-semibold">
        Compatibilité location en {{ rental.year }}
      </h3>
      <RentalPill :verdict="rental.verdict" />
    </header>
    <ul class="grid gap-1 text-sm">
      <li
        v-for="check in rental.checks"
        :key="check.key"
        class="grid grid-cols-[18px_1fr] gap-1.5"
      >
        <span
          class="font-mono text-xs font-bold"
          :class="CHECK_LEVEL_CLASSES[check.level]"
          :aria-label="check.level"
          >{{ CHECK_LEVEL_SYMBOLS[check.level] }}</span
        >
        <span>{{ check.message }}</span>
      </li>
    </ul>
  </section>
</template>
