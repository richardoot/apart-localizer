<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { AGENCY_CHANNEL_LABELS } from '@apart/contracts'
  import type { AgencyRequest, Member } from '@apart/contracts'
  import { activityActorName, formatShortParisDay } from '@apart/domain'

  /**
   * Lot 19 : un message à l'annonceur à valider, dans la ligne de sa question
   * (onglet « À faire »). Le texte se lit en entier ; « Modifier » ouvre
   * l'objet et le texte, à enregistrer avant de valider. « Valider le
   * message » ne fait rien partir : Claude enverra le message validé depuis
   * le Gmail de l'utilisateur ou la messagerie du portail (lot 17).
   */
  const props = withDefaults(
    defineProps<{
      request: AgencyRequest
      members?: Member[]
      busy?: boolean
    }>(),
    { members: () => [], busy: false }
  )
  const emit = defineEmits<{
    approve: [requestId: string]
    save: [requestId: string, update: { subject: string; body: string }]
    cancel: [requestId: string]
  }>()

  const editing = ref(false)
  const subject = ref(props.request.subject)
  const body = ref(props.request.body)
  watch(
    () => [props.request.subject, props.request.body] as const,
    ([s, b]) => {
      if (editing.value) return
      subject.value = s
      body.value = b
    }
  )
  const changed = computed(
    () =>
      subject.value !== props.request.subject ||
      body.value !== props.request.body
  )
  /** Le message se lit en entier : une ligne de plus par ligne du texte (plafonné). */
  const rows = computed(() =>
    Math.min(24, Math.max(8, body.value.split('\n').length + 2))
  )

  function reset(): void {
    subject.value = props.request.subject
    body.value = props.request.body
    editing.value = false
  }

  /** Qui l'a préparé : Claude (pour un membre) ou un membre. */
  const author = computed(() =>
    activityActorName(
      {
        channel: props.request.createdChannel,
        actorMemberId: props.request.createdById,
      },
      new Map(props.members.map(m => [m.id, { displayName: m.displayName }]))
    )
  )
  const ids = computed(() => `draft-${props.request.id}`)
  const button =
    'inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2 disabled:opacity-60 sm:min-h-10'
</script>

<template>
  <div
    class="grid gap-2 rounded-xl bg-surface-2 px-3 py-2.5"
    :data-request="request.id"
    data-testid="draft-message"
  >
    <p class="text-xs text-muted">
      {{ AGENCY_CHANNEL_LABELS[request.channel] }} ·
      {{ request.recipientName ?? 'destinataire à préciser' }} ·
      {{ request.questions.length }} question{{
        request.questions.length > 1 ? 's' : ''
      }}<template v-if="request.followUpOfId"> · relance</template> · préparé
      par {{ author }} le
      {{ formatShortParisDay(request.createdAt) }}
    </p>
    <template v-if="!editing">
      <p class="text-sm font-semibold break-words">{{ request.subject }}</p>
      <pre
        class="font-sans text-sm leading-relaxed break-words whitespace-pre-wrap text-fg"
        data-testid="draft-text"
        >{{ request.body }}</pre>
    </template>
    <template v-else>
      <label :for="`${ids}-subject`" class="text-xs font-medium text-muted"
        >Objet</label
      >
      <input
        :id="`${ids}-subject`"
        v-model="subject"
        maxlength="200"
        class="min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg sm:min-h-10"
        data-testid="draft-subject"
      />
      <label :for="`${ids}-body`" class="text-xs font-medium text-muted"
        >Message</label
      >
      <textarea
        :id="`${ids}-body`"
        v-model="body"
        :rows="rows"
        maxlength="8000"
        class="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm leading-relaxed text-fg"
        data-testid="draft-body"
      />
      <p v-if="changed" class="text-xs text-warn">
        Texte modifié : enregistrez-le avant de valider.
      </p>
    </template>
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="inline-flex min-h-11 items-center rounded-lg bg-accent px-3.5 text-sm font-semibold text-accent-fg disabled:opacity-60 sm:min-h-10"
        :disabled="busy || changed"
        data-testid="draft-approve"
        @click="emit('approve', request.id)"
      >
        Valider le message
      </button>
      <button
        v-if="!editing"
        type="button"
        :class="button"
        :aria-expanded="false"
        data-testid="draft-edit"
        @click="editing = true"
      >
        Modifier
      </button>
      <template v-else>
        <button
          type="button"
          class="inline-flex min-h-11 items-center rounded-lg border border-accent bg-surface px-3 text-sm text-accent disabled:opacity-60 sm:min-h-10"
          :disabled="busy || !changed"
          data-testid="draft-save"
          @click="emit('save', request.id, { subject, body })"
        >
          Enregistrer le texte
        </button>
        <button type="button" :class="button" @click="reset">
          Revenir au texte
        </button>
      </template>
      <button
        type="button"
        class="ml-auto inline-flex min-h-11 items-center text-xs text-muted underline hover:text-bad sm:min-h-0"
        :disabled="busy"
        data-testid="draft-cancel"
        @click="emit('cancel', request.id)"
      >
        Annuler ce message
      </button>
    </div>
  </div>
</template>
