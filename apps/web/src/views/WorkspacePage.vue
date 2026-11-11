<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    INVITATION_STATE_LABELS,
    InvitationInputSchema,
    MAX_PENDING_INVITATIONS,
    MEMBER_ROLE_LABELS,
  } from '@apart/contracts'
  import type {
    Invitation,
    InvitationWriteResult,
    Member,
  } from '@apart/contracts'
  import { useMembers, useWorkspace } from '@/composables/useWorkspace'
  import { useDecisionSettings } from '@/composables/useWorkflow'
  import { useAction } from '@/composables/useAction'
  import { errorMessage } from '@/lib/errors'
  import { formatDate } from '@/lib/format'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiConfirm from '@/components/ui/UiConfirm.vue'
  import UiField from '@/components/ui/UiField.vue'
  import UiInput from '@/components/ui/UiInput.vue'

  const router = useRouter()
  const { data, me, activeMembers, isOwner } = useWorkspace()
  const { rename, invite, cancel, changeRole, remove, leave } = useMembers()

  const workspace = computed(() => data.value?.workspace ?? null)
  const formerMembers = computed(
    () => workspace.value?.members.filter(m => m.status === 'removed') ?? []
  )
  const invitations = computed(() => workspace.value?.invitations ?? [])
  const pendingCount = computed(
    () => invitations.value.filter(i => i.state === 'pending').length
  )
  const owners = computed(
    () => activeMembers.value.filter(m => m.role === 'owner').length
  )

  /**
   * Lot 22 : chaque bloc a son action ; une erreur s'affiche dans le bloc où
   * l'on a cliqué, une réussite dans la zone de messages commune.
   */
  const nameAction = useAction("Le nom n'a pas pu être enregistré.")
  const decideAction = useAction('Le réglage n’a pas pu être enregistré.')
  const membersAction = useAction()
  const invitationsAction = useAction()

  // Nom de l'espace (propriétaire).
  const name = ref('')
  watch(
    () => workspace.value?.name,
    value => {
      name.value = value ?? ''
    },
    { immediate: true }
  )
  function saveName(): void {
    void nameAction.run(() => rename.mutateAsync(name.value), {
      success: 'Espace renommé.',
    })
  }

  // Invitation.
  const email = ref('')
  const displayName = ref('')
  const formError = ref<string | null>(null)
  const sent = ref<InvitationWriteResult | null>(null)
  const copied = ref(false)

  async function submitInvitation(): Promise<void> {
    formError.value = null
    const parsed = InvitationInputSchema.safeParse({
      email: email.value,
      displayName: displayName.value,
    })
    if (!parsed.success) {
      formError.value = parsed.error.issues.map(i => i.message).join(', ')
      return
    }
    await sendInvitation(parsed.data.email, parsed.data.displayName)
    if (sent.value) {
      email.value = ''
      displayName.value = ''
    }
  }

  async function sendInvitation(
    address: string,
    nameShown: string
  ): Promise<void> {
    copied.value = false
    formError.value = null
    try {
      sent.value = await invite.mutateAsync({
        email: address,
        displayName: nameShown,
      })
    } catch (error) {
      sent.value = null
      formError.value = errorMessage(
        error,
        "L'invitation n'a pas pu être enregistrée."
      )
    }
  }

  async function copyLink(): Promise<void> {
    if (!sent.value) return
    try {
      await navigator.clipboard.writeText(sent.value.delivery.link)
      copied.value = true
    } catch {
      copied.value = false
    }
  }

  function cancelInvitation(invitation: Invitation): void {
    void invitationsAction.run(() => cancel.mutateAsync(invitation.id), {
      success: `Invitation de ${invitation.displayName} annulée.`,
      fallback: "L'invitation n'a pas pu être annulée.",
    })
  }

  // Membres : rôle, retrait, départ, avec confirmation sur place.
  function setRole(member: Member, role: Member['role']): void {
    void membersAction.run(
      () => changeRole.mutateAsync({ memberId: member.id, role }),
      {
        success:
          role === 'owner'
            ? `${member.displayName} est maintenant propriétaire.`
            : `${member.displayName} est maintenant membre.`,
        fallback: "Le rôle n'a pas pu être changé.",
      }
    )
  }

  function removeMember(member: Member): void {
    void membersAction.run(() => remove.mutateAsync(member.id), {
      success: `${member.displayName} a été retiré de l'espace ; son historique reste à son nom.`,
      fallback: "Le membre n'a pas pu être retiré.",
    })
  }

  async function leaveWorkspace(): Promise<void> {
    const left = await membersAction.run(
      async () => {
        await leave.mutateAsync()
        return true
      },
      { fallback: "Tu n'as pas pu quitter l'espace." }
    )
    if (left) await router.push('/')
  }

  const canLeave = computed(
    () => me.value?.role !== 'owner' || owners.value > 1
  )

  // Lot 21 : « Décider à plusieurs ».
  const decisionSettings = useDecisionSettings()
  function toggleDecideTogether(value: boolean): void {
    void decideAction.run(() => decisionSettings.mutateAsync(value), {
      success: value
        ? '« Décider à plusieurs » est activé.'
        : '« Décider à plusieurs » est désactivé.',
    })
  }
