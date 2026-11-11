<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'
  import { useQuery } from '@tanstack/vue-query'
  import { DialogTitle } from 'reka-ui'
  import type {
    DecisionChoice,
    DecisionResult,
    ListingStatus,
    OfferInputRaw,
    OfferUpdate,
  } from '@apart/contracts'
  import {
    proposedMessage,
    todoPendingCount,
    waitingNames,
  } from '@apart/domain'
  import QueryState from '@/components/ui/QueryState.vue'
  import SidePanel from '@/components/ui/SidePanel.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import { useLeaveGuard } from '@/composables/useLeaveGuard'
  import { useFeedbackStore } from '@/stores/feedback'
  import { errorMessage } from '@/lib/errors'
  import {
    createListingEditor,
    provideListingEditor,
  } from '@/composables/useListingEditor'
  import {
    useListing,
    useListingMutations,
    useTargetPrice,
  } from '@/composables/useListings'
  import { useLivePreview } from '@/composables/useLivePreview'
  import { useAssumptions, useWorkspace } from '@/composables/useWorkspace'
  import { useListingExchanges } from '@/composables/useAgencyRequests'
  import { useVisits } from '@/composables/useVisits'
  import { api } from '@/lib/api'
  import { criteriaChangesMessage } from '@/lib/criteria'
  import { parseNumberInput } from '@/lib/format'
  import { ADDRESS_FIELD_ID } from '@/lib/listing-sections'
  import type { OpinionActions } from '@/lib/opinions'
  import { DEFAULT_LISTING_TAB, listingTabQuestion } from '@/lib/listing-tabs'
  import type { ListingTab } from '@/lib/listing-tabs'
  import DecisionBanner from '@/components/workflow/DecisionBanner.vue'
  import { useDecisionActions } from '@/composables/useWorkflow'
  import ListingHeader from './ListingHeader.vue'
  import ListingSynthesis from './ListingSynthesis.vue'
  import ListingTabs from './ListingTabs.vue'
  import UnsavedChangesBar from './sections/UnsavedChangesBar.vue'
  import BudgetTab from './tabs/BudgetTab.vue'
  import HistoryTab from './tabs/HistoryTab.vue'
  import NegotiateTab from './tabs/NegotiateTab.vue'
  import NeighbourhoodTab from './tabs/NeighbourhoodTab.vue'
  import PropertyTab from './tabs/PropertyTab.vue'
  import TodoTab from './tabs/TodoTab.vue'

  /**
   * La fiche d'une annonce (lot 19, ADR 0029) : un en-tête allégé et sept
   * onglets, chacun répond à une question (Synthèse, Le bien, Budget,
   * Négocier, Quartier, À faire, Historique). La fiche se modifie section par
   * section (`useListingEditor`) ; pendant une modification, les chiffres
   * suivent l'aperçu en direct calculé par `domain`.
   */
  const props = defineProps<{
    id: string
    /** Message à afficher à l'ouverture (critères dans lesquels l'annonce créée entre). */
    notice?: string | null
  }>()
  const emit = defineEmits<{ close: [] }>()
  /**
   * L'onglet ouvert. La page des annonces le lie à l'URL (`?onglet=`) ; sans
   * liaison, il vit dans le composant.
   */
  const tab = defineModel<ListingTab>('tab', { default: DEFAULT_LISTING_TAB })

  const id = computed(() => props.id)
  const listingQuery = useListing(id)
  const { data: item } = listingQuery
  const { values: assumptions } = useAssumptions()
  const { me, members } = useWorkspace()
  const mutations = useListingMutations()

  // Lot 22 : les réussites vont à la zone de messages ; chaque échec se dit
  // à côté du contrôle cliqué (en-tête, bandeau de décision, Budget,
  // Négocier), plus en haut de la fiche.
  const feedback = useFeedbackStore()
  if (props.notice) feedback.success(props.notice)
  const statusError = ref<string | null>(null)
  const decisionError = ref<string | null>(null)
  const budgetError = ref<string | null>(null)
  const negotiateError = ref<string | null>(null)
  const seenFor = ref<string | null>(null)

  // « Ce qui a changé » depuis la dernière ouverture : lu avant de marquer la
  // fiche vue, gardé le temps de l'ouverture (puis oublié). Clé hors de
  // `['listings']` : une invalidation des annonces ne doit pas le relire
  // une fois la fiche marquée vue.
  const changesQuery = useQuery({
    queryKey: computed(() => ['listing-changes', props.id] as const),
    queryFn: () => api.whatsNew.listingChanges(props.id),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
  })
  const changes = computed(() => changesQuery.data.value ?? null)
  const changedFields = computed(() => changes.value?.changedFields ?? [])

  // L'annonce devient « vue » pour le membre, une fois par ouverture, après
  // la lecture de ce qui a changé.
  watch(
    [item, () => changesQuery.status.value],
    ([value, status]) => {
      if (!value) return
      if (status !== 'pending' && seenFor.value !== value.listing.id) {
        seenFor.value = value.listing.id
        mutations.markSeen.mutate(value.listing.id)
      }
    },
    { immediate: true }
  )

  // Lot 19 : l'édition section par section, sur un brouillon de la fiche ;
  // l'aperçu en direct en est calculé (aucun appel réseau).
  const editor = createListingEditor({
    listing: computed(() => item.value?.listing ?? null),
    changedFields,
    preview: draft =>
      useLivePreview(
        draft,
        assumptions,
        computed(() => item.value?.listing.openDataContext ?? null),
        // La provenance enregistrée ne vaut que tant que le plafond n'est pas retapé.
        computed(() => {
          const stored =
            item.value?.listing.rentalPlan?.referenceRentPerM2 ?? null
          const typed = parseNumberInput(
            draft.value.rentalPlan.referenceRentPerM2
          )
          return typed === stored
            ? (item.value?.listing.fieldSources ?? null)
            : null
        })
      ),
    // Le refus du serveur se dit dans la section (`errors._submit`).
    submit: async (section, patch) => {
      if (!item.value) throw new Error('Annonce absente')
      const saved = await mutations.update.mutateAsync({
        id: item.value.listing.id,
        patch: { ...patch, expectedUpdatedAt: item.value.listing.updatedAt },
      })
      feedback.success(
        [
          `« ${editor.titleOf(section)} » enregistré.`,
          criteriaChangesMessage(saved.criteriaChanges),
        ]
          .filter(Boolean)
          .join(' ')
      )
    },
    focus: fieldId => {
      void nextTick(() => {
        const field = document.getElementById(fieldId)
        field?.focus?.({ preventScroll: true })
        field?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      })
    },
  })
  provideListingEditor(editor)

  // Lot 22 : le bouton retour du navigateur ou du téléphone, ou un lien,
  // sur une section modifiée : la même question que dans la fiche (le
  // bandeau « Modifications non enregistrées »), puis la navigation.
  useLeaveGuard({
    title: () => editor.titleOf(editor.editing.value ?? 'listing'),
    isDirty: () => editor.dirty.value,
    discard: () => editor.cancel(),
    prompt: proceed => {
      const section = editor.editing.value
      if (section === null) {
        proceed()
        return
      }
      editor.pending.value = { section, run: proceed }
    },
    leaves: (to, from) =>
      to.path !== from.path || to.query.onglet !== from.query.onglet,
  })

  // Lot 20 : « Mon avis » passe par la même garde, sans aperçu en direct.
  const live = computed(
    () => editor.editing.value !== null && editor.editing.value !== 'opinion'
  )
  const shownEvaluation = computed(() =>
    live.value
      ? editor.preview.value.evaluation
      : (item.value?.evaluation ?? null)
  )
  /** Les hypothèses de l'espace (lot 19 : plus de surcharge par annonce). */
  const shownAssumptions = computed(() => assumptions.value ?? null)

  // Le rapport du serveur (rang, historique) ; pendant l'édition, l'aperçu
  // calculé dans le navigateur par `domain`.
  const { data: targetReport } = useTargetPrice(id)
  const shownTargetPrice = computed(() =>
    live.value
      ? (editor.preview.value.evaluation?.targetPrice ?? null)
      : (targetReport.value?.targetPrice ??
        item.value?.evaluation.targetPrice ??
        null)
  )
  const shownNegotiation = computed(() =>
    live.value
      ? editor.preview.value.negotiation
      : (targetReport.value?.negotiation ?? null)
  )

  // Lot 17 : les échanges avec l'annonceur (messages à valider, relances),
  // et les visites : la pastille de « À faire » et les prochaines étapes.
  const exchanges = useListingExchanges(id)
  const agencyRequests = computed(() => exchanges.data.value?.requests ?? [])
  const visits = useVisits(id)
  const visitList = computed(() => visits.data.value ?? [])
  const todoCount = computed(() =>
    todoPendingCount({
      tasks: item.value?.tasks ?? [],
      requests: agencyRequests.value,
    })
  )

  /** Changer d'onglet quitte la section en édition (confirmation si modifiée). */
  const tabsBar = ref<HTMLElement | null>(null)
  const tabModel = computed<ListingTab>({
    get: () => tab.value,
    set: next => {
      if (next === tab.value) return
      editor.guard(() => {
        editor.cancel()
        tab.value = next
        void nextTick(keepTabsInView)
      })
    },
  })
  /** Après un changement d'onglet, le haut du panneau, sous la barre collée. */
  function keepTabsInView(): void {
    const bar = tabsBar.value
    const panel = document.getElementById(`listing-panel-${tab.value}`)
    if (!bar || !panel) return
    if (
      panel.getBoundingClientRect().top < bar.getBoundingClientRect().bottom
    ) {
      panel.scrollIntoView?.({ block: 'start' })
    }
  }
  function go(next: ListingTab): void {
    tabModel.value = next
  }

  /** Fermer la fiche : confirmation si une section est modifiée. */
  function requestClose(): void {
    editor.guard(() => {
      editor.cancel()
      emit('close')
    })
  }

  /**
   * « Préciser l'adresse » : l'onglet Le bien, la section de l'adresse
   * ouverte, le champ de l'adresse atteint. À l'enregistrement, le serveur
   * replace le repère (adresse au numéro, sinon quartier reconnu, sinon
   * commune).
   */
  function preciseAddress(): void {
    editor.guard(() => {
      if (tab.value !== 'bien') {
        editor.cancel()
        tab.value = 'bien'
      }
      void nextTick(() => editor.start('listing', ADDRESS_FIELD_ID))
    })
  }

  /** Le statut proposé par la dernière offre écrite, jusqu'à ce qu'il soit appliqué ou que la fiche change. */
  const suggestedStatus = ref<ListingStatus | null>(null)
  const busy = computed(
    () =>
      mutations.update.isPending.value ||
      mutations.setStatus.isPending.value ||
      mutations.addOffer.isPending.value ||
      mutations.updateOffer.isPending.value ||
      mutations.recordPriceChange.isPending.value
  )

  async function changeStatus(
    change: { status: ListingStatus; reason: string | null },
    from: 'header' | 'tab' = 'tab'
  ): Promise<void> {
    if (!item.value) return
    statusError.value = null
    try {
      const saved = await mutations.setStatus.mutateAsync({
        id: item.value.listing.id,
        change: { ...change, expectedStatus: item.value.listing.status },
      })
      if (change.status === suggestedStatus.value) suggestedStatus.value = null
      // Lot 21 : une décision à deux devient une proposition.
      if (saved.decision && saved.listing.status !== change.status) {
        feedback.success(proposedMessage(waitingNames(saved.decision)))
      }
    } catch (err) {
      const text = errorMessage(err, 'Le changement de statut a échoué.')
      // Depuis l'en-tête, sous le menu ; depuis un onglet, dans la zone.
      if (from === 'header') statusError.value = text
      else feedback.error(text)
    }
  }

  // Lot 21 : répondre, retirer, décider sans attendre depuis la fiche.
  const decisions = useDecisionActions()
  async function act(promise: Promise<DecisionResult>): Promise<void> {
    decisionError.value = null
    try {
      const result = await promise
      feedback.success(result.message)
    } catch (err) {
      decisionError.value = errorMessage(err)
    }
  }
  function withdrawDecision(): void {
    if (item.value?.decision) {
      void act(decisions.withdraw.mutateAsync(item.value.decision.id))
    }
  }
  function decideNow(): void {
    if (item.value?.decision) {
      void act(decisions.decideNow.mutateAsync(item.value.decision.id))
    }
  }
  function agreeDecision(): void {
    if (item.value?.decision) {
      void act(
        decisions.respond.mutateAsync({
          id: item.value.decision.id,
          input: { agree: true },
        })
      )
    }
  }
  function disagreeDecision(
    choice: DecisionChoice,
    reason: string | null
  ): void {
    if (item.value?.decision) {
      void act(
        decisions.respond.mutateAsync({
          id: item.value.decision.id,
          input: {
            agree: false,
            choice,
            ...(reason ? { reason } : {}),
          },
        })
      )
    }
  }
  const decisionBusy = computed(
    () =>
      decisions.withdraw.isPending.value ||
      decisions.decideNow.isPending.value ||
      decisions.respond.isPending.value
  )

  /** « Retenir » le loyer de marché estimé par les comparables dans la phase 2. */
  async function retainMarketRent(rent: number): Promise<void> {
    if (!item.value) return
    budgetError.value = null
    const plan = item.value.listing.rentalPlan
    if (!plan) {
      budgetError.value =
        'Renseigne d’abord le loyer visé de la phase 2 pour y retenir un loyer de marché.'
      return
    }
    try {
      await mutations.update.mutateAsync({
        id: item.value.listing.id,
        patch: {
          rentalPlan: { ...plan, marketRent: rent },
          expectedUpdatedAt: item.value.listing.updatedAt,
        },
      })
      feedback.success('Loyer de marché retenu dans la phase 2.')
    } catch (err) {
      budgetError.value = errorMessage(err, 'L’enregistrement a échoué.')
    }
  }

  async function addOffer(input: OfferInputRaw): Promise<void> {
    if (!item.value) return
    negotiateError.value = null
    try {
      const result = await mutations.addOffer.mutateAsync({
        id: item.value.listing.id,
        input,
      })
      suggestedStatus.value = result.suggestedStatus
      feedback.success('Offre enregistrée.')
    } catch (err) {
      negotiateError.value = errorMessage(err, 'L’enregistrement a échoué.')
    }
  }

  async function updateOffer(
    offerId: string,
    update: OfferUpdate
  ): Promise<void> {
    if (!item.value) return
    negotiateError.value = null
    const listingId = item.value.listing.id
    // Lot 22 : « Annuler » remet la réponse d'avant, par le même appel.
    const before = item.value.offers.find(offer => offer.id === offerId)
    const restore: OfferUpdate | null =
      before && update.response !== undefined
        ? { response: before.response, counterAmount: before.counterAmount }
        : null
    try {
      const result = await mutations.updateOffer.mutateAsync({
        id: listingId,
        offerId,
        update,
      })
      suggestedStatus.value = result.suggestedStatus
      feedback.success(
        'Réponse enregistrée.',
        restore
          ? {
              undo: async () => {
                const undone = await mutations.updateOffer.mutateAsync({
                  id: listingId,
                  offerId,
                  update: restore,
                })
                suggestedStatus.value = undone.suggestedStatus
              },
            }
          : {}
      )
    } catch (err) {
      negotiateError.value = errorMessage(err, 'L’enregistrement a échoué.')
    }
  }

  async function recordPrice(newPrice: number): Promise<void> {
    if (!item.value) return
    negotiateError.value = null
    try {
      await mutations.recordPriceChange.mutateAsync({
        id: item.value.listing.id,
        input: {
          newPrice,
          expectedPrice: item.value.listing.price,
          source: 'listing',
        },
      })
      feedback.success('Nouveau prix enregistré.')
    } catch (err) {
      negotiateError.value = errorMessage(err, 'L’enregistrement a échoué.')
    }
  }

  /**
   * Lot 20 : les actions de « Nos avis ». Chacune lance en cas d'échec : la
   * section garde la saisie et dit pourquoi ; la tâche de contre-visite n'est
   * créée qu'à la confirmation du membre.
   */
  const opinionActions: OpinionActions = {
    save: async input => {
      if (!item.value) return
      await mutations.upsertOpinion.mutateAsync({
        id: item.value.listing.id,
        input,
      })
      feedback.success('Avis enregistré.')
    },
    reveal: async () => {
      if (!item.value) return
      await mutations.revealOpinions.mutateAsync(item.value.listing.id)
    },
    addTask: async task => {
      if (!item.value) return
      await mutations.addTask.mutateAsync({
        id: item.value.listing.id,
        label: task.label,
        details: task.details,
        origin: 'opinion',
      })
      feedback.success(`Tâche ajoutée dans À faire : « ${task.label} ».`)
    },
  }
