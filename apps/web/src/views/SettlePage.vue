<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type {
    DecisionCard,
    DecisionChoice,
    DecisionResult,
  } from '@apart/contracts'
  import { VERDICT_LABELS } from '@apart/contracts'
  import { choiceLabel, decisionSides } from '@apart/domain'
  import {
    useDecisionActions,
    useDecisionCards,
  } from '@/composables/useWorkflow'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { errorMessage } from '@/lib/errors'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import { formatEuros, formatSurface } from '@/lib/format'
  import { LISTING_STATUS_LABELS } from '@/lib/labels'
  import { draftFitText } from '@/lib/workflow'

  /**
   * Lot 21 (ADR 0031) : « À trancher ensemble » (`/annonces/a-trancher`). Les
   * deux choix côte à côte ; un clic d'un membre sur l'un d'eux suffit, une
   * fois la question discutée à deux. « On en reparle » laisse la proposition
   * ouverte, sans rien écrire. Lot 22 : un échec de lecture se dit, avec
   * « Réessayer », jamais « Rien à trancher ».
   */
  const cardsQuery = useDecisionCards('settle')
  const cards = cardsQuery.data
  const { me } = useWorkspace()
  const actions = useDecisionActions({ inSession: true })

  interface Outcome {
    text: string
    result: DecisionResult | null
  }
  const outcomes = ref<Record<string, Outcome>>({})
  const failures = ref<Record<string, string>>({})
  const busy = ref<string | null>(null)
  const live = ref('')

  const left = computed(
    () => (cards.value ?? []).filter(c => !outcomes.value[c.proposal.id]).length
  )
  const countText = computed(() => {
    if (left.value === 0) return 'Plus rien à trancher.'
    return left.value > 1
      ? `${left.value} annonces où les choix diffèrent.`
      : '1 annonce où les choix diffèrent.'
  })

  function facts(card: DecisionCard): string[] {
    const stage = card.proposal.fromStatus
      ? LISTING_STATUS_LABELS[card.proposal.fromStatus]
      : 'À valider'
    if (card.listing) {
      const l = card.listing.listing
      return [
        stage,
        formatEuros(l.price),
        formatSurface(l.surface),
        `Verdict : ${VERDICT_LABELS[card.listing.evaluation.metrics.verdict]}`,
      ]
    }
    if (card.draft) {
      return [
        stage,
        card.draft.listing.price ? formatEuros(card.draft.listing.price) : '—',
        formatSurface(card.draft.listing.surface),
        draftFitText(card.draft),
      ]
    }
    return [stage]
  }

  function reasonText(reason: string | null, isDiscard: boolean): string {
    if (!reason) return 'Aucune raison donnée.'
    return isDiscard ? `Raison : ${reason}.` : `« ${reason} »`
  }

  async function settle(
    card: DecisionCard,
    choice: DecisionChoice
  ): Promise<void> {
    const id = card.proposal.id
    busy.value = id
    const { [id]: _drop, ...rest } = failures.value
    failures.value = rest
    try {
      const result = await actions.resolve.mutateAsync({
        id,
        input: { choice },
      })
      const label = choiceLabel(card.proposal.target, choice)
      const text =
        result.outcome === 'stale'
          ? result.message
          : `Tranché : ${label}. Noté au journal.`
      outcomes.value = { ...outcomes.value, [id]: { text, result } }
      live.value = text
    } catch (err) {
      failures.value = {
        ...failures.value,
        [id]: errorMessage(err),
      }
    } finally {
      busy.value = null
    }
  }

  function later(card: DecisionCard): void {
    const text = 'Elle reste ici, pour en reparler plus tard.'
    outcomes.value = {
      ...outcomes.value,
      [card.proposal.id]: { text, result: null },
    }
    live.value = text
  }

  async function reopen(card: DecisionCard): Promise<void> {
    const id = card.proposal.id
    const outcome = outcomes.value[id]
    if (outcome?.result?.outcome === 'applied') {
      busy.value = id
      try {
        await actions.undo.mutateAsync(id)
      } catch (err) {
        failures.value = {
          ...failures.value,
          [id]: errorMessage(err),
        }
        return
      } finally {
        busy.value = null
      }
    }
    const { [id]: _drop, ...rest } = outcomes.value
    outcomes.value = rest
  }

  function canReopen(card: DecisionCard): boolean {
    const outcome = outcomes.value[card.proposal.id]
    if (!outcome) return false
    return (
      outcome.result === null ||
      (outcome.result.outcome === 'applied' && !outcome.result.createdListing)
    )
  }

  const whoLabel = (memberId: string | null, who: string): string =>
    memberId === me.value?.id ? 'Toi' : who

  function back(): void {
    actions.refreshAll()
  }
