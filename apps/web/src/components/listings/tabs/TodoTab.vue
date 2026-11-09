<script setup lang="ts">
  import { computed, nextTick, ref } from 'vue'
  import type {
    AgencyRequest,
    EvaluatedListing,
    ListingStatus,
    Member,
    Task,
  } from '@apart/contracts'
  import { filterTodo, todoItems, todoProgress } from '@apart/domain'
  import type { TodoFilter } from '@apart/domain'
  import ExchangesSection from '@/components/agency/ExchangesSection.vue'
  import VisitsSection from '@/components/visits/VisitsSection.vue'
  import { useExchangeActions } from '@/composables/useExchangeActions'
  import { useListingMutations } from '@/composables/useListings'
  import { useVisits } from '@/composables/useVisits'
  import { ApiError } from '@/lib/api'
  import {
    TODO_FILTERS,
    requestRows,
    taskLabelFor,
    todoCounts,
    visitChecklist,
  } from '@/lib/todo'
  import TodoItemRow from '../todo/TodoItemRow.vue'

  /**
   * Lot 19 (ADR 0029) : « À faire : qu'est-ce qu'il reste à faire ? ». Une
   * seule liste fusionne nos tâches, les questions à l'annonceur (avec l'état
   * de leur demande : message à valider, validé à envoyer, envoyé, relance
   * due, réponse reçue) et les visites (`todoItems` de `domain`), filtrée
   * (Tout, Nous, Agence, Visites), ce qui est fait en bas. À droite : le
   * contact de l'annonceur et la signature (lot 17), ce qu'on vérifie
   * pendant la visite, les visites (création, compte rendu, photos).
   * L'application n'envoie aucun message : un message part seulement après la
   * validation d'un membre, par les outils de l'utilisateur.
   */
  const props = defineProps<{
    item: EvaluatedListing
    members: Member[]
    meId: string | null
  }>()
  const emit = defineEmits<{ setStatus: [status: ListingStatus] }>()

  const listingId = computed(() => props.item.listing.id)
  const actions = useExchangeActions(listingId)
  const visits = useVisits(listingId)
  const mutations = useListingMutations()

  const requests = computed<AgencyRequest[]>(
    () => actions.view.value?.requests ?? []
  )
  const visitList = computed(() => visits.data.value ?? [])
  const items = computed(() =>
    todoItems({
      tasks: props.item.tasks,
      requests: requests.value,
      visits: visitList.value,
    })
  )
  const filter = ref<TodoFilter>('all')
  const shown = computed(() => filterTodo(items.value, filter.value))
  const counts = computed(() => todoCounts(items.value))
  const progress = computed(() => todoProgress(items.value))
  const rows = computed(() => requestRows(shown.value))

  const taskOf = (id: string): Task | null =>
    props.item.tasks.find(t => t.id === id) ?? null
  const requestOf = (id: string | null): AgencyRequest | null =>
    id ? (requests.value.find(r => r.id === id) ?? null) : null

  const drafts = computed(() =>
    requests.value.filter(r => r.status === 'draft')
  )
  const toAsk = computed(
    () =>
      actions.view.value?.openQuestions.filter(q => q.state === 'open') ?? []
  )
  const checklist = computed(() => visitChecklist(props.item.tasks))

  // Les tâches : cocher, rouvrir, ajouter, supprimer.
  const failure = ref<string | null>(null)
  const notice = ref<string | null>(null)
  async function runTask(action: Promise<unknown>, done: string) {
    failure.value = null
    actions.failure.value = null
    try {
      await action
      notice.value = done
      actions.notice.value = null
    } catch (error) {
      notice.value = null
      failure.value =
        error instanceof ApiError ? error.message : "L'enregistrement a échoué."
    }
  }
  const toggle = (taskId: string, done: boolean) =>
    runTask(
      mutations.updateTask.mutateAsync({
        id: listingId.value,
        taskId,
        update: { done },
      }),
      done ? 'Tâche faite.' : 'Tâche rouverte.'
    )
  const remove = (taskId: string) =>
    runTask(
      mutations.removeTask.mutateAsync({ id: listingId.value, taskId }),
      'Tâche supprimée.'
    )

  const text = ref('')
  const askAgency = ref(false)
  const addError = ref<string | null>(null)
  async function add(): Promise<void> {
    const label = taskLabelFor(text.value, askAgency.value)
    if (!label) {
      addError.value = 'Écrivez la tâche ou la question.'
      return
    }
    addError.value = null
    await runTask(
      mutations.addTask.mutateAsync({ id: listingId.value, label }),
      askAgency.value
        ? `Question ajoutée : « ${label} ». Préparez le message quand vous voulez.`
        : `Tâche ajoutée : « ${label} ».`
    )
    if (!failure.value) {
      text.value = ''
      askAgency.value = false
    }
  }

  /** Les actions d'une demande : le message de l'onglet vient du composable. */
  function onAction(): void {
    notice.value = null
    failure.value = null
  }

  function showVisit(visitId: string): void {
    void nextTick(() => {
      const card = document.getElementById(`visit-${visitId}`)
      card?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      card?.focus?.({ preventScroll: true })
    })
  }

  const shownFailure = computed(() => failure.value ?? actions.failure.value)
  const shownNotice = computed(() => notice.value ?? actions.notice.value)

  const pill = (on: boolean) =>
    on
      ? 'border-accent bg-accent text-accent-fg'
      : 'border-line bg-surface text-fg hover:bg-surface-2'
