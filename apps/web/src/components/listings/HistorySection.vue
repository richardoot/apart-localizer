<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { OfferChannelSchema, OfferResponseSchema } from '@apart/contracts'
  import type {
    ListingStatus,
    Offer,
    OfferChannel,
    OfferInputRaw,
    OfferResponse,
    OfferUpdate,
    PriceEvent,
  } from '@apart/contracts'
  import { formatDate, formatEuros, parseNumberInput } from '@/lib/format'
  import {
    LISTING_STATUS_LABELS,
    OFFER_CHANNEL_LABELS,
    OFFER_RESPONSE_CLASSES,
    OFFER_RESPONSE_LABELS,
  } from '@/lib/labels'

  const props = defineProps<{
    events: PriceEvent[]
    offers: Offer[]
    currentPrice: number
    /** Statut proposé par la dernière offre enregistrée ; null si rien à proposer. */
    suggestedStatus?: ListingStatus | null
    busy?: boolean
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

  // Nouvelle offre
  const offerAmount = ref('')
  const offerDate = ref('')
  const offerChannel = ref<OfferChannel | ''>('')
  const offerNotes = ref('')
  const offerError = ref<string | null>(null)
  function submitOffer(): void {
    const amount = parseNumberInput(offerAmount.value)
    if (amount === null || amount <= 0) {
      offerError.value = "Saisissez le montant de l'offre en euros."
      return
    }
    offerError.value = null
    const input: OfferInputRaw = {
      amount,
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
      const amount = parseNumberInput(counters.value[offer.id])
      if (amount === null || amount <= 0) {
        responseError.value =
          'Saisissez le montant de la contre-proposition avant de la choisir.'
        ;(event.target as HTMLSelectElement).value = offer.response
        return
      }
      responseError.value = null
      emit('updateOffer', offer.id, {
        response,
        counterAmount: amount,
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
    'rounded-lg border border-line bg-bg px-3 py-1.5 text-sm w-full'
</script>

<template>
  <section class="grid gap-3" aria-labelledby="history-title">
    <h3 id="history-title" class="font-display text-base font-semibold">
      Historique des prix et des offres
    </h3>

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
        class="rounded-lg bg-accent px-3 py-1 text-sm font-medium text-accent-fg disabled:opacity-60"
        :disabled="busy"
        @click="emit('setStatus', suggestedStatus)"
      >
        Passer à « {{ LISTING_STATUS_LABELS[suggestedStatus] }} »
      </button>
    </p>

    <ol class="grid gap-1 text-sm" aria-label="Frise des prix et des offres">
      <li
        v-for="entry in timeline"
        :key="entry.key"
        class="grid gap-1 rounded-lg border border-line px-3 py-2"
        :data-kind="entry.kind"
      >
        <template v-if="entry.kind === 'price'">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span>
              <span class="text-xs text-muted uppercase">Prix</span>
              <span class="ml-2 font-mono">{{
                formatEuros(entry.event.newPrice)
              }}</span>
            </span>
            <span class="text-xs text-muted">
              {{ formatDate(entry.event.occurredAt) }} ·
              {{ delta(entry.event) }}
            </span>
          </div>
        </template>
        <template v-else>
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="flex flex-wrap items-center gap-2">
              <span class="text-xs text-muted uppercase">Offre</span>
              <span class="font-mono">{{
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
            </span>
            <span class="text-xs text-muted">
              {{ formatDate(entry.offer.madeAt) }}
              <template v-if="entry.offer.channel">
                · {{ OFFER_CHANNEL_LABELS[entry.offer.channel] }}</template
              >
              <template v-if="entry.offer.respondedAt">
                · réponse le {{ formatDate(entry.offer.respondedAt) }}</template
              >
            </span>
          </div>
          <p v-if="entry.offer.notes" class="text-xs text-muted">
            {{ entry.offer.notes }}
          </p>
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <label class="flex items-center gap-1 text-muted">
              Réponse du vendeur
              <select
                class="rounded-lg border border-line bg-bg px-2 py-1 text-xs"
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
              class="w-40 rounded-lg border border-line bg-bg px-2 py-1 text-xs"
              inputmode="numeric"
              placeholder="Contre-proposition (€)"
              :aria-label="`Contre-proposition à l'offre de ${formatEuros(entry.offer.amount)}`"
            />
          </div>
        </template>
      </li>
    </ol>
    <p v-if="responseError" class="text-xs text-bad" role="alert">
      {{ responseError }}
    </p>

    <div class="grid gap-3 sm:grid-cols-2">
      <form
        class="grid gap-2 rounded-lg bg-surface-2 p-3"
        aria-label="Nouveau prix constaté"
        @submit.prevent="submitPrice"
      >
        <span class="text-xs font-medium text-muted"
          >Nouveau prix constaté</span
        >
        <input
          v-model="newPrice"
          :class="inputClass"
          inputmode="numeric"
          placeholder="Nouveau prix constaté (€)"
          aria-label="Nouveau prix constaté"
        />
        <button
          type="submit"
          class="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface"
          :disabled="busy"
        >
          Enregistrer la baisse ou la hausse
        </button>
        <p v-if="priceError" class="text-xs text-bad" role="alert">
          {{ priceError }}
        </p>
      </form>

      <form
        class="grid gap-2 rounded-lg bg-surface-2 p-3"
        aria-label="Nouvelle offre"
        @submit.prevent="submitOffer"
      >
        <span class="text-xs font-medium text-muted">Nouvelle offre</span>
        <input
          v-model="offerAmount"
          :class="inputClass"
          inputmode="numeric"
          placeholder="Montant de l'offre (€)"
          aria-label="Montant de l'offre"
        />
        <div class="grid grid-cols-2 gap-2">
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
          class="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-60"
          :disabled="busy"
        >
          Enregistrer l'offre
        </button>
        <p v-if="offerError" class="text-xs text-bad" role="alert">
          {{ offerError }}
        </p>
      </form>
    </div>
  </section>
</template>
