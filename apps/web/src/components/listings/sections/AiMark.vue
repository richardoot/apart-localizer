<script setup lang="ts">
  import { computed } from 'vue'
  import type { Provenance } from '@apart/contracts'
  import { confidencePercent } from '@/lib/provenance'

  /**
   * Lot 19 : la marque « IA » d'une valeur lue par l'IA dans l'annonce, à
   * confirmer (provenance enregistrée du champ, avec sa confiance et son
   * extrait au survol). Rien pour une autre provenance.
   */
  const props = defineProps<{ provenance: Provenance | null | undefined }>()
  const title = computed(() => {
    const p = props.provenance
    if (!p) return ''
    return [
      'Valeur lue par l’IA dans l’annonce, à confirmer',
      p.confidence !== undefined
        ? `confiance ${confidencePercent(p.confidence)}`
        : null,
      p.evidence ? `extrait : « ${p.evidence} »` : null,
    ]
      .filter(Boolean)
      .join(' · ')
  })
</script>

<template>
  <span
    v-if="provenance?.source === 'ai'"
    class="ml-1 inline-block rounded-md bg-ai-soft px-1.5 align-[1px] text-[11px] leading-[18px] font-semibold text-ai"
    :title="title"
    data-testid="ai-mark"
    ><span aria-hidden="true">IA</span
    ><span class="sr-only">(valeur lue par l’IA, à confirmer)</span></span
  >
</template>
