<script setup lang="ts">
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  import type { ReceivedInvitation } from '@apart/contracts'
  import {
    useReceivedInvitations,
    useWorkspace,
  } from '@/composables/useWorkspace'
  import { ApiError } from '@/lib/api'
  import { formatDate } from '@/lib/format'

  /**
   * Une personne déjà inscrite (elle a son propre espace) reçoit une
   * invitation : rejoindre l'espace qui l'invite, ou refuser (lot 8). Rejoindre
   * quitte l'espace actuel, qui reste intact (ADR 0018).
   */
  const router = useRouter()
  const { data, accept, decline } = useReceivedInvitations()
  const { data: current } = useWorkspace()
  const confirming = ref<string | null>(null)
  const failure = ref<string | null>(null)

  async function join(invitation: ReceivedInvitation): Promise<void> {
    failure.value = null
    try {
      await accept.mutateAsync(invitation.id)
      confirming.value = null
      await router.push('/espace')
    } catch (error) {
      confirming.value = null
      failure.value =
        error instanceof ApiError
          ? error.message
          : "Impossible de rejoindre cet espace pour l'instant."
    }
  }

  async function refuse(invitation: ReceivedInvitation): Promise<void> {
    failure.value = null
    try {
      await decline.mutateAsync(invitation.id)
    } catch (error) {
      failure.value =
        error instanceof ApiError
          ? error.message
          : "Le refus n'a pas pu être enregistré."
    }
  }
</script>

<template>
  <section
    v-if="data && data.length > 0"
    class="mx-auto mt-4 grid max-w-6xl gap-2 px-4"
    aria-label="Invitations reçues"
    data-testid="invitation-banner"
  >
    <article
      v-for="invitation in data"
      :key="invitation.id"
      class="grid gap-2 rounded-xl border border-accent bg-accent-soft/50 px-4 py-3 text-sm"
      :data-invitation="invitation.id"
    >
      <p>
        <strong>{{ invitation.invitedByName ?? 'Un propriétaire' }}</strong>
        vous invite à rejoindre l'espace
        <strong>« {{ invitation.workspace.name }} »</strong>
        (sous le nom {{ invitation.displayName }}), jusqu'au
        {{ formatDate(invitation.expiresAt) }}.
      </p>
      <div
        v-if="confirming === invitation.id"
        class="flex flex-wrap items-center gap-2"
      >
        <span class="text-xs">
          Vous quitterez « {{ current?.workspace.name ?? 'votre espace' }} » :
          ses annonces y restent, mais vous n'y aurez plus accès.
        </span>
        <button
          type="button"
          class="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-fg disabled:opacity-60"
          :disabled="accept.isPending.value"
          data-testid="confirm-join"
          @click="join(invitation)"
        >
          Confirmer
        </button>
        <button
          type="button"
          class="rounded-lg border border-line bg-surface px-3 py-1 text-xs"
          @click="confirming = null"
        >
          Pas maintenant
        </button>
      </div>
      <div v-else class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-fg"
          data-testid="join"
          @click="confirming = invitation.id"
        >
          Rejoindre
        </button>
        <button
          type="button"
          class="rounded-lg border border-line bg-surface px-3 py-1 text-xs disabled:opacity-60"
          :disabled="decline.isPending.value"
          data-testid="decline"
          @click="refuse(invitation)"
        >
          Refuser
        </button>
      </div>
    </article>
    <p
      v-if="failure"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
      role="alert"
      data-testid="banner-error"
    >
      {{ failure }}
    </p>
  </section>
</template>
