<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { OfferChannelSchema, OfferResponseSchema } from '@apart/contracts'
  import type {
    Assumptions,
    ListingFinancials,
    ListingStatus,
    Offer,
    OfferChannel,
    OfferInputRaw,
    OfferResponse,
    OfferUpdate,
    PriceEvent,
  } from '@apart/contracts'
  import { outcomeAtPrice } from '@apart/domain'
  import {
    formatDate,
    formatEuros,
    formatEurosPerMonth,
    parseNumberInput,
  } from '@/lib/format'
  import {
    LISTING_STATUS_LABELS,
    OFFER_CHANNEL_LABELS,
    OFFER_RESPONSE_CLASSES,
    OFFER_RESPONSE_LABELS,
    VERDICT_FAILURE_LABELS,
    VERDICT_LABELS,
    VERDICT_NEAR_MISS_LABELS,
  } from '@/lib/labels'

  /**
   * Lot 19 (ADR 0029) : « Prix et offres » de l'onglet Négocier. La frise des
   * prix et des offres (du plus récent au plus ancien, la date à gauche),
   * la réponse du vendeur, le statut suggéré par une offre (jamais appliqué
   * d'office), « Nouveau prix constaté » et « Préparer une offre » : choisir
   * un montant (offre suggérée, prix cible, ou libre) montre le coût tout
   * compris, la mensualité et le verdict à ce prix (`outcomeAtPrice` de
   * `domain`), avant d'enregistrer l'offre.
   */
  const props = defineProps<{
    events: PriceEvent[]
    offers: Offer[]
    currentPrice: number
    /** Statut proposé par la dernière offre enregistrée ; null si rien à proposer. */
    suggestedStatus?: ListingStatus | null
    busy?: boolean
    /** L'entrée financière de l'annonce, pour évaluer un montant d'offre. */
    financials?: ListingFinancials | null
    /** Les hypothèses de l'espace. */
    assumptions?: Assumptions | null
    /** L'offre suggérée du brief de négociation. */
    suggestedOffer?: number | null
    /** Le prix cible. */
    targetPrice?: number | null
  }>()
  const emit = defineEmits<{
    record: [newPrice: number]
    addOffer: [input: OfferInputRaw]
    updateOffer: [offerId: string, update: OfferUpdate]
    setStatus: [status: ListingStatus]
  }>()

  type Entry =
    | { key: string; date: string; kind: 'price'; event: PriceEvent }
    | { key: string; date: string; kind: 'offer'; offer: Offer }

  /** La frise : prix et offres mêlés, du plus récent au plus ancien. */
  const timeline = computed<Entry[]>(() =>
    [
      ...props.events.map((event): Entry => ({
        key: `price-${event.id}`,
        date: event.occurredAt,
        kind: 'price',
        event,
      })),
      ...props.offers.map((offer): Entry => ({
        key: `offer-${offer.id}`,
        date: offer.madeAt,
        kind: 'offer',
        offer,
      })),
    ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  )

  function delta(event: PriceEvent): string {
    if (event.oldPrice === null) return 'premier prix'
    const diff = event.newPrice - event.oldPrice
    const pct = event.oldPrice > 0 ? (diff / event.oldPrice) * 100 : 0
    const sign = diff > 0 ? '+' : ''
    return `${sign}${formatEuros(diff)} (${sign}${pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %)`
  }

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })

  // Nouveau prix constaté
  const newPrice = ref('')
  const priceError = ref<string | null>(null)
  function submitPrice(): void {
    const value = parseNumberInput(newPrice.value)
    if (value === null || value < 0) {
      priceError.value = 'Saisissez le nouveau prix en euros.'
      return
    }
    if (value === props.currentPrice) {
      priceError.value = 'Le prix est déjà celui-là.'
      return
    }
    priceError.value = null
    emit('record', value)
    newPrice.value = ''
  }

  // Préparer une offre : un montant proposé ou libre, évalué par `domain`.
  const offerAmount = ref('')
  const offerDate = ref('')
  const offerChannel = ref<OfferChannel | ''>('')
  const offerNotes = ref('')
  const offerError = ref<string | null>(null)

  const proposals = computed(() =>
    [
      {
        key: 'suggested',
        label: 'Offre suggérée',
        amount: props.suggestedOffer,
      },
      { key: 'target', label: 'Prix cible', amount: props.targetPrice },
    ].filter(
      (p): p is { key: string; label: string; amount: number } =>
        typeof p.amount === 'number' && p.amount > 0
    )
  )
  const amount = computed(() => parseNumberInput(offerAmount.value))
  function pick(value: number): void {
    offerAmount.value = String(Math.round(value))
  }
  const outcome = computed(() => {
    const value = amount.value
    if (value === null || !(value > 0)) return null
    if (!props.financials || !props.assumptions) return null
    return outcomeAtPrice(props.financials, props.assumptions, value)
  })
  const outcomeWhy = computed(() => {
    const o = outcome.value
    if (!o || o.verdict === 'target') return null
    return o.verdict === 'to_dig'
      ? `de peu : ${o.nearMisses.map(n => VERDICT_NEAR_MISS_LABELS[n]).join(', ')}`
      : `en échec : ${o.failures.map(f => VERDICT_FAILURE_LABELS[f]).join(', ')}`
  })

  function submitOffer(): void {
    const value = amount.value
    if (value === null || value <= 0) {
      offerError.value = "Saisissez le montant de l'offre en euros."
      return
    }
    offerError.value = null
    const input: OfferInputRaw = {
      amount: value,
      channel: offerChannel.value === '' ? null : offerChannel.value,
      notes: offerNotes.value.trim() || null,
    }
    if (offerDate.value) {
      input.madeAt = new Date(`${offerDate.value}T12:00:00`).toISOString()
    }
    emit('addOffer', input)
    offerAmount.value = ''
    offerDate.value = ''
    offerChannel.value = ''
    offerNotes.value = ''
  }

  // Réponse du vendeur
  const counters = ref<Record<string, string>>({})
  const responseError = ref<string | null>(null)
  function respond(offer: Offer, event: Event): void {
    const response = (event.target as HTMLSelectElement).value as OfferResponse
    if (response === offer.response) return
    if (response === 'counter_offer') {
      const value = parseNumberInput(counters.value[offer.id])
      if (value === null || value <= 0) {
        responseError.value =
          'Saisissez le montant de la contre-proposition avant de la choisir.'
        ;(event.target as HTMLSelectElement).value = offer.response
        return
      }
      responseError.value = null
      emit('updateOffer', offer.id, {
        response,
        counterAmount: value,
        expectedResponse: offer.response,
      })
      return
    }
    responseError.value = null
    emit('updateOffer', offer.id, {
      response,
      expectedResponse: offer.response,
    })
  }

  const inputClass =
    'min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm sm:min-h-10'
  const smallInput =
    'min-h-11 rounded-lg border border-line bg-bg px-2 text-xs sm:min-h-9'
