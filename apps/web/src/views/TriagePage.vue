<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import type {
    DecisionChoice,
    DecisionProposal,
    DecisionResult,
    EvaluatedListing,
    ListingDraft,
    ListingStatus,
    WorkflowStage,
  } from '@apart/contracts'
  import {
    CREATED_LISTING_NO_UNDO,
    agreeLabel,
    counterChoice,
    finishLabel,
    isFoldedOut,
    refuseLabel,
    sessionIntro,
  } from '@apart/domain'
  import { useDrafts } from '@/composables/useDrafts'
  import { useListingList } from '@/composables/useListings'
  import { useTriageSession } from '@/composables/useTriageSession'
  import type { TriagePick } from '@/composables/useTriageSession'
  import {
    useDecisionActions,
    useDecisionCards,
    useWorkflowOverview,
  } from '@/composables/useWorkflow'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { ApiError, api } from '@/lib/api'
  import { pendingDuplicate, duplicateLead, duplicateWhy } from '@/lib/drafts'
  import {
    draftTriageCard,
    listingTriageCard,
    orderedRows,
    primaryChoice,
    primaryLabel,
    progressText,
    draftRow,
    listingRow,
  } from '@/lib/workflow'
  import type { TriageCardView } from '@/lib/workflow'
  import { stageApiFilters } from '@/stores/filters'
  import DiscardReasons from '@/components/workflow/DiscardReasons.vue'
  import PropertyFacts from '@/components/workflow/PropertyFacts.vue'
  import { isWorkflowStage } from '@apart/domain'

  /**
   * Lot 21 (ADR 0031) : le mode tri, une annonce à la fois (`/annonces/tri`).
   * Trois modes : trier « À valider » ou « À étudier » (À étudier ou À
   * visiter, Écarter, Passer), ou confirmer les propositions d'un autre
   * membre (`?mode=confirmer`). La session est dans l'URL (`session`, `pos`) :
   * recharger ne perd pas la position. Une seule notification à la fin.
   */
  const route = useRoute()
  const router = useRouter()

  const confirmMode = computed(() => route.query.mode === 'confirmer')
  const stage = computed<WorkflowStage>(() =>
    isWorkflowStage(route.query.etape) ? route.query.etape : 'a-valider'
  )

  function newSessionId(): string {
    return crypto.randomUUID()
  }
  const sessionId = ref(
    typeof route.query.session === 'string'
      ? route.query.session
      : newSessionId()
  )

  const { me, activeMembers } = useWorkspace()
  const { data: overview } = useWorkflowOverview()
  const others = computed(() => overview.value?.others ?? [])
  const agreement = computed(() => overview.value?.agreementRequired ?? false)
  const actions = useDecisionActions({ inSession: true })

  // Les annonces à trier : les brouillons, ou celles de l'étape.
  const drafts = useDrafts()
  const listingFilters = computed(() => ({
    ...stageApiFilters(stage.value),
    page: 1,
    limit: 200,
  }))
  const listings = useListingList(
    listingFilters,
    computed(() => !confirmMode.value && stage.value !== 'a-valider')
  )
  const cards = useDecisionCards('confirm', confirmMode)

  interface QueueItem {
    id: string
    card: TriageCardView
    draft: ListingDraft | null
    listing: EvaluatedListing | null
    proposal: DecisionProposal | null
  }

  function itemOfDraft(
    draft: ListingDraft,
    proposal: DecisionProposal | null
  ): QueueItem {
    return {
      id: proposal?.id ?? draft.id,
      card: draftTriageCard(draft),
      draft,
      listing: null,
      proposal,
    }
  }
  function itemOfListing(
    listing: EvaluatedListing,
    proposal: DecisionProposal | null
  ): QueueItem {
    return {
      id: proposal?.id ?? listing.listing.id,
      card: listingTriageCard(listing),
      draft: null,
      listing,
      proposal,
    }
  }

  const allItems = computed<QueueItem[]>(() => {
    if (confirmMode.value) {
      return (cards.data.value ?? []).flatMap(card => {
        if (card.draft) return [itemOfDraft(card.draft, card.proposal)]
        if (card.listing) return [itemOfListing(card.listing, card.proposal)]
        return []
      })
    }
    if (stage.value === 'a-valider') {
      return (drafts.data.value ?? []).map(d => itemOfDraft(d, null))
    }
    return (listings.data.value?.items ?? []).map(i => itemOfListing(i, null))
  })

  const queue = computed<QueueItem[]>(() => {
    if (confirmMode.value) return allItems.value
    const meId = me.value?.id ?? null
    if (stage.value === 'a-valider') {
      const rows = (drafts.data.value ?? [])
        .filter(d => !isFoldedOut(d.fit, d.decision))
        .map(d => draftRow(d, { meId }))
      return orderedRows(stage.value, rows)
        .filter(r => r.rowKind === 'to_sort')
        .flatMap(r => allItems.value.filter(i => i.id === r.id))
    }
    const rows = (listings.data.value?.items ?? [])
      .filter(i => !isFoldedOut(i.criteriaFit, i.decision))
      .map(i =>
        listingRow(stage.value, i, { members: activeMembers.value, meId })
      )
    return orderedRows(stage.value, rows)
      .filter(r => r.rowKind === 'to_sort')
      .flatMap(r => allItems.value.filter(i => i.id === r.id))
  })
  const byId = computed(
    () => new Map(allItems.value.map(item => [item.id, item]))
  )
  const loaded = computed(() => {
    if (confirmMode.value) return cards.data.value !== undefined
    if (stage.value === 'a-valider') return drafts.data.value !== undefined
    return (
      listings.data.value !== undefined && !listings.isPlaceholderData.value
    )
  })

  const session = useTriageSession({
    sessionId,
    queue,
    byId,
    loaded,
    startAt: typeof route.query.carte === 'string' ? route.query.carte : null,
  })
  const { picks, position, total, finished, current, lastPick } = session

  // L'URL porte la session et la position : recharger retrouve la carte.
  watch(
    [sessionId, position],
    ([id, pos]) => {
      void router.replace({
        name: route.name ?? 'triage',
        query: { ...route.query, session: id, pos: String(pos) },
      })
    },
    { immediate: true }
  )

  const failure = ref<string | null>(null)
  const announce = ref('')
  const busy = ref(false)
  const asking = ref(false)
  /** Le volet « Les données du bien » reste ouvert d'une annonce à l'autre. */
  const factsOpen = ref(false)

  async function run(action: () => Promise<void>): Promise<void> {
    if (busy.value) return
    busy.value = true
    failure.value = null
    try {
      await action()
    } catch (err) {
      failure.value =
        err instanceof ApiError ? err.message : 'L’action a échoué.'
    } finally {
      busy.value = false
    }
  }

  const stageWord = computed(() => primaryLabel(stage.value))

  function pickFrom(
    item: QueueItem,
    action: DecisionChoice,
    reason: string | null,
    result: DecisionResult,
    statusBefore: ListingStatus | null
  ): TriagePick {
    const label =
      action === 'discard'
        ? reason
          ? `Écarter (${reason.toLowerCase()})`
          : 'Écarter'
        : stageWord.value
    return {
      id: item.id,
      title: item.card.title,
      label,
      result: result.outcome === 'stale' ? 'Caduque' : label,
      action,
      proposalId: result.proposal?.id ?? null,
      undo: result.createdListing
        ? null
        : result.proposal
          ? 'proposal'
          : item.listing
            ? 'listing'
            : 'draft',
      statusBefore,
      createdListing: result.createdListing,
      listingId: result.listingId,
    }
  }

  /** Trier : une proposition, ou tout de suite dans un espace à un membre. */
  function decide(choice: DecisionChoice, reason: string | null = null): void {
    const item = current.value
    if (!item) return
    void run(async () => {
      const result = await actions.decide.mutateAsync({
        target: {
          kind: item.listing ? 'listing' : 'draft',
          id: item.card.id,
        },
        choice,
        ...(reason ? { reason } : {}),
        sessionId: sessionId.value,
        ...(item.listing
          ? { expectedStatus: item.listing.listing.status }
          : {}),
      })
      session.push(
        pickFrom(
          item,
          choice,
          reason,
          result,
          item.listing?.listing.status ?? null
        )
      )
      asking.value = false
      announce.value = `${result.message} ${progressLine.value}`
    })
  }

  function skip(): void {
    const item = current.value
    if (!item) return
    session.push({
      id: item.id,
      title: item.card.title,
      label: 'Passée',
      result: 'Passée',
      action: 'skip',
      proposalId: null,
      undo: 'skip',
      statusBefore: null,
      createdListing: false,
      listingId: null,
    })
    asking.value = false
    announce.value = `Passée. ${progressLine.value}`
  }

  /** Confirmer : d'accord, non avec son choix à la place, ou plus tard. */
  function agree(): void {
    const item = current.value
    if (!item?.proposal) return
    const proposal = item.proposal
    void run(async () => {
      const result = await actions.respond.mutateAsync({
        id: proposal.id,
        input: { agree: true, sessionId: sessionId.value },
      })
      const out = proposal.choice === 'discard'
      session.push({
        id: item.id,
        title: item.card.title,
        label: `D’accord : ${proposal.choiceLabel}`,
        result:
          result.outcome === 'stale'
            ? 'Caduque'
            : out
              ? 'Écartée'
              : `Passée en ${proposal.choiceLabel}`,
        action: 'agree',
        proposalId: proposal.id,
        undo: result.createdListing ? null : 'proposal',
        statusBefore: proposal.fromStatus,
        createdListing: result.createdListing,
        listingId: result.listingId,
      })
      announce.value = `${result.message} ${progressLine.value}`
    })
  }

  const refuseAsking = ref(false)

  function refuse(): void {
    const item = current.value
    if (!item?.proposal) return
    const counter = counterChoice(
      item.proposal.target,
      item.proposal.choice,
      item.proposal.fromStatus
    )
    if (counter === 'discard') {
      refuseAsking.value = true
      return
    }
    sendRefuse(counter, null)
  }

  function sendRefuse(choice: DecisionChoice, reason: string | null): void {
    const item = current.value
    if (!item?.proposal) return
    const proposal = item.proposal
    void run(async () => {
      const result = await actions.respond.mutateAsync({
        id: proposal.id,
        input: {
          agree: false,
          choice,
          ...(reason ? { reason } : {}),
          sessionId: sessionId.value,
        },
      })
      session.push({
        id: item.id,
        title: item.card.title,
        label: refuseLabel(proposal.choice),
        result: 'À trancher ensemble',
        action: 'refuse',
        proposalId: proposal.id,
        undo: 'proposal',
        statusBefore: proposal.fromStatus,
        createdListing: false,
        listingId: null,
        toSettle: true,
      })
      refuseAsking.value = false
      announce.value = `${result.message} ${progressLine.value}`
    })
  }

  function later(): void {
    const item = current.value
    if (!item) return
    session.push({
      id: item.id,
      title: item.card.title,
      label: 'Plus tard',
      result: 'Plus tard',
      action: 'later',
      proposalId: null,
      undo: 'skip',
      statusBefore: null,
      createdListing: false,
      listingId: null,
    })
    announce.value = `Plus tard. ${progressLine.value}`
  }

  const canUndo = computed(
    () =>
      lastPick.value !== null &&
      lastPick.value.undo !== null &&
      !session.snapshot.value?.outcome
  )
  const undoBlocked = computed(() => lastPick.value?.createdListing === true)
  const undoText = computed(() =>
    confirmMode.value
      ? 'Annuler mon dernier choix'
      : `Annuler : ${lastPick.value?.label ?? ''}`
  )

  function undo(): void {
    const pick = lastPick.value
    if (!pick) return
    void run(async () => {
      if (pick.undo === 'proposal' && pick.proposalId) {
        await actions.undo.mutateAsync(pick.proposalId)
      } else if (pick.undo === 'listing' && pick.statusBefore) {
        await api.listings.setStatus(pick.id, {
          status: pick.statusBefore,
          reason: null,
        })
      } else if (pick.undo === 'draft') {
        await api.drafts.decide(pick.id, { status: 'pending' })
      }
      session.pop()
      announce.value = `Annulé. ${progressLine.value}`
    })
  }

  const progressLine = computed(() =>
    progressText(
      confirmMode.value ? null : stage.value,
      Math.min(position.value + 1, total.value),
      total.value
    )
  )
  const progressTitle = computed(() => {
    if (confirmMode.value) {
      const author =
        current.value?.proposal?.author?.displayName ??
        others.value[0]?.displayName ??
        ''
      return `Propositions de ${author} · ${Math.min(position.value + 1, total.value)} sur ${total.value}`
    }
    return progressLine.value
  })
  const percent = computed(() =>
    total.value ? Math.round((position.value / total.value) * 100) : 100
  )

  const proposals = computed(() =>
    picks.value.filter(p => p.action !== 'skip' && p.proposalId !== null)
  )
  const hasProposals = computed(() => proposals.value.length > 0)
  const count = (action: TriagePick['action']): number =>
    picks.value.filter(p => p.action === action).length
  const totals = computed(() => [
    {
      n: count('keep') + count('to_visit'),
      label: stageWord.value.toLowerCase(),
    },
    {
      n: count('discard'),
      label: count('discard') > 1 ? 'écartées' : 'écartée',
    },
    { n: count('skip'), label: count('skip') > 1 ? 'passées' : 'passée' },
  ])
  const hasClash = computed(() => picks.value.some(p => p.toSettle))
  const finishedLabel = computed(() => finishLabel(others.value))

  const outcome = computed(() => session.snapshot.value?.outcome ?? null)
  const outcomeText = computed(
    () => session.snapshot.value?.outcomeText ?? null
  )

  function finishAndNotify(): void {
    void run(async () => {
      const result = await actions.finishSession.mutateAsync(sessionId.value)
      session.setOutcome('sent', result.message)
      announce.value = result.message
    })
  }

  function decideNow(): void {
    void run(async () => {
      const result = await actions.decideSessionNow.mutateAsync(sessionId.value)
      session.setOutcome('solo', result.message)
      announce.value = result.message
    })
  }

  // Confirmer : à la fin, le retour part tout seul (une notification).
  watch(finished, done => {
    if (done && confirmMode.value && picks.value.length > 0) {
      void actions.finishSession.mutateAsync(sessionId.value)
    }
  })

  function backTarget(): { name: string; query?: Record<string, string> } {
    return confirmMode.value
      ? { name: 'listings' }
      : { name: 'listings', query: { etape: stage.value } }
  }

  /** Quitter : s'il y a des propositions, l'autre est prévenu une fois. */
  function quit(): void {
    void run(async () => {
      if (hasProposals.value && !outcome.value) {
        await actions.finishSession.mutateAsync(sessionId.value)
      } else {
        actions.refreshAll()
      }
      await router.push(backTarget())
    })
  }

  // Raccourcis E, P, A ; inactifs dans un champ de saisie.
  function onKey(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.target as HTMLElement | null
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return
    }
    if (confirmMode.value || !current.value || busy.value) return
    const key = event.key.toLowerCase()
    if (asking.value) {
      if (event.key === 'Escape') asking.value = false
      return
    }
    if (key === 'e') {
      event.preventDefault()
      asking.value = true
    } else if (key === 'p') {
      event.preventDefault()
      skip()
    } else if (key === 'a') {
      event.preventDefault()
      decide(primaryChoice(stage.value))
    }
  }
  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

  const currentCard = computed(() => current.value?.card ?? null)
  const duplicate = computed(() =>
    current.value?.draft ? pendingDuplicate(current.value.draft) : null
  )

  /** « C'est la même » (lot 18) : un fait, appliqué tout de suite ; la carte passe. */
  function same(listingId: string): void {
    const item = current.value
    const draftId = item?.draft?.id
    if (!item || !draftId) return
    void run(async () => {
      await drafts.merge.mutateAsync({
        id: draftId,
        request: { listingId },
      })
      session.push({
        id: item.id,
        title: item.card.title,
        label: 'C’est la même',
        result: 'Ajoutée à la fiche suivie',
        action: 'skip',
        proposalId: null,
        undo: null,
        statusBefore: null,
        createdListing: false,
        listingId,
      })
    })
  }
