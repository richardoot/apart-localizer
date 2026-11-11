<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
  import type {
    EvaluatedListing,
    Member,
    OpinionSummary,
    Visit,
  } from '@apart/contracts'
  import {
    confrontOpinions,
    effectiveOpinionCriteria,
    formatOpinionAverage,
    opinionAfterVisit,
    opinionHasRating,
    visibleCriterionKeys,
  } from '@apart/domain'
  import { useOptionalListingEditor } from '@/composables/useListingEditor'
  import { useMediaQuery } from '@/composables/useMediaQuery'
  import { useOpinionDraft } from '@/composables/useOpinionDraft'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import { errorMessage } from '@/lib/errors'
  import { cardClasses } from '@/lib/ui'
  import {
    maskedText,
    memberMeta,
    seenBeforeText,
    shortDay,
  } from '@/lib/opinions'
  import type { OpinionActions } from '@/lib/opinions'
  import MyOpinionForm from './opinions/MyOpinionForm.vue'
  import OpinionsDetail from './opinions/OpinionsDetail.vue'

  /**
   * « Nos avis » (lot 20, ADR 0030 ; dans la Synthèse depuis le lot 19) : une
   * carte par membre (note globale, moyenne des critères à titre indicatif,
   * phrase, « 8 critères sur 8 · après la visite du 14 nov. »), le bilan et
   * la note commune, le détail critère par critère qui se déplie, les
   * désaccords et la tâche de contre-visite proposée. À l'aveugle, l'avis
   * des autres reste masqué tant que je n'ai pas noté (le serveur ne l'envoie
   * pas) : on dit qui a noté et combien de critères, et « Voir quand même »
   * l'affiche. Mon avis se donne sur place (« Mon avis »), par la même garde
   * des modifications non enregistrées que les sections de la fiche.
   */
  const props = withDefaults(
    defineProps<{
      item: EvaluatedListing
      members: Member[]
      meId: string | null
      visits?: Visit[]
      actions?: OpinionActions | null
      saving?: boolean
    }>(),
    { visits: () => [], actions: null, saving: false }
  )

  const active = computed(() =>
    props.members.filter(m => m.status === 'active')
  )
  /**
   * La confrontation du serveur (avis visibles seulement) ; sans elle (fiche
   * d'avant le lot 20), celle des avis reçus avec les critères par défaut.
   */
  const summary = computed<OpinionSummary>(
    () =>
      props.item.opinionSummary ??
      confrontOpinions({
        criteria: effectiveOpinionCriteria(null),
        members: active.value.map(m => ({
          id: m.id,
          displayName: m.displayName,
        })),
        visible: props.item.opinions,
        masked: [],
        blind: false,
        revealed: false,
        viewerRated: opinionHasRating(
          props.item.opinions.find(o => o.memberId === props.meId),
          visibleCriterionKeys(effectiveOpinionCriteria(null))
        ),
      })
  )
  const mine = computed(
    () => props.item.opinions.find(o => o.memberId === props.meId) ?? null
  )
  const me = computed(
    () => summary.value.members.find(m => m.memberId === props.meId) ?? null
  )
  const meName = computed(
    () => props.members.find(m => m.id === props.meId)?.displayName ?? 'moi'
  )
  const others = computed(() =>
    summary.value.members.filter(m => m.memberId !== props.meId)
  )
  const masked = computed(() => others.value.filter(m => m.state === 'masked'))
  const rows = computed(() => summary.value.rows)
  const textOf = (memberId: string): string =>
    props.item.opinions.find(o => o.memberId === memberId)?.text ?? ''
  /** Les anciens membres dont l'avis reste visible (historique). */
  const former = computed(() =>
    props.item.opinions.filter(
      o =>
        !summary.value.members.some(m => m.memberId === o.memberId) &&
        (o.rating > 0 || o.text)
    )
  )
  const nameOf = (id: string): string =>
    props.members.find(m => m.id === id)?.displayName ?? 'Ancien membre'

  /** La dernière visite faite avec moi (« après visite », « note pendant que c'est frais »). */
  const myVisit = computed(() =>
    props.meId
      ? opinionAfterVisit(
          props.visits.map(v => ({
            id: v.id,
            visitedAt: v.visitedAt,
            status: v.status,
            participantIds: v.participantIds,
          })),
          props.meId,
          new Date()
        )
      : null
  )

  // Mon avis : un brouillon, ouvert par la garde de la fiche s'il y en a une.
  const editor = useOptionalListingEditor()
  const localEditing = ref(false)
  const editing = computed(() =>
    editor ? editor.editing.value === 'opinion' : localEditing.value
  )
  const state = useOpinionDraft(() => ({
    opinion: mine.value,
    keys: rows.value.map(r => r.key),
  }))
  if (editor) {
    const unregister = editor.registerSection('opinion', {
      title: 'Mon avis',
      isDirty: () => state.dirty.value,
      reset: () => state.load(),
    })
    onBeforeUnmount(unregister)
  }
  // Lot 25 : « Donner mon avis » de la Synthèse ouvre la saisie par la garde
  // de la fiche : le brouillon part de mon avis enregistré.
  watch(editing, (now, before) => {
    if (now && !before && !state.dirty.value) state.load()
  })
  const compact = useMediaQuery('(max-width: 639px)')
  const formError = ref<string | null>(null)

  function start(): void {
    state.load()
    formError.value = null
    if (editor) editor.start('opinion')
    else localEditing.value = true
    void nextTick(() => {
      const first = document.querySelector<HTMLElement>(
        '#my-opinion [role="radio"][tabindex="0"]'
      )
      first?.focus({ preventScroll: true })
      document
        .getElementById('nos-avis')
        ?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    })
  }
  function close(): void {
    if (editor) editor.finish('opinion')
    localEditing.value = false
  }
  function cancel(): void {
    if (editor) editor.cancel()
    else {
      state.load()
      localEditing.value = false
    }
    formError.value = null
  }
  async function submit(): Promise<void> {
    if (!state.dirty.value) {
      close()
      return
    }
    if (!props.actions) return
    formError.value = null
    try {
      await props.actions.save(state.payload())
      close()
    } catch (error) {
      formError.value = errorMessage(
        error,
        'L’avis n’a pas pu être enregistré.'
      )
    }
  }

  // « Voir quand même ».
  const revealing = ref(false)
  const revealError = ref<string | null>(null)
  async function reveal(): Promise<void> {
    if (!props.actions) return
    revealing.value = true
    revealError.value = null
    try {
      await props.actions.reveal()
    } catch (error) {
      revealError.value = errorMessage(
        error,
        'Les avis n’ont pas pu être affichés.'
      )
    } finally {
      revealing.value = false
    }
  }

  const detailOpen = ref(false)
  const hasScores = computed(() =>
    rows.value.some(r => r.scores.some(s => s.score !== null))
  )
  const commonText = computed(() => {
    const s = summary.value
    if (s.status === 'empty') return null
    return s.status === 'ready' ? formatOpinionAverage(s.commonScore) : null
  })
  /** Mon avis porte « après avoir vu celui de … » : « Voir quand même » avant de noter. */
  const revealedNote = computed(() => {
    const s = summary.value
    if (!s.revealed || s.viewerRated) return null
    const names = others.value
      .filter(m => m.state === 'rated')
      .map(m => m.displayName)
    const seen = seenBeforeText(names)
    return seen
      ? `Vu avant d’avoir noté : ton avis portera la mention « ${seen} ».`
      : null
  })
  const blindNote = computed(() => {
    const names = masked.value.map(m => m.displayName)
    if (names.length === 0) return null
    const list =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
    return `Note de ton côté d’abord : tu verras ensuite ${names.length > 1 ? 'ceux' : 'celui'} de ${list}, sans influence.`
  })

  const myCardText = computed(() =>
    ['Tu n’as pas encore donné ton avis.', blindNote.value]
      .filter(Boolean)
      .join(' ')
  )

  const card = 'grid content-start gap-1.5 rounded-xl px-3.5 py-3'
