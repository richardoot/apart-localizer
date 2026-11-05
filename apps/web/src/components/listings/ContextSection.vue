<script setup lang="ts">
  import { computed, ref } from 'vue'
  import {
    OPEN_DATA_STATUS_LABELS,
    RENT_EPOCH_LABELS,
    TRANSIT_MODE_LABELS,
  } from '@apart/contracts'
  import type {
    DpeCandidate,
    ListingLocation,
    OpenDataStatus,
  } from '@apart/contracts'
  import { precisionBadge } from '@apart/domain'
  import {
    useContextMutations,
    useListingContext,
  } from '@/composables/useListingContext'
  import { ApiError } from '@/lib/api'
  import {
    formatDate,
    formatDistance,
    formatEuros,
    formatEurosPerM2,
    formatEurosPerMonth,
    formatPercent,
    formatSurface,
  } from '@/lib/format'
  import { CHECK_LEVEL_CLASSES } from '@/lib/labels'
  import ContextMap from './ContextMap.vue'
  import DpeBadge from './DpeBadge.vue'
  import PrecisionBadge from './PrecisionBadge.vue'
  import SurroundingsDetails from './SurroundingsDetails.vue'

  /**
   * Le bloc « Contexte » de la fiche (lot 4) : arrêt de tram le plus proche,
   * quartier et équipements proches (lot 11),
   * DPE vérifié auprès de l'ADEME (candidats à valider), plafond
   * d'encadrement, comparables DVF datés et carte miniature. Tout vient du
   * serveur (données ouvertes importées, `domain`) ; rien n'est calculé ici.
   */
  const props = defineProps<{
    listingId: string
    updatedAt: string
    /** Lot 12 : la localisation de l'annonce, pour la pastille et l'explication du repère. */
    location?: ListingLocation | null
  }>()
  const emit = defineEmits<{
    /** « Préciser l'adresse » : ouvrir le formulaire sur l'adresse. */
    precise: []
  }>()

  const id = computed(() => props.listingId)
  const { data: context, isPending, error } = useListingContext(id)
  const mutations = useContextMutations()
  const failure = ref<string | null>(null)

  const STATUS_CLASSES: Record<OpenDataStatus, string> = {
    ok: 'bg-good-soft text-good',
    to_verify: 'bg-warn-soft text-warn',
    not_applicable: 'bg-surface-2 text-muted',
    unavailable: 'bg-surface-2 text-muted',
  }

  async function run(action: Promise<unknown>): Promise<void> {
    failure.value = null
    try {
      await action
    } catch (err) {
      failure.value = err instanceof ApiError ? err.message : 'Échec.'
    }
  }

  function retain(candidate: DpeCandidate): void {
    void run(
      mutations.verifyDpe.mutateAsync({
        id: props.listingId,
        number: candidate.number,
        expectedUpdatedAt: props.updatedAt,
      })
    )
  }

  const busy = computed(
    () =>
      mutations.searchDpe.isPending.value ||
      mutations.verifyDpe.isPending.value ||
      mutations.regeocode.isPending.value
  )

  /**
   * Lot 12 : le repère tel que le serveur l'a placé (précision, placement du
   * contexte), avec la commune et le quartier saisis de l'annonce.
   */
  const placed = computed(() =>
    context.value
      ? {
          precision: context.value.precision,
          point: context.value.point,
          placement: context.value.placement,
          commune: props.location?.commune ?? null,
          district: props.location?.district ?? null,
        }
      : null
  )
  const badge = computed(() =>
    placed.value ? precisionBadge(placed.value) : null
  )
  /** Les raisons du placement, sans répéter l'explication de la pastille. */
  const placementReasons = computed(
    () => context.value?.placement?.reasons ?? []
  )
</script>

