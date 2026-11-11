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
    SimilarListing,
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
  import { useListingMerge } from '@/composables/useListingMerge'
  import { useListingList } from '@/composables/useListings'
  import { useTriageSession } from '@/composables/useTriageSession'
  import type { TriagePick } from '@/composables/useTriageSession'
  import {
    useDecisionActions,
    useDecisionCards,
    useWorkflowOverview,
  } from '@/composables/useWorkflow'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { api } from '@/lib/api'
  import { useAction } from '@/composables/useAction'
  import SimilarListingPicker from '@/components/merge/SimilarListingPicker.vue'
  import QueryState from '@/components/ui/QueryState.vue'
  import SidePanel from '@/components/ui/SidePanel.vue'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import { errorMessage } from '@/lib/errors'
  import JudgementPills from '@/components/listings/JudgementPills.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import { pendingDuplicate, duplicateLead, duplicateWhy } from '@/lib/drafts'
  import { alreadySeenLabel } from '@/lib/merge'
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
   *
   * Lot 27 (ADR 0037) : « Déjà vue » (touche D) ouvre la recherche des
   * annonces suivies, classées par ressemblance avec la carte ; « C'est la
   * même » rattache le brouillon à l'annonce retrouvée, ou fusionne les deux
   * fiches (l'annonce retrouvée est gardée ; la fusion s'annule).
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

  /**
   * Lot 22 : la lecture qui nourrit ce tri. Un échec (réseau coupé) se dit,
   * avec « Réessayer » ; jamais un « Chargement… » sans fin.
   */
  const activeQuery = computed(() =>
    confirmMode.value ? cards : stage.value === 'a-valider' ? drafts : listings
  )

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

  const announce = ref('')
  const action = useAction('L’action a échoué.')
  const busy = action.pending
  const asking = ref(false)
  /** Le volet « Les données du bien » reste ouvert d'une annonce à l'autre. */
  const factsOpen = ref(false)

  async function run(task: () => Promise<void>): Promise<void> {
    if (busy.value) return
    await action.run(task)
  }

  /**
   * Lot 24 : un choix s'applique à l'écran tout de suite (la carte suivante
   * arrive sans attendre le serveur) ; la réponse complète le bilan. Si le
   * serveur refuse, le choix sort du bilan, la carte revient et l'erreur le
   * dit au-dessus des boutons. Terminer, décider ou quitter attend les
   * réponses en route.
   */
  const inflight = new Set<Promise<void>>()
  const failure = ref<string | null>(null)
  const shownError = computed(() => failure.value ?? action.error.value)
  function optimistic(
    item: QueueItem,
    pick: TriagePick,
    send: () => Promise<{ message: string; patch: Partial<TriagePick> }>
  ): void {
    failure.value = null
    action.clear()
    session.push({ ...pick, pending: true })
    asking.value = false
    refuseAsking.value = false
    announce.value = `${pick.label}. ${progressLine.value}`
    const task = (async () => {
      try {
        const { message, patch } = await send()
        session.patch(item.id, patch)
        announce.value = `${message} ${progressLine.value}`
      } catch (error) {
        session.rollback(item.id)
        failure.value = `« ${item.card.title} » : ${errorMessage(error, 'le choix n’a pas été enregistré.')} La carte est revenue.`
        announce.value = failure.value
      }
    })()
    inflight.add(task)
    void task.finally(() => inflight.delete(task))
  }
  const settled = () => Promise.all([...inflight])

  const stageWord = computed(() => primaryLabel(stage.value))

  function pickFrom(
    item: QueueItem,
    action: DecisionChoice,
    reason: string | null,
    result: Pick<
      DecisionResult,
      'outcome' | 'proposal' | 'createdListing' | 'listingId'
    >,
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
    if (!item || busy.value) return
    const statusBefore = item.listing?.listing.status ?? null
    const ahead = pickFrom(
      item,
      choice,
      reason,
      {
        outcome: 'applied',
        proposal: null,
        createdListing: false,
        listingId: null,
      },
      statusBefore
    )
    optimistic(item, { ...ahead, undo: null }, async () => {
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
      return {
        message: result.message,
        patch: pickFrom(item, choice, reason, result, statusBefore),
      }
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
    if (!item?.proposal || busy.value) return
    const proposal = item.proposal
    const out = proposal.choice === 'discard'
    optimistic(
      item,
      {
        id: item.id,
        title: item.card.title,
        label: `D’accord : ${proposal.choiceLabel}`,
        result: out ? 'Écartée' : `Passée en ${proposal.choiceLabel}`,
        action: 'agree',
        proposalId: proposal.id,
        undo: null,
        statusBefore: proposal.fromStatus,
        createdListing: false,
        listingId: null,
      },
      async () => {
        const result = await actions.respond.mutateAsync({
          id: proposal.id,
          input: { agree: true, sessionId: sessionId.value },
        })
        return {
          message: result.message,
          patch: {
            ...(result.outcome === 'stale' ? { result: 'Caduque' } : {}),
            undo: result.createdListing ? null : 'proposal',
            createdListing: result.createdListing,
            listingId: result.listingId,
          },
        }
      }
    )
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
    if (!item?.proposal || busy.value) return
    const proposal = item.proposal
    optimistic(
      item,
      {
        id: item.id,
        title: item.card.title,
        label: refuseLabel(proposal.choice),
        result: 'À trancher ensemble',
        action: 'refuse',
        proposalId: proposal.id,
        undo: null,
        statusBefore: proposal.fromStatus,
        createdListing: false,
        listingId: null,
        toSettle: true,
      },
      async () => {
        const result = await actions.respond.mutateAsync({
          id: proposal.id,
          input: {
            agree: false,
            choice,
            ...(reason ? { reason } : {}),
            sessionId: sessionId.value,
          },
        })
        return { message: result.message, patch: { undo: 'proposal' } }
      }
    )
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
      !lastPick.value.pending &&
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
      } else if (pick.undo === 'merge' && pick.mergeId) {
        // Lot 27 : « Déjà vue » sur une annonce : la fusion est défaite.
        await merges.undo.mutateAsync(pick.mergeId)
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
    // Lot 27 : seulement s'il y en a (la grille reste à trois sinon).
    ...(count('seen') > 0
      ? [
          {
            n: count('seen'),
            label: count('seen') > 1 ? 'déjà vues' : 'déjà vue',
          },
        ]
      : []),
  ])
  const hasClash = computed(() => picks.value.some(p => p.toSettle))
  const finishedLabel = computed(() => finishLabel(others.value))

  const outcome = computed(() => session.snapshot.value?.outcome ?? null)
  const outcomeText = computed(
    () => session.snapshot.value?.outcomeText ?? null
  )

  function finishAndNotify(): void {
    void run(async () => {
      await settled()
      const result = await actions.finishSession.mutateAsync(sessionId.value)
      session.setOutcome('sent', result.message)
      announce.value = result.message
    })
  }

  function decideNow(): void {
    void run(async () => {
      await settled()
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
      await settled()
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
    // Lot 27 : la recherche « Déjà vue » est ouverte, ses touches sont à elle.
    if (seenOpen.value) return
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
    } else if (key === 'd') {
      event.preventDefault()
      openSeen()
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
        action: 'seen',
        proposalId: null,
        undo: null,
        statusBefore: null,
        createdListing: false,
        listingId,
      })
    })
  }

  // --- Lot 27 : « Déjà vue » ------------------------------------------------

  const merges = useListingMerge()
  const seenOpen = ref(false)
  const seenAction = useAction('L’annonce n’a pas pu être rattachée.')
  /** Ce qu'on compare aux annonces suivies : le brouillon ou l'annonce de la carte. */
  const seenTarget = computed(() =>
    current.value?.draft
      ? { draftId: current.value.draft.id }
      : current.value?.listing
        ? { listingId: current.value.listing.listing.id }
        : {}
  )

  function openSeen(): void {
    if (!current.value || confirmMode.value) return
    asking.value = false
    seenAction.clear()
    seenOpen.value = true
  }

  /**
   * « C'est la même » sur une annonce retrouvée. Un brouillon y est rattaché
   * (son lien, ce qu'il a lu, son agence si c'en est une autre) ; une annonce
   * y est fusionnée : l'annonce retrouvée, déjà vue, est celle qu'on garde.
   */
  async function alreadySeen(found: SimilarListing): Promise<void> {
    const item = current.value
    if (!item || seenAction.pending.value) return
    const base = {
      id: item.id,
      title: item.card.title,
      label: alreadySeenLabel(found.title),
      action: 'seen' as const,
      proposalId: null,
      statusBefore: null,
      createdListing: false,
      listingId: found.listingId,
    }
    const draft = item.draft
    const listing = item.listing
    const done = await seenAction.run(async () => {
      if (draft) {
        await drafts.merge.mutateAsync({
          id: draft.id,
          request: {
            listingId: found.listingId,
            expectedUpdatedAt: found.updatedAt,
          },
        })
        return {
          ...base,
          result: 'Ajoutée à la fiche suivie',
          undo: null,
        } satisfies TriagePick
      }
      if (!listing) return null
      const merged = await merges.merge.mutateAsync({
        keepId: found.listingId,
        input: {
          absorbedId: listing.listing.id,
          expectedUpdatedAt: found.updatedAt,
          expectedAbsorbedUpdatedAt: listing.listing.updatedAt,
        },
      })
      return {
        ...base,
        result: 'Fusionnée avec la fiche déjà suivie',
        undo: 'merge',
        mergeId: merged.merge.id,
      } satisfies TriagePick
    })
    if (!done) return
    session.push(done)
    seenOpen.value = false
    announce.value = `${done.label}. ${progressLine.value}`
  }
