<script setup lang="ts">
  import { JUDGEMENT_SYMBOLS } from '@apart/domain'
  import type { Judgement, JudgementSense } from '@apart/domain'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import type { Tone } from '@/lib/ui'

  /**
   * Lot 25 (ADR 0035) : les trois jugements d'une annonce, toujours étiquetés
   * et toujours dans le même ordre (« Rentabilité », « Recherche »,
   * « Location », de `domain`), partout où ils s'affichent : liste, cartes,
   * fiche, tri, accueil, brouillons. Le sens se lit sans la couleur : le
   * symbole (✓, ~, ✗, ?) et le mot. `compact` prend les formes courtes
   * (« Renta. ») ; le lecteur d'écran entend toujours l'étiquette entière.
   */
  withDefaults(
    defineProps<{
      judgements: readonly Judgement[]
      compact?: boolean
      /** Une seule ligne (la ligne collée du téléphone, qui défile seule). */
      nowrap?: boolean
    }>(),
    { compact: false, nowrap: false }
  )

  const TONES: Record<JudgementSense, Tone> = {
    good: 'good',
    mixed: 'warn',
    bad: 'bad',
    unknown: 'info',
  }
</script>

<template>
  <ul
    v-if="judgements.length"
    class="m-0 flex list-none items-center gap-1.5 p-0"
    :class="nowrap ? 'flex-nowrap' : 'flex-wrap'"
    aria-label="Jugements"
    data-testid="judgements"
  >
    <li v-for="j in judgements" :key="j.key" class="flex max-w-full">
      <UiBadge
        :tone="TONES[j.sense]"
        :title="j.description"
        :data-judgement="j.key"
        :data-sense="j.sense"
        :data-code="j.code"
      >
        <span aria-hidden="true">{{ JUDGEMENT_SYMBOLS[j.sense] }}</span>
        <template v-if="compact">
          <span class="font-normal" aria-hidden="true">{{ j.short }}</span>
          <span class="sr-only">{{ j.label }} :</span>
        </template>
        <span v-else class="font-normal"
          >{{ j.label }}<span class="sr-only"> :</span></span
        >
        <span class="truncate">{{ j.value }}</span>
      </UiBadge>
    </li>
  </ul>
</template>
