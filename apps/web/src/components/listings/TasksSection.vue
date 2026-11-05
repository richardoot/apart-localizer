<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { AgencyRequest, Member, Task } from '@apart/contracts'
  import { taskRequestState } from '@apart/domain'
  import type { TaskRequestStateKind } from '@apart/domain'

  const props = defineProps<{
    tasks: Task[]
    members: Member[]
    /** Lot 17 : les demandes à l'annonceur, pour l'état de chaque tâche demandée. */
    requests?: AgencyRequest[]
  }>()
  const emit = defineEmits<{
    add: [label: string]
    toggle: [taskId: string, done: boolean]
    remove: [taskId: string]
  }>()

  const label = ref('')
  const done = computed(() => props.tasks.filter(t => t.done).length)
  const progress = computed(() =>
    props.tasks.length ? Math.round((done.value / props.tasks.length) * 100) : 0
  )
  const nameOf = (id: string | null): string | null =>
    id ? (props.members.find(m => m.id === id)?.displayName ?? null) : null

  /** Lot 17 : « Demandée le 5 nov. à l'agence », « Réponse du 7 nov. ». */
  const states = computed(
    () =>
      new Map(
        props.tasks.map(task => [
          task.id,
          taskRequestState(
            {
              id: task.id,
              label: task.label,
              field: task.field,
              done: task.done,
              requestId: task.requestId,
              requestedAt: task.requestedAt,
              answeredAt: task.answeredAt,
            },
            (props.requests ?? []).map(r => ({
              id: r.id,
              status: r.status,
              taskIds: r.taskIds,
              createdAt: r.createdAt,
              sentAt: r.sentAt,
              answeredAt: r.answeredAt,
              followUpOfId: r.followUpOfId,
              recipientName: r.recipientName,
            }))
          ),
        ])
      )
  )
  const STATE_TONES: Record<TaskRequestStateKind, string> = {
    none: '',
    draft: 'bg-warn-soft text-warn',
    approved: 'bg-accent-soft text-accent',
    requested: 'bg-accent-soft text-accent',
    answered: 'bg-good-soft text-good',
    unanswered: 'border border-dashed border-muted text-muted',
  }

  function submit(): void {
    const value = label.value.trim()
    if (!value) return
    emit('add', value)
    label.value = ''
  }
</script>

<template>
  <section class="grid gap-2" aria-labelledby="tasks-title">
    <header class="flex items-center justify-between gap-2">
      <h3 id="tasks-title" class="font-display text-base font-semibold">
        À faire pour cette annonce
      </h3>
      <span class="text-xs text-muted" data-testid="tasks-count"
        >{{ done }}/{{ tasks.length }}</span
      >
    </header>
    <div class="h-1 overflow-hidden rounded bg-surface-2" aria-hidden="true">
      <i class="block h-full bg-accent" :style="{ width: `${progress}%` }" />
    </div>
    <ul class="grid gap-1">
      <li
        v-for="task in tasks"
        :key="task.id"
        class="grid grid-cols-[auto_1fr_auto] items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2"
      >
        <input
          :id="`task-${task.id}`"
          type="checkbox"
          class="mt-1 accent-accent"
          :checked="task.done"
          @change="
            emit('toggle', task.id, ($event.target as HTMLInputElement).checked)
          "
        />
        <label
          :for="`task-${task.id}`"
          class="text-sm"
          :class="task.done ? 'text-muted line-through' : ''"
        >
          {{ task.label }}
          <span
            v-if="task.origin === 'missing_field'"
            class="ml-1 rounded-full bg-warn-soft px-1.5 py-px text-[10px] font-semibold tracking-wide text-warn uppercase"
            title="Champ non trouvé par l'extraction IA, transformé en tâche"
            data-testid="task-ai"
            >IA · champ manquant</span
          >
          <span v-if="nameOf(task.assigneeId)" class="text-xs text-muted">
            · {{ nameOf(task.assigneeId) }}</span
          >
          <span
            v-if="states.get(task.id)?.label"
            class="ml-1 inline-block rounded-full px-1.5 py-px text-[11px] font-medium whitespace-nowrap no-underline"
            :class="STATE_TONES[states.get(task.id)?.kind ?? 'none']"
            :data-request-state="states.get(task.id)?.kind"
            data-testid="task-request-state"
            >{{ states.get(task.id)?.label }}</span
          >
        </label>
        <button
          v-if="task.origin === 'manual'"
          type="button"
          class="text-xs text-muted hover:text-bad"
          aria-label="Supprimer la tâche"
          @click="emit('remove', task.id)"
        >
          ✕
        </button>
      </li>
    </ul>
    <p v-if="tasks.length === 0" class="text-sm text-muted">
      Aucune tâche pour cette annonce.
    </p>
    <form class="flex gap-2" @submit.prevent="submit">
      <input
        v-model="label"
        class="flex-1 rounded-lg border border-line bg-bg px-3 py-1.5 text-sm"
        placeholder="Ajouter une tâche (ex. : appeler l'agence)"
        aria-label="Nouvelle tâche"
      />
      <button
        type="submit"
        class="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2"
      >
        Ajouter
      </button>
    </form>
  </section>
</template>