</script>

<template>
  <SidePanel
    :title="item?.listing.title ?? 'Annonce'"
    wide
    @close="requestClose"
  >
    <template #top>
      <div class="contents">
        <ListingHeader
          v-if="item"
          :item="item"
          :evaluation="shownEvaluation"
          :busy="busy"
          :status-error="statusError"
          @back="requestClose"
          @status="change => changeStatus(change, 'header')"
        />
        <header
          v-else
          class="flex items-center justify-between gap-3 bg-surface px-4 py-3 sm:px-5"
        >
          <DialogTitle as="h1" class="font-display text-lg font-bold">
            Annonce
          </DialogTitle>
          <UiButton icon="close" @click="emit('close')">Fermer</UiButton>
        </header>
        <div
          v-if="item"
          ref="tabsBar"
          class="sticky top-0 z-[6] border-b border-line bg-surface px-4 sm:px-5"
        >
          <ListingTabs v-model="tabModel" :todo-count="todoCount" />
        </div>
      </div>
    </template>

    <QueryState
      :query="listingQuery"
      skeleton="cards"
      :skeleton-count="2"
      loading-label="l’annonce"
      error-fallback="La lecture de l’annonce a échoué."
    >
      <template v-if="item">
        <UnsavedChangesBar />

        <DecisionBanner
          v-if="item.decision"
          :decision="item.decision"
          :busy="decisionBusy"
          :error="decisionError"
          @withdraw="withdrawDecision"
          @decide-now="decideNow"
          @agree="agreeDecision"
          @disagree="disagreeDecision"
        />

        <div
          :id="`listing-panel-${tab}`"
          role="tabpanel"
          :aria-labelledby="`listing-tab-${tab}`"
          tabindex="0"
          class="grid scroll-mt-14 gap-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          :data-panel="tab"
        >
          <p class="text-sm text-muted" data-testid="tab-question">
            {{ listingTabQuestion(tab) }}
          </p>

          <ListingSynthesis
            v-if="tab === 'synthese'"
            :item="item"
            :evaluation="shownEvaluation"
            :target-price="shownTargetPrice"
            :negotiation="shownNegotiation"
            :assumptions="shownAssumptions"
            :live="live"
            :changes="changes"
            :requests="agencyRequests"
            :visits="visitList"
            :members="members"
            :me-id="me?.id ?? null"
            :saving-opinion="mutations.upsertOpinion.isPending.value"
            :opinion-actions="opinionActions"
            @go="go"
            @precise="preciseAddress"
          />

          <PropertyTab v-else-if="tab === 'bien'" :item="item" @go="go" />

          <BudgetTab
            v-else-if="tab === 'budget'"
            :item="item"
            :evaluation="shownEvaluation"
            :target-price="shownTargetPrice"
            :assumptions="shownAssumptions"
            :live="live"
            :busy="busy"
            :error="budgetError"
            @go="go"
            @retain-market-rent="retainMarketRent"
          />

          <NegotiateTab
            v-else-if="tab === 'negocier'"
            :item="item"
            :evaluation="shownEvaluation"
            :target-price="shownTargetPrice"
            :negotiation="shownNegotiation"
            :rank="live ? null : (targetReport?.rank ?? null)"
            :assumptions="shownAssumptions"
            :live="live"
            :busy="busy"
            :suggested-status="suggestedStatus"
            :error="negotiateError"
            @go="go"
            @record-price="recordPrice"
            @add-offer="addOffer"
            @update-offer="updateOffer"
            @set-status="status => changeStatus({ status, reason: null })"
          />

          <NeighbourhoodTab
            v-else-if="tab === 'quartier'"
            :item="item"
            @precise="preciseAddress"
            @go="go"
          />

          <TodoTab
            v-else-if="tab === 'a-faire'"
            :item="item"
            :members="members"
            :me-id="me?.id ?? null"
            @set-status="status => changeStatus({ status, reason: null })"
          />

          <HistoryTab
            v-else
            :item="item"
            :members="members"
            @set-status="status => changeStatus({ status, reason: null })"
          />
        </div>
      </template>
    </QueryState>
  </SidePanel>
</template>
