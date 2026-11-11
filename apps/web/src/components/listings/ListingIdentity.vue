<script setup lang="ts">
  import { computed } from 'vue'
  import type {
    EvaluatedListing,
    ListingCover as Cover,
    ListingEvaluation,
    ListingStatus,
  } from '@apart/contracts'
  import { judgementsOfListing } from '@apart/domain'
  import { formatEuros } from '@/lib/format'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import JudgementPills from './JudgementPills.vue'
  import ListingCover from './ListingCover.vue'
  import FicheTitle from './FicheTitle.vue'
  import StatusChanger from './StatusChanger.vue'

  /**
   * Lot 25 (ADR 0035) : la ligne d'identité de la fiche, collée en haut au
   * défilement : retour, titre, prix (« Corriger » ouvre le prix dans Le
   * bien, même section, même garde, même journal), les trois jugements
   * étiquetés, le statut. Sur ordinateur, une ligne de page ; au téléphone,
   * compacte : retour, titre (deux lignes au plus), prix et statut (lot 26 :
   * un menu court sur la ligne du prix) ; les jugements passent juste
   * dessous, sur une ligne, dans l'en-tête qui défile. Dans le panneau, le
   * titre est celui du dialogue.
   */
  const props = defineProps<{
    item: EvaluatedListing
    evaluation: ListingEvaluation | null
    /** `page` : pleine page sur ordinateur ; `panel` : panneau du téléphone. */
    layout: 'page' | 'panel'
    cover?: Cover | null
    busy?: boolean
    statusError?: string | null
    backLabel?: string | undefined
  }>()
  const emit = defineEmits<{
    back: []
    status: [change: { status: ListingStatus; reason: string | null }]
    editPrice: []
    coverExpired: []
  }>()

  const listing = computed(() => props.item.listing)
  const price = computed(() =>
    formatEuros(props.evaluation?.metrics.price ?? listing.value.price)
  )
  const judgements = computed(() =>
    judgementsOfListing({
      evaluation: props.evaluation ?? props.item.evaluation,
      criteriaFit: props.item.criteriaFit,
    })
  )
  const page = computed(() => props.layout === 'page')
</script>

<template>
  <div
    class="flex items-start gap-2 bg-surface px-4 py-2 sm:gap-3 sm:px-5"
    :class="page ? 'border-b border-line py-2.5' : ''"
    data-testid="listing-identity"
  >
    <UiButton
      variant="ghost"
      :size="page ? 'sm' : 'icon'"
      icon="arrow-left"
      class="-ml-2 flex-none text-accent"
      :aria-label="page ? undefined : `Retour : ${backLabel ?? 'Annonces'}`"
      data-testid="listing-back"
      @click="emit('back')"
    >
      <template v-if="page">{{ backLabel ?? 'Annonces' }}</template>
    </UiButton>
    <ListingCover
      v-if="page"
      :cover="cover"
      size="row"
      class="-my-0.5"
      @expired="emit('coverExpired')"
    />
    <div class="grid min-w-0 flex-1 gap-1">
      <div
        class="flex min-w-0 gap-x-3 gap-y-0.5"
        :class="page ? 'flex-wrap items-baseline' : 'flex-col'"
      >
        <FicheTitle
          :page="page"
          class="min-w-0 font-display leading-tight font-bold break-words"
          :class="
            page
              ? 'text-xl lg:max-w-[46ch] lg:truncate'
              : 'line-clamp-2 text-base sm:text-lg'
          "
          :title="page ? listing.title : undefined"
        >
          {{ listing.title }}
        </FicheTitle>
        <!-- Lot 26 : au téléphone, le statut se règle sur la ligne du prix (plus de menu pleine largeur sous l'en-tête). -->
        <div class="flex min-w-0 items-center gap-x-2 gap-y-1">
          <span class="inline-flex items-center gap-1">
            <strong
              class="text-base text-fg tabular-nums sm:text-lg"
              data-testid="header-price"
              >{{ price }}</strong
            >
            <UiButton
              variant="ghost"
              size="icon"
              class="-my-2 text-muted"
              :aria-label="`Corriger le prix (${price})`"
              data-testid="edit-price"
              @click="emit('editPrice')"
            >
              <UiIcon name="edit" class="size-4" />
            </UiButton>
          </span>
          <StatusChanger
            v-if="!page"
            class="ml-auto"
            compact
            :status="listing.status"
            :busy="busy"
            :error="statusError ?? null"
            @change="change => emit('status', change)"
          />
        </div>
      </div>
      <!-- Au téléphone, les jugements passent sous la ligne collée (en-tête), sur une ligne. -->
      <JudgementPills v-if="page" :judgements="judgements" />
    </div>
    <div v-if="page" class="flex-none">
      <StatusChanger
        :status="listing.status"
        :busy="busy"
        :error="statusError ?? null"
        @change="change => emit('status', change)"
      />
    </div>
  </div>
</template>