</script>

<template>
  <div class="grid gap-4">
    <section
      id="nos-avis"
      tabindex="-1"
      class="grid scroll-mt-28 gap-3.5 outline-none"
      :class="cardClasses(editing ? 'accent' : 'default')"
      :aria-labelledby="editing ? 'my-opinion-title' : 'opinions-title'"
      data-testid="opinions"
      :data-editing="editing ? 'true' : undefined"
    >
      <MyOpinionForm
        v-if="editing"
        :state="state"
        :rows="rows"
        :me-name="meName"
        :other-names="others.map(m => m.displayName)"
        :visit="myVisit"
        :saving="saving"
        :error="formError"
        :compact="compact"
        @submit="submit"
        @cancel="cancel"
      />
      <template v-else>
        <div
          class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
        >
          <h2 id="opinions-title" class="text-base font-semibold">Nos avis</h2>
          <UiButton
            v-if="me?.state === 'rated'"
            variant="outline"
            aria-controls="nos-avis"
            data-testid="opinion-edit"
            @click="start"
          >
            Modifier mon avis
          </UiButton>
        </div>

        <div class="grid gap-3 @xl:grid-cols-2">
          <template v-for="member in summary.members" :key="member.memberId">
            <div
              v-if="member.memberId === meId && member.state !== 'rated'"
              :class="[
                card,
                'gap-2.5 border-[1.5px] border-dashed border-accent',
              ]"
              :data-member="member.memberId"
              data-state="me-missing"
            >
              <strong class="text-base">{{ member.displayName }}</strong>
              <template v-if="myVisit">
                <span class="font-semibold"
                  >Visite faite le {{ shortDay(myVisit.visitedAt) }}</span
                >
                <p class="leading-snug" data-testid="fresh-visit">
                  Note pendant que c’est frais. Ce que tu ne sais pas, laisse «
                  — ».
                </p>
              </template>
              <p class="leading-snug" data-testid="my-card-text">
                {{ myCardText }}
              </p>
              <p
                v-if="textOf(member.memberId)"
                class="leading-snug whitespace-pre-line text-muted"
              >
                « {{ textOf(member.memberId) }} »
              </p>
              <p
                v-if="revealedNote"
                class="text-sm text-muted"
                data-testid="revealed-note"
              >
                {{ revealedNote }}
              </p>
              <UiButton
                variant="primary"
                class="justify-self-start"
                data-testid="opinion-edit"
                @click="start"
              >
                Donner mon avis
              </UiButton>
            </div>
            <div
              v-else-if="member.state === 'masked'"
              :class="[card, 'gap-2.5 bg-bg']"
              :data-member="member.memberId"
              data-state="masked"
            >
              <strong class="text-base">{{ member.displayName }}</strong>
              <p class="leading-snug">{{ maskedText(member) }}</p>
              <div aria-hidden="true" class="flex flex-wrap gap-1.5">
                <span
                  v-for="n in member.ratedCount"
                  :key="n"
                  class="h-6 w-[5.75rem] rounded-lg bg-surface-2"
                />
              </div>
              <UiButton
                class="justify-self-start"
                :disabled="!actions"
                :loading="revealing"
                data-testid="opinion-reveal"
                @click="reveal"
              >
                Voir quand même
              </UiButton>
              <UiAlert v-if="revealError">{{ revealError }}</UiAlert>
            </div>
            <div
              v-else-if="member.state === 'rated'"
              :class="[card, 'bg-bg']"
              :data-member="member.memberId"
              data-state="rated"
            >
              <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <strong class="text-base">{{ member.displayName }}</strong>
                <span
                  v-if="member.rating"
                  class="font-display text-2xl font-bold text-accent tabular-nums"
                  :aria-label="`note globale ${member.rating} sur 5`"
                  >{{ member.rating }}/5</span
                >
                <span
                  v-if="member.average !== null"
                  class="text-sm text-fg"
                  data-testid="member-average"
                  >critères : {{ formatOpinionAverage(member.average) }} en
                  moyenne</span
                >
              </div>
              <p class="leading-snug whitespace-pre-line break-words">
                {{ textOf(member.memberId) || 'Pas de phrase.' }}
              </p>
              <span class="text-sm text-muted" data-testid="member-meta">{{
                memberMeta(member)
              }}</span>
            </div>
            <div
              v-else
              :class="[card, 'bg-bg']"
              :data-member="member.memberId"
              data-state="missing"
            >
              <strong class="text-base">{{ member.displayName }}</strong>
              <p class="text-muted">Pas encore donné</p>
            </div>
          </template>
          <div
            v-for="opinion in former"
            :key="opinion.id"
            :class="[card, 'bg-bg']"
            :data-member="opinion.memberId"
            data-state="former"
          >
            <div class="flex flex-wrap items-baseline gap-x-3">
              <strong>{{ nameOf(opinion.memberId) }}</strong>
              <span v-if="opinion.rating" class="font-semibold text-accent"
                >{{ opinion.rating }}/5</span
              >
            </div>
            <p class="leading-snug whitespace-pre-line">{{ opinion.text }}</p>
          </div>
        </div>

        <div
          v-if="
            summary.status !== 'empty' &&
            !(summary.masked && !summary.viewerRated)
          "
          class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-t border-line pt-3"
        >
          <p
            class="min-w-0 flex-[1_1_28rem] leading-normal"
            data-testid="opinions-sentence"
          >
            {{ summary.sentence }}
          </p>
          <div class="flex flex-wrap items-center gap-2.5">
            <span class="text-sm text-muted" data-testid="common-score"
              >Note commune
              <strong v-if="commonText" class="text-fg">{{ commonText }}</strong
              ><template v-if="commonText"> / 5</template
              ><template v-else> en attente</template></span
            >
            <UiButton
              v-if="hasScores"
              size="sm"
              :icon-right="detailOpen ? 'chevron-up' : 'chevron-down'"
              :aria-expanded="detailOpen"
              aria-controls="opinions-detail"
              data-testid="opinions-toggle"
              @click="detailOpen = !detailOpen"
            >
              {{ detailOpen ? 'Masquer le détail' : 'Voir le détail' }}
            </UiButton>
          </div>
        </div>
        <OpinionsDetail
          v-if="detailOpen && hasScores"
          :summary="summary"
          :tasks="item.tasks"
          :add-task="actions?.addTask"
        />
      </template>
    </section>

    <aside
      v-if="!editing && summary.masked && !summary.viewerRated"
      class="grid gap-1.5 rounded-2xl border border-line bg-surface px-4 py-3.5 text-sm leading-normal text-fg sm:px-5"
      data-testid="blind-why"
    >
      <strong>Pourquoi masquer ?</strong>
      <span class="text-muted"
        >Voir l’avis de l’autre avant de noter pousse à s’aligner. Les
        désaccords n’apparaissent qu’une fois que chacun a noté, ou quand
        quelqu’un choisit « Voir quand même ».</span
      >
      <span class="text-muted"
        >Ailleurs (liste, comparaison, Claude), la note commune ne se calcule
        qu’avec les avis visibles par celui qui regarde.</span
      >
    </aside>
  </div>
</template>
