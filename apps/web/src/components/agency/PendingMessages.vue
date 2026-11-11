<script setup lang="ts">
  import { computed } from 'vue'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import { useAction } from '@/composables/useAction'
  import { usePendingAgencyRequests } from '@/composables/useAgencyRequests'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { plural } from '@/lib/format'
  import { cardClasses } from '@/lib/ui'
  import DraftsBatch from './DraftsBatch.vue'

  /**
   * Lot 17 : le bloc « Messages à valider » de la Synthèse, toutes annonces
   * confondues, s'il y en a. Valider par lot ne fait partir aucun message :
   * Claude enverra ceux qui sont validés. Rappelle aussi les messages validés
   * en attente d'envoi et les relances dues. Lot 22 : l'erreur dans le
   * bloc, la réussite dans la zone de messages.
   */
  const pending = usePendingAgencyRequests()
  const { members } = useWorkspace()
  const action = useAction('La validation a échoué.')

  const data = computed(() => pending.data.value ?? null)
  const visible = computed(
    () =>
      Boolean(data.value) &&
      ((data.value?.toApprove.length ?? 0) > 0 ||
        (data.value?.toSend.length ?? 0) > 0 ||
        (data.value?.followUpsDue.length ?? 0) > 0)
  )

  async function approve(ids: string[]): Promise<void> {
    await action.run(() => pending.approve.mutateAsync(ids), {
      success:
        ids.length > 1
          ? `${ids.length} messages validés : Claude peut les envoyer.`
          : 'Message validé : Claude peut l’envoyer.',
    })
  }
</script>

<template>
  <section
    v-if="visible && data"
    class="grid gap-3"
    :class="cardClasses('accent')"
    aria-labelledby="pending-messages-title"
    data-testid="pending-messages"
  >
    <header class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="pending-messages-title" class="font-display text-base font-bold">
        Messages à valider
        <UiBadge
          v-if="data.toApprove.length"
          tone="accent"
          variant="solid"
          class="ml-1"
          >{{ data.toApprove.length }}</UiBadge
        >
      </h2>
      <p class="text-sm text-muted">
        <template v-if="data.toSend.length"
          >{{ plural(data.toSend.length, 'validé') }}, en attente d’envoi par
          Claude</template
        >
        <template v-if="data.toSend.length && data.followUpsDue.length">
          ·
        </template>
        <template v-if="data.followUpsDue.length"
          ><span class="font-medium text-warn">{{
            plural(data.followUpsDue.length, 'relance due', 'relances dues')
          }}</span></template
        >
      </p>
    </header>
    <DraftsBatch
      v-if="data.toApprove.length"
      :requests="data.toApprove"
      :members="members"
      show-listing
      hide-cancel
      :busy="pending.approve.isPending.value"
      @approve="approve"
    />
    <UiAlert v-if="action.error.value">{{ action.error.value }}</UiAlert>
    <p v-if="data.toApprove.length" class="text-xs text-muted">
      Pour corriger ou annuler un message, ouvre sa fiche (onglet « À faire »).
    </p>
    <ul
      v-if="data.followUpsDue.length"
      class="grid gap-1 text-sm"
      data-testid="follow-ups-due"
    >
      <li v-for="r in data.followUpsDue" :key="r.id">
        <RouterLink
          :to="{
            name: 'listing',
            params: { id: r.listingId },
            query: { onglet: 'a-faire' },
          }"
          class="inline-flex min-h-11 items-center text-accent underline sm:min-h-0"
          >{{ r.listing.title }}</RouterLink
        >
        <span class="text-sm text-muted">
          · relance due{{
            r.recipientName ? ` (${r.recipientName})` : ''
          }}</span
        >
      </li>
    </ul>
  </section>
</template>
