<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'
  import { useQuery } from '@tanstack/vue-query'
  import type {
    ListingStatus,
    OfferInputRaw,
    OfferUpdate,
    SensitivityAxis,
  } from '@apart/contracts'
  import {
    locationApproximation,
    mergeAssumptions,
    precisionBadge,
  } from '@apart/domain'
  import SidePanel from '@/components/ui/SidePanel.vue'
  import {
    useListing,
    useListingMutations,
    useSensitivity,
    useTargetPrice,
  } from '@/composables/useListings'
  import { useLivePreview } from '@/composables/useLivePreview'
  import { useAssumptions, useWorkspace } from '@/composables/useWorkspace'
  import { ApiError, api } from '@/lib/api'
  import { criteriaChangesMessage } from '@/lib/criteria'
  import { formatDate, formatDistance, parseNumberInput } from '@/lib/format'
  import {
    emptyForm,
    formFromListing,
    formToPatch,
    validateForm,
  } from '@/lib/listing-form'
  import { DEFAULT_LISTING_TAB } from '@/lib/listing-tabs'
  import type { ListingTab } from '@/lib/listing-tabs'
  import ContextSection from './ContextSection.vue'
  import CriteriaBadges from './CriteriaBadges.vue'
  import DpeBadge from './DpeBadge.vue'
  import HistorySection from './HistorySection.vue'
  import ListingForm from './ListingForm.vue'
  import ListingSynthesis from './ListingSynthesis.vue'
  import ListingTabs from './ListingTabs.vue'
  import MetricsPreview from './MetricsPreview.vue'
  import NewBadge from './NewBadge.vue'
  import OpinionsSection from './OpinionsSection.vue'
  import PrecisionBadge from './PrecisionBadge.vue'
  import RentalChecksList from './RentalChecksList.vue'
  import SensitivityTable from './SensitivityTable.vue'
  import StatusBadge from './StatusBadge.vue'
  import StatusChanger from './StatusChanger.vue'
  import TargetPriceSection from './TargetPriceSection.vue'
  import TasksSection from './TasksSection.vue'
  import VerdictPill from './VerdictPill.vue'
  import CompliancePanel from '@/components/study/CompliancePanel.vue'
  import StudySection from '@/components/study/StudySection.vue'
  import JournalSection from '@/components/activity/JournalSection.vue'
  import ListingChanges from '@/components/activity/ListingChanges.vue'
  import VisitsSection from '@/components/visits/VisitsSection.vue'

  const props = defineProps<{
    id: string
    /** Message à afficher à l'ouverture (critères dans lesquels l'annonce créée entre). */
    notice?: string | null
  }>()
  const emit = defineEmits<{ close: [] }>()
  /**
   * L'onglet ouvert (lot 9). La page des annonces le lie à l'URL
   * (`?onglet=`) ; sans liaison, il vit dans le composant.
   */
  const tab = defineModel<ListingTab>('tab', { default: DEFAULT_LISTING_TAB })

  const id = computed(() => props.id)
  const { data: item, isPending, error } = useListing(id)
  const { values: assumptions } = useAssumptions()
  const { me, members } = useWorkspace()
  const mutations = useListingMutations()

  const form = ref(emptyForm())
  const errors = ref<Record<string, string>>({})
  const editing = ref(false)
  const message = ref<string | null>(props.notice ?? null)
  const failure = ref<string | null>(null)
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

  // La fiche ouverte : le formulaire se cale sur l'annonce, et l'annonce
  // devient « vue » pour le membre, une fois par ouverture, après la lecture
  // de ce qui a changé.
  watch(
    [item, () => changesQuery.status.value],
    ([value, status]) => {
      if (!value) return
      if (!editing.value) form.value = formFromListing(value.listing)
      if (status !== 'pending' && seenFor.value !== value.listing.id) {
        seenFor.value = value.listing.id
        mutations.markSeen.mutate(value.listing.id)
      }
    },
    { immediate: true }
  )

  const preview = useLivePreview(
    form,
    assumptions,
    computed(() => item.value?.listing.openDataContext ?? null),
    // La provenance enregistrée ne vaut que tant que le plafond n'est pas retapé.
    computed(() => {
      const stored = item.value?.listing.rentalPlan?.referenceRentPerM2 ?? null
      const typed = parseNumberInput(form.value.rentalPlan.referenceRentPerM2)
      return typed === stored
        ? (item.value?.listing.fieldSources ?? null)
        : null
    })
  )
  const shownEvaluation = computed(() =>
    editing.value ? preview.value.evaluation : (item.value?.evaluation ?? null)
  )
  /**
   * Les hypothèses de l'annonce (espace surchargé par l'annonce), comme le
   * serveur les applique ; pendant l'édition, celles du formulaire.
   */
  const shownAssumptions = computed(() => {
    if (editing.value) return preview.value.assumptions
    if (!assumptions.value) return null
    return mergeAssumptions(
      assumptions.value,
      item.value?.listing.assumptionsOverride ?? null
    )
  })

  // « À partir de quel prix ? » : le rapport du serveur (rang, historique) ;
  // pendant l'édition, l'aperçu calculé dans le navigateur par `domain`.
  const { data: targetReport } = useTargetPrice(id)
  const shownTargetPrice = computed(() =>
    editing.value
      ? (preview.value.evaluation?.targetPrice ?? null)
      : (targetReport.value?.targetPrice ??
        item.value?.evaluation.targetPrice ??
        null)
  )
  const shownNegotiation = computed(() =>
    editing.value
      ? preview.value.negotiation
      : (targetReport.value?.negotiation ?? null)
  )
  const shownNotaryFees = computed(
    () => shownEvaluation.value?.metrics.notaryFeesDetail ?? null
  )

  // Tableau de sensibilité : axes au choix, recalculé côté serveur, avec la
  // ligne du prix cible ; demandé seulement à l'ouverture de l'onglet Négocier.
  const rowAxis = ref<SensitivityAxis>('price')
  const colAxis = ref<SensitivityAxis>('rent')
  const sensitivityRequest = computed(() => ({
    rowAxis: rowAxis.value,
    colAxis: colAxis.value,
    includeTargetPrice: true,
  }))
  const sensitivity = useSensitivity(
    computed(() => (tab.value === 'negocier' ? props.id : null)),
    sensitivityRequest
  )

  const openTasks = computed(
    () => item.value?.tasks.filter(t => !t.done).length ?? 0
  )

  /** « Modifier la fiche » : l'onglet Financer et louer, formulaire ouvert. */
  const formBox = ref<HTMLDetailsElement | null>(null)
  function startEditing(): void {
    editing.value = true
    tab.value = 'financer'
    void nextTick(() => {
      formBox.value?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    })
  }

  /**
   * Lot 12 : « Préciser l'adresse » ouvre le formulaire sur l'adresse. À
   * l'enregistrement, le serveur replace le repère (adresse au numéro, sinon
   * quartier reconnu, sinon commune).
   */
  function preciseAddress(): void {
    startEditing()
    void nextTick(() => {
      const field = document.getElementById('f-address')
      field?.focus?.({ preventScroll: true })
      field?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    })
  }

  /** Le statut proposé par la dernière offre écrite, jusqu'à ce qu'il soit appliqué ou que la fiche change. */
  const suggestedStatus = ref<ListingStatus | null>(null)
  const busy = computed(
    () =>
      mutations.update.isPending.value ||
      mutations.setStatus.isPending.value ||
      mutations.addOffer.isPending.value ||
      mutations.updateOffer.isPending.value
  )
  /** Combien de champs viennent de l'IA : la fiche a été extraite, pas saisie. */
  const aiFieldCount = computed(
    () =>
      Object.values(item.value?.listing.fieldSources ?? {}).filter(
        p => p.source === 'ai'
      ).length
  )

  function report(err: unknown): void {
    failure.value =
      err instanceof ApiError ? err.message : "L'enregistrement a échoué."
  }

  async function save(): Promise<void> {
    if (!item.value) return
    const { input, errors: issues } = validateForm(form.value)
    errors.value = issues
    if (!input) return
    failure.value = null
    try {
      const saved = await mutations.update.mutateAsync({
        id: item.value.listing.id,
        patch: {
          ...formToPatch(form.value),
          expectedUpdatedAt: item.value.listing.updatedAt,
        },
      })
      editing.value = false
      message.value = [
        'Annonce enregistrée.',
        criteriaChangesMessage(saved.criteriaChanges),
      ]
        .filter(Boolean)
        .join(' ')
    } catch (err) {
      report(err)
    }
  }

  function cancel(): void {
    if (item.value) form.value = formFromListing(item.value.listing)
    errors.value = {}
    editing.value = false
  }

  async function changeStatus(change: {
    status: ListingStatus
    reason: string | null
  }): Promise<void> {
    if (!item.value) return
    failure.value = null
    try {
      await mutations.setStatus.mutateAsync({
        id: item.value.listing.id,
        change: { ...change, expectedStatus: item.value.listing.status },
      })
      if (change.status === suggestedStatus.value) suggestedStatus.value = null
    } catch (err) {
      report(err)
    }
  }

  const run = async (action: Promise<unknown>): Promise<void> => {
    failure.value = null
    try {
      await action
    } catch (err) {
      report(err)
    }
  }

  /** « Retenir » le loyer de marché estimé par les comparables dans la phase 2. */
  async function retainMarketRent(rent: number): Promise<void> {
    if (!item.value) return
    const plan = item.value.listing.rentalPlan
    if (!plan) {
      failure.value =
        'Ajoutez d’abord la phase 2 (mise en location) dans la fiche pour y retenir un loyer de marché.'
      return
    }
    failure.value = null
    try {
      await mutations.update.mutateAsync({
        id: item.value.listing.id,
        patch: {
          rentalPlan: { ...plan, marketRent: rent },
          expectedUpdatedAt: item.value.listing.updatedAt,
        },
      })
      message.value = 'Loyer de marché retenu dans la phase 2.'
    } catch (err) {
      report(err)
    }
  }

  async function addOffer(input: OfferInputRaw): Promise<void> {
    if (!item.value) return
    failure.value = null
    try {
      const result = await mutations.addOffer.mutateAsync({
        id: item.value.listing.id,
        input,
      })
      suggestedStatus.value = result.suggestedStatus
      message.value = 'Offre enregistrée.'
    } catch (err) {
      report(err)
    }
  }

  async function updateOffer(
    offerId: string,
    update: OfferUpdate
  ): Promise<void> {
    if (!item.value) return
    failure.value = null
    try {
      const result = await mutations.updateOffer.mutateAsync({
        id: item.value.listing.id,
        offerId,
        update,
      })
      suggestedStatus.value = result.suggestedStatus
      message.value = 'Réponse enregistrée.'
    } catch (err) {
      report(err)
    }
  }
