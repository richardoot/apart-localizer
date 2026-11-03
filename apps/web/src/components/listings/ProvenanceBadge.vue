<script setup lang="ts">
  import { computed } from 'vue'
  import type { Provenance } from '@apart/contracts'
  import {
    FIELD_SOURCE_CLASSES,
    FIELD_SOURCE_LABELS,
    FIELD_SOURCE_TITLES,
    confidenceClass,
    confidencePercent,
  } from '@/lib/provenance'

  const props = defineProps<{ provenance: Provenance | null | undefined }>()

  const classes = computed(() => {
    if (!props.provenance) return ''
    return props.provenance.source === 'ai'
      ? confidenceClass(props.provenance.confidence)
      : FIELD_SOURCE_CLASSES[props.provenance.source]
  })
  const label = computed(() => {
    if (!props.provenance) return ''
    const base = FIELD_SOURCE_LABELS[props.provenance.source]
    const percent =
      props.provenance.source === 'ai'
        ? confidencePercent(props.provenance.confidence)
        : ''
    return percent ? `${base} ${percent}` : base
  })
  const title = computed(() => {
    if (!props.provenance) return ''
    const parts = [FIELD_SOURCE_TITLES[props.provenance.source]]
    if (props.provenance.confidence !== undefined) {
      parts.push(`confiance ${confidencePercent(props.provenance.confidence)}`)
    }
    if (props.provenance.evidence) {
      parts.push(`Extrait : « ${props.provenance.evidence} »`)
    }
    return parts.join(' · ')
  })
</script>

<template>
  <span
    v-if="provenance"
    class="inline-block rounded-full px-1.5 py-px text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase"
    :class="classes"
    :title="title"
    :data-source="provenance.source"
  >
    {{ label }}
  </span>
</template>