</script>

<template>
  <div class="flex min-h-screen flex-col bg-bg text-fg">
    <header class="border-b border-line bg-surface">
      <div
        class="mx-auto flex w-full max-w-[1040px] flex-col gap-1.5 px-4 pt-2 pb-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2 sm:px-5 sm:py-2.5"
      >
        <div class="flex items-center justify-between gap-2 sm:contents">
          <button
            type="button"
            class="inline-flex min-h-11 items-center bg-transparent text-accent"
            data-testid="triage-quit"
            :disabled="busy"
            @click="quit"
          >
            {{ confirmMode ? 'Quitter' : 'Quitter le tri' }}
          </button>
          <strong class="sm:hidden" data-testid="progress-mobile">
            {{ Math.min(position + 1, total) }} sur {{ total }}
          </strong>
          <button
            v-if="canUndo"
            type="button"
            class="min-h-11 rounded-[10px] border border-line bg-surface px-3 text-[13px] sm:order-last disabled:opacity-60"
            :aria-label="undoText"
            :disabled="busy"
            data-testid="triage-undo"
            @click="undo"
          >
            <span class="sm:hidden">Annuler</span>
            <span class="hidden sm:inline">{{ undoText }}</span>
          </button>
        </div>
        <div class="flex min-w-0 flex-col gap-1.5 sm:flex-[1_1_280px]">
          <strong class="hidden sm:block" data-testid="progress">{{
            progressTitle
          }}</strong>
          <div
            role="progressbar"
            aria-label="Avancement du tri"
            :aria-valuemin="0"
            :aria-valuemax="total"
            :aria-valuenow="position"
            class="h-1.5 overflow-hidden rounded-full bg-surface-2 sm:h-2"
          >
            <div class="h-full bg-accent" :style="{ width: `${percent}%` }" />
          </div>
        </div>
      </div>
    </header>

    <main
      id="triage-main"
      class="mx-auto flex w-full max-w-[1040px] min-w-0 flex-1 flex-col gap-3 px-4 py-3.5 pb-44 sm:px-5 sm:py-4.5 sm:pb-10"
    >
      <p class="sr-only" aria-live="polite" data-testid="triage-live">
        {{ announce }}
      </p>
      <p
        v-if="failure"
        role="alert"
        class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
      >
        {{ failure }}
      </p>
      <p
        v-if="undoBlocked && !finished"
        class="rounded-lg bg-surface-2 px-3 py-2 text-sm"
        data-testid="undo-blocked"
      >
        {{ CREATED_LISTING_NO_UNDO }}
        <RouterLink
          v-if="lastPick?.listingId"
          :to="{ name: 'listing', params: { id: lastPick.listingId } }"
          class="ml-1 text-accent underline underline-offset-2"
          >Ouvrir la fiche</RouterLink
        >
      </p>

      <p v-if="!loaded" class="text-sm text-muted">Chargement…</p>
      <p
        v-else-if="total === 0"
        class="rounded-[14px] border border-line bg-surface p-5"
        data-testid="triage-empty"
      >
        {{ confirmMode ? 'Rien à confirmer.' : 'Rien à trier ici.' }}
      </p>

      <template v-else-if="!finished && currentCard">
        <p
          v-if="!confirmMode && agreement"
          class="text-[13px] text-muted"
          data-testid="triage-intro"
        >
          {{ sessionIntro(others) }}
        </p>

        <article
          class="flex flex-col gap-3 sm:gap-4 sm:rounded-2xl sm:border sm:border-line sm:bg-surface sm:px-5.5 sm:py-5"
          :data-card="currentCard.id"
          data-testid="triage-card"
        >
          <div
            v-if="current?.proposal"
            class="flex flex-col gap-0.5 rounded-xl px-3.5 py-3"
            :class="
              current.proposal.choice === 'discard'
                ? 'bg-bad-soft text-bad'
                : 'bg-accent-soft text-accent'
            "
            data-testid="confirm-banner"
          >
            <strong class="text-base">{{
              current.proposal.choice === 'discard'
                ? `${current.proposal.author?.displayName ?? 'Un membre'} propose de l’écarter`
                : `${current.proposal.author?.displayName ?? 'Un membre'} propose : ${current.proposal.choiceLabel}`
            }}</strong>
            <span>{{
              current.proposal.reason
                ? current.proposal.choice === 'discard'
                  ? `Raison : ${current.proposal.reason}.`
                  : `« ${current.proposal.reason} »`
                : 'Aucune raison donnée.'
            }}</span>
          </div>

          <div class="flex flex-col gap-1.5">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <h1
                class="min-w-0 flex-[1_1_320px] font-display text-[23px] leading-tight font-bold sm:text-[26px]"
              >
                {{ currentCard.title }}
              </h1>
              <a
                v-if="currentCard.url"
                :href="currentCard.url"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border-[1.5px] border-accent bg-accent-soft px-3.5 text-sm font-semibold whitespace-nowrap text-accent"
                data-testid="triage-link"
                >Voir l’annonce en ligne
                <span aria-hidden="true">↗</span>
                <span class="sr-only">(nouvel onglet)</span></a
              >
            </div>
            <div class="flex flex-wrap gap-x-3.5 gap-y-1 text-sm text-muted">
              <span>{{ currentCard.where }}</span>
              <span>{{ currentCard.size }}</span>
              <span>{{ currentCard.rooms }}</span>
              <span v-if="!confirmMode">{{ currentCard.source }}</span>
              <RouterLink
                v-if="current?.listing"
                :to="{
                  name: 'listing',
                  params: { id: current.listing.listing.id },
                }"
                class="text-accent underline-offset-2 hover:underline"
                >Ouvrir la fiche</RouterLink
              >
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <span
                v-if="currentCard.verdict"
                class="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                :class="currentCard.verdictClass"
                >{{ currentCard.verdict }}</span
              >
              <span
                v-if="currentCard.fit"
                class="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                :class="currentCard.fitClass"
                >{{ currentCard.fit }}</span
              >
              <span
                class="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-semibold"
                >{{ currentCard.dpe }}</span
              >
            </div>
          </div>

          <div
            class="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] sm:gap-2.5"
            data-testid="triage-figures"
          >
            <div
              v-for="figure in currentCard.figures"
              :key="figure.label"
              class="flex flex-col gap-px rounded-xl border border-line bg-surface px-3 py-2.5 sm:border-0 sm:bg-bg sm:px-3.5"
            >
              <span class="text-xs text-muted">{{ figure.label }}</span>
              <strong class="font-display text-[19px] sm:text-[21px]">{{
                figure.value
              }}</strong>
              <span
                v-if="figure.note"
                class="hidden text-xs text-muted sm:block"
                >{{ figure.note }}</span
              >
            </div>
          </div>

          <div
            v-if="!confirmMode"
            class="flex flex-col gap-3.5 sm:flex-row sm:flex-wrap sm:gap-x-7"
          >
            <section
              v-if="currentCard.why.length"
              class="flex flex-col gap-1 rounded-xl border border-line bg-surface px-3.5 py-3 sm:flex-[1_1_320px] sm:gap-1.5 sm:border-0 sm:bg-transparent sm:p-0"
              data-testid="triage-why"
            >
              <h2 class="text-[15px] font-semibold">
                {{ currentCard.whyTitle }}
              </h2>
              <ul class="ml-4.5 list-disc leading-normal">
                <li v-for="why in currentCard.why" :key="why">{{ why }}</li>
              </ul>
            </section>
            <section
              v-if="currentCard.missing.length"
              class="hidden flex-col gap-1.5 sm:flex sm:flex-[1_1_320px]"
              data-testid="triage-missing"
            >
              <h2 class="text-[15px] font-semibold">Ce qui manque</h2>
              <ul class="ml-4.5 list-disc leading-normal">
                <li v-for="missing in currentCard.missing" :key="missing">
                  {{ missing }}
                </li>
              </ul>
            </section>
          </div>

          <PropertyFacts
            v-model:open="factsOpen"
            :facts="currentCard.facts"
            :description="currentCard.description"
          />

          <div
            v-if="duplicate && !confirmMode"
            class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn"
            data-testid="triage-duplicate"
          >
            <span class="min-w-0 flex-[1_1_20rem]"
              >{{ duplicateLead(duplicate) }} « {{ duplicate.title }} », déjà
              suivie : {{ duplicateWhy(duplicate) }}</span
            >
            <button
              type="button"
              class="min-h-11 rounded-lg border border-warn bg-surface px-3 font-semibold disabled:opacity-60"
              :disabled="busy"
              data-action="same"
              @click="same(duplicate.listingId)"
            >
              C’est la même
            </button>
          </div>

          <div
            class="fixed inset-x-0 bottom-0 z-10 flex flex-col gap-2 border-t border-line bg-surface px-4 pt-2.5 pb-3.5 sm:static sm:px-0 sm:pt-3.5 sm:pb-0"
          >
            <template v-if="confirmMode && current?.proposal">
              <DiscardReasons
                v-if="refuseAsking"
                :busy="busy"
                @pick="reason => sendRefuse('discard', reason)"
                @cancel="refuseAsking = false"
              />
              <div
                v-else
                class="grid grid-cols-[1fr_0.8fr_1.2fr] gap-2 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] sm:gap-2.5"
              >
                <button
                  type="button"
                  class="min-h-[60px] rounded-[14px] border-[1.5px] border-ai bg-surface font-semibold text-ai disabled:opacity-60 sm:min-h-14 sm:rounded-xl sm:text-base"
                  :disabled="busy"
                  data-action="refuse"
                  @click="refuse"
                >
                  {{ refuseLabel(current.proposal.choice) }}
                </button>
                <button
                  type="button"
                  class="min-h-[60px] rounded-[14px] border-[1.5px] border-line bg-surface font-semibold disabled:opacity-60 sm:min-h-14 sm:rounded-xl sm:text-base"
                  :disabled="busy"
                  data-action="later"
                  @click="later"
                >
                  Plus tard
                </button>
                <button
                  type="button"
                  class="min-h-[60px] rounded-[14px] bg-accent font-semibold text-accent-fg disabled:opacity-60 sm:min-h-14 sm:rounded-xl sm:text-base"
                  :disabled="busy"
                  data-action="agree"
                  @click="agree"
                >
                  {{
                    agreeLabel(current.proposal.target, current.proposal.choice)
                  }}
                </button>
              </div>
              <p
                v-if="!refuseAsking"
                class="hidden text-xs text-muted sm:block"
              >
                D’accord : l’annonce change d’étape tout de suite. Sinon, elle
                part dans « À trancher ensemble ».
              </p>
            </template>
            <template v-else>
              <DiscardReasons
                v-if="asking"
                :busy="busy"
                @pick="reason => decide('discard', reason)"
                @cancel="asking = false"
              />
              <div
                v-else
                class="grid grid-cols-[1fr_0.8fr_1.2fr] gap-2 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] sm:gap-2.5"
              >
                <button
                  type="button"
                  class="min-h-[60px] rounded-[14px] border-[1.5px] border-bad bg-surface font-semibold text-bad disabled:opacity-60 sm:min-h-14 sm:rounded-xl sm:text-base"
                  :disabled="busy"
                  data-action="discard"
                  @click="asking = true"
                >
                  Écarter
                  <span class="hidden text-xs font-normal sm:inline"
                    >touche E</span
                  >
                </button>
                <button
                  type="button"
                  class="min-h-[60px] rounded-[14px] border-[1.5px] border-line bg-surface font-semibold disabled:opacity-60 sm:min-h-14 sm:rounded-xl sm:text-base"
                  :disabled="busy"
                  data-action="skip"
                  @click="skip"
                >
                  Passer
                  <span class="hidden text-xs font-normal sm:inline"
                    >touche P</span
                  >
                </button>
                <button
                  type="button"
                  class="min-h-[60px] rounded-[14px] bg-accent font-semibold text-accent-fg disabled:opacity-60 sm:min-h-14 sm:rounded-xl sm:text-base"
                  :disabled="busy"
                  data-action="keep"
                  @click="decide(primaryChoice(stage))"
                >
                  {{ primaryLabel(stage) }}
                  <span class="hidden text-xs font-normal sm:inline"
                    >touche A</span
                  >
                </button>
              </div>
            </template>
          </div>
        </article>
      </template>

      <article
        v-else-if="finished"
        class="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-4 sm:gap-4 sm:p-6"
        data-testid="triage-summary"
      >
        <h1 class="font-display text-[25px] font-bold sm:text-[26px]">
          {{ confirmMode ? 'C’est fait' : 'Ton tri est fini' }}
        </h1>
        <div
          v-if="!confirmMode"
          class="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5"
          data-testid="summary-totals"
        >
          <div
            v-for="line in totals"
            :key="line.label"
            class="rounded-xl bg-bg px-3.5 py-3"
          >
            <strong class="font-display text-[26px]">{{ line.n }}</strong>
            {{ line.label }}
          </div>
        </div>
        <ul class="m-0 list-none p-0" data-testid="summary-list">
          <li
            v-for="pick in picks"
            :key="pick.id"
            class="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-line py-2.5"
          >
            <span class="font-medium">{{ pick.title }}</span>
            <span class="text-muted">{{
              confirmMode ? pick.result : pick.label
            }}</span>
          </li>
        </ul>

        <div
          v-if="!confirmMode && hasProposals && !outcome"
          class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
        >
          <button
            type="button"
            class="min-h-[52px] rounded-xl bg-accent px-4.5 font-semibold text-accent-fg disabled:opacity-60 sm:min-h-12"
            :disabled="busy"
            data-action="finish"
            @click="finishAndNotify"
          >
            {{ finishedLabel }}
          </button>
          <button
            type="button"
            class="min-h-12 rounded-xl border border-line bg-surface px-3.5 disabled:opacity-60"
            :disabled="busy"
            data-action="decide-now"
            @click="decideNow"
          >
            Décider sans attendre
          </button>
          <span class="text-xs text-muted">
            « Décider sans attendre » applique tes choix tout de suite et
            l’inscrit au journal.
          </span>
        </div>
        <div
          v-if="outcome"
          class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-xl bg-accent-soft px-3.5 py-3 text-accent"
          data-testid="triage-outcome"
        >
          <span>{{ outcomeText }}</span>
          <button
            type="button"
            class="inline-flex min-h-11 items-center bg-transparent font-semibold underline underline-offset-2"
            @click="quit"
          >
            Retour aux annonces
          </button>
        </div>
        <div
          v-else-if="confirmMode || !hasProposals"
          class="flex flex-wrap gap-2"
        >
          <RouterLink
            v-if="hasClash"
            :to="{ name: 'settle' }"
            class="inline-flex min-h-12 items-center rounded-xl bg-accent px-4.5 font-semibold text-accent-fg"
            data-action="go-settle"
            >Voir ce qui reste à trancher</RouterLink
          >
          <button
            type="button"
            class="inline-flex min-h-12 items-center rounded-xl border border-line bg-surface px-3.5"
            data-action="back"
            @click="quit"
          >
            Retour aux annonces
          </button>
        </div>
      </article>
    </main>
  </div>
</template>
