<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { usePendingAgencyRequests } from '@/composables/useAgencyRequests'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { ApiError } from '@/lib/api'
  import DraftsBatch from './DraftsBatch.vue'

  /**
   * Lot 17 : le bloc « Messages à valider » de la Synthèse, toutes annonces
   * confondues, s'il y en a. Valider par lot ne fait partir aucun message :
   * Claude enverra ceux qui sont validés. Rappelle aussi les messages validés
   * en attente d'envoi et les relances dues.
   */
  const pending = usePendingAgencyRequests()
  const { members } = useWorkspace()
  const failure = ref<string | null>(null)
  const notice = ref<string | null>(null)

  const data = computed(() => pending.data.value ?? null)
  const visible = computed(
    () =>
      Boolean(data.value) &&
      ((data.value?.toApprove.length ?? 0) > 0 ||
        (data.value?.toSend.length ?? 0) > 0 ||
        (data.value?.followUpsDue.length ?? 0) > 0)
  )

  async function approve(ids: string[]): Promise<void> {
    failure.value = null
    try {
      await pending.approve.mutateAsync(ids)
      notice.value =
        ids.length > 1
          ? `${ids.length} messages validés : Claude peut les envoyer.`
          : 'Message validé : Claude peut l’envoyer.'
    } catch (error) {
      notice.value = null
      failure.value =
        error instanceof ApiError ? error.message : 'La validation a échoué.'
    }
  }
</script>

<template>
  <section
    v-if="visible && data"
    class="grid gap-3 rounded-xl border-2 border-accent bg-surface p-4"
    aria-labelledby="pending-messages-title"
    data-testid="pending-messages"
  >
    <header class="flex flex-wrap items-baseline justify-between gap-2">
      <h2
        id="pending-messages-title"
        class="font-display text-base font-semibold"
      >
        Messages à valider
        <span
          v-if="data.toApprove.length"
          class="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-fg"
          >{{ data.toApprove.length }}</span
        >
      </h2>
      <p class="text-xs text-muted">
        <template v-if="data.toSend.length"
          >{{ data.toSend.length }} validé(s), en attente d’envoi par
          Claude</template
        >
        <template v-if="data.toSend.length && data.followUpsDue.length">
          ·
        </template>
        <template v-if="data.followUpsDue.length"
          ><span class="font-medium text-warn"
            >{{ data.followUpsDue.length }} relance(s) due(s)</span
          ></template
        >
      </p>
    </header>
    <p
      v-if="failure"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ failure }}
    </p>
    <p v-else-if="notice" class="text-sm text-good" aria-live="polite">
      {{ notice }}
    </p>
    <DraftsBatch
      v-if="data.toApprove.length"
      :requests="data.toApprove"
      :members="members"
      show-listing
      hide-cancel
      :busy="pending.approve.isPending.value"
      @approve="approve"
    />
    <p v-if="data.toApprove.length" class="text-xs text-muted">
      Pour corriger ou annuler un message, ouvrez sa fiche (onglet « Échanges
      »).
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
          class="text-accent underline"
          >{{ r.listing.title }}</RouterLink
        >
        <span class="text-xs text-muted">
          · relance due{{
            r.recipientName ? ` (${r.recipientName})` : ''
          }}</span
        >
      </li>
    </ul>
  </section>
</template>
