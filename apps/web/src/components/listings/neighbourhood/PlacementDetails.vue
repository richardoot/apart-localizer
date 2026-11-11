<script setup lang="ts">
  import { computed } from 'vue'
  import type { ListingContext, ListingLocation } from '@apart/contracts'
  import { precisionBadge } from '@apart/domain'
  import { useContextMutations } from '@/composables/useListingContext'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import { useAction } from '@/composables/useAction'
  import PrecisionBadge from '../PrecisionBadge.vue'

  /**
   * Lot 19 : le détail de la tuile « Repère » de l'onglet Quartier : d'où
   * vient le repère (pastille de précision et son explication, raisons du
   * placement, lot 12), « Préciser l'adresse » quand il n'est pas à
   * l'adresse, et « Relancer le géocodage ».
   */
  const props = defineProps<{
    listingId: string
    context: ListingContext
    location?: ListingLocation | null
  }>()
  const emit = defineEmits<{ precise: [] }>()

  const mutations = useContextMutations()
  const action = useAction('Le géocodage a échoué.')

  const placed = computed(() => ({
    precision: props.context.precision,
    point: props.context.point,
    placement: props.context.placement,
    commune: props.location?.commune ?? null,
    district: props.location?.district ?? null,
  }))
  const badge = computed(() => precisionBadge(placed.value))
  const reasons = computed(() => props.context.placement?.reasons ?? [])

  async function regeocode(): Promise<void> {
    await action.run(() => mutations.regeocode.mutateAsync(props.listingId), {
      success: 'Géocodage relancé.',
    })
  }
</script>

<template>
  <div
    class="grid gap-2 text-sm"
    :class="
      context.approximation.approximate ? 'border-l-4 border-l-warn pl-3' : ''
    "
    data-testid="placement"
  >
    <p class="flex flex-wrap items-center gap-2">
      <PrecisionBadge :location="placed" />
    </p>
    <p>{{ badge.title }}</p>
    <ul
      v-if="reasons.length"
      class="grid gap-0.5 text-sm text-muted"
      data-testid="placement-reasons"
    >
      <li v-for="reason in reasons" :key="reason">{{ reason }}</li>
    </ul>
    <p v-if="context.approximation.note" class="text-xs text-muted">
      {{ context.approximation.note }}
    </p>
    <div class="flex flex-wrap gap-2">
      <UiButton
        v-if="badge.tone !== 'exact'"
        variant="primary"
        data-action="precise-address"
        @click="emit('precise')"
      >
        Préciser l’adresse
      </UiButton>
      <UiButton
        :loading="mutations.regeocode.isPending.value"
        data-action="regeocode"
        @click="regeocode"
      >
        Relancer le géocodage
      </UiButton>
    </div>
    <UiAlert v-if="action.error.value">{{ action.error.value }}</UiAlert>
  </div>
</template>
