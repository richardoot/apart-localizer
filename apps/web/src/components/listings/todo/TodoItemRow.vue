<script setup lang="ts">
  import { computed } from 'vue'
  import type {
    AgencyAnswerValueKey,
    AgencyRequest,
    Member,
    Task,
  } from '@apart/contracts'
  import type { TodoItem, TodoState } from '@apart/domain'
  import RequestsTimeline from '@/components/agency/RequestsTimeline.vue'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiConfirm from '@/components/ui/UiConfirm.vue'
  import { TODO_GROUP_LABELS, TODO_GROUP_TONES } from '@/lib/todo'
  import DraftMessage from './DraftMessage.vue'

  /**
   * Lot 19 : une ligne de la liste « À faire ». Une tâche se coche et se
   * rouvre ; une tâche ajoutée à la main se supprime après confirmation en
   * ligne. Une question à l'annonceur dit l'état de sa demande et, sur la
   * première ligne de la demande seulement, ses actions : le message à
   * valider, « Je l'ai envoyé » pour un message validé, le suivi de la
   * demande (relance, pas de réponse, réponse et valeur à appliquer). Une
   * visite mène à sa carte. Lot 22 : l'erreur d'une action de la ligne
   * s'affiche dans la ligne (`error`).
   */
  const props = defineProps<{
    item: TodoItem
    task: Task | null
    request: AgencyRequest | null
    /** La ligne porte les actions de sa demande (la première de la demande). */
    showRequest: boolean
    /** Les autres questions du même message. */
    sameMessage: string[]
    members: Member[]
    busy?: boolean
    /** Lot 22 : l'échec de la dernière action lancée depuis cette ligne. */
    error?: string | null
  }>()
  const emit = defineEmits<{
    toggle: [done: boolean]
    remove: []
    approve: [requestIds: string[]]
    save: [requestId: string, update: { subject: string; body: string }]
    cancel: [requestId: string]
    markSent: [requestId: string]
    followUp: [requestId: string]
    noAnswer: [requestId: string]
    apply: [requestId: string, keys: AgencyAnswerValueKey[]]
    showVisit: [visitId: string]
  }>()

  const assignee = computed(() => {
    const id = props.task?.assigneeId ?? null
    return id
      ? (props.members.find(m => m.id === id)?.displayName ?? null)
      : null
  })
  const STATE_TONES: Record<TodoState, string> = {
    open: 'text-muted',
    done: 'text-muted',
    draft: 'font-medium text-warn',
    approved: 'font-medium text-accent',
    requested: 'text-muted',
    follow_up_due: 'font-medium text-warn',
    answered: 'font-medium text-good',
    unanswered: 'text-muted',
    planned: 'text-muted',
    visited: 'text-good',
  }
  const stateText = computed(() => {
    const parts = [props.item.stateLabel, assignee.value].filter(Boolean)
    return parts.join(' · ')
  })
  const tracked = computed(
    () =>
      props.request !== null &&
      ['sent', 'answered', 'no_answer'].includes(props.request.status)
  )
  const checkboxId = computed(() => `todo-${props.item.key.replace(':', '-')}`)
</script>

