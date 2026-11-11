<script setup lang="ts">
  import { computed } from 'vue'
  import UiPopover from '@/components/ui/UiPopover.vue'
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
  /**
   * Lot 24 : l'extrait lu se montre au toucher (iPhone : pas de survol),
   * dans un panneau ancré à la pastille ; sans extrait, une simple pastille.
   */
  const detailed = computed(
    () =>
      Boolean(props.provenance?.evidence) ||
      props.provenance?.confidence !== undefined
  )
  const badgeClass =
    'inline-block rounded-full px-1.5 py-px text-xs font-semibold tracking-wide whitespace-nowrap uppercase'
</script>

<template>
  <UiPopover
    v-if="provenance && detailed"
    :label="`D’où vient la valeur : ${label}`"
    align="start"
  >
    <template #trigger>
      <!-- Lot 24 : une pastille qui se touche (cible agrandie sans changer son dessin). -->
      <button
        type="button"
        :class="[badgeClass, classes]"
        class="relative cursor-pointer after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']"
        :title="title"
        :aria-label="`${label} : voir d’où vient la valeur`"
        :data-source="provenance.source"
        data-testid="provenance-badge"
      >
        {{ label }}
      </button>
    </template>
    <p class="px-1 py-0.5" data-testid="provenance-detail">{{ title }}</p>
  </UiPopover>
  <span
    v-else-if="provenance"
    :class="[badgeClass, classes]"
    :title="title"
    :data-source="provenance.source"
  >
    {{ label }}
  </span>
</template>
