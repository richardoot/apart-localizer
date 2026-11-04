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
  import { ApiError } from '@/lib/api'
  import { formatDate } from '@/lib/format'

  const router = useRouter()
  const { data, me, activeMembers, isOwner } = useWorkspace()
  const { rename, invite, cancel, changeRole, remove, leave } = useMembers()

  const inputClass =
    'rounded-lg border border-line bg-bg px-3 py-1.5 text-sm w-full'
  const buttonClass =
    'rounded-lg border border-line px-3 py-1 text-xs hover:bg-surface-2 disabled:opacity-60'

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

  const failure = ref<string | null>(null)
  const notice = ref<string | null>(null)
  function report(error: unknown, fallback: string): void {
    notice.value = null
    failure.value = error instanceof ApiError ? error.message : fallback
  }

  // Nom de l'espace (propriétaire).
  const name = ref('')
  watch(
    () => workspace.value?.name,
    value => {
      name.value = value ?? ''
    },
    { immediate: true }
  )
  async function saveName(): Promise<void> {
    failure.value = null
    try {
      await rename.mutateAsync(name.value)
      notice.value = 'Espace renommé.'
    } catch (error) {
      report(error, "Le nom n'a pas pu être enregistré.")
    }
  }

  // Invitation.
  const email = ref('')
  const displayName = ref('')
  const formError = ref<string | null>(null)
  const sent = ref<InvitationWriteResult | null>(null)
  const copied = ref(false)

  async function submitInvitation(): Promise<void> {
    formError.value = null
    failure.value = null
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
    try {
      sent.value = await invite.mutateAsync({
        email: address,
        displayName: nameShown,
      })
    } catch (error) {
      sent.value = null
      formError.value =
        error instanceof ApiError
          ? error.message
          : "L'invitation n'a pas pu être enregistrée."
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

  async function cancelInvitation(invitation: Invitation): Promise<void> {
    failure.value = null
    try {
      await cancel.mutateAsync(invitation.id)
      notice.value = `Invitation de ${invitation.displayName} annulée.`
    } catch (error) {
      report(error, "L'invitation n'a pas pu être annulée.")
    }
  }

  // Membres : rôle, retrait, départ, avec confirmation.
  const confirmRemove = ref<string | null>(null)
  const confirmLeave = ref(false)

  async function setRole(member: Member, role: Member['role']): Promise<void> {
    failure.value = null
    try {
      await changeRole.mutateAsync({ memberId: member.id, role })
      notice.value =
        role === 'owner'
          ? `${member.displayName} est maintenant propriétaire.`
          : `${member.displayName} est maintenant membre.`
    } catch (error) {
      report(error, "Le rôle n'a pas pu être changé.")
    }
  }

  async function removeMember(member: Member): Promise<void> {
    failure.value = null
    try {
      await remove.mutateAsync(member.id)
      confirmRemove.value = null
      notice.value = `${member.displayName} a été retiré de l'espace ; son historique reste à son nom.`
    } catch (error) {
      report(error, "Le membre n'a pas pu être retiré.")
    }
  }

  async function leaveWorkspace(): Promise<void> {
    failure.value = null
    try {
      await leave.mutateAsync()
      confirmLeave.value = false
      await router.push('/')
    } catch (error) {
      confirmLeave.value = false
      report(error, "Vous n'avez pas pu quitter l'espace.")
    }
  }

  const canLeave = computed(
    () => me.value?.role !== 'owner' || owners.value > 1
  )
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

    <p
      v-if="failure"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
      role="alert"
      data-testid="workspace-error"
    >
      {{ failure }}
    </p>
    <p
      v-else-if="notice"
      class="rounded-lg bg-good-soft px-3 py-2 text-sm text-good"
      role="status"
    >
      {{ notice }}
    </p>

    <section
      v-if="workspace"
      class="grid gap-3 rounded-xl border border-line bg-surface p-4"
      aria-labelledby="workspace-name-title"
    >
      <h2
        id="workspace-name-title"
        class="font-display text-base font-semibold"
      >
        Nom de l'espace
      </h2>
      <form
        v-if="isOwner"
        class="flex flex-wrap items-end gap-2"
        data-testid="rename-form"
        @submit.prevent="saveName"
      >
        <label class="grid flex-1 gap-1 text-xs font-medium text-muted">
          Nom
          <input
            v-model="name"
            :class="inputClass"
            maxlength="120"
            required
            data-testid="workspace-name"
          />
        </label>
        <button
          type="submit"
          class="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-60"
          :disabled="rename.isPending.value || name.trim() === workspace.name"
        >
          Renommer
        </button>
      </form>
      <p v-else class="text-sm">{{ workspace.name }}</p>
    </section>

    <section
      v-if="workspace"
      class="grid gap-3 rounded-xl border border-line bg-surface p-4"
      aria-labelledby="members-title"
    >
      <h2 id="members-title" class="font-display text-base font-semibold">
        Membres ({{ activeMembers.length }})
      </h2>
      <ul class="grid gap-2" data-testid="members">
        <li
          v-for="member in activeMembers"
          :key="member.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
          :data-member="member.handle"
        >
          <div class="grid gap-0.5">
            <span class="font-medium">
              {{ member.displayName }}
              <span v-if="member.id === me?.id" class="text-muted">(vous)</span>
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
            <button
              v-if="member.role === 'member'"
              type="button"
              :class="buttonClass"
              :disabled="changeRole.isPending.value"
              @click="setRole(member, 'owner')"
            >
              Nommer propriétaire
            </button>
            <button
              v-else
              type="button"
              :class="buttonClass"
              :disabled="changeRole.isPending.value"
              @click="setRole(member, 'member')"
            >
              Rendre membre
            </button>
            <template v-if="confirmRemove === member.id">
              <span class="text-xs">
                {{ member.displayName }} perdra l'accès tout de suite ; ses
                avis, tâches et visites resteront à son nom.
              </span>
              <button
                type="button"
                class="rounded-lg bg-bad px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                :disabled="remove.isPending.value"
                data-testid="confirm-remove"
                @click="removeMember(member)"
              >
                Confirmer le retrait
              </button>
              <button
                type="button"
                :class="buttonClass"
                @click="confirmRemove = null"
              >
                Garder
              </button>
            </template>
            <button
              v-else
              type="button"
              :class="buttonClass"
              :data-remove="member.handle"
              @click="confirmRemove = member.id"
            >
              Retirer
            </button>
          </div>
        </li>
      </ul>

      <div class="flex flex-wrap items-center gap-2 text-sm">
        <template v-if="confirmLeave">
          <span class="text-xs">
            Vous perdrez l'accès à « {{ workspace.name }} » ; vos avis et tâches
            y resteront à votre nom. À votre prochaine visite, vous retrouverez
            une invitation en attente ou un espace à vous.
          </span>
          <button
            type="button"
            class="rounded-lg bg-bad px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
            :disabled="leave.isPending.value"
            data-testid="confirm-leave"
            @click="leaveWorkspace"
          >
            Quitter l'espace
          </button>
          <button
            type="button"
            :class="buttonClass"
            @click="confirmLeave = false"
          >
            Rester
          </button>
        </template>
        <button
          v-else-if="canLeave"
          type="button"
          :class="buttonClass"
          data-testid="leave"
          @click="confirmLeave = true"
        >
          Quitter l'espace…
        </button>
        <p v-else class="text-xs text-muted">
          Vous êtes le dernier propriétaire : nommez un autre propriétaire avant
          de pouvoir partir.
        </p>
      </div>

      <details v-if="formerMembers.length" class="text-sm">
        <summary class="cursor-pointer text-xs text-muted">
          Anciens membres ({{ formerMembers.length }}) : leur historique reste à
          leur nom
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
    </section>

    <section
      v-if="workspace"
      class="grid gap-3 rounded-xl border border-line bg-surface p-4"
      aria-labelledby="invitations-title"
    >
      <h2 id="invitations-title" class="font-display text-base font-semibold">
        Invitations
      </h2>
      <ul
        v-if="invitations.length"
        class="grid gap-2"
        data-testid="invitations"
      >
        <li
          v-for="invitation in invitations"
          :key="invitation.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
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
            <button
              v-if="invitation.state !== 'pending'"
              type="button"
              :class="buttonClass"
              :disabled="invite.isPending.value"
              :data-renew="invitation.email"
              @click="sendInvitation(invitation.email, invitation.displayName)"
            >
              Renouveler
            </button>
            <button
              type="button"
              :class="buttonClass"
              :disabled="cancel.isPending.value"
              :data-cancel="invitation.email"
              @click="cancelInvitation(invitation)"
            >
              {{
                invitation.state === 'pending'
                  ? 'Annuler'
                  : 'Retirer de la liste'
              }}
            </button>
          </div>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">Aucune invitation en cours.</p>

      <form
        v-if="isOwner"
        class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        novalidate
        data-testid="invite-form"
        @submit.prevent="submitInvitation"
      >
        <label class="grid gap-1 text-xs font-medium text-muted">
          Adresse e-mail (celle de son compte Google)
          <input
            v-model="email"
            type="email"
            autocomplete="off"
            :class="inputClass"
            data-testid="invite-email"
          />
        </label>
        <label class="grid gap-1 text-xs font-medium text-muted">
          Nom affiché
          <input
            v-model="displayName"
            :class="inputClass"
            maxlength="120"
            data-testid="invite-name"
          />
        </label>
        <button
          type="submit"
          class="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-60"
          :disabled="
            invite.isPending.value || pendingCount >= MAX_PENDING_INVITATIONS
          "
        >
          Inviter
        </button>
        <p
          v-if="formError"
          class="text-xs text-bad sm:col-span-3"
          role="alert"
          data-testid="invite-error"
        >
          {{ formError }}
        </p>
      </form>
      <p v-else class="text-xs text-muted">
        Seul un propriétaire de l'espace peut inviter.
      </p>

      <div
        v-if="sent"
        class="grid gap-2 rounded-lg bg-accent-soft/50 p-3 text-sm"
        data-testid="invite-result"
      >
        <p v-if="sent.delivery.email === 'sent'">
          E-mail d'invitation envoyé à {{ sent.invitation.email }}.
        </p>
        <p v-else>
          <template v-if="sent.delivery.email === 'failed'">
            L'e-mail n'a pas pu partir.
          </template>
          Transmettez ce lien à {{ sent.invitation.displayName }} : il ou elle
          s'y connecte avec Google, avec l'adresse {{ sent.invitation.email }},
          avant le {{ formatDate(sent.invitation.expiresAt) }}.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <input
            :value="sent.delivery.link"
            readonly
            :class="inputClass"
            class="max-w-md"
            aria-label="Lien de l'application"
            data-testid="invite-link"
          />
          <button type="button" :class="buttonClass" @click="copyLink">
            {{ copied ? 'Copié' : 'Copier le lien' }}
          </button>
        </div>
        <p v-if="sent.renewed" class="text-xs text-muted">
          Invitation renouvelée : la même personne garde son historique si elle
          était déjà venue.
        </p>
      </div>
    </section>
  </section>
</template>