</script>

<template>
  <SidePanel
    :title="item?.listing.title ?? 'Annonce'"
    wide
    @close="emit('close')"
  >
    <p v-if="isPending" class="text-sm text-muted">Chargement de l'annonce…</p>
    <p
      v-else-if="error"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ error.message }}
    </p>
    <div v-else-if="item" class="grid gap-5">
      <header class="grid gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge :status="item.listing.status" />
          <NewBadge :is-new="item.isNewForMe" />
          <DpeBadge :dpe="item.listing.dpeClass" />
          <VerdictPill
            v-if="shownEvaluation"
            :verdict="shownEvaluation.metrics.verdict"
          />
          <CriteriaBadges :matches="item.criteriaMatches" />
          <span class="text-xs text-muted">
            {{
              [item.listing.location.commune, item.listing.location.district]
                .filter(Boolean)
                .join(' · ')
            }}
            <template v-if="item.distanceMeters !== null">
              · à
              {{
                locationApproximation(item.listing.location).approximate
                  ? '≈ '
                  : ''
              }}{{ formatDistance(item.distanceMeters) }}</template
            >
          </span>
          <PrecisionBadge :location="item.listing.location" />
          <button
            v-if="
              !editing && precisionBadge(item.listing.location).tone !== 'exact'
            "
            type="button"
            class="text-xs text-accent underline hover:text-fg"
            data-testid="precise-address"
            @click="preciseAddress"
          >
            Préciser l’adresse
          </button>
        </div>
        <p class="text-xs text-muted">
          Ajoutée le {{ formatDate(item.listing.createdAt) }} · modifiée le
          {{ formatDate(item.listing.updatedAt) }}
          <template v-if="aiFieldCount > 0">
            ·
            <span data-testid="ai-field-count"
              >{{ aiFieldCount }} champ(s) extraits par l'IA</span
            ></template
          >
          <a
            v-if="item.listing.url"
            :href="item.listing.url"
            target="_blank"
            rel="noopener noreferrer"
            class="ml-2 text-accent underline"
            >voir l'annonce</a
          >
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <StatusChanger
            :status="item.listing.status"
            :busy="busy"
            @change="changeStatus"
          />
          <button
            v-if="!editing"
            type="button"
            class="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 py-1 text-sm hover:bg-surface-2"
            data-testid="edit-listing"
            @click="startEditing"
          >
            Modifier la fiche
            <span
              v-if="changedFields.length"
              class="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-fg"
              data-testid="changed-count"
              >{{ changedFields.length }} champ(s) modifié(s)</span
            >
          </button>
          <span v-else class="text-xs text-muted" data-testid="editing-notice"
            >Modification en cours : la synthèse montre l’aperçu en
            direct.</span
          >
        </div>
        <p
          v-if="
            item.listing.status === 'discarded' && item.listing.discardReason
          "
          class="text-xs text-muted"
        >
          Écartée : {{ item.listing.discardReason }}
        </p>
      </header>

      <ListingTabs v-model="tab" :open-tasks="openTasks" />

      <p
        v-if="failure"
        role="alert"
        class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
      >
        {{ failure }}
      </p>
      <p v-else-if="message" class="text-sm text-good" aria-live="polite">
        {{ message }}
      </p>

      <div
        :id="`listing-panel-${tab}`"
        role="tabpanel"
        :aria-labelledby="`listing-tab-${tab}`"
        tabindex="0"
        class="grid gap-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        :data-panel="tab"
      >
        <template v-if="tab === 'synthese'">
          <ListingChanges v-if="changes" :changes="changes" />
          <ListingSynthesis
            :item="item"
            :evaluation="shownEvaluation"
            :target-price="shownTargetPrice"
            :negotiation="shownNegotiation"
            :assumptions="shownAssumptions"
            :live="editing"
            @go="next => (tab = next)"
          />
        </template>

        <template v-else-if="tab === 'negocier'">
          <TargetPriceSection
            :price="shownEvaluation?.metrics.price ?? item.listing.price"
            :target-price="shownTargetPrice"
            :negotiation="shownNegotiation"
            :rank="editing ? null : (targetReport?.rank ?? null)"
            :notary-fees="shownNotaryFees"
            :assumptions="shownAssumptions"
            :rent="shownEvaluation?.metrics.rent ?? 0"
            :live="editing"
          />
          <SensitivityTable
            v-model:row-axis="rowAxis"
            v-model:col-axis="colAxis"
            :grid="sensitivity.data.value ?? null"
            :loading="sensitivity.isFetching.value"
          />
          <HistorySection
            :events="item.priceEvents"
            :offers="item.offers"
            :current-price="item.listing.price"
            :suggested-status="suggestedStatus"
            :busy="busy"
            @record="
              newPrice =>
                run(
                  mutations.recordPriceChange.mutateAsync({
                    id: item!.listing.id,
                    input: {
                      newPrice,
                      expectedPrice: item!.listing.price,
                      source: 'listing',
                    },
                  })
                )
            "
            @add-offer="addOffer"
            @update-offer="updateOffer"
            @set-status="status => changeStatus({ status, reason: null })"
          />
        </template>

        <template v-else-if="tab === 'financer'">
          <RentalChecksList
            v-if="shownEvaluation"
            :rental="shownEvaluation.rental"
          />
          <StudySection
            :item="item"
            :assumptions="assumptions"
            :busy="busy"
            @retain-market-rent="retainMarketRent"
          />
          <details
            ref="formBox"
            class="rounded-xl border border-line"
            :open="editing"
          >
            <summary
              class="cursor-pointer px-4 py-3 font-display text-base font-semibold"
              @click="editing = true"
            >
              Fiche et saisie : bien, travaux, phase 2, hypothèses de l’annonce
              <span
                v-if="changedFields.length"
                class="ml-2 text-xs font-normal text-muted"
                >{{ changedFields.length }} champ(s) modifié(s) mis en
                évidence</span
              >
            </summary>
            <div class="grid gap-4 px-4 pb-4">
              <div
                v-if="editing"
                class="sticky top-0 z-10 -mx-1 bg-surface px-1 py-1"
              >
                <MetricsPreview :evaluation="shownEvaluation" compact />
              </div>
              <ListingForm
                v-model="form"
                :errors="errors"
                :field-sources="item.listing.fieldSources"
                :changed="changedFields"
                hide-status
              />
              <div class="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  class="rounded-lg border border-line px-3 py-1.5 text-sm"
                  @click="cancel"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-60"
                  :disabled="busy"
                  @click="save"
                >
                  {{
                    mutations.update.isPending.value
                      ? 'Enregistrement…'
                      : 'Enregistrer'
                  }}
                </button>
              </div>
            </div>
          </details>
        </template>

        <template v-else-if="tab === 'quartier'">
          <ContextSection
            :listing-id="item.listing.id"
            :updated-at="item.listing.updatedAt"
            :location="item.listing.location"
            @precise="preciseAddress"
          />
          <section
            class="grid gap-3 rounded-xl border border-line p-4"
            aria-labelledby="risks-title"
          >
            <h3 id="risks-title" class="font-display text-base font-semibold">
              Risques à l’adresse
            </h3>
            <CompliancePanel :listing-id="item.listing.id" risks-only />
          </section>
        </template>

        <template v-else>
          <OpinionsSection
            :opinions="item.opinions"
            :members="members"
            :me-id="me?.id ?? null"
            :saving="mutations.upsertOpinion.isPending.value"
            @save="
              input =>
                run(
                  mutations.upsertOpinion.mutateAsync({
                    id: item!.listing.id,
                    input,
                  })
                )
            "
          />
          <TasksSection
            :tasks="item.tasks"
            :members="members"
            @add="
              label =>
                run(
                  mutations.addTask.mutateAsync({
                    id: item!.listing.id,
                    label,
                  })
                )
            "
            @toggle="
              (taskId, done) =>
                run(
                  mutations.updateTask.mutateAsync({
                    id: item!.listing.id,
                    taskId,
                    update: { done },
                  })
                )
            "
            @remove="
              taskId =>
                run(
                  mutations.removeTask.mutateAsync({
                    id: item!.listing.id,
                    taskId,
                  })
                )
            "
          />
          <VisitsSection
            :listing-id="item.listing.id"
            :members="members"
            :me-id="me?.id ?? null"
            @set-status="status => changeStatus({ status, reason: null })"
          />
          <JournalSection :listing-id="item.listing.id" />
        </template>
      </div>
    </div>
  </SidePanel>
</template>
