<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type {
    AgencyAnswerValueKey,
    AgencyRequest,
    Member,
    Task,
  } from '@apart/contracts'
  import type { TodoItem, TodoState } from '@apart/domain'
  import RequestsTimeline from '@/components/agency/RequestsTimeline.vue'
  import { TODO_GROUP_CLASSES, TODO_GROUP_LABELS } from '@/lib/todo'
  import DraftMessage from './DraftMessage.vue'

  /**
   * Lot 19 : une ligne de la liste « À faire ». Une tâche se coche et se
   * rouvre ; une tâche ajoutée à la main se supprime après confirmation en
   * ligne. Une question à l'annonceur dit l'état de sa demande et, sur la
   * première ligne de la demande seulement, ses actions : le message à
   * valider, « Je l'ai envoyé » pour un message validé, le suivi de la
   * demande (relance, pas de réponse, réponse et valeur à appliquer). Une
   * visite mène à sa carte.
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

  const confirmingRemove = ref(false)
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
  const button =
    'inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2 disabled:opacity-60 sm:min-h-10'
</script>

<template>
  <li
    class="grid gap-2 rounded-xl border border-line px-3 py-2.5 sm:px-3.5"
    :class="item.done ? 'bg-surface-2/60' : 'bg-surface'"
    :data-key="item.key"
    :data-group="item.group"
    :data-state="item.state"
    data-testid="todo-item"
  >
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <label
        v-if="item.kind === 'task'"
        :for="checkboxId"
        class="-my-2 -ml-2 inline-flex size-11 flex-none cursor-pointer items-center justify-center"
      >
        <input
          :id="checkboxId"
          type="checkbox"
          class="size-[18px] accent-accent"
          :checked="item.done"
          :aria-label="`${item.done ? 'Rouvrir' : 'Marquer comme fait'} : ${item.title}`"
          data-testid="todo-toggle"
          @change="emit('toggle', ($event.target as HTMLInputElement).checked)"
        />
      </label>
      <span
        class="flex-none rounded-md px-2 py-0.5 text-xs font-semibold"
        :class="TODO_GROUP_CLASSES[item.group]"
        data-testid="todo-kind"
        >{{ TODO_GROUP_LABELS[item.group] }}</span
      >
      <span
        class="min-w-0 flex-[1_1_16rem] font-semibold break-words"
        :class="item.done ? 'text-muted line-through' : 'text-fg'"
        data-testid="todo-title"
      >
        {{ item.title }}
        <span
          v-if="task?.origin === 'missing_field'"
          class="ml-1 rounded-md bg-ai-soft px-1.5 py-px text-[11px] font-semibold text-ai no-underline"
          title="Champ non trouvé par l’extraction IA, transformé en tâche"
          data-testid="task-ai"
          >IA · champ manquant</span
        >
      </span>
      <span
        v-if="stateText"
        class="text-sm"
        :class="STATE_TONES[item.state]"
        data-testid="todo-state"
        >{{ stateText }}</span
      >
      <button
        v-if="task?.origin === 'manual' && !confirmingRemove"
        type="button"
        class="-my-2 inline-flex size-11 flex-none items-center justify-center rounded-lg text-muted hover:text-bad"
        aria-label="Supprimer la tâche"
        data-testid="todo-remove"
        @click="confirmingRemove = true"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>

    <div
      v-if="confirmingRemove"
      class="flex flex-wrap items-center gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm"
      role="alert"
      data-testid="todo-remove-confirm"
    >
      <span class="min-w-0 flex-1">Supprimer « {{ item.title }} » ?</span>
      <button type="button" :class="button" @click="confirmingRemove = false">
        Garder
      </button>
      <button
        type="button"
        class="inline-flex min-h-11 items-center rounded-lg bg-bad px-3 text-sm font-medium text-surface sm:min-h-10"
        data-testid="todo-remove-yes"
        @click="
          () => {
            confirmingRemove = false
            emit('remove')
          }
        "
      >
        Supprimer
      </button>
    </div>

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
            Claude l’enverra par vos outils (Gmail, messagerie du portail) quand
            vous le lui demanderez dans claude.ai (prompt « Questions aux
            agences »).
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              :class="button"
              :disabled="busy"
              data-testid="mark-sent"
              @click="emit('markSent', request.id)"
            >
              Je l’ai envoyé
            </button>
            <button
              type="button"
              :class="button"
              :disabled="busy"
              data-testid="approved-cancel"
              @click="emit('cancel', request.id)"
            >
              Annuler
            </button>
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
      <button
        type="button"
        class="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-2 hover:underline sm:min-h-9"
        data-testid="todo-show-visit"
        @click="emit('showVisit', item.id)"
      >
        Voir la visite →
      </button>
    </div>
  </li>
</template>