</script>

<template>
  <div
    class="flex flex-wrap items-start gap-4"
    data-testid="tab-todo"
    :data-listing="item.listing.id"
  >
    <div class="grid min-w-0 flex-[999_1_36rem] gap-3">
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div
          role="group"
          aria-label="Filtrer la liste"
          class="flex flex-wrap gap-1.5"
          data-testid="todo-filters"
        >
          <button
            v-for="choice in TODO_FILTERS"
            :key="choice.id"
            type="button"
            class="inline-flex min-h-11 items-center gap-1 rounded-full border-[1.5px] px-3.5 text-sm"
            :class="pill(filter === choice.id)"
            :aria-pressed="filter === choice.id"
            :data-filter="choice.id"
            @click="filter = choice.id"
          >
            {{ choice.label
            }}<span class="text-xs opacity-80">({{ counts[choice.id] }})</span>
          </button>
        </div>
        <span class="text-sm text-muted" data-testid="todo-progress"
          >{{ progress.done }} sur {{ progress.total }} faits</span
        >
      </div>

      <p
        v-if="shownFailure"
        role="alert"
        class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
      >
        {{ shownFailure }}
      </p>
      <p
        v-else-if="shownNotice"
        class="text-sm text-good"
        aria-live="polite"
        data-testid="todo-notice"
      >
        {{ shownNotice }}
      </p>

      <div
        v-if="
          (filter === 'all' || filter === 'agency') &&
          (toAsk.length || drafts.length > 1)
        "
        class="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm"
        data-testid="todo-agency-bar"
      >
        <span class="min-w-0 flex-1 text-muted">
          <template v-if="toAsk.length"
            >{{ toAsk.length }} question{{ toAsk.length > 1 ? 's' : '' }} pas
            encore posée{{ toAsk.length > 1 ? 's' : '' }} à
            l’annonceur.</template
          >
          <template v-if="drafts.length > 1">
            {{ drafts.length }} messages attendent votre validation.</template
          >
        </span>
        <button
          v-if="toAsk.length"
          type="button"
          class="inline-flex min-h-11 items-center rounded-lg border border-accent bg-surface px-3 text-sm font-semibold text-accent disabled:opacity-60 sm:min-h-10"
          :disabled="actions.busy.value"
          data-testid="prepare-message"
          @click="
            () => {
              onAction()
              void actions.prepare()
            }
          "
        >
          Préparer un message ({{ toAsk.length }})
        </button>
        <button
          v-if="drafts.length > 1"
          type="button"
          class="inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-sm font-semibold text-accent-fg disabled:opacity-60 sm:min-h-10"
          :disabled="actions.busy.value"
          data-testid="approve-all"
          @click="
            () => {
              onAction()
              void actions.approve(drafts.map(d => d.id))
            }
          "
        >
          Tout valider ({{ drafts.length }})
        </button>
      </div>

      <ul
        v-if="shown.length"
        class="grid gap-2"
        aria-label="Ce qu’il reste à faire"
        data-testid="todo-list"
      >
        <TodoItemRow
          v-for="row in shown"
          :key="row.key"
          :item="row"
          :task="row.kind === 'task' ? taskOf(row.id) : null"
          :request="requestOf(row.requestId)"
          :show-request="
            row.requestId !== null &&
            rows.get(row.requestId)?.firstKey === row.key
          "
          :same-message="
            row.requestId !== null &&
            rows.get(row.requestId)?.firstKey === row.key
              ? (rows.get(row.requestId)?.others ?? [])
              : []
          "
          :members="members"
          :busy="actions.busy.value || mutations.updateTask.isPending.value"
          @toggle="done => toggle(row.id, done)"
          @remove="remove(row.id)"
          @approve="
            ids => {
              onAction()
              void actions.approve(ids)
            }
          "
          @save="
            (id, update) => {
              onAction()
              void actions.save(id, update)
            }
          "
          @cancel="
            id => {
              onAction()
              void actions.cancel(id)
            }
          "
          @mark-sent="
            id => {
              onAction()
              void actions.markSent(id)
            }
          "
          @follow-up="
            id => {
              onAction()
              void actions.followUp(id)
            }
          "
          @no-answer="
            id => {
              onAction()
              void actions.noAnswer(id)
            }
          "
          @apply="
            (id, keys) => {
              onAction()
              void actions.apply(id, keys)
            }
          "
          @show-visit="showVisit"
        />
      </ul>
      <p
        v-else
        class="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted"
        data-testid="todo-empty"
      >
        {{
          filter === 'all'
            ? 'Rien à faire pour cette annonce.'
            : 'Rien de ce type pour cette annonce.'
        }}
      </p>

      <form
        class="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface px-3 py-3 sm:px-3.5"
        aria-label="Ajouter une tâche ou une question"
        data-testid="todo-add"
        @submit.prevent="add"
      >
        <div class="grid min-w-0 flex-[1_1_18rem] gap-1">
          <label for="todo-add-text" class="text-sm text-muted">Ajouter</label>
          <input
            id="todo-add-text"
            v-model="text"
            class="min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg"
            placeholder="Une tâche, ou une question pour l’agence"
            maxlength="290"
            data-testid="todo-add-text"
          />
        </div>
        <label
          class="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm"
        >
          <input
            v-model="askAgency"
            type="checkbox"
            class="size-[18px] accent-accent"
            data-testid="todo-add-agency"
          />
          À demander à l’agence
        </label>
        <button
          type="submit"
          class="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-60"
          :disabled="mutations.addTask.isPending.value"
          data-testid="todo-add-submit"
        >
          Ajouter
        </button>
        <p v-if="addError" class="w-full text-xs text-bad" role="alert">
          {{ addError }}
        </p>
      </form>
    </div>

    <aside
      class="grid min-w-0 flex-[1_1_20rem] content-start gap-4"
      aria-label="Contact, visite et visites"
    >
      <ExchangesSection :listing-id="item.listing.id" />
      <section
        v-if="checklist.length"
        class="grid gap-2 rounded-2xl border border-line bg-surface p-4 sm:px-5"
        aria-labelledby="visit-checklist-title"
        data-testid="visit-checklist"
      >
        <h2 id="visit-checklist-title" class="text-base font-semibold">
          Pendant la visite
        </h2>
        <ul class="grid list-disc gap-1 pl-5 text-sm leading-relaxed">
          <li v-for="point in checklist" :key="point.id">{{ point.label }}</li>
        </ul>
        <p class="text-xs text-muted">
          Les tâches « Vérifier … » de la liste et les points à revoir à la
          contre-visite (« Nos avis »). Les photos et le compte rendu se
          saisissent dans la visite.
        </p>
      </section>
      <div class="rounded-2xl border border-line bg-surface p-4 sm:px-5">
        <VisitsSection
          :listing-id="item.listing.id"
          :members="members"
          :me-id="meId"
          @set-status="status => emit('setStatus', status)"
        />
      </div>
    </aside>
  </div>
</template>