<template>
  <li
    :id="item.kind === 'task' ? `todo-${item.id}` : undefined"
    class="grid scroll-mt-32 gap-2 rounded-xl border border-line px-3 py-2.5 sm:px-3.5"
    :class="item.done ? 'bg-surface-2/60' : 'bg-surface'"
    :data-key="item.key"
    :data-group="item.group"
    :data-state="item.state"
    data-testid="todo-item"
  >
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <UiCheckbox
        v-if="item.kind === 'task'"
        :id="checkboxId"
        class="-my-2 -ml-1 flex-none px-1"
        :model-value="item.done"
        :aria-label="`${item.done ? 'Rouvrir' : 'Marquer comme fait'} : ${item.title}`"
        data-testid="todo-toggle"
        @update:model-value="value => emit('toggle', value === true)"
      />
      <UiBadge
        class="flex-none"
        :tone="TODO_GROUP_TONES[item.group]"
        data-testid="todo-kind"
        >{{ TODO_GROUP_LABELS[item.group] }}</UiBadge
      >
      <span
        class="min-w-0 flex-[1_1_16rem] font-semibold break-words"
        :class="item.done ? 'text-muted line-through' : 'text-fg'"
        data-testid="todo-title"
      >
        {{ item.title }}
        <UiBadge
          v-if="task?.origin === 'missing_field'"
          tone="ai"
          class="ml-1 no-underline"
          title="Champ pas trouvé par l’extraction IA, transformé en tâche"
          data-testid="task-ai"
          >IA · champ manquant</UiBadge
        >
      </span>
      <span
        v-if="stateText"
        class="text-sm"
        :class="STATE_TONES[item.state]"
        data-testid="todo-state"
        >{{ stateText }}</span
      >
      <span
        v-if="task?.origin === 'manual' || task?.origin === 'opinion'"
        class="inline-flex flex-wrap items-center gap-2"
        data-testid="todo-remove-confirm"
      >
        <UiConfirm
          label="Supprimer"
          variant="ghost"
          icon="trash"
          :question="`Supprimer « ${item.title} » ?`"
          cancel-label="Garder"
          :aria-label="`Supprimer la tâche : ${item.title}`"
          :confirm-attrs="{ 'data-testid': 'todo-remove-yes' }"
          data-testid="todo-remove"
          @confirm="emit('remove')"
        />
      </span>
    </div>
    <UiAlert v-if="error" data-testid="todo-row-error">{{ error }}</UiAlert>

    <p
      v-if="task?.details"
      class="text-sm leading-snug text-muted"
      data-testid="todo-details"
    >
      {{ task.details }}
    </p>
    <p
      v-if="task?.origin === 'opinion'"
      class="text-xs text-muted"
      data-testid="todo-from-opinions"
    >
      Proposée depuis « Nos avis », ajoutée d’un clic.
    </p>

    <template v-if="request">
      <p
        v-if="!showRequest"
        class="text-xs text-muted"
        data-testid="todo-same-message"
      >
        Dans le même message que la question au-dessus.
      </p>
      <template v-else>
        <p
          v-if="sameMessage.length"
          class="text-xs text-muted"
          data-testid="todo-shared"
        >
          Ce message pose aussi : {{ sameMessage.join(' · ') }}
        </p>
        <DraftMessage
          v-if="request.status === 'draft'"
          :request="request"
          :members="members"
          :busy="busy"
          @approve="id => emit('approve', [id])"
          @save="(id, update) => emit('save', id, update)"
          @cancel="id => emit('cancel', id)"
        />
        <div
          v-else-if="request.status === 'approved'"
          class="grid gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm"
          data-testid="todo-approved"
        >
          <p>
            Claude l’enverra par tes outils (Gmail, messagerie du portail) quand
            tu le lui demanderas dans claude.ai (demande « Questions aux agences
            »).
          </p>
          <div class="flex flex-wrap gap-2">
            <UiButton
              :disabled="busy"
              data-testid="mark-sent"
              @click="emit('markSent', request.id)"
            >
              Je l’ai envoyé
            </UiButton>
            <UiButton
              :disabled="busy"
              data-testid="approved-cancel"
              @click="emit('cancel', request.id)"
            >
              Annuler
            </UiButton>
          </div>
        </div>
        <details
          v-else-if="tracked"
          class="rounded-xl bg-surface-2 px-3 py-2 text-sm"
          :open="request.followUpDue || item.state === 'answered'"
          data-testid="todo-request"
        >
          <summary
            class="flex min-h-11 cursor-pointer items-center text-sm font-medium text-accent sm:min-h-9"
          >
            Suivi de la demande
          </summary>
          <div class="pt-2">
            <RequestsTimeline
              :requests="[request]"
              :members="members"
              :busy="busy"
              @no-answer="id => emit('noAnswer', id)"
              @follow-up="id => emit('followUp', id)"
              @apply="(id, keys) => emit('apply', id, keys)"
            />
          </div>
        </details>
      </template>
    </template>

    <div v-if="item.kind === 'visit'" class="flex flex-wrap gap-2">
      <UiButton
        variant="link"
        icon-right="arrow-right"
        class="font-semibold"
        data-testid="todo-show-visit"
        @click="emit('showVisit', item.id)"
      >
        Voir la visite
      </UiButton>
    </div>
  </li>
</template>
