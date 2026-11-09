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
    listingHighlights,
    locationApproximation,
    nextSteps,
  } from '@apart/domain'
  import type { Highlight, HighlightTab, NextStep } from '@apart/domain'
  import ListingChanges from '@/components/activity/ListingChanges.vue'
  import type { ListingTab } from '@/lib/listing-tabs'
  import { LISTING_TABS } from '@/lib/listing-tabs'
  import type { OpinionActions } from '@/lib/opinions'
  import { fitLine, keyFigures } from '@/lib/synthesis'
  import CriteriaFitSection from './CriteriaFitSection.vue'
  import FitBadge from './FitBadge.vue'
  import OpinionsSection from './OpinionsSection.vue'

  /**
   * La Synthèse (lot 19, ADR 0029) : « Faut-il y aller ? ». Quatre chiffres
   * qui ouvrent leur onglet (prix affiché et ventes du quartier, coût tout
   * compris, mensualité, prix cible), l'adéquation aux critères en une ligne
   * (détail dépliable), « Ce qui plaît » et « À surveiller » (choisis par
   * `domain` dans les données), nos avis, les prochaines étapes et la
   * dernière vérification. Pendant une modification, les chiffres suivent
   * l'aperçu en direct. Lot 20 : nos avis critère par critère nourrissent
   * « Ce qui plaît », « À surveiller » (lien « Nos avis ») et « À rediscuter ».
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
  const STEP_KINDS: Record<NextStep['kind'], { label: string; tone: string }> =
    {
      visit: { label: 'Visite', tone: 'bg-info-soft text-info' },
      discuss: { label: 'À rediscuter', tone: 'bg-ai-soft text-ai' },
      draft: { label: 'À valider', tone: 'bg-warn-soft text-warn' },
      follow_up: { label: 'Relance', tone: 'bg-warn-soft text-warn' },
      task: { label: 'Tâche', tone: 'bg-surface-2 text-fg' },
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

  const card = 'rounded-2xl border border-line bg-surface p-4 sm:px-5'
  const linkClass =
    'inline-flex min-h-11 flex-none items-center text-sm text-accent underline-offset-2 hover:underline sm:min-h-0'
</script>

<template>
  <div class="@container grid gap-4" data-testid="synthesis">
    <ListingChanges v-if="changes" :changes="changes" />

    <section
      :class="[card, 'grid gap-3.5']"
      aria-labelledby="key-figures-title"
      data-testid="key-figures"
    >
      <div class="flex items-center justify-between gap-2">
        <h2 id="key-figures-title" class="sr-only">L’essentiel</h2>
        <span
          v-if="live"
          class="ml-auto rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-fg"
          data-testid="live-badge"
          >aperçu en direct</span
        >
      </div>
      <p v-if="!evaluation" class="text-sm text-muted">
        Saisissez un prix et un loyer visé pour voir les indicateurs.
      </p>
      <div v-else class="grid grid-cols-2 gap-2.5 @3xl:grid-cols-4 @3xl:gap-3">
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
            class="text-xs"
            :class="figure.accent ? 'text-fg' : 'text-muted'"
            >{{ figure.label }}</span
          >
          <strong
            class="font-display text-[19px] leading-tight font-bold tabular-nums @3xl:text-2xl"
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
        <button
          type="button"
          class="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2 sm:min-h-10"
          :aria-expanded="fitOpen"
          aria-controls="fit-detail"
          data-testid="fit-toggle"
          @click="fitOpen = !fitOpen"
        >
          {{ fitOpen ? 'Masquer le détail' : 'Voir le détail' }}
        </button>
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
            <button
              type="button"
              :class="linkClass"
              :aria-label="
                point.section === 'opinions'
                  ? `${point.text} : voir nos avis`
                  : `${point.text} : voir l’onglet ${tabLabel(point.tab)}`
              "
              @click="openPoint(point)"
            >
              {{ pointLabel(point) }}
            </button>
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
          <button
            type="button"
            :class="linkClass"
            data-testid="go-todo"
            @click="emit('go', 'a-faire')"
          >
            Tout voir dans À faire
          </button>
        </div>
        <ul v-if="steps.length" class="grid gap-2 leading-snug">
          <li
            v-for="step in steps"
            :key="`${step.kind}-${step.id}`"
            class="flex items-baseline gap-2.5"
            :data-step="step.kind"
          >
            <span
              class="flex-none rounded-md px-1.5 py-0.5 text-xs font-semibold"
              :class="STEP_KINDS[step.kind].tone"
              >{{ STEP_KINDS[step.kind].label }}</span
            >
            <span class="min-w-0 break-words">{{ step.text }}</span>
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
      <button
        type="button"
        class="ml-1 text-accent underline-offset-2 hover:underline"
        data-testid="go-history"
        @click="emit('go', 'historique')"
      >
        Historique
      </button>
    </p>
  </div>
</template>
