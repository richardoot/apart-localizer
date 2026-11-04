<script setup lang="ts">
  import { computed, ref } from 'vue'
  import {
    PopoverArrow,
    PopoverContent,
    PopoverPortal,
    PopoverRoot,
    PopoverTrigger,
  } from 'reka-ui'
  import { glossaryEntry } from '@apart/contracts'

  /**
   * Le bouton « ? » d'un indicateur (lot 9) : sa définition en une phrase,
   * tirée du glossaire partagé avec le MCP (`apart://glossaire`). Un vrai
   * bouton (`aria-expanded`), fermé par Échap ou un clic ailleurs ; aucun
   * `title`, illisible au toucher.
   */
  const props = defineProps<{ term: string }>()
  const entry = computed(() => glossaryEntry(props.term) ?? null)
  const open = ref(false)
</script>

<template>
  <PopoverRoot v-if="entry" v-model:open="open">
    <PopoverTrigger
      class="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface align-middle text-xs leading-none font-semibold text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      :aria-label="`Définition : ${entry.term}`"
      :data-term="term"
    >
      ?
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        side="top"
        align="center"
        :side-offset="6"
        :collision-padding="12"
        class="z-50 w-max max-w-72 rounded-lg border border-line bg-surface p-3 text-xs text-fg shadow-panel"
        :data-definition="term"
      >
        <p class="font-semibold">{{ entry.term }}</p>
        <p class="mt-1 leading-snug">{{ entry.short ?? entry.definition }}</p>
        <PopoverArrow class="fill-[var(--surface)]" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