</script>

<template>
  <div class="min-h-screen bg-bg text-fg">
    <div
      class="mx-auto flex w-full max-w-[1040px] min-w-0 flex-col gap-3.5 px-4 pt-6 pb-12 sm:px-5"
    >
      <UiButton
        :to="{ name: 'listings' }"
        variant="ghost"
        icon="arrow-left"
        class="-ml-2 w-fit text-accent"
        data-testid="settle-back"
        @click="back"
        >Retour aux annonces</UiButton
      >
      <div class="flex flex-col gap-1">
        <h1 class="font-display text-3xl font-bold">À trancher ensemble</h1>
        <p class="text-muted" data-testid="settle-count">
          {{ countText }} Un seul clic de l’un ou de l’autre suffit, une fois la
          question discutée à deux. La décision entre au journal.
        </p>
      </div>
      <p class="sr-only" aria-live="polite">{{ live }}</p>

      <QueryState
        :query="cardsQuery"
        :empty="!cards?.length"
        skeleton="cards"
        :skeleton-count="2"
        loading-label="ce qu’il reste à trancher"
        error-fallback="Impossible de lire ce qu’il reste à trancher."
      >
        <template #empty>
          <UiCard>
            <p class="font-semibold" data-testid="settle-empty">
              Rien à trancher pour l’instant.
            </p>
            <p class="mt-1 text-sm text-muted">
              Quand les choix diffèrent sur une annonce, elle arrive ici.
            </p>
          </UiCard>
        </template>
        <UiCard
          v-for="card in cards ?? []"
          :key="card.proposal.id"
          as="article"
          class="flex flex-col gap-3.5"
          :data-settle="card.proposal.id"
        >
          <div
            class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5"
          >
            <h2 class="font-display text-xl font-bold">
              {{ card.proposal.title }}
            </h2>
            <UiButton
              v-if="card.proposal.listingId"
              variant="link"
              :to="{
                name: 'listing',
                params: { id: card.proposal.listingId },
              }"
              >Ouvrir la fiche</UiButton
            >
          </div>
          <div class="flex flex-wrap gap-x-4.5 gap-y-1 text-muted tabular-nums">
            <span v-for="fact in facts(card)" :key="fact">{{ fact }}</span>
          </div>
          <div
            class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2.5"
          >
            <div
              v-for="side in decisionSides(card.proposal)"
              :key="side.who"
              class="flex flex-col gap-1 rounded-xl bg-bg px-3.5 py-3"
              data-testid="settle-side"
            >
              <span class="text-sm text-muted">{{
                whoLabel(side.memberId, side.who)
              }}</span>
              <strong
                class="text-lg"
                :class="side.choice === 'discard' ? 'text-bad' : 'text-accent'"
                >{{ side.choiceLabel }}</strong
              >
              <span class="leading-snug">{{
                reasonText(side.reason, side.choice === 'discard')
              }}</span>
            </div>
          </div>
          <UiAlert v-if="failures[card.proposal.id]">{{
            failures[card.proposal.id]
          }}</UiAlert>
          <div v-if="!outcomes[card.proposal.id]" class="flex flex-wrap gap-2">
            <UiButton
              v-for="choice in card.proposal.settleOptions"
              :key="choice"
              variant="outline"
              class="min-h-12!"
              :disabled="busy === card.proposal.id"
              :data-settle-choice="choice"
              @click="settle(card, choice)"
            >
              {{ choiceLabel(card.proposal.target, choice) }}
            </UiButton>
            <UiButton
              class="min-h-12!"
              data-action="later"
              @click="later(card)"
            >
              On en reparle
            </UiButton>
          </div>
          <div
            v-else
            class="flex flex-wrap items-center justify-between gap-x-3.5 gap-y-1.5 rounded-xl bg-accent-soft px-3.5 py-3 text-accent"
            data-testid="settle-result"
          >
            <span>{{ outcomes[card.proposal.id]?.text }}</span>
            <UiButton
              v-if="canReopen(card)"
              variant="link"
              icon="undo"
              data-action="reopen"
              @click="reopen(card)"
            >
              Annuler
            </UiButton>
          </div>
        </UiCard>
      </QueryState>
    </div>
  </div>
</template>