<template>
  <section
    class="grid gap-3 rounded-xl border border-line p-4"
    aria-label="Contexte"
  >
    <header class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="font-display text-base font-semibold">
        Contexte (données ouvertes)
      </h3>
      <button
        type="button"
        class="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:text-fg disabled:opacity-60"
        :disabled="busy"
        data-action="regeocode"
        @click="run(mutations.regeocode.mutateAsync(listingId))"
      >
        Relancer le géocodage
      </button>
    </header>
    <p v-if="isPending" class="text-sm text-muted">Chargement du contexte…</p>
    <p v-else-if="error" role="alert" class="text-sm text-bad">
      {{ error.message }}
    </p>
    <template v-else-if="context">
      <p v-if="!context.point" class="text-sm text-warn">
        Adresse non localisée : saisissez une adresse ou une commune pour
        obtenir la desserte, le plafond et le marché.
      </p>

      <div
        v-if="placed && badge"
        class="grid gap-1.5 rounded-lg border border-line bg-bg p-3 text-sm"
        :class="
          context.approximation.approximate ? 'border-l-4 border-l-warn' : ''
        "
        data-testid="placement"
      >
        <h4
          class="flex flex-wrap items-center gap-2 text-xs font-medium text-muted"
        >
          Repère de l’annonce
          <PrecisionBadge :location="placed" />
        </h4>
        <p class="text-xs">{{ badge.title }}</p>
        <ul
          v-if="placementReasons.length"
          class="grid gap-0.5 text-xs text-muted"
          data-testid="placement-reasons"
        >
          <li v-for="reason in placementReasons" :key="reason">
            {{ reason }}
          </li>
        </ul>
        <button
          v-if="badge.tone !== 'exact'"
          type="button"
          class="inline-flex min-h-9 items-center justify-self-start rounded-lg border border-accent px-3 py-1 text-xs font-medium text-accent hover:bg-accent-soft"
          data-action="precise-address"
          @click="emit('precise')"
        >
          Préciser l’adresse
        </button>
      </div>

      <div class="grid gap-1 text-sm" data-testid="transit">
        <h4 class="text-xs font-medium text-muted">Desserte TBM</h4>
        <p v-if="context.transit.nearestTram">
          Tram le plus proche :
          <strong>{{ context.transit.nearestTram.name }}</strong>
          <template v-if="context.transit.nearestTram.lines.length">
            (ligne {{ context.transit.nearestTram.lines.join(', ') }})
          </template>
          à {{ context.transit.approximate ? '≈ ' : ''
          }}{{ formatDistance(context.transit.nearestTram.distanceMeters) }}
        </p>
        <p v-else class="text-muted">Aucun arrêt de tram à moins de 2 km.</p>
        <p
          v-if="
            context.transit.nearestStop &&
            context.transit.nearestStop.name !==
              context.transit.nearestTram?.name
          "
          class="text-xs text-muted"
        >
          Arrêt le plus proche : {{ context.transit.nearestStop.name }} ({{
            TRANSIT_MODE_LABELS[context.transit.nearestStop.mode].toLowerCase()
          }}
          {{ context.transit.nearestStop.lines.join(', ') }}) à
          {{ context.transit.approximate ? '≈ ' : ''
          }}{{ formatDistance(context.transit.nearestStop.distanceMeters) }}
        </p>
        <p
          v-for="reason in context.transit.reasons"
          :key="reason"
          class="text-xs text-muted"
        >
          {{ reason }}
        </p>
      </div>

      <SurroundingsDetails
        :surroundings="context.surroundings"
        :approximation="context.approximation"
      />

      <div class="grid gap-1 text-sm" data-testid="dpe">
        <h4 class="flex items-center gap-2 text-xs font-medium text-muted">
          DPE
          <span
            :class="
              context.dpe.verified
                ? 'bg-good-soft text-good'
                : 'bg-surface-2 text-muted'
            "
            class="rounded-full px-2"
          >
            {{ context.dpe.verified ? 'vérifié ADEME' : 'non vérifié' }}
          </span>
        </h4>
        <ul class="grid gap-0.5">
          <li
            v-for="message in context.dpe.validity.messages"
            :key="message"
            :class="CHECK_LEVEL_CLASSES[context.dpe.validity.level]"
            class="rounded px-2 py-0.5 text-xs"
          >
            {{ message }}
          </li>
        </ul>
        <p v-if="context.dpe.search?.message" class="text-xs text-muted">
          {{ context.dpe.search.message }}
          ({{ formatDate(context.dpe.search.searchedAt) }})
        </p>
        <ul
          v-if="
            context.dpe.search &&
            context.dpe.search.candidates.length &&
            !context.dpe.verified
          "
          class="grid gap-1"
          aria-label="DPE candidats"
        >
          <li
            v-for="candidate in context.dpe.search.candidates.slice(0, 8)"
            :key="candidate.number"
            class="flex flex-wrap items-center gap-2 rounded-lg border border-line px-2 py-1 text-xs"
          >
            <DpeBadge :dpe="candidate.dpeClass" />
            <span
              >n° {{ candidate.number }} du
              {{ formatDate(candidate.issuedAt) }}</span
            >
            <span class="text-muted">
              {{ formatSurface(candidate.surface) }}
              <template v-if="candidate.floor !== null">
                · étage {{ candidate.floor }}</template
              >
              <template v-if="candidate.consumption !== null">
                · {{ candidate.consumption }} kWh/m²/an</template
              >
              <template v-if="candidate.complement">
                · {{ candidate.complement }}</template
              >
              · ressemblance {{ Math.round(candidate.matchScore * 100) }} %
            </span>
            <button
              type="button"
              class="ml-auto rounded border border-accent px-2"
              :disabled="busy"
              @click="retain(candidate)"
            >
              Retenir
            </button>
          </li>
        </ul>
        <button
          type="button"
          class="justify-self-start rounded-lg border border-line px-2 py-1 text-xs disabled:opacity-60"
          :disabled="busy"
          data-action="search-dpe"
          @click="run(mutations.searchDpe.mutateAsync(listingId))"
        >
          {{
            mutations.searchDpe.isPending.value
              ? 'Recherche…'
              : 'Rechercher le DPE à l’ADEME'
          }}
        </button>
      </div>

      <div class="grid gap-1 text-sm" data-testid="rent-control">
        <h4 class="flex items-center gap-2 text-xs font-medium text-muted">
          Encadrement des loyers
          <span
            :class="STATUS_CLASSES[context.rentControl.status]"
            class="rounded-full px-2"
          >
            {{ OPEN_DATA_STATUS_LABELS[context.rentControl.status] }}
          </span>
        </h4>
        <p v-if="context.rentControl.referenceRentPerM2 !== null">
          Loyer de référence majoré
          <strong
            >{{
              context.rentControl.referenceRentPerM2.toLocaleString('fr-FR')
            }}
            €/m²</strong
          >
          <template v-if="context.rentControl.monthlyCap !== null">
            · plafond
            {{ formatEurosPerMonth(context.rentControl.monthlyCap) }} hors
            charges
          </template>
          <span class="text-xs text-muted">
            (zone {{ context.rentControl.zone?.zone }},
            {{
              context.rentControl.rooms === 4
                ? '4 pièces et plus'
                : `${context.rentControl.rooms} pièce(s)`
            }},
            {{
              context.rentControl.epoch
                ? RENT_EPOCH_LABELS[context.rentControl.epoch].toLowerCase()
                : ''
            }}, {{ context.rentControl.furnished ? 'meublé' : 'vide' }})
          </span>
        </p>
        <ul class="grid gap-0.5 text-xs">
          <li
            v-for="reason in context.rentControl.reasons"
            :key="reason"
            class="text-warn"
          >
            {{ reason }}
          </li>
          <li
            v-for="note in context.rentControl.notes"
            :key="note"
            class="text-muted"
          >
            {{ note }}
          </li>
        </ul>
      </div>

      <div class="grid gap-1 text-sm" data-testid="market">
        <h4 class="flex items-center gap-2 text-xs font-medium text-muted">
          Ventes comparables (DVF)
          <span
            :class="STATUS_CLASSES[context.market.status]"
            class="rounded-full px-2"
          >
            {{ OPEN_DATA_STATUS_LABELS[context.market.status] }}
          </span>
        </h4>
        <p v-if="context.market.stats">
          Médiane
          <strong>{{
            formatEurosPerM2(context.market.stats.medianPricePerM2)
          }}</strong>
          sur {{ context.market.stats.count }} vente(s) à
          {{ formatDistance(context.market.radiusMeters) }} ({{
            formatEurosPerM2(context.market.stats.p25PricePerM2)
          }}
          à {{ formatEurosPerM2(context.market.stats.p75PricePerM2) }} pour la
          moitié centrale)
          <template v-if="context.market.marketPrice !== null">
            · prix de marché ≈ {{ formatEuros(context.market.marketPrice) }}
          </template>
          <template v-if="context.market.gapToMarket !== null">
            · prix affiché {{ context.market.gapToMarket >= 0 ? '+' : '−'
            }}{{ formatPercent(Math.abs(context.market.gapToMarket)) }}
          </template>
        </p>
        <ul class="grid gap-0.5 text-xs text-muted">
          <li v-for="reason in context.market.reasons" :key="reason">
            {{ reason }}
          </li>
        </ul>
        <table v-if="context.market.comparables.length" class="w-full text-xs">
          <thead class="text-left text-muted">
            <tr>
              <th class="py-1">Date</th>
              <th>€/m²</th>
              <th>Surface</th>
              <th>Prix</th>
              <th>Distance</th>
              <th>Adresse</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="sale in context.market.comparables"
              :key="sale.id"
              class="border-t border-line"
            >
              <td class="py-0.5">{{ formatDate(sale.mutationDate) }}</td>
              <td>{{ formatEurosPerM2(sale.pricePerM2) }}</td>
              <td>{{ formatSurface(sale.surface) }}</td>
              <td>{{ formatEuros(sale.price) }}</td>
              <td>{{ formatDistance(sale.distanceMeters) }}</td>
              <td class="text-muted">{{ sale.address }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <ContextMap :context="context" />
      <p class="text-xs text-muted">
        Sources : arrêts TBM (Bordeaux Métropole), DVF géolocalisées (Etalab,
        DGFiP), arrêté préfectoral de l’encadrement (Gironde), observatoire DPE
        (ADEME), équipements sportifs (ministère des Sports), © contributeurs
        OpenStreetMap (ODbL), contours des quartiers (source indiquée sous le
        quartier).
      </p>
    </template>
    <p
      v-if="failure"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ failure }}
    </p>
  </section>
</template>
