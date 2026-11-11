<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { NegotiationBrief, TargetPrice } from '@apart/contracts'
  import { formatDate } from '@/lib/format'
  import { negotiationBriefText } from '@/lib/negotiation-brief'
  import UiButton from '@/components/ui/UiButton.vue'
  import { cardClasses } from '@/lib/ui'

  /**
   * Lot 19 : les « Arguments » de l'onglet Négocier : les leviers factuels
   * du brief de négociation de `domain` (ancienneté, baisses de prix,
   * travaux, DPE, marché, republication…) et « Copier le brief de
   * négociation » dans le presse-papiers (rien n'est envoyé).
   */
  const props = defineProps<{
    title: string
    price: number
    targetPrice: TargetPrice | null
    negotiation: NegotiationBrief | null
  }>()

  const copyState = ref<'idle' | 'copied' | 'failed'>('idle')
  const text = computed(() =>
    negotiationBriefText({
      title: props.title,
      price: props.price,
      targetPrice: props.targetPrice,
      negotiation: props.negotiation,
    })
  )

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text.value)
      copyState.value = 'copied'
    } catch {
      copyState.value = 'failed'
    }
  }
</script>

<template>
  <section
    class="grid content-start gap-2.5"
    :class="cardClasses()"
    aria-labelledby="negotiation-arguments-title"
    data-testid="negotiation-arguments"
  >
    <h2 id="negotiation-arguments-title" class="text-base font-semibold">
      Arguments
    </h2>
    <ul
      v-if="negotiation && negotiation.arguments.length"
      class="grid list-disc gap-1.5 pl-5 text-sm leading-relaxed"
      aria-label="Arguments de négociation"
    >
      <li
        v-for="argument in negotiation.arguments"
        :key="argument.kind"
        :data-argument="argument.kind"
      >
        {{ argument.text }}
      </li>
    </ul>
    <p v-else class="text-sm text-muted">
      Aucun levier factuel pour l’instant : l’ancienneté, les baisses de prix et
      les travaux en deviendront.
    </p>
    <p
      v-if="negotiation?.republication"
      class="text-sm text-muted"
      data-testid="negotiation-republication"
    >
      Annonce republiée : durée en ligne
      <template v-if="negotiation.daysOnline !== null"
        >({{ negotiation.daysOnline }} jours)</template
      >
      et baisses ({{ negotiation.priceDrops.count }}) comptées depuis la
      première publication<template v-if="negotiation.republication.firstTitle">
        « {{ negotiation.republication.firstTitle }} »</template
      ><template v-if="negotiation.republication.firstSeenAt"
        >, le {{ formatDate(negotiation.republication.firstSeenAt) }}</template
      >.
    </p>
    <UiButton variant="outline" data-testid="copy-brief" @click="copy">
      Copier le brief de négociation
    </UiButton>
    <p
      v-if="copyState !== 'idle'"
      class="text-sm"
      :class="copyState === 'copied' ? 'text-good' : 'text-bad'"
      :role="copyState === 'failed' ? 'alert' : undefined"
      aria-live="polite"
      data-testid="copy-state"
    >
      {{
        copyState === 'copied'
          ? 'Copié : colle-le dans un message ou une note.'
          : 'Copie impossible : le navigateur l’a refusée.'
      }}
    </p>
  </section>
</template>
