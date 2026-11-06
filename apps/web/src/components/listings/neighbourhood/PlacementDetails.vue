<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { ListingContext, ListingLocation } from '@apart/contracts'
  import { precisionBadge } from '@apart/domain'
  import { useContextMutations } from '@/composables/useListingContext'
  import { ApiError } from '@/lib/api'
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
  const failure = ref<string | null>(null)

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
    failure.value = null
    try {
      await mutations.regeocode.mutateAsync(props.listingId)
    } catch (err) {
      failure.value =
        err instanceof ApiError ? err.message : 'Le géocodage a échoué.'
    }
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
      class="grid gap-0.5 text-xs text-muted"
      data-testid="placement-reasons"
    >
      <li v-for="reason in reasons" :key="reason">{{ reason }}</li>
    </ul>
    <p v-if="context.approximation.note" class="text-xs text-muted">
      {{ context.approximation.note }}
    </p>
    <div class="flex flex-wrap gap-2">
      <button
        v-if="badge.tone !== 'exact'"
        type="button"
        class="inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-sm font-semibold text-accent-fg sm:min-h-10"
        data-action="precise-address"
        @click="emit('precise')"
      >
        Préciser l’adresse
      </button>
      <button
        type="button"
        class="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2 disabled:opacity-60 sm:min-h-10"
        :disabled="mutations.regeocode.isPending.value"
        data-action="regeocode"
        @click="regeocode"
      >
        Relancer le géocodage
      </button>
    </div>
    <p
      v-if="failure"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ failure }}
    </p>
  </div>
</template>