</script>

<template>
  <section
    class="grid gap-3 rounded-2xl border border-line bg-surface p-4 text-sm sm:px-5"
    aria-labelledby="history-title"
    data-testid="prices-offers"
  >
    <h2 id="history-title" class="text-base font-semibold">Prix et offres</h2>

    <p
      v-if="suggestedStatus"
      class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm"
      data-testid="suggested-status"
    >
      <span>
        Cette offre suggère le statut «
        {{ LISTING_STATUS_LABELS[suggestedStatus] }} ».
      </span>
      <button
        type="button"
        class="inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg disabled:opacity-60 sm:min-h-9"
        :disabled="busy"
        @click="emit('setStatus', suggestedStatus)"
      >
        Passer à « {{ LISTING_STATUS_LABELS[suggestedStatus] }} »
      </button>
    </p>

    <ol class="grid tabular-nums" aria-label="Frise des prix et des offres">
      <li
        v-for="entry in timeline"
        :key="entry.key"
        class="grid gap-x-4 gap-y-1 border-t border-line py-2 first:border-t-0 sm:grid-cols-[6.5rem_minmax(0,1fr)]"
        :data-kind="entry.kind"
      >
        <span class="text-muted">{{ day(entry.date) }}</span>
        <div v-if="entry.kind === 'price'" class="min-w-0">
          <span class="text-xs text-muted uppercase">Prix</span>
          <span class="ml-2 font-semibold">{{
            formatEuros(entry.event.newPrice)
          }}</span>
          <span class="ml-2 text-xs text-muted">{{ delta(entry.event) }}</span>
        </div>
        <div v-else class="grid min-w-0 gap-1">
          <span class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-muted uppercase">Offre</span>
            <span class="font-semibold">{{
              formatEuros(entry.offer.amount)
            }}</span>
            <span
              class="rounded-full px-2 py-0.5 text-xs font-semibold"
              :class="OFFER_RESPONSE_CLASSES[entry.offer.response]"
              :data-response="entry.offer.response"
            >
              {{ OFFER_RESPONSE_LABELS[entry.offer.response] }}
              <template v-if="entry.offer.counterAmount !== null">
                à {{ formatEuros(entry.offer.counterAmount) }}</template
              >
            </span>
            <span class="text-xs text-muted">
              <template v-if="entry.offer.channel">
                {{ OFFER_CHANNEL_LABELS[entry.offer.channel] }}</template
              >
              <template v-if="entry.offer.respondedAt">
                · réponse le {{ formatDate(entry.offer.respondedAt) }}</template
              >
            </span>
          </span>
          <p v-if="entry.offer.notes" class="text-xs text-muted">
            {{ entry.offer.notes }}
          </p>
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <label class="flex items-center gap-1 text-muted">
              Réponse du vendeur
              <select
                :class="smallInput"
                :value="entry.offer.response"
                :disabled="busy"
                :aria-label="`Réponse à l'offre de ${formatEuros(entry.offer.amount)}`"
                @change="respond(entry.offer, $event)"
              >
                <option
                  v-for="r in OfferResponseSchema.options"
                  :key="r"
                  :value="r"
                >
                  {{ OFFER_RESPONSE_LABELS[r] }}
                </option>
              </select>
            </label>
            <input
              v-model="counters[entry.offer.id]"
              :class="smallInput"
              class="w-44"
              inputmode="numeric"
              placeholder="Contre-proposition (€)"
              :aria-label="`Contre-proposition à l'offre de ${formatEuros(entry.offer.amount)}`"
            />
          </div>
        </div>
      </li>
    </ol>
    <p v-if="timeline.length === 0" class="text-muted">
      Aucun prix ni aucune offre enregistrés.
    </p>
    <p v-if="responseError" class="text-xs text-bad" role="alert">
      {{ responseError }}
    </p>

    <div class="grid gap-3 @2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <form
        class="grid content-start gap-2.5 rounded-xl bg-surface-2 p-3 sm:px-3.5"
        aria-label="Préparer une offre"
        data-testid="offer-prep"
        @submit.prevent="submitOffer"
      >
        <p class="text-sm text-muted">
          Préparer une offre :
          <template v-if="offers.length === 0"
            >aucune offre faite pour l’instant</template
          >
          <template v-else
            >{{ offers.length }} offre{{ offers.length > 1 ? 's' : '' }} faite{{
              offers.length > 1 ? 's' : ''
            }}</template
          >
        </p>
        <div
          v-if="proposals.length"
          role="group"
          aria-label="Montants proposés"
          class="flex flex-wrap gap-1.5"
        >
          <button
            v-for="p in proposals"
            :key="p.key"
            type="button"
            class="inline-flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-sm tabular-nums"
            :class="
              amount === Math.round(p.amount)
                ? 'border-accent bg-accent text-accent-fg'
                : 'border-line bg-surface text-fg hover:bg-surface-2'
            "
            :aria-pressed="amount === Math.round(p.amount)"
            :data-proposal="p.key"
            @click="pick(p.amount)"
          >
            {{ p.label }} · {{ formatEuros(p.amount) }}
          </button>
        </div>
        <label class="grid gap-1 text-xs font-medium text-muted">
          Montant de l’offre (€)
          <input
            v-model="offerAmount"
            :class="inputClass"
            class="text-fg"
            inputmode="numeric"
            placeholder="Montant de l'offre (€)"
            aria-label="Montant de l'offre"
          />
        </label>
        <p
          v-if="outcome"
          class="text-sm text-fg"
          aria-live="polite"
          data-testid="offer-outcome"
        >
          À {{ formatEuros(outcome.price) }} : coût tout compris
          {{ formatEuros(outcome.totalCost) }}, mensualité
          {{ formatEurosPerMonth(outcome.monthlyPayment) }}. Verdict
          <strong>{{ VERDICT_LABELS[outcome.verdict] }}</strong
          ><template v-if="outcomeWhy"> ({{ outcomeWhy }})</template>.
        </p>
        <div class="grid gap-2 sm:grid-cols-2">
          <input
            v-model="offerDate"
            :class="inputClass"
            type="date"
            aria-label="Date de l'offre"
          />
          <select
            v-model="offerChannel"
            :class="inputClass"
            aria-label="Canal de l'offre"
          >
            <option value="">Canal…</option>
            <option v-for="c in OfferChannelSchema.options" :key="c" :value="c">
              {{ OFFER_CHANNEL_LABELS[c] }}
            </option>
          </select>
        </div>
        <input
          v-model="offerNotes"
          :class="inputClass"
          placeholder="Commentaire (facultatif)"
          aria-label="Commentaire de l'offre"
        />
        <button
          type="submit"
          class="inline-flex min-h-11 items-center justify-center justify-self-start rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-60"
          :disabled="busy"
        >
          Enregistrer l'offre
        </button>
        <p v-if="offerError" class="text-xs text-bad" role="alert">
          {{ offerError }}
        </p>
      </form>

      <form
        class="grid content-start gap-2 rounded-xl bg-surface-2 p-3 sm:px-3.5"
        aria-label="Nouveau prix constaté"
        @submit.prevent="submitPrice"
      >
        <span class="text-sm text-muted">Nouveau prix constaté</span>
        <input
          v-model="newPrice"
          :class="inputClass"
          inputmode="numeric"
          placeholder="Nouveau prix constaté (€)"
          aria-label="Nouveau prix constaté"
        />
        <button
          type="submit"
          class="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2"
          :disabled="busy"
        >
          Enregistrer la baisse ou la hausse
        </button>
        <p v-if="priceError" class="text-xs text-bad" role="alert">
          {{ priceError }}
        </p>
      </form>
    </div>
  </section>
</template>