</script>

<template>
  <section class="mx-auto grid max-w-4xl gap-6 px-4 py-6">
    <header class="grid gap-1">
      <h1 class="font-display text-2xl font-bold">Espace</h1>
      <p class="text-sm text-muted">
        Les membres partagent les annonces, avis, tâches et visites de l'espace.
        Seul un propriétaire invite, retire un membre ou change un rôle ;
        l'espace garde toujours au moins un propriétaire.
      </p>
    </header>

    <UiCard v-if="workspace" title="Nom de l'espace">
      <form
        v-if="isOwner"
        class="flex flex-wrap items-end gap-2"
        data-testid="rename-form"
        @submit.prevent="saveName"
      >
        <UiField
          id="workspace-name"
          v-model="name"
          label="Nom"
          class="min-w-48 flex-1"
          maxlength="120"
          required
          data-testid="workspace-name"
        />
        <UiButton
          type="submit"
          variant="primary"
          :loading="rename.isPending.value"
          :disabled="name.trim() === workspace.name"
        >
          Renommer
        </UiButton>
      </form>
      <p v-else class="text-sm">{{ workspace.name }}</p>
      <UiAlert v-if="nameAction.error.value" class="mt-3">
        {{ nameAction.error.value }}
      </UiAlert>
    </UiCard>

    <UiCard
      v-if="workspace"
      title="Critères des avis"
      data-testid="opinion-criteria-link"
    >
      <template #actions>
        <UiButton :to="{ name: 'opinion-criteria' }" variant="outline">{{
          isOwner ? 'Régler les critères' : 'Voir les critères'
        }}</UiButton>
      </template>
      <p class="text-sm text-muted">
        Les critères que chacun note sur une annonce (luminosité, calme…) et
        l’avis à l’aveugle.
        {{
          isOwner
            ? 'Renommer, masquer, réordonner, ajouter.'
            : 'Réglés par les propriétaires.'
        }}
      </p>
    </UiCard>

    <UiCard
      v-if="workspace"
      title="Réglage de l’espace"
      data-testid="decide-together"
    >
      <UiCheckbox
        :model-value="workspace.decideTogether"
        :disabled="!isOwner || decisionSettings.isPending.value"
        data-testid="decide-together-input"
        hint="Sont concernés : garder ou écarter un brouillon, passer en À visiter, écarter une annonce. Une visite faite, une offre acceptée ou refusée, une annonce vendue s’appliquent tout de suite. Seuls les propriétaires changent ce réglage."
        @update:model-value="value => toggleDecideTogether(value === true)"
      >
        Décider à plusieurs : un changement d’étape attend l’accord de tous
      </UiCheckbox>
      <UiAlert v-if="decideAction.error.value" class="mt-2">
        {{ decideAction.error.value }}
      </UiAlert>
    </UiCard>

    <UiCard v-if="workspace" :title="`Membres (${activeMembers.length})`">
      <ul class="grid gap-2" data-testid="members">
        <li
          v-for="member in activeMembers"
          :key="member.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm"
          :data-member="member.handle"
        >
          <div class="grid gap-0.5">
            <span class="font-medium">
              {{ member.displayName }}
              <span v-if="member.id === me?.id" class="text-muted">(toi)</span>
            </span>
            <span class="text-xs text-muted">
              {{ member.email ?? 'sans e-mail' }} ·
              {{ MEMBER_ROLE_LABELS[member.role] }}
              <template v-if="!member.authUserId">
                · pas encore connecté</template
              >
              <template v-else-if="member.joinedAt">
                · arrivé le {{ formatDate(member.joinedAt) }}</template
              >
            </span>
          </div>
          <div
            v-if="isOwner && member.id !== me?.id"
            class="flex flex-wrap items-center gap-2"
          >
            <UiButton
              v-if="member.role === 'member'"
              size="sm"
              :disabled="changeRole.isPending.value"
              @click="setRole(member, 'owner')"
            >
              Nommer propriétaire
            </UiButton>
            <UiButton
              v-else
              size="sm"
              :disabled="changeRole.isPending.value"
              @click="setRole(member, 'member')"
            >
              Rendre membre
            </UiButton>
            <UiConfirm
              label="Retirer"
              :question="`${member.displayName} perdra l'accès tout de suite ; ses avis, tâches et visites resteront à son nom.`"
              confirm-label="Confirmer le retrait"
              cancel-label="Garder"
              :busy="remove.isPending.value"
              :data-remove="member.handle"
              :confirm-attrs="{ 'data-testid': 'confirm-remove' }"
              @confirm="removeMember(member)"
            />
          </div>
        </li>
      </ul>

      <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <UiConfirm
          v-if="canLeave"
          label="Quitter l'espace…"
          :question="`Tu perdras l'accès à « ${workspace.name} » ; tes avis et tâches y resteront à ton nom. À ta prochaine visite, tu retrouveras une invitation en attente ou un espace à toi.`"
          confirm-label="Quitter l'espace"
          cancel-label="Rester"
          :busy="leave.isPending.value"
          data-testid="leave"
          :confirm-attrs="{ 'data-testid': 'confirm-leave' }"
          @confirm="leaveWorkspace"
        />
        <p v-else class="text-sm text-muted">
          Tu es le dernier propriétaire : nomme un autre propriétaire avant de
          pouvoir partir.
        </p>
      </div>
      <UiAlert
        v-if="membersAction.error.value"
        class="mt-3"
        data-testid="workspace-error"
      >
        {{ membersAction.error.value }}
      </UiAlert>

      <details v-if="formerMembers.length" class="mt-3 text-sm">
        <summary
          class="flex min-h-11 cursor-pointer items-center text-sm text-muted sm:min-h-8"
        >
          {{ formerMembers.length >= 2 ? 'Anciens membres' : 'Ancien membre' }}
          ({{ formerMembers.length }}) : leur historique reste à leur nom
        </summary>
        <ul class="mt-2 grid gap-1" data-testid="former-members">
          <li v-for="member in formerMembers" :key="member.id">
            {{ member.displayName }}
            <span class="text-xs text-muted">
              · plus membre depuis le {{ formatDate(member.removedAt) }}
            </span>
          </li>
        </ul>
      </details>
    </UiCard>

    <UiCard v-if="workspace" title="Invitations">
      <ul
        v-if="invitations.length"
        class="grid gap-2"
        data-testid="invitations"
      >
        <li
          v-for="invitation in invitations"
          :key="invitation.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm"
          :data-invitation="invitation.email"
        >
          <div class="grid gap-0.5">
            <span class="font-medium">
              {{ invitation.displayName }}
              <span class="text-xs text-muted">{{ invitation.email }}</span>
            </span>
            <span class="text-xs text-muted">
              {{ INVITATION_STATE_LABELS[invitation.state] }}
              <template v-if="invitation.state === 'pending'">
                · valable jusqu'au {{ formatDate(invitation.expiresAt) }}
              </template>
              <template v-else-if="invitation.state === 'expired'">
                le {{ formatDate(invitation.expiresAt) }}
              </template>
              <template v-else-if="invitation.closedAt">
                le {{ formatDate(invitation.closedAt) }}
              </template>
              <template v-if="invitation.invitedBy">
                · par {{ invitation.invitedBy.displayName }}
              </template>
            </span>
          </div>
          <div v-if="isOwner" class="flex flex-wrap gap-2">
            <UiButton
              v-if="invitation.state !== 'pending'"
              size="sm"
              :disabled="invite.isPending.value"
              :data-renew="invitation.email"
              @click="sendInvitation(invitation.email, invitation.displayName)"
            >
              Renouveler
            </UiButton>
            <UiConfirm
              :label="
                invitation.state === 'pending'
                  ? 'Annuler l’invitation'
                  : 'Retirer de la liste'
              "
              :question="
                invitation.state === 'pending'
                  ? `Annuler l’invitation de ${invitation.displayName} ?`
                  : `Retirer l’invitation de ${invitation.displayName} de la liste ?`
              "
              :confirm-label="
                invitation.state === 'pending' ? 'Oui, annuler' : 'Retirer'
              "
              cancel-label="Garder"
              :busy="cancel.isPending.value"
              :data-cancel="invitation.email"
              :confirm-attrs="{ 'data-confirm-cancel': invitation.email }"
              @confirm="cancelInvitation(invitation)"
            />
          </div>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">Aucune invitation en cours.</p>
      <UiAlert v-if="invitationsAction.error.value" class="mt-3">
        {{ invitationsAction.error.value }}
      </UiAlert>

      <form
        v-if="isOwner"
        class="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        novalidate
        data-testid="invite-form"
        @submit.prevent="submitInvitation"
      >
        <UiField
          id="invite-email"
          v-model="email"
          label="Adresse e-mail (celle de son compte Google)"
          type="email"
          autocomplete="off"
          data-testid="invite-email"
        />
        <UiField
          id="invite-name"
          v-model="displayName"
          label="Nom affiché"
          maxlength="120"
          data-testid="invite-name"
        />
        <UiButton
          type="submit"
          variant="primary"
          :loading="invite.isPending.value"
          :disabled="pendingCount >= MAX_PENDING_INVITATIONS"
        >
          Inviter
        </UiButton>
        <p
          v-if="formError"
          class="text-sm font-medium text-bad sm:col-span-3"
          role="alert"
          data-testid="invite-error"
        >
          {{ formError }}
        </p>
      </form>
      <p v-else class="mt-3 text-sm text-muted">
        Seul un propriétaire de l'espace peut inviter.
      </p>

      <div
        v-if="sent"
        class="mt-3 grid gap-2 rounded-xl bg-accent-soft/50 p-3 text-sm"
        data-testid="invite-result"
      >
        <p v-if="sent.delivery.email === 'sent'">
          E-mail d'invitation envoyé à {{ sent.invitation.email }}.
        </p>
        <p v-else>
          <template v-if="sent.delivery.email === 'failed'">
            L'e-mail n'a pas pu partir.
          </template>
          Transmets ce lien à {{ sent.invitation.displayName }} : il ou elle s'y
          connecte avec Google, avec l'adresse {{ sent.invitation.email }},
          avant le {{ formatDate(sent.invitation.expiresAt) }}.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <UiInput
            :model-value="sent.delivery.link"
            readonly
            class="w-full max-w-md"
            align="left"
            aria-label="Lien de l'application"
            data-testid="invite-link"
          />
          <UiButton
            size="sm"
            :icon="copied ? 'check' : undefined"
            @click="copyLink"
          >
            {{ copied ? 'Copié' : 'Copier le lien' }}
          </UiButton>
        </div>
        <p v-if="sent.renewed" class="text-xs text-muted">
          Invitation renouvelée : la même personne garde son historique si elle
          était déjà venue.
        </p>
      </div>
    </UiCard>
  </section>
</template>
