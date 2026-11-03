<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import type { ListingStatus } from '@apart/contracts'
  import SidePanel from '@/components/ui/SidePanel.vue'
  import { useListing, useListingMutations } from '@/composables/useListings'
  import { useLivePreview } from '@/composables/useLivePreview'
  import { useAssumptions, useWorkspace } from '@/composables/useWorkspace'
  import { ApiError } from '@/lib/api'
  import { formatDate, formatDistance } from '@/lib/format'
  import {
    emptyForm,
    formFromListing,
    formToPatch,
    validateForm,
  } from '@/lib/listing-form'
  import DpeBadge from './DpeBadge.vue'
  import ListingForm from './ListingForm.vue'
  import MetricsPreview from './MetricsPreview.vue'
  import NewBadge from './NewBadge.vue'
  import OpinionsSection from './OpinionsSection.vue'
  import PriceHistory from './PriceHistory.vue'
  import RentalChecksList from './RentalChecksList.vue'
  import StatusBadge from './StatusBadge.vue'
  import StatusChanger from './StatusChanger.vue'
  import TasksSection from './TasksSection.vue'

  const props = defineProps<{ id: string }>()
  const emit = defineEmits<{ close: [] }>()

  const id = computed(() => props.id)
  const { data: item, isPending, error } = useListing(id)
  const { values: assumptions } = useAssumptions()
  const { me, members } = useWorkspace()
  const mutations = useListingMutations()

  const form = ref(emptyForm())
  const errors = ref<Record<string, string>>({})
  const editing = ref(false)
  const message = ref<string | null>(null)
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

  const preview = useLivePreview(form, assumptions)
  const shownEvaluation = computed(() =>
    editing.value ? preview.value.evaluation : (item.value?.evaluation ?? null)
  )
  const busy = computed(
    () =>
      mutations.update.isPending.value || mutations.setStatus.isPending.value
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
      await mutations.update.mutateAsync({
        id: item.value.listing.id,
        patch: {
          ...formToPatch(form.value),
          expectedUpdatedAt: item.value.listing.updatedAt,
        },
      })
      editing.value = false
      message.value = 'Annonce enregistrée.'
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
      <RentalChecksList
        v-if="shownEvaluation"
        :rental="shownEvaluation.rental"
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
          <ListingForm v-model="form" :errors="errors" hide-status />
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

      <PriceHistory
        :events="item.priceEvents"
        :current-price="item.listing.price"
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
      />
    </div>
  </SidePanel>
</template>
