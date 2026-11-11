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
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiChip from '@/components/ui/UiChip.vue'
  import UiField from '@/components/ui/UiField.vue'
  import { useAction } from '@/composables/useAction'
  import { plural } from '@/lib/format'
  import { cardClasses } from '@/lib/ui'
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

  // Les tâches : cocher, rouvrir, ajouter, supprimer. Lot 22 : la réussite
  // dans la zone de messages (« Annuler » sur une tâche cochée ou rouverte),
  // l'erreur dans le bloc où l'on a cliqué (`errorAt` : une ligne, la barre
  // de l'agence, le formulaire d'ajout).
  const taskAction = useAction('L’enregistrement a échoué.')
  const errorAt = ref<string | null>(null)
  function at(where: string): void {
    errorAt.value = where
    taskAction.clear()
    actions.failure.value = null
  }
  const shownError = computed(
    () => taskAction.error.value ?? actions.failure.value
  )
  const errorFor = (where: string) =>
    errorAt.value === where ? shownError.value : null

  const updateTask = (taskId: string, done: boolean) =>
    mutations.updateTask.mutateAsync({
      id: listingId.value,
      taskId,
      update: { done },
    })
  function toggle(key: string, taskId: string, done: boolean) {
    at(key)
    return taskAction.run(() => updateTask(taskId, done), {
      success: done ? 'Tâche cochée.' : 'Tâche rouverte.',
      undo: () => updateTask(taskId, !done),
    })
  }
  function remove(key: string, taskId: string) {
    at(key)
    return taskAction.run(
      () => mutations.removeTask.mutateAsync({ id: listingId.value, taskId }),
      { success: 'Tâche supprimée.' }
    )
  }

  const text = ref('')
  const askAgency = ref(false)
  const addError = ref<string | null>(null)
  async function add(): Promise<void> {
    const label = taskLabelFor(text.value, askAgency.value)
    if (!label) {
      addError.value = 'Écris la tâche ou la question.'
      return
    }
    addError.value = null
    at('add')
    await taskAction.run(
      () => mutations.addTask.mutateAsync({ id: listingId.value, label }),
      {
        success: askAgency.value
          ? `Question ajoutée : « ${label} ». Prépare le message quand tu veux.`
          : `Tâche ajoutée : « ${label} ».`,
      }
    )
    if (!taskAction.error.value) {
      text.value = ''
      askAgency.value = false
    }
  }

  function showVisit(visitId: string): void {
    void nextTick(() => {
      const card = document.getElementById(`visit-${visitId}`)
      card?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      card?.focus?.({ preventScroll: true })
    })
  }
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
          <UiChip
            v-for="choice in TODO_FILTERS"
            :key="choice.id"
            :selected="filter === choice.id"
            :count="counts[choice.id]"
            :data-filter="choice.id"
            @click="filter = choice.id"
          >
            {{ choice.label }}
          </UiChip>
        </div>
        <span class="text-sm text-muted" data-testid="todo-progress"
          >{{ progress.done }} sur {{ progress.total }} faits</span
        >
      </div>

      <div
        v-if="
          (filter === 'all' || filter === 'agency') &&
          (toAsk.length || drafts.length > 1)
        "
        class="grid gap-2 text-sm"
        :class="cardClasses('default', 'sm')"
        data-testid="todo-agency-bar"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="min-w-0 flex-1 text-muted">
            <template v-if="toAsk.length"
              >{{ plural(toAsk.length, 'question') }} pas encore
              {{ toAsk.length > 1 ? 'posées' : 'posée' }} à
              l’annonceur.</template
            >
            <template v-if="drafts.length > 1">
              {{ drafts.length }} messages attendent ta validation.</template
            >
          </span>
          <UiButton
            v-if="toAsk.length"
            variant="outline"
            :disabled="actions.busy.value"
            data-testid="prepare-message"
            @click="
              () => {
                at('agency-bar')
                void actions.prepare()
              }
            "
          >
            Préparer un message ({{ toAsk.length }})
          </UiButton>
          <UiButton
            v-if="drafts.length > 1"
            variant="primary"
            :disabled="actions.busy.value"
            data-testid="approve-all"
            @click="
              () => {
                at('agency-bar')
                void actions.approve(drafts.map(d => d.id))
              }
            "
          >
            Tout valider ({{ drafts.length }})
          </UiButton>
        </div>
        <UiAlert v-if="errorFor('agency-bar')">{{
          errorFor('agency-bar')
        }}</UiAlert>
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
          :busy="actions.busy.value"
          :error="errorFor(row.key)"
          @toggle="done => toggle(row.key, row.id, done)"
          @remove="remove(row.key, row.id)"
          @approve="
            ids => {
              at(row.key)
              void actions.approve(ids)
            }
          "
          @save="
            (id, update) => {
              at(row.key)
              void actions.save(id, update)
            }
          "
          @cancel="
            id => {
              at(row.key)
              void actions.cancel(id)
            }
          "
          @mark-sent="
            id => {
              at(row.key)
              void actions.markSent(id)
            }
          "
          @follow-up="
            id => {
              at(row.key)
              void actions.followUp(id)
            }
          "
          @no-answer="
            id => {
              at(row.key)
              void actions.noAnswer(id)
            }
          "
          @apply="
            (id, keys) => {
              at(row.key)
              void actions.apply(id, keys)
            }
          "
          @show-visit="showVisit"
        />
      </ul>
      <p
        v-else
        class="text-sm text-muted"
        :class="cardClasses('default', 'sm')"
        data-testid="todo-empty"
      >
        {{
          filter === 'all'
            ? 'Rien à faire pour cette annonce : ajoute une tâche ou une question ci-dessous.'
            : 'Rien de ce type pour cette annonce : choisis « Tout » pour voir le reste.'
        }}
      </p>

      <form
        class="grid gap-2"
        :class="cardClasses('default', 'sm')"
        aria-label="Ajouter une tâche ou une question"
        data-testid="todo-add"
        novalidate
        @submit.prevent="add"
      >
        <div class="flex flex-wrap items-end gap-2">
          <UiField
            id="todo-add-text"
            v-model="text"
            class="min-w-0 flex-[1_1_18rem]"
            label="Ajouter"
            quiet
            :error="addError"
            placeholder="Une tâche, ou une question pour l’agence"
            maxlength="290"
            data-testid="todo-add-text"
          />
          <UiCheckbox
            v-model="askAgency"
            label="À demander à l’agence"
            data-testid="todo-add-agency"
          />
          <UiButton
            type="submit"
            variant="primary"
            :loading="mutations.addTask.isPending.value"
            data-testid="todo-add-submit"
          >
            Ajouter
          </UiButton>
        </div>
        <UiAlert v-if="errorFor('add')">{{ errorFor('add') }}</UiAlert>
      </form>
    </div>

    <aside
      class="grid min-w-0 flex-[1_1_20rem] content-start gap-4"
      aria-label="Contact, visite et visites"
    >
      <ExchangesSection :listing-id="item.listing.id" />
      <UiCard title="Pendant la visite" class="grid gap-2">
        <ul
          v-if="checklist.length"
          class="grid list-disc gap-1 pl-5 text-sm leading-relaxed"
          data-testid="visit-checklist"
        >
          <li v-for="point in checklist" :key="point.id">{{ point.label }}</li>
        </ul>
        <p class="text-sm text-muted">
          Le mode visite réunit sur un écran les points à vérifier (à cocher),
          les photos, une remarque, tes notes et le compte rendu ; il enregistre
          au fil de l’eau, même avec un réseau faible.
        </p>
        <UiButton
          variant="primary"
          icon="camera"
          :to="{ name: 'visit-mode', params: { id: item.listing.id } }"
          data-testid="visit-mode-open"
        >
          Mode visite
        </UiButton>
      </UiCard>
      <UiCard as="div">
        <VisitsSection
          :listing-id="item.listing.id"
          :members="members"
          :me-id="meId"
          @set-status="status => emit('setStatus', status)"
        />
      </UiCard>
    </aside>
  </div>
</template>