</script>

<template>
  <div class="flex min-h-screen flex-col bg-bg text-fg">
    <header class="border-b border-line bg-surface">
      <div
        class="mx-auto flex w-full max-w-[1040px] flex-col gap-1.5 px-4 pt-2 pb-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2 sm:px-5 sm:py-2.5"
      >
        <div class="flex items-center justify-between gap-2 sm:contents">
          <UiButton
            variant="ghost"
            icon="arrow-left"
            class="-ml-2 text-accent"
            data-testid="triage-quit"
            :disabled="busy"
            @click="quit"
          >
            {{ confirmMode ? 'Quitter' : 'Quitter le tri' }}
          </UiButton>
          <strong class="sm:hidden" data-testid="progress-mobile">
            {{ Math.min(position + 1, total) }} sur {{ total }}
          </strong>
          <UiButton
            v-if="canUndo"
            icon="undo"
            class="sm:order-last"
            :aria-label="undoText"
            :disabled="busy"
            data-testid="triage-undo"
            @click="undo"
          >
            <span class="sm:hidden">Annuler</span>
            <span class="hidden sm:inline">{{ undoText }}</span>
          </UiButton>
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
      class="mx-auto flex w-full max-w-[1040px] min-w-0 flex-1 flex-col gap-3 px-4 py-3.5 pb-56 sm:px-5 sm:py-4.5 sm:pb-10"
    >
      <p class="sr-only" aria-live="polite" data-testid="triage-live">
        {{ announce }}
      </p>
      <UiAlert
        v-if="undoBlocked && !finished"
        tone="neutral"
        data-testid="undo-blocked"
      >
        {{ CREATED_LISTING_NO_UNDO }}
        <RouterLink
          v-if="lastPick?.listingId"
          :to="{ name: 'listing', params: { id: lastPick.listingId } }"
          class="ml-1 text-accent underline underline-offset-2"
          >Ouvrir la fiche</RouterLink
        >
      </UiAlert>

      <QueryState
        :query="activeQuery"
        :pending="!loaded"
        :empty="loaded && total === 0"
        skeleton="cards"
        :skeleton-count="1"
        loading-label="ce qu’il y a à trier"
        error-fallback="Impossible de lire ce qu’il y a à trier."
        data-testid="triage-state"
      >
        <template #empty>
          <UiCard>
            <p class="font-semibold" data-testid="triage-empty">
              {{ confirmMode ? 'Rien à confirmer.' : 'Rien à trier ici.' }}
            </p>
            <p class="mt-1 text-sm text-muted">
              {{
                confirmMode
                  ? 'Les propositions des autres membres arriveront ici.'
                  : 'Les nouvelles annonces de cette étape arriveront ici.'
              }}
            </p>
            <UiButton class="mt-3" data-action="empty-back" @click="quit"
              >Retour aux annonces</UiButton
            >
          </UiCard>
        </template>
        <template v-if="!finished && currentCard">
          <p
            v-if="!confirmMode && agreement"
            class="text-sm text-muted"
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
                  class="min-w-0 flex-[1_1_320px] font-display text-2xl leading-tight font-bold sm:text-3xl"
                >
                  {{ currentCard.title }}
                </h1>
                <UiButton
                  v-if="currentCard.url"
                  :href="currentCard.url"
                  variant="outline"
                  icon-right="external"
                  class="whitespace-nowrap"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="triage-link"
                  >Voir l’annonce en ligne
                  <span class="sr-only">(nouvel onglet)</span></UiButton
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
              <!-- Lot 25 : les trois jugements étiquetés, puis le DPE. -->
              <div class="flex flex-wrap items-center gap-1.5">
                <JudgementPills :judgements="currentCard.judgements" />
                <UiBadge>{{ currentCard.dpe }}</UiBadge>
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
                <strong class="font-display text-xl">{{ figure.value }}</strong>
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
                <h2 class="text-base font-semibold">
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
                <h2 class="text-base font-semibold">Ce qui manque</h2>
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
              <UiButton
                class="border-warn! font-semibold"
                :disabled="busy"
                data-action="same"
                @click="same(duplicate.listingId)"
              >
                C’est la même
              </UiButton>
            </div>

            <div
              class="fixed inset-x-0 bottom-0 z-10 flex flex-col gap-2 border-t border-line bg-surface px-4 pt-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:static sm:px-0 sm:pt-3.5 sm:pb-0"
            >
              <!-- Lot 22 : l'échec d'un choix se dit au-dessus des boutons. -->
              <UiAlert v-if="shownError" data-testid="triage-failure">
                {{ shownError }}
              </UiAlert>
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
                  <UiButton
                    class="min-h-15! rounded-[14px]! font-semibold sm:min-h-14! sm:rounded-xl! sm:text-base border-[1.5px] border-ai! text-ai"
                    :disabled="busy"
                    data-action="refuse"
                    @click="refuse"
                  >
                    {{ refuseLabel(current.proposal.choice) }}
                  </UiButton>
                  <UiButton
                    class="min-h-15! rounded-[14px]! font-semibold sm:min-h-14! sm:rounded-xl! sm:text-base border-[1.5px]"
                    :disabled="busy"
                    data-action="later"
                    @click="later"
                  >
                    Plus tard
                  </UiButton>
                  <UiButton
                    variant="primary"
                    class="min-h-15! rounded-[14px]! font-semibold sm:min-h-14! sm:rounded-xl! sm:text-base"
                    :disabled="busy"
                    data-action="agree"
                    @click="agree"
                  >
                    {{
                      agreeLabel(
                        current.proposal.target,
                        current.proposal.choice
                      )
                    }}
                  </UiButton>
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
                  <UiButton
                    variant="danger-soft"
                    class="min-h-15! rounded-[14px]! font-semibold sm:min-h-14! sm:rounded-xl! sm:text-base border-[1.5px] border-bad!"
                    :disabled="busy"
                    data-action="discard"
                    @click="asking = true"
                  >
                    Écarter
                    <span class="hidden text-xs font-normal sm:inline"
                      >touche E</span
                    >
                  </UiButton>
                  <UiButton
                    class="min-h-15! rounded-[14px]! font-semibold sm:min-h-14! sm:rounded-xl! sm:text-base border-[1.5px]"
                    :disabled="busy"
                    data-action="skip"
                    @click="skip"
                  >
                    Passer
                    <span class="hidden text-xs font-normal sm:inline"
                      >touche P</span
                    >
                  </UiButton>
                  <UiButton
                    variant="primary"
                    class="min-h-15! rounded-[14px]! font-semibold sm:min-h-14! sm:rounded-xl! sm:text-base"
                    :disabled="busy"
                    data-action="keep"
                    @click="decide(primaryChoice(stage))"
                  >
                    {{ primaryLabel(stage) }}
                    <span class="hidden text-xs font-normal sm:inline"
                      >touche A</span
                    >
                  </UiButton>
                </div>
                <!-- Lot 27 : on l'a déjà vue ? La retrouver et la rattacher. -->
                <UiButton
                  v-if="!asking"
                  variant="ghost"
                  icon="search"
                  class="self-center text-accent"
                  :disabled="busy"
                  data-action="already-seen"
                  @click="openSeen"
                >
                  Déjà vue ? La retrouver
                  <span class="hidden text-xs font-normal text-muted sm:inline"
                    >touche D</span
                  >
                </UiButton>
              </template>
            </div>
          </article>
        </template>

        <article
          v-else-if="finished"
          class="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-4 sm:gap-4 sm:p-6"
          data-testid="triage-summary"
        >
          <h1 class="font-display text-2xl font-bold sm:text-3xl">
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
              <strong class="font-display text-3xl">{{ line.n }}</strong>
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
            <UiButton
              variant="primary"
              class="min-h-12!"
              :loading="busy"
              data-action="finish"
              @click="finishAndNotify"
            >
              {{ finishedLabel }}
            </UiButton>
            <UiButton
              class="min-h-12!"
              :disabled="busy"
              data-action="decide-now"
              @click="decideNow"
            >
              Décider sans attendre
            </UiButton>
            <span class="text-sm text-muted">
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
            <UiButton variant="link" class="font-semibold" @click="quit">
              Retour aux annonces
            </UiButton>
          </div>
          <div
            v-else-if="confirmMode || !hasProposals"
            class="flex flex-wrap gap-2"
          >
            <UiButton
              v-if="hasClash"
              :to="{ name: 'settle' }"
              variant="primary"
              data-action="go-settle"
              >Voir ce qui reste à trancher</UiButton
            >
            <UiButton data-action="back" @click="quit">
              Retour aux annonces
            </UiButton>
          </div>
          <UiAlert v-if="shownError">{{ shownError }}</UiAlert>
        </article>
      </QueryState>
    </main>

    <!-- Lot 27 : « Déjà vue » : les annonces suivies, par ressemblance. -->
    <SidePanel
      v-if="seenOpen && currentCard"
      title="Déjà vue ?"
      @close="seenOpen = false"
    >
      <div class="grid gap-3" data-testid="already-seen-panel">
        <p class="text-sm text-muted">
          Retrouve « {{ currentCard.title }} » parmi les annonces déjà suivies,
          écartées comprises.
          {{
            current?.draft
              ? 'Son lien, et son agence si c’en est une autre, rejoindront la fiche choisie.'
              : 'Les deux fiches n’en feront plus qu’une : celle que tu choisis est gardée, et la fusion s’annule.'
          }}
        </p>
        <UiAlert v-if="seenAction.error.value" data-testid="already-seen-error">
          {{ seenAction.error.value }}
        </UiAlert>
        <SimilarListingPicker
          :target="seenTarget"
          :busy="seenAction.pending.value"
          :action-label="
            current?.draft ? 'C’est la même' : 'C’est la même : fusionner'
          "
          @pick="alreadySeen"
        />
      </div>
    </SidePanel>
  </div>
</template>
