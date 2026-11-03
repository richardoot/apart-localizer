<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import type {
    ListingStatus,
    OfferInputRaw,
    OfferUpdate,
    SensitivityAxis,
  } from '@apart/contracts'
  import SidePanel from '@/components/ui/SidePanel.vue'
  import {
    useListing,
    useListingMutations,
    useSensitivity,
    useTargetPrice,
  } from '@/composables/useListings'
  import { useLivePreview } from '@/composables/useLivePreview'
  import { useAssumptions, useWorkspace } from '@/composables/useWorkspace'
  import { ApiError } from '@/lib/api'
  import { criteriaChangesMessage } from '@/lib/criteria'
  import { formatDate, formatDistance, parseNumberInput } from '@/lib/format'
  import {
    emptyForm,
    formFromListing,
    formToPatch,
    validateForm,
  } from '@/lib/listing-form'
  import ContextSection from './ContextSection.vue'
  import CriteriaBadges from './CriteriaBadges.vue'
  import DpeBadge from './DpeBadge.vue'
  import HistorySection from './HistorySection.vue'
  import ListingForm from './ListingForm.vue'
  import MetricsPreview from './MetricsPreview.vue'
  import NewBadge from './NewBadge.vue'
  import OpinionsSection from './OpinionsSection.vue'
  import RentalChecksList from './RentalChecksList.vue'
  import SensitivityTable from './SensitivityTable.vue'
  import StatusBadge from './StatusBadge.vue'
  import StatusChanger from './StatusChanger.vue'
  import TargetPriceSection from './TargetPriceSection.vue'
  import TasksSection from './TasksSection.vue'

  const props = defineProps<{
    id: string
    /** Message à afficher à l'ouverture (critères dans lesquels l'annonce créée entre). */
    notice?: string | null
  }>()
  const emit = defineEmits<{ close: [] }>()

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

  // La fiche ouverte : le formulaire se cale sur l'annonce, et l'annonce
  // devient « vue » pour le membre (une fois par ouverture).
  watch(
    item,
    value => {
      if (!value) return
      if (!editing.value) form.value = formFromListing(value.listing)
      if (value.isNewForMe && seenFor.value !== value.listing.id) {
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

  // Tableau de sensibilité : axes au choix, recalculé côté serveur.
  const rowAxis = ref<SensitivityAxis>('price')
  const colAxis = ref<SensitivityAxis>('rent')
  const sensitivityRequest = computed(() => ({
    rowAxis: rowAxis.value,
    colAxis: colAxis.value,
  }))
  const sensitivity = useSensitivity(id, sensitivityRequest)

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
  <SidePanel :title="item?.listing.title ?? 'Annonce'" @close="emit('close')">
    <p v-if="isPending" class="text-sm text-muted">Chargement de l'annonce…</p>
    <p
      v-else-if="error"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ error.message }}
    </p>
    <div v-else-if="item" class="grid gap-6">
      <header class="grid gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge :status="item.listing.status" />
          <NewBadge :is-new="item.isNewForMe" />
          <DpeBadge :dpe="item.listing.dpeClass" />
          <CriteriaBadges :matches="item.criteriaMatches" />
          <span class="text-xs text-muted">
            {{
              [item.listing.location.commune, item.listing.location.district]
                .filter(Boolean)
                .join(' · ')
            }}
            <template v-if="item.distanceMeters !== null">
              · à {{ formatDistance(item.distanceMeters) }}</template
            >
          </span>
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
        <StatusChanger
          :status="item.listing.status"
          :busy="busy"
          @change="changeStatus"
        />
        <p
          v-if="
            item.listing.status === 'discarded' && item.listing.discardReason
          "
          class="text-xs text-muted"
        >
          Écartée : {{ item.listing.discardReason }}
        </p>
      </header>

      <MetricsPreview :evaluation="shownEvaluation" />
      <TargetPriceSection
        :price="shownEvaluation?.metrics.price ?? item.listing.price"
        :target-price="shownTargetPrice"
        :negotiation="shownNegotiation"
        :rank="editing ? null : (targetReport?.rank ?? null)"
        :notary-fees="shownNotaryFees"
        :live="editing"
      />
      <SensitivityTable
        v-model:row-axis="rowAxis"
        v-model:col-axis="colAxis"
        :grid="sensitivity.data.value ?? null"
        :loading="sensitivity.isFetching.value"
      />
      <RentalChecksList
        v-if="shownEvaluation"
        :rental="shownEvaluation.rental"
      />
      <ContextSection
        :listing-id="item.listing.id"
        :updated-at="item.listing.updatedAt"
      />

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

      <details class="rounded-xl border border-line" :open="editing">
        <summary
          class="cursor-pointer px-4 py-3 font-display text-base font-semibold"
          @click="editing = true"
        >
          Fiche et saisie
        </summary>
        <div class="grid gap-4 px-4 pb-4">
          <ListingForm
            v-model="form"
            :errors="errors"
            :field-sources="item.listing.fieldSources"
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
            run(mutations.addTask.mutateAsync({ id: item!.listing.id, label }))
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
              mutations.removeTask.mutateAsync({ id: item!.listing.id, taskId })
            )
        "
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
    </div>
  </SidePanel>
</template>
