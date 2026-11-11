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
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import UiChip from '@/components/ui/UiChip.vue'
  import UiField from '@/components/ui/UiField.vue'
  import UiInput from '@/components/ui/UiInput.vue'
  import UiSelect from '@/components/ui/UiSelect.vue'
  import {
    formatDate,
    formatEuros,
    formatEurosPerMonth,
    numberInputError,
    parseNumberInput,
    plural,
  } from '@/lib/format'
  import { badgeClasses } from '@/lib/ui'
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
   * `domain`), avant d'enregistrer l'offre. Lot 22 : un montant illisible
   * (« 150k ») est refusé au champ, jamais envoyé.
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
      priceError.value =
        numberInputError(newPrice.value) ?? 'Écris le nouveau prix en euros.'
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
      offerError.value =
        numberInputError(offerAmount.value) ??
        'Écris le montant de l’offre en euros.'
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
  /** Le choix affiché dans la liste de chaque offre (revient en arrière sur un refus). */
  const shownResponse = ref<Record<string, OfferResponse>>({})
  const responseOf = (offer: Offer): OfferResponse =>
    shownResponse.value[offer.id] ?? offer.response
  function respond(offer: Offer, value: unknown): void {
    const response = value as OfferResponse
    if (response === offer.response) return
    if (response === 'counter_offer') {
      const raw = counters.value[offer.id]
      const value = parseNumberInput(raw)
      if (value === null || value <= 0) {
        responseError.value =
          numberInputError(raw) ??
          'Écris le montant de la contre-proposition avant de la choisir.'
        shownResponse.value = { ...shownResponse.value, [offer.id]: response }
        void Promise.resolve().then(() => {
          shownResponse.value = {
            ...shownResponse.value,
            [offer.id]: offer.response,
          }
        })
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

  const responseOptions = OfferResponseSchema.options.map(r => ({
    value: r,
    label: OFFER_RESPONSE_LABELS[r],
  }))
  const channelOptions = [
    { value: '', label: 'Canal…' },
    ...OfferChannelSchema.options.map(c => ({
      value: c,
      label: OFFER_CHANNEL_LABELS[c],
    })),
  ]
</script>

<template>
  <UiCard
    class="grid gap-3 text-sm"
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
      <UiButton
        variant="primary"
        size="sm"
        :disabled="busy"
        @click="emit('setStatus', suggestedStatus)"
      >
        Passer à « {{ LISTING_STATUS_LABELS[suggestedStatus] }} »
      </UiButton>
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
          <span class="ml-2 text-sm text-muted">{{ delta(entry.event) }}</span>
        </div>
        <div v-else class="grid min-w-0 gap-1">
          <span class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-muted uppercase">Offre</span>
            <span class="font-semibold">{{
              formatEuros(entry.offer.amount)
            }}</span>
            <span
              :class="[
                badgeClasses('neutral'),
                OFFER_RESPONSE_CLASSES[entry.offer.response],
              ]"
              :data-response="entry.offer.response"
            >
              {{ OFFER_RESPONSE_LABELS[entry.offer.response] }}
              <template v-if="entry.offer.counterAmount !== null">
                à {{ formatEuros(entry.offer.counterAmount) }}</template
              >
            </span>
            <span class="text-sm text-muted">
              <template v-if="entry.offer.channel">
                {{ OFFER_CHANNEL_LABELS[entry.offer.channel] }}</template
              >
              <template v-if="entry.offer.respondedAt">
                · réponse le {{ formatDate(entry.offer.respondedAt) }}</template
              >
            </span>
          </span>
          <p v-if="entry.offer.notes" class="text-sm text-muted">
            {{ entry.offer.notes }}
          </p>
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <label
              class="flex flex-wrap items-center gap-2 text-muted"
              :for="`offer-response-${entry.offer.id}`"
            >
              Réponse du vendeur
            </label>
            <UiSelect
              :id="`offer-response-${entry.offer.id}`"
              class="w-auto"
              :model-value="responseOf(entry.offer)"
              :options="responseOptions"
              :disabled="busy"
              :aria-label="`Réponse à l'offre de ${formatEuros(entry.offer.amount)}`"
              @update:model-value="value => respond(entry.offer, value)"
            />
            <UiInput
              v-model="counters[entry.offer.id]"
              class="w-48"
              inputmode="numeric"
              unit="€"
              placeholder="Contre-proposition"
              :invalid="!!responseError"
              :aria-label="`Contre-proposition à l'offre de ${formatEuros(entry.offer.amount)}`"
            />
          </div>
        </div>
      </li>
    </ol>
    <p v-if="timeline.length === 0" class="text-muted">
      Aucun prix ni aucune offre enregistrés.
    </p>
    <UiAlert v-if="responseError">{{ responseError }}</UiAlert>

    <div class="grid gap-3 @2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <form
        class="grid content-start gap-2.5 rounded-xl bg-surface-2 p-3 sm:px-3.5"
        aria-label="Préparer une offre"
        data-testid="offer-prep"
        novalidate
        @submit.prevent="submitOffer"
      >
        <p class="text-sm text-muted">
          Préparer une offre :
          <template v-if="offers.length === 0"
            >aucune offre faite pour l’instant</template
          >
          <template v-else>{{
            plural(offers.length, 'offre faite', 'offres faites')
          }}</template>
        </p>
        <div
          v-if="proposals.length"
          role="group"
          aria-label="Montants proposés"
          class="flex flex-wrap gap-1.5"
        >
          <UiChip
            v-for="p in proposals"
            :key="p.key"
            class="tabular-nums"
            :selected="amount === Math.round(p.amount)"
            :data-proposal="p.key"
            @click="pick(p.amount)"
          >
            {{ p.label }} · {{ formatEuros(p.amount) }}
          </UiChip>
        </div>
        <UiField
          id="offer-amount"
          v-model="offerAmount"
          label="Montant de l’offre"
          quiet
          unit="€"
          inputmode="numeric"
          :error="offerError"
          aria-label="Montant de l'offre"
        />
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
          <UiInput
            v-model="offerDate"
            type="date"
            align="left"
            aria-label="Date de l'offre"
          />
          <UiSelect
            v-model="offerChannel"
            :options="channelOptions"
            aria-label="Canal de l'offre"
          />
        </div>
        <UiInput
          v-model="offerNotes"
          align="left"
          placeholder="Commentaire (facultatif)"
          aria-label="Commentaire de l'offre"
        />
        <UiButton
          type="submit"
          variant="primary"
          class="justify-self-start"
          :disabled="busy"
        >
          Enregistrer l’offre
        </UiButton>
      </form>

      <form
        class="grid content-start gap-2 rounded-xl bg-surface-2 p-3 sm:px-3.5"
        aria-label="Nouveau prix constaté"
        novalidate
        @submit.prevent="submitPrice"
      >
        <UiField
          id="new-price"
          v-model="newPrice"
          label="Nouveau prix constaté"
          quiet
          unit="€"
          inputmode="numeric"
          :error="priceError"
          aria-label="Nouveau prix constaté"
        />
        <UiButton type="submit" :disabled="busy">
          Enregistrer la baisse ou la hausse
        </UiButton>
      </form>
    </div>
  </UiCard>
</template>
