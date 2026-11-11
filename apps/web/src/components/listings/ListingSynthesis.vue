<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type {
    AgencyRequest,
    Assumptions,
    EvaluatedListing,
    ListingChanges as ListingChangesView,
    ListingEvaluation,
    ListingQuestionField,
    Member,
    NegotiationBrief,
    TargetPrice,
    Visit,
  } from '@apart/contracts'
  import {
    activityActorName,
    checkFreshness,
    ficheNextAction,
    listingAnswer,
    listingChangesLine,
    listingHighlights,
    locationApproximation,
    nextStepTarget,
    nextSteps,
  } from '@apart/domain'
  import type {
    AnswerTone,
    FicheActionKind,
    Highlight,
    HighlightTab,
    NextStep,
    NextStepTarget,
  } from '@apart/domain'
  import type { IconName } from '@/lib/icons'
  import { formatDate } from '@/lib/format'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import ListingChanges from '@/components/activity/ListingChanges.vue'
  import type { ListingTab } from '@/lib/listing-tabs'
  import { LISTING_TABS } from '@/lib/listing-tabs'
  import type { OpinionActions } from '@/lib/opinions'
  import { fitLine, keyFigures } from '@/lib/synthesis'
  import CriteriaFitSection from './CriteriaFitSection.vue'
  import FitBadge from './FitBadge.vue'
  import OpinionsSection from './OpinionsSection.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import { cardClasses } from '@/lib/ui'
  import type { Tone } from '@/lib/ui'

  /**
   * La Synthèse (lot 19, ADR 0029) : « Faut-il y aller ? ». Quatre chiffres
   * qui ouvrent leur onglet (prix affiché et ventes du quartier, coût tout
   * compris, mensualité, prix cible), l'adéquation aux critères en une ligne
   * (détail dépliable), « Ce qui plaît » et « À surveiller » (choisis par
   * `domain` dans les données), nos avis, les prochaines étapes et la
   * dernière vérification. Pendant une modification, les chiffres suivent
   * l'aperçu en direct. Lot 20 : nos avis critère par critère nourrissent
   * « Ce qui plaît », « À surveiller » (lien « Nos avis ») et « À rediscuter ».
   *
   * Lot 25 (ADR 0035) : la Synthèse répond d'abord. En tête, la réponse en une
   * phrase (`listingAnswer` de `domain` : verdict, adéquation, prix cible ;
   * ce qui manque est dit) et l'action de l'étape (`ficheNextAction`) ;
   * « Depuis ta dernière ouverture » tient en une ligne, son détail à la
   * demande ; chaque prochaine étape mène à son onglet (`nextStepTarget`).
   */
  const props = defineProps<{
    item: EvaluatedListing
    evaluation: ListingEvaluation | null
    targetPrice: TargetPrice | null
    negotiation: NegotiationBrief | null
    assumptions: Assumptions | null
    /** Vrai pendant une modification : valeurs de l'aperçu en direct. */
    live?: boolean
    /** « Ce qui a changé » depuis la dernière ouverture. */
    changes?: ListingChangesView | null
    /** Lot 17 : les demandes à l'annonceur (messages à valider, relances). */
    requests?: AgencyRequest[]
    visits?: Visit[]
    members?: Member[]
    meId?: string | null
    savingOpinion?: boolean
    /** Lot 20 : enregistrer mon avis, « Voir quand même », ajouter la tâche de contre-visite. */
    opinionActions?: OpinionActions | null
  }>()
  const emit = defineEmits<{
    go: [tab: ListingTab]
    /** Lot 25 : un onglet et un bloc (prochaine étape). */
    goTo: [target: NextStepTarget]
    /** Lot 25 : l'action de l'étape. */
    action: [kind: FicheActionKind]
    precise: []
  }>()

  const listing = computed(() => props.item.listing)
  const figures = computed(() =>
    props.evaluation
      ? keyFigures({
          metrics: props.evaluation.metrics,
          targetPrice: props.targetPrice,
          assumptions: props.assumptions,
          medianPricePerM2:
            listing.value.openDataContext?.market?.medianPricePerM2 ?? null,
        })
      : []
  )

  const fit = computed(() => props.item.criteriaFit)
  const fitOpen = ref(false)

  /** Les champs qu'une tâche encore ouverte demande à l'annonceur. */
  const askedFields = computed(() =>
    props.item.tasks
      .filter(t => !t.done && t.field !== null)
      .map(t => t.field as ListingQuestionField)
  )
  const highlights = computed(() =>
    listingHighlights({
      metrics: props.evaluation?.metrics ?? null,
      rental: props.evaluation?.rental ?? null,
      targetPrice: props.targetPrice,
      dpeClass: listing.value.dpeClass,
      openData: listing.value.openDataContext,
      votedWorks: listing.value.votedWorks,
      proceedings: listing.value.proceedings,
      askedFields: askedFields.value,
      approximate: locationApproximation(listing.value.location).approximate,
      opinions: props.item.opinionSummary,
    })
  )
  const tabLabel = (tab: HighlightTab | ListingTab): string =>
    LISTING_TABS.find(t => t.id === tab)?.label ?? ''
  /** Lot 20 : un point né des avis mène à « Nos avis », dans la Synthèse. */
  const pointLabel = (point: Highlight): string =>
    point.section === 'opinions' ? 'Nos avis' : tabLabel(point.tab)
  function openPoint(point: Highlight): void {
    if (point.section === 'opinions') {
      const target = document.getElementById('nos-avis')
      target?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
      target?.focus?.({ preventScroll: true })
      return
    }
    emit('go', point.tab as ListingTab)
  }

  const steps = computed(() =>
    nextSteps({
      tasks: props.item.tasks,
      requests: props.requests ?? [],
      visits: props.visits ?? [],
      now: new Date(),
      opinions: props.item.opinionSummary,
    })
  )
  const STEP_KINDS: Record<NextStep['kind'], { label: string; tone: Tone }> = {
    visit: { label: 'Visite', tone: 'info' },
    discuss: { label: 'À rediscuter', tone: 'ai' },
    draft: { label: 'À valider', tone: 'warn' },
    follow_up: { label: 'Relance', tone: 'warn' },
    task: { label: 'Tâche', tone: 'neutral' },
  }

  /** La dernière vérification sur le portail, en une phrase. */
  const freshness = computed(() =>
    checkFreshness(
      {
        status: listing.value.status,
        lastCheckedAt: listing.value.lastCheckedAt,
        createdAt: listing.value.createdAt,
      },
      new Date(),
      undefined,
      props.item.lastCheck?.outcome ?? null
    )
  )
  const checkedBy = computed(() => {
    const check = props.item.lastCheck
    if (!check) return null
    const names = new Map(
      (props.members ?? []).map(m => [m.id, { displayName: m.displayName }])
    )
    return activityActorName(
      { channel: check.channel, actorMemberId: check.authorId },
      names
    )
  })

  // Lot 25 : la réponse et l'action, en tête.
  const answer = computed(() => {
    const evaluation = props.evaluation
    if (!evaluation) return null
    return listingAnswer({
      price: evaluation.metrics.price,
      hasRent: evaluation.metrics.rent > 0,
      verdict: evaluation.metrics.verdict,
      failures: evaluation.metrics.failures,
      nearMisses: evaluation.metrics.nearMisses,
      fit: props.item.criteriaFit,
      targetPrice: props.targetPrice,
    })
  })
  const answerRest = computed(() =>
    answer.value ? answer.value.sentence.slice(answer.value.lead.length) : ''
  )
  const ANSWER_LOOK: Record<AnswerTone, { icon: IconName; ink: string }> = {
    go: { icon: 'check', ink: 'text-good' },
    maybe: { icon: 'alert', ink: 'text-warn' },
    no: { icon: 'cross', ink: 'text-bad' },
    unknown: { icon: 'info', ink: 'text-info' },
  }
  const action = computed(() =>
    ficheNextAction({
      status: listing.value.status,
      decision: props.item.decision,
      stage: props.item.stage,
      offers: props.item.offers,
      opinionSummary: props.item.opinionSummary,
      now: new Date(),
    })
  )

  // « Depuis ta dernière ouverture » : une ligne, le détail à la demande.
  const changesLine = computed(() =>
    props.changes ? listingChangesLine(props.changes) : null
  )
  const changesOpen = ref(false)

  const card = cardClasses()
