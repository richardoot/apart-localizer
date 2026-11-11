<script setup lang="ts">
  import { computed } from 'vue'
  import { DialogTitle } from 'reka-ui'
  import type {
    EvaluatedListing,
    ListingEvaluation,
    ListingStatus,
  } from '@apart/contracts'
  import { locationApproximation } from '@apart/domain'
  import {
    formatDistance,
    formatEuros,
    formatEurosPerM2,
    formatSurface,
  } from '@/lib/format'
  import UiButton from '@/components/ui/UiButton.vue'
  import CheckFreshnessBadge from './CheckFreshnessBadge.vue'
  import DpeBadge from './DpeBadge.vue'
  import FitBadge from './FitBadge.vue'
  import NewBadge from './NewBadge.vue'
  import PortalChips from './PortalChips.vue'
  import StatusChanger from './StatusChanger.vue'
  import VerdictPill from './VerdictPill.vue'

  /**
   * Lot 19 (ADR 0029) : l'en-tête allégé de la fiche, commun aux sept
   * onglets. Retour à la liste, menu du statut, titre, prix et prix au m²,
   * surface, pièces, étage, lieu ; pastilles du verdict (aperçu en direct
   * pendant une modification), de l'adéquation et du DPE ; portails ;
   * fraîcheur de la vérification. Les dates, les champs lus par l'IA et le
   * lien de l'annonce vont dans Historique et Le bien. La barre d'onglets
   * suit l'en-tête dans la fiche et reste collée en haut au défilement.
   */
  const props = defineProps<{
    item: EvaluatedListing
    /** L'évaluation affichée (serveur, ou aperçu pendant une modification). */
    evaluation: ListingEvaluation | null
    busy?: boolean
    /** Lot 22 : le refus du dernier changement de statut. */
    statusError?: string | null
    /** Lot 23 : où mène le retour (« Accueil » pour une fiche ouverte depuis l'accueil). */
    backLabel?: string | undefined
  }>()
  const emit = defineEmits<{
    back: []
    status: [change: { status: ListingStatus; reason: string | null }]
  }>()

  const listing = computed(() => props.item.listing)
  const place = computed(() =>
    [listing.value.location.commune, listing.value.location.district]
      .filter(Boolean)
      .join(' · ')
  )
  const floor = computed(() => {
    const l = listing.value
    if (l.floorLabel) return l.floorLabel
    if (l.floor === null) return null
    return l.floor === 0 ? 'rez-de-chaussée' : `${l.floor}e étage`
  })
  const pricePerM2 = computed(() => {
    const value = props.evaluation?.metrics.pricePerM2 ?? Number.NaN
    return Number.isFinite(value) ? formatEurosPerM2(value) : null
  })
  const approximate = computed(
    () => locationApproximation(listing.value.location).approximate
  )
</script>

<template>
  <header
    class="bg-surface px-4 pt-2 pb-1 sm:px-5 sm:pt-3"
    data-testid="listing-header"
  >
    <div class="grid gap-2">
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <UiButton
          variant="ghost"
          size="sm"
          icon="arrow-left"
          class="-ml-2 text-accent"
          data-testid="listing-back"
          @click="emit('back')"
        >
          {{ backLabel ?? 'Annonces' }}
        </UiButton>
        <StatusChanger
          :status="listing.status"
          :busy="busy"
          :error="statusError ?? null"
          @change="change => emit('status', change)"
        />
      </div>

      <div class="grid gap-1.5">
        <DialogTitle
          as="h1"
          class="font-display text-2xl leading-tight font-bold break-words sm:text-[26px]"
        >
          {{ listing.title }}
        </DialogTitle>
        <p
          class="flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5 text-sm text-muted tabular-nums"
          data-testid="listing-facts"
        >
          <strong class="text-lg text-fg" data-testid="header-price">{{
            formatEuros(evaluation?.metrics.price ?? listing.price)
          }}</strong>
          <span v-if="pricePerM2">{{ pricePerM2 }}</span>
          <span v-if="listing.surface">{{
            formatSurface(listing.surface)
          }}</span>
          <span v-if="listing.rooms !== null"
            >{{ listing.rooms }} pièce{{ listing.rooms > 1 ? 's' : '' }}</span
          >
          <span v-if="floor">{{ floor }}</span>
          <span v-if="place">{{ place }}</span>
          <span v-if="item.distanceMeters !== null"
            >à {{ approximate ? '≈ ' : ''
            }}{{ formatDistance(item.distanceMeters) }}</span
          >
        </p>
        <div
          class="flex flex-wrap items-center gap-1.5"
          data-testid="listing-pills"
        >
          <NewBadge :is-new="item.isNewForMe" />
          <VerdictPill
            v-if="evaluation"
            :verdict="evaluation.metrics.verdict"
          />
          <FitBadge
            v-if="item.criteriaFit.activeCriteria > 0"
            :level="item.criteriaFit.level"
          />
          <DpeBadge :dpe="listing.dpeClass" />
          <template v-if="item.links.length">
            <!-- Sur le téléphone, les portails passent souvent à la ligne. -->
            <span
              aria-hidden="true"
              class="mx-0.5 hidden h-4 w-px bg-line sm:inline-block"
            />
            <PortalChips :links="item.links" short linked />
          </template>
          <CheckFreshnessBadge
            v-if="listing.lastCheckedAt"
            :listing="listing"
            :last-outcome="item.lastCheck?.outcome ?? null"
          />
        </div>
        <p
          v-if="listing.status === 'discarded' && listing.discardReason"
          class="text-sm text-muted"
          data-testid="discard-reason"
        >
          Écartée : {{ listing.discardReason }}
        </p>
      </div>
    </div>
  </header>
</template>
