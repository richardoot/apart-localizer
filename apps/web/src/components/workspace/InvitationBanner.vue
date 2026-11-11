<script setup lang="ts">
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  import type { ReceivedInvitation } from '@apart/contracts'
  import {
    useReceivedInvitations,
    useWorkspace,
  } from '@/composables/useWorkspace'
  import { useAction } from '@/composables/useAction'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
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
  const action = useAction()

  async function join(invitation: ReceivedInvitation): Promise<void> {
    const joined = await action.run(() => accept.mutateAsync(invitation.id), {
      fallback: "Impossible de rejoindre cet espace pour l'instant.",
    })
    confirming.value = null
    if (joined !== undefined) await router.push('/espace')
  }

  function refuse(invitation: ReceivedInvitation): void {
    void action.run(() => decline.mutateAsync(invitation.id), {
      fallback: "Le refus n'a pas pu être enregistré.",
    })
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
      class="grid gap-2 rounded-2xl border border-accent bg-accent-soft/50 p-4 text-sm sm:px-5"
      :data-invitation="invitation.id"
    >
      <p>
        <strong>{{ invitation.invitedByName ?? 'Un propriétaire' }}</strong>
        t’invite à rejoindre l'espace
        <strong>« {{ invitation.workspace.name }} »</strong>
        (sous le nom {{ invitation.displayName }}), jusqu'au
        {{ formatDate(invitation.expiresAt) }}.
      </p>
      <div
        v-if="confirming === invitation.id"
        class="flex flex-wrap items-center gap-2"
      >
        <span>
          Tu quitteras « {{ current?.workspace.name ?? 'ton espace' }} » : ses
          annonces y restent, mais tu n'y auras plus accès.
        </span>
        <UiButton
          variant="primary"
          size="sm"
          :loading="accept.isPending.value"
          data-testid="confirm-join"
          @click="join(invitation)"
        >
          Confirmer
        </UiButton>
        <UiButton size="sm" @click="confirming = null">
          Pas maintenant
        </UiButton>
      </div>
      <div v-else class="flex flex-wrap gap-2">
        <UiButton
          variant="primary"
          size="sm"
          data-testid="join"
          @click="confirming = invitation.id"
        >
          Rejoindre
        </UiButton>
        <UiButton
          size="sm"
          :loading="decline.isPending.value"
          data-testid="decline"
          @click="refuse(invitation)"
        >
          Refuser
        </UiButton>
      </div>
    </article>
    <UiAlert v-if="action.error.value" data-testid="banner-error">
      {{ action.error.value }}
    </UiAlert>
  </section>
</template>
