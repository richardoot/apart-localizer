<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { OpinionSummary, Task } from '@apart/contracts'
  import { counterVisitTask } from '@apart/domain'
  import {
    gapText,
    hasOpenTask,
    rowNotes,
    scoreChip,
    scoreToneClass,
    shortDay,
  } from '@/lib/opinions'

  /**
   * Lot 20 : le détail de « Nos avis », critère par critère : la note de
   * chacun (« 4 · bien »), l'écart (« d'accord », « 1 point », « 2 points »),
   * ce que chacun en dit ; les désaccords (2 points ou plus) surlignés. Pour
   * chaque désaccord, « À revoir à la contre-visite : le calme » PROPOSE une
   * tâche pré-remplie (titre et contexte des notes et des mots) ; elle n'est
   * ajoutée à « À faire » qu'au clic de confirmation, jamais d'office.
   */
  const props = defineProps<{
    summary: OpinionSummary
    tasks: readonly Pick<Task, 'label' | 'done'>[]
    /** Ajoute la tâche confirmée ; lance en cas d'échec. */
    addTask?:
      ((task: { label: string; details: string }) => Promise<void>) | undefined
  }>()

  const rated = computed(() =>
    props.summary.members.filter(m => m.state === 'rated')
  )
  const scoreOf = (row: OpinionSummary['rows'][number], memberId: string) =>
    row.scores.find(s => s.memberId === memberId)?.score ?? null

  /** « Notes données après la visite du 14 nov. » quand tous ont visité ensemble. */
  const visitNote = computed(() => {
    const visits = rated.value.map(m => m.afterVisit)
    const first = visits[0]
    if (!first || visits.some(v => v?.visitId !== first.visitId)) return null
    // « 14 nov. » finit déjà par un point ; « 3 mai » non.
    const day = shortDay(first.visitedAt)
    return `Notes données après la visite du ${day}${day.endsWith('.') ? '' : '.'}`
  })

  const proposals = computed(() =>
    props.summary.disagreementKeys
      .map(key => ({ key, task: counterVisitTask(props.summary, key) }))
      .filter(
        (p): p is { key: string; task: { label: string; details: string } } =>
          p.task !== null
      )
  )
  const proposed = ref<string | null>(null)
  const added = ref<string[]>([])
  const busy = ref(false)
  const failure = ref<string | null>(null)

  async function confirm(task: {
    label: string
    details: string
  }): Promise<void> {
    if (!props.addTask) return
    busy.value = true
    failure.value = null
    try {
      await props.addTask(task)
      added.value = [...added.value, task.label]
      proposed.value = null
    } catch (error) {
      failure.value =
        error instanceof Error && error.message
          ? error.message
          : 'La tâche n’a pas pu être ajoutée.'
    } finally {
      busy.value = false
    }
  }

  const button =
    'inline-flex min-h-11 items-center rounded-lg px-3.5 text-sm sm:min-h-10'
</script>

<template>
  <div id="opinions-detail" class="grid gap-3" data-testid="opinions-detail">
    <div class="overflow-x-auto">
      <table class="w-full min-w-[42rem] border-collapse text-sm">
        <thead>
          <tr class="text-left text-xs text-muted">
            <th scope="col" class="px-2.5 py-2 font-semibold">Critère</th>
            <th
              v-for="member in rated"
              :key="member.memberId"
              scope="col"
              class="px-2.5 py-2 font-semibold"
            >
              {{ member.displayName }}
            </th>
            <th scope="col" class="px-2.5 py-2 font-semibold">Écart</th>
            <th scope="col" class="px-2.5 py-2 font-semibold">
              Ce que vous en dites
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in summary.rows"
            :key="row.key"
            class="border-t border-line"
            :class="row.agreement === 'disagree' ? 'bg-warn-soft/60' : ''"
            :data-row="row.key"
            :data-agreement="row.agreement ?? 'none'"
          >
            <th scope="row" class="px-2.5 py-2.5 text-left font-medium">
              {{ row.label }}
            </th>
            <td
              v-for="member in rated"
              :key="member.memberId"
              class="px-2.5 py-2.5"
            >
              <span
                class="inline-block min-w-24 rounded-lg px-2 py-0.5 text-[13px] font-semibold"
                :class="scoreToneClass(scoreOf(row, member.memberId))"
                >{{ scoreChip(scoreOf(row, member.memberId)) }}</span
              >
            </td>
            <td
              class="px-2.5 py-2.5 font-semibold"
              :class="row.agreement === 'disagree' ? 'text-warn' : 'text-muted'"
            >
              {{ gapText(row.gap) }}
            </td>
            <td class="px-2.5 py-2.5 text-[13px] leading-snug text-muted">
              {{ rowNotes(row, summary) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-xs text-muted">
      Écart de 2 points ou plus : à rediscuter. « — » : pas encore d’avis.
      <template v-if="visitNote">{{ visitNote }}</template>
    </p>

    <ul v-if="proposals.length" class="grid gap-2" aria-label="Contre-visite">
      <li
        v-for="p in proposals"
        :key="p.key"
        class="grid gap-2"
        :data-proposal="p.key"
      >
        <span
          v-if="added.includes(p.task.label)"
          class="text-sm font-medium text-good"
          role="status"
          data-testid="counter-visit-added"
          >Tâche ajoutée dans À faire : {{ p.task.label }}</span
        >
        <span
          v-else-if="hasOpenTask(tasks, p.task.label)"
          class="text-sm text-muted"
          data-testid="counter-visit-exists"
          >Déjà dans À faire : {{ p.task.label }}</span
        >
        <div
          v-else-if="proposed === p.key"
          role="group"
          :aria-labelledby="`proposal-${p.key}-title`"
          class="grid gap-2 rounded-xl border border-line bg-bg px-3.5 py-3"
          data-testid="counter-visit-proposal"
        >
          <span class="text-xs font-semibold text-muted"
            >Tâche proposée pour « À faire »</span
          >
          <strong :id="`proposal-${p.key}-title`">{{ p.task.label }}</strong>
          <p class="text-sm leading-snug text-muted">{{ p.task.details }}</p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              :class="[
                button,
                'bg-accent font-semibold text-accent-fg disabled:opacity-60',
              ]"
              :disabled="busy || !addTask"
              data-testid="counter-visit-confirm"
              @click="confirm(p.task)"
            >
              Ajouter à À faire
            </button>
            <button
              type="button"
              :class="[
                button,
                'border border-line bg-surface hover:bg-surface-2',
              ]"
              @click="proposed = null"
            >
              Annuler
            </button>
          </div>
        </div>
        <button
          v-else
          type="button"
          :class="[
            button,
            'justify-self-start bg-accent font-semibold text-accent-fg',
          ]"
          data-testid="counter-visit"
          @click="proposed = p.key"
        >
          {{ p.task.label }}
        </button>
      </li>
    </ul>
    <p v-if="failure" role="alert" class="text-sm text-bad">{{ failure }}</p>
  </div>
</template>
