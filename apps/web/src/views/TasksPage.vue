<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { WORKFLOW_STAGE_LABELS } from '@apart/contracts'
  import type { OpenTask, OpenTasksGroup } from '@apart/contracts'
  import { openTaskAgeText, openTasksSummaryText } from '@apart/domain'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiSegmented from '@/components/ui/UiSegmented.vue'
  import { useAction } from '@/composables/useAction'
  import { useBackLink } from '@/composables/useBackLink'
  import { useOpenTasks } from '@/composables/useHome'
  import { useListingMutations } from '@/composables/useListings'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { plural } from '@/lib/format'
  import { listingTabQuery } from '@/lib/listing-tabs'

  /**
   * Lot 23 (ADR 0033) : toutes les tâches ouvertes des annonces suivies,
   * depuis l'accueil. Par annonce, celles qui ont du retard d'abord ; dans
   * une annonce, la tâche la plus en retard en tête (`openTasksView` de
   * `domain`). Cocher se fait comme dans la fiche (même route, même journal)
   * et se défait par « Annuler » ; l'erreur s'affiche sous la tâche. Le titre
   * ouvre la fiche sur « À faire », et la fermer revient ici.
   */
  const route = useRoute()
  const router = useRouter()
  const query = useOpenTasks()
  const mutations = useListingMutations()
  const { memberName } = useWorkspace()

  type Filter = 'all' | 'overdue'
  const filter = computed<Filter>({
    get: () => (route.query.retard === '1' ? 'overdue' : 'all'),
    set: next => {
      void router.replace({
        query: next === 'overdue' ? { retard: '1' } : {},
      })
    },
  })
  const data = computed(() => query.data.value ?? null)
  const groups = computed<OpenTasksGroup[]>(() => {
    const all = data.value?.groups ?? []
    if (filter.value === 'all') return all
    return all
      .map(g => ({ ...g, tasks: g.tasks.filter(t => t.overdue) }))
      .filter(g => g.tasks.length > 0)
  })
  const filterOptions = computed(() => [
    { value: 'all' as const, label: 'Toutes', count: data.value?.open ?? null },
    {
      value: 'overdue' as const,
      label: 'En retard',
      count: data.value?.overdue ?? null,
    },
  ])

  const action = useAction('L’enregistrement a échoué.')
  /** La tâche où l'erreur s'affiche. */
  const errorAt = ref<string | null>(null)
  const update = (task: OpenTask, done: boolean) =>
    mutations.updateTask.mutateAsync({
      id: task.listingId,
      taskId: task.id,
      update: { done },
    })
  async function tick(task: OpenTask): Promise<void> {
    errorAt.value = task.id
    await action.run(() => update(task, true), {
      success: `Tâche cochée : « ${task.label} ».`,
      undo: () => update(task, false),
    })
  }

  function openListing(id: string): void {
    void router.push({
      name: 'listing',
      params: { id },
      query: listingTabQuery('a-faire'),
    })
  }
  const back = useBackLink({ name: 'home' }, 'Accueil')
</script>

<template>
  <section class="mx-auto grid max-w-4xl gap-4 px-4 py-5">
    <header class="grid gap-2">
      <UiButton
        variant="link"
        icon="arrow-left"
        class="w-fit"
        data-testid="tasks-back"
        @click="back.go"
        >{{ back.label }}</UiButton
      >
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="font-display text-2xl font-bold">Toutes les tâches</h1>
          <p class="text-sm text-muted" data-testid="tasks-summary">
            <template v-if="data"
              >Sur les annonces suivies :
              {{ openTasksSummaryText(data).toLocaleLowerCase('fr-FR') }}. En
              retard : ouverte depuis plus de
              {{ data.overdueDays }} jours.</template
            >
          </p>
        </div>
        <UiSegmented
          v-model="filter"
          :options="filterOptions"
          label="Quelles tâches"
          data-testid="tasks-filter"
        />
      </div>
    </header>

    <QueryState
      :query="query"
      :empty="groups.length === 0"
      :filtered="filter === 'overdue'"
      empty-title="Rien à faire"
      :empty-text="
        filter === 'overdue'
          ? 'Aucune tâche en retard.'
          : 'Aucune tâche ouverte sur les annonces suivies : tout est fait.'
      "
      skeleton="cards"
      :skeleton-count="2"
      loading-label="les tâches"
      error-fallback="Impossible de lire les tâches."
      @clear-filters="filter = 'all'"
    >
      <UiCard
        v-for="group in groups"
        :key="group.listing.id"
        as="article"
        padding="sm"
        class="grid gap-1"
        :data-listing="group.listing.id"
        data-testid="tasks-group"
      >
        <header class="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 class="min-w-0 text-base font-semibold">
            <UiButton
              variant="link"
              size="inline"
              class="text-left font-semibold"
              data-testid="tasks-open-listing"
              @click="openListing(group.listing.id)"
              >{{ group.listing.title }}</UiButton
            >
          </h2>
          <p class="text-sm text-muted">
            {{ WORKFLOW_STAGE_LABELS[group.listing.stage] }}
            <template v-if="group.listing.commune">
              · {{ group.listing.commune }}</template
            >
            <template v-if="group.overdue">
              ·
              <span class="font-medium text-warn">{{
                plural(group.overdue, 'en retard', 'en retard')
              }}</span></template
            >
          </p>
        </header>
        <ul class="m-0 grid list-none gap-0 p-0">
          <li
            v-for="task in group.tasks"
            :key="task.id"
            class="grid border-t border-line first:border-t-0"
            :data-task="task.id"
            :data-overdue="task.overdue ? 'true' : undefined"
            data-testid="tasks-item"
          >
            <UiCheckbox
              :id="`open-task-${task.id}`"
              :model-value="false"
              :disabled="action.pending.value && errorAt === task.id"
              :aria-label="`Marquer comme fait : ${task.label}`"
              data-testid="tasks-toggle"
              @update:model-value="tick(task)"
            >
              <span class="font-medium">{{ task.label }}</span>
              <span class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <UiBadge v-if="task.overdue" tone="warn">en retard</UiBadge>
                <span class="text-xs text-muted"
                  >{{ openTaskAgeText(task.openDays)
                  }}<template v-if="task.assigneeId">
                    · {{ memberName(task.assigneeId) }}</template
                  ></span
                >
              </span>
            </UiCheckbox>
            <UiAlert
              v-if="errorAt === task.id && action.error.value"
              class="mb-2"
              data-testid="tasks-error"
              >{{ action.error.value }}</UiAlert
            >
          </li>
        </ul>
      </UiCard>
    </QueryState>
  </section>
</template>
