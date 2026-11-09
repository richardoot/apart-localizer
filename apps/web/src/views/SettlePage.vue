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
  import { ApiError } from '@/lib/api'
  import { formatEuros, formatSurface } from '@/lib/format'
  import { LISTING_STATUS_LABELS } from '@/lib/labels'
  import { draftFitText } from '@/lib/workflow'

  /**
   * Lot 21 (ADR 0031) : « À trancher ensemble » (`/annonces/a-trancher`). Les
   * deux choix côte à côte ; un clic d'un membre sur l'un d'eux suffit, une
   * fois que vous en avez parlé. « On en reparle » laisse la proposition
   * ouverte, sans rien écrire.
   */
  const { data: cards, isPending } = useDecisionCards('settle')
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
      ? `${left.value} annonces où vos choix diffèrent.`
      : '1 annonce où vos choix diffèrent.'
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
        [id]: err instanceof ApiError ? err.message : 'L’action a échoué.',
      }
    } finally {
      busy.value = null
    }
  }

  function later(card: DecisionCard): void {
    const text = 'Elle reste ici, vous en reparlerez.'
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
          [id]: err instanceof ApiError ? err.message : 'L’action a échoué.',
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
      <RouterLink
        :to="{ name: 'listings' }"
        class="inline-flex min-h-11 w-fit items-center text-accent"
        data-testid="settle-back"
        @click="back"
        >Retour aux annonces</RouterLink
      >
      <div class="flex flex-col gap-1">
        <h1 class="font-display text-[26px] font-bold">À trancher ensemble</h1>
        <p class="text-muted" data-testid="settle-count">
          {{ countText }} Un seul clic de l’un de vous deux suffit, une fois que
          vous en avez parlé. La décision entre au journal.
        </p>
      </div>
      <p class="sr-only" aria-live="polite">{{ live }}</p>

      <p v-if="isPending" class="text-sm text-muted">Chargement…</p>
      <p
        v-else-if="!cards?.length"
        class="rounded-[14px] border border-line bg-surface p-5"
        data-testid="settle-empty"
      >
        Rien à trancher pour l’instant.
      </p>

      <article
        v-for="card in cards ?? []"
        :key="card.proposal.id"
        class="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface px-5 py-4.5"
        :data-settle="card.proposal.id"
      >
        <div
          class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5"
        >
          <h2 class="font-display text-xl font-bold">
            {{ card.proposal.title }}
          </h2>
          <RouterLink
            v-if="card.proposal.listingId"
            :to="{
              name: 'listing',
              params: { id: card.proposal.listingId },
            }"
            class="text-accent underline-offset-2 hover:underline"
            >Ouvrir la fiche</RouterLink
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
            <span class="text-[13px] text-muted">{{
              whoLabel(side.memberId, side.who)
            }}</span>
            <strong
              class="text-[17px]"
              :class="side.choice === 'discard' ? 'text-bad' : 'text-accent'"
              >{{ side.choiceLabel }}</strong
            >
            <span class="leading-snug">{{
              reasonText(side.reason, side.choice === 'discard')
            }}</span>
          </div>
        </div>
        <p
          v-if="failures[card.proposal.id]"
          role="alert"
          class="text-sm text-bad"
        >
          {{ failures[card.proposal.id] }}
        </p>
        <div v-if="!outcomes[card.proposal.id]" class="flex flex-wrap gap-2">
          <button
            v-for="choice in card.proposal.settleOptions"
            :key="choice"
            type="button"
            class="min-h-12 rounded-xl border-[1.5px] border-accent bg-surface px-4.5 font-semibold text-accent disabled:opacity-60"
            :disabled="busy === card.proposal.id"
            :data-settle-choice="choice"
            @click="settle(card, choice)"
          >
            {{ choiceLabel(card.proposal.target, choice) }}
          </button>
          <button
            type="button"
            class="min-h-12 rounded-xl border border-line bg-surface px-3.5"
            data-action="later"
            @click="later(card)"
          >
            On en reparle
          </button>
        </div>
        <div
          v-else
          class="flex flex-wrap items-center justify-between gap-x-3.5 gap-y-1.5 rounded-xl bg-accent-soft px-3.5 py-3 text-accent"
          data-testid="settle-result"
        >
          <span>{{ outcomes[card.proposal.id]?.text }}</span>
          <button
            v-if="canReopen(card)"
            type="button"
            class="min-h-11 bg-transparent px-3 underline"
            data-action="reopen"
            @click="reopen(card)"
          >
            Annuler
          </button>
        </div>
      </article>
    </div>
  </div>
</template>
