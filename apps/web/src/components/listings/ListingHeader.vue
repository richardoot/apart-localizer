<script setup lang="ts">
  import { computed } from 'vue'
  import type {
    EvaluatedListing,
    ListingCover as Cover,
    ListingEvaluation,
  } from '@apart/contracts'
  import { judgementsOfListing, locationApproximation } from '@apart/domain'
  import { formatDistance, formatEurosPerM2, formatSurface } from '@/lib/format'
  import CheckFreshnessBadge from './CheckFreshnessBadge.vue'
  import DpeBadge from './DpeBadge.vue'
  import JudgementPills from './JudgementPills.vue'
  import ListingCover from './ListingCover.vue'
  import NewBadge from './NewBadge.vue'
  import PortalChips from './PortalChips.vue'

  /**
   * Lot 19 (ADR 0029), lot 25 (ADR 0035) : ce qui suit la ligne d'identité
   * collée de la fiche (retour, titre, prix, jugements, statut :
   * `ListingIdentity`) et défile : prix au m², surface, pièces, étage, lieu ;
   * pastilles « nouvelle », DPE, portails, fraîcheur de la vérification ; au
   * téléphone, les trois jugements étiquetés et la photo de couverture (photo
   * de visite, jamais du portail ; sur ordinateur, elle est dans la ligne
   * collée). Lot 26 : au téléphone, une ligne de jugements (formes courtes)
   * et une ligne de faits qui défile ; le statut est sur la ligne du prix
   * (`ListingIdentity`). La barre d'onglets suit et reste collée.
   */
  const props = defineProps<{
    item: EvaluatedListing
    /** L'évaluation affichée (serveur, ou aperçu pendant une modification). */
    evaluation: ListingEvaluation | null
    layout: 'page' | 'panel'
    cover?: Cover | null
  }>()
  const emit = defineEmits<{
    coverExpired: []
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
  /** Au téléphone, les trois jugements étiquetés, en entier, sous la ligne collée. */
  const judgements = computed(() =>
    judgementsOfListing({
      evaluation: props.evaluation ?? props.item.evaluation,
      criteriaFit: props.item.criteriaFit,
    })
  )
  const approximate = computed(
    () => locationApproximation(listing.value.location).approximate
  )
</script>

<template>
  <header
    class="flex gap-3 bg-surface px-4 sm:px-5"
    :class="layout === 'panel' ? 'pt-0.5 pb-2' : 'pt-1 pb-2'"
    data-testid="listing-header"
  >
    <ListingCover
      v-if="layout === 'panel'"
      :cover="cover"
      size="thumb"
      @expired="emit('coverExpired')"
    />
    <div class="grid min-w-0 flex-1 gap-1.5">
      <!-- Lot 26 : au téléphone, les jugements en formes courtes sur une ligne (l'étiquette entière pour le lecteur d'écran). -->
      <JudgementPills
        v-if="layout === 'panel'"
        :judgements="judgements"
        compact
        nowrap
        class="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
      />
      <!-- Lot 26 : au téléphone, les faits et les pastilles sur une seule ligne qui défile ; rien n'est retiré. -->
      <div
        class="flex gap-x-3.5 gap-y-1"
        :class="
          layout === 'panel'
            ? '-mx-4 flex-nowrap items-center overflow-x-auto px-4 whitespace-nowrap [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:whitespace-normal'
            : 'flex-col'
        "
        data-testid="listing-facts-line"
      >
        <p
          class="flex items-baseline gap-x-3.5 gap-y-0.5 text-sm text-muted tabular-nums"
          :class="layout === 'panel' ? 'flex-none sm:flex-wrap' : 'flex-wrap'"
          data-testid="listing-facts"
        >
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
          class="flex items-center gap-1.5"
          :class="layout === 'panel' ? 'flex-none' : 'flex-wrap'"
          data-testid="listing-pills"
        >
          <NewBadge :is-new="item.isNewForMe" />
          <DpeBadge :dpe="listing.dpeClass" />
          <template v-if="item.links.length">
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
      </div>
      <p
        v-if="listing.status === 'discarded' && listing.discardReason"
        class="text-sm text-muted"
        data-testid="discard-reason"
      >
        Écartée : {{ listing.discardReason }}
      </p>
    </div>
  </header>
</template>