</script>

<template>
  <div class="@container grid gap-4" data-testid="synthesis">
    <section
      :class="[cardClasses('accent'), 'grid gap-3']"
      aria-labelledby="answer-title"
      data-testid="answer"
      :data-tone="answer?.tone ?? 'unknown'"
    >
      <h2 id="answer-title" class="sr-only">La réponse</h2>
      <p
        v-if="answer"
        class="flex items-start gap-2 text-base leading-snug sm:text-lg"
        data-testid="answer-sentence"
      >
        <UiIcon
          :name="ANSWER_LOOK[answer.tone].icon"
          class="mt-1 size-5 flex-none"
          :class="ANSWER_LOOK[answer.tone].ink"
        />
        <span
          ><strong class="font-display font-bold">{{ answer.lead }}</strong
          >{{ answerRest }}</span
        >
      </p>
      <p v-else class="text-sm text-muted" data-testid="answer-sentence">
        Pas encore de réponse : saisis un prix et un loyer visé pour que
        l’application la calcule.
      </p>
      <div
        v-if="action.kind !== 'none'"
        class="flex flex-wrap items-center gap-x-3 gap-y-1.5"
      >
        <UiButton
          variant="primary"
          :data-action="action.kind"
          data-testid="answer-action"
          @click="emit('action', action.kind)"
        >
          {{ action.label }}
        </UiButton>
        <span v-if="action.hint" class="text-sm text-muted">{{
          action.hint
        }}</span>
      </div>
    </section>

    <section
      v-if="changes && changesLine"
      class="grid gap-2 text-sm"
      aria-labelledby="changes-line-title"
      data-testid="changes-line"
    >
      <p class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <strong id="changes-line-title" class="font-semibold"
          >Depuis ta dernière ouverture<template v-if="changes.since">
            ({{ formatDate(changes.since) }})</template
          >
          :</strong
        >
        <span class="text-muted">{{ changesLine }}</span>
        <UiButton
          variant="link"
          size="inline"
          :aria-expanded="changesOpen"
          aria-controls="changes-detail"
          data-testid="changes-toggle"
          @click="changesOpen = !changesOpen"
        >
          {{ changesOpen ? 'Masquer le détail' : 'Voir le détail' }}
        </UiButton>
      </p>
      <div v-if="changesOpen" id="changes-detail">
        <ListingChanges :changes="changes" />
      </div>
    </section>

    <section
      :class="[card, 'grid gap-3.5']"
      aria-labelledby="key-figures-title"
      data-testid="key-figures"
    >
      <div class="flex items-center justify-between gap-2">
        <h2 id="key-figures-title" class="sr-only">L’essentiel</h2>
        <UiBadge
          v-if="live"
          tone="accent"
          class="ml-auto"
          data-testid="live-badge"
          >aperçu en direct</UiBadge
        >
      </div>
      <p v-if="!evaluation" class="text-sm text-muted">
        Saisis un prix et un loyer visé pour voir les indicateurs.
      </p>
      <div v-else class="grid grid-cols-2 gap-2.5 @3xl:grid-cols-4 @3xl:gap-3">
        <!-- Lot 22 : une tuile chiffrée cliquable (grille, texte à gauche),
             pas un bouton d'action : son habit ne peut pas être un UiButton. -->
        <button
          v-for="figure in figures"
          :key="figure.key"
          type="button"
          class="grid content-start gap-0.5 rounded-xl px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-3.5 sm:py-3"
          :class="
            figure.accent
              ? 'bg-accent-soft text-fg hover:ring-1 hover:ring-accent'
              : 'bg-bg text-fg hover:ring-1 hover:ring-line'
          "
          :data-figure="figure.key"
          @click="emit('go', figure.tab)"
        >
          <span
            class="text-sm"
            :class="figure.accent ? 'text-fg' : 'text-muted'"
            >{{ figure.label }}</span
          >
          <strong
            class="font-display text-xl leading-tight font-bold tabular-nums @3xl:text-2xl"
            >{{ figure.value }}</strong
          >
          <span
            v-if="figure.sub"
            class="text-xs"
            :class="figure.accent ? 'text-fg' : 'text-muted'"
            >{{ figure.sub }}</span
          >
          <span class="sr-only"
            >: voir l’onglet {{ tabLabel(figure.tab) }}</span
          >
        </button>
      </div>

      <div
        class="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-line pt-3"
        data-testid="fit-line"
      >
        <FitBadge v-if="fit.activeCriteria > 0" :level="fit.level" />
        <span class="min-w-0 flex-[1_1_22rem] text-sm">{{ fitLine(fit) }}</span>
        <UiButton
          size="sm"
          :icon-right="fitOpen ? 'chevron-up' : 'chevron-down'"
          :aria-expanded="fitOpen"
          aria-controls="fit-detail"
          data-testid="fit-toggle"
          @click="fitOpen = !fitOpen"
        >
          {{ fitOpen ? 'Masquer le détail' : 'Voir le détail' }}
        </UiButton>
      </div>
      <div v-if="fitOpen" id="fit-detail">
        <CriteriaFitSection
          :fit="fit"
          @precise="emit('precise')"
          @go="next => emit('go', next)"
        />
      </div>
    </section>

    <div class="grid gap-4 @3xl:grid-cols-2">
      <section
        v-for="side in ['good', 'watch'] as const"
        :key="side"
        :class="[card, 'grid content-start gap-2.5']"
        :aria-labelledby="`highlights-${side}-title`"
        :data-testid="`highlights-${side}`"
      >
        <h2 :id="`highlights-${side}-title`" class="text-base font-semibold">
          {{ side === 'good' ? 'Ce qui plaît' : 'À surveiller' }}
        </h2>
        <ul v-if="highlights[side].length" class="grid gap-2 leading-snug">
          <li
            v-for="point in highlights[side]"
            :key="point.key"
            class="flex items-baseline justify-between gap-3"
            :data-highlight="point.key"
          >
            <span class="min-w-0 break-words">{{ point.text }}</span>
            <UiButton
              variant="link"
              class="flex-none"
              :aria-label="
                point.section === 'opinions'
                  ? `${point.text} : voir nos avis`
                  : `${point.text} : voir l’onglet ${tabLabel(point.tab)}`
              "
              @click="openPoint(point)"
            >
              {{ pointLabel(point) }}
            </UiButton>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">
          {{
            side === 'good'
              ? 'Rien à mettre en avant pour l’instant.'
              : 'Rien à signaler pour l’instant.'
          }}
        </p>
      </section>
    </div>

    <div class="grid gap-4">
      <OpinionsSection
        :item="item"
        :members="members ?? []"
        :me-id="meId ?? null"
        :visits="visits ?? []"
        :actions="opinionActions ?? null"
        :saving="savingOpinion"
      />
      <section
        :class="[card, 'grid content-start gap-2.5']"
        aria-labelledby="next-steps-title"
        data-testid="next-steps"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 id="next-steps-title" class="text-base font-semibold">
            Prochaines étapes
          </h2>
          <UiButton
            variant="link"
            data-testid="go-todo"
            @click="emit('go', 'a-faire')"
          >
            Tout voir dans À faire
          </UiButton>
        </div>
        <ul v-if="steps.length" class="grid gap-2 leading-snug">
          <li
            v-for="step in steps"
            :key="`${step.kind}-${step.id}`"
            class="flex items-baseline gap-2.5"
            :data-step="step.kind"
          >
            <UiBadge :tone="STEP_KINDS[step.kind].tone" class="flex-none">{{
              STEP_KINDS[step.kind].label
            }}</UiBadge>
            <span class="min-w-0 flex-1 break-words">{{ step.text }}</span>
            <UiButton
              variant="link"
              class="flex-none"
              :aria-label="`${step.text} : ${nextStepTarget(step).label}`"
              data-testid="step-link"
              @click="emit('goTo', nextStepTarget(step))"
            >
              {{ nextStepTarget(step).label }}
            </UiButton>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">Rien à faire pour l’instant.</p>
      </section>
    </div>

    <p class="text-sm text-muted" data-testid="synthesis-freshness">
      <template v-if="item.lastCheck && freshness.label">
        {{ freshness.label
        }}<template v-if="checkedBy"> par {{ checkedBy }}</template> :
        {{ item.lastCheck.summary }}
      </template>
      <template v-else>{{ freshness.title }}.</template>
      <UiButton
        variant="link"
        size="inline"
        class="ml-1"
        data-testid="go-history"
        @click="emit('go', 'historique')"
      >
        Historique
      </UiButton>
    </p>
  </div>
</template>
