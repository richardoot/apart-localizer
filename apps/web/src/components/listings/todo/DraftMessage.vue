<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { AGENCY_CHANNEL_LABELS } from '@apart/contracts'
  import type { AgencyRequest, Member } from '@apart/contracts'
  import { activityActorName, formatShortParisDay } from '@apart/domain'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiField from '@/components/ui/UiField.vue'
  import { plural } from '@/lib/format'

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
      {{ plural(request.questions.length, 'question')
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
      <!-- Le message va à l'agence : son texte reste au « vous ». -->
      <UiField
        :id="`${ids}-subject`"
        v-model="subject"
        label="Objet"
        quiet
        maxlength="200"
        data-testid="draft-subject"
      />
      <UiField
        :id="`${ids}-body`"
        v-model="body"
        as="textarea"
        label="Message"
        quiet
        :rows="rows"
        maxlength="8000"
        data-testid="draft-body"
      />
      <p v-if="changed" class="text-xs text-warn">
        Texte modifié : enregistre-le avant de valider.
      </p>
    </template>
    <div class="flex flex-wrap items-center gap-2">
      <UiButton
        variant="primary"
        :disabled="busy || changed"
        data-testid="draft-approve"
        @click="emit('approve', request.id)"
      >
        Valider le message
      </UiButton>
      <UiButton
        v-if="!editing"
        :aria-expanded="false"
        data-testid="draft-edit"
        @click="editing = true"
      >
        Modifier
      </UiButton>
      <template v-else>
        <UiButton
          variant="outline"
          :disabled="busy || !changed"
          data-testid="draft-save"
          @click="emit('save', request.id, { subject, body })"
        >
          Enregistrer le texte
        </UiButton>
        <UiButton @click="reset">Revenir au texte</UiButton>
      </template>
      <UiButton
        variant="danger-soft"
        size="sm"
        class="ml-auto"
        :disabled="busy"
        data-testid="draft-cancel"
        @click="emit('cancel', request.id)"
      >
        Annuler ce message
      </UiButton>
    </div>
  </div>
</template>
