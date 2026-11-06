<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { EvaluatedListing } from '@apart/contracts'
  import { precisionBadge } from '@apart/domain'
  import CompliancePanel from '@/components/study/CompliancePanel.vue'
  import { useListingContext } from '@/composables/useListingContext'
  import { useCompliance } from '@/composables/useStudy'
  import { formatDate } from '@/lib/format'
  import type { ListingTab } from '@/lib/listing-tabs'
  import { neighbourhoodTiles } from '@/lib/neighbourhood-tiles'
  import type {
    NeighbourhoodTileId,
    NeighbourhoodTileTone,
  } from '@/lib/neighbourhood-tiles'
  import ContextMap from '../ContextMap.vue'
  import SurroundingsDetails from '../SurroundingsDetails.vue'
  import PlacementDetails from '../neighbourhood/PlacementDetails.vue'
  import TransitDetails from '../neighbourhood/TransitDetails.vue'

  /**
   * Lot 19 (ADR 0029) : « Quartier : comment on y vit ? ». Six tuiles (tram,
   * courses, sport, quartier, risques à l'adresse, repère) lisibles d'un coup
   * d'œil (`neighbourhoodTiles`, pur) ; la tuile choisie détaille sa donnée
   * dessous. Puis la carte et, repliées, les sources et leurs dates. Tout
   * vient du contexte calculé par le serveur et du rapport Géorisques ; une
   * donnée absente se dit « à vérifier ». Le DPE est dans Le bien,
   * l'encadrement dans Budget, les ventes comparables dans Négocier.
   */
  const props = defineProps<{ item: EvaluatedListing }>()
  const emit = defineEmits<{ precise: []; go: [tab: ListingTab] }>()

  const id = computed(() => props.item.listing.id)
  const { data: context, isPending, error } = useListingContext(id)
  const { data: compliance } = useCompliance(id)

  const tiles = computed(() =>
    neighbourhoodTiles(
      context.value ?? null,
      compliance.value ?? null,
      props.item.listing.location
    )
  )
  const selected = ref<NeighbourhoodTileId>('transit')
  const current = computed(
    () => tiles.value.find(t => t.id === selected.value) ?? tiles.value[0]
  )

  const TITLES: Record<NeighbourhoodTileId, string> = {
    transit: 'Desserte TBM',
    shopping: 'Courses : supermarchés avec drive',
    sport: 'Sport : piste d’athlétisme et Fitness Park',
    neighbourhood: 'Quartier',
    risks: 'Risques à l’adresse (Géorisques)',
    placement: 'Repère de l’annonce',
  }
  const SOURCES: Record<NeighbourhoodTileId, string> = {
    transit:
      'Arrêts TBM (Bordeaux Métropole) importés ; distance à vol d’oiseau depuis le repère.',
    shopping:
      '© contributeurs OpenStreetMap (ODbL) ; drive signalé ou à vérifier, jamais supposé d’après l’enseigne.',
    sport:
      'Équipements sportifs (ministère des Sports) et © contributeurs OpenStreetMap (ODbL).',
    neighbourhood: 'Contours des quartiers : source indiquée sous le quartier.',
    risks:
      'Géorisques (BRGM, ministère de la Transition écologique, licence Etalab 2.0) ; un doute rend « à vérifier ».',
    placement:
      'Géocodeur de l’IGN (Géoplateforme), quartiers reconnus, lieux-dits OpenStreetMap.',
  }
  const TONES: Record<NeighbourhoodTileTone, string> = {
    default: 'text-fg',
    good: 'text-good',
    warn: 'text-warn',
  }

  const placed = computed(() =>
    context.value
      ? {
          precision: context.value.precision,
          point: context.value.point,
          placement: context.value.placement,
          commune: props.item.listing.location.commune,
          district: props.item.listing.location.district,
        }
      : null
  )
  const badge = computed(() =>
    placed.value ? precisionBadge(placed.value) : null
  )
  /** Le contour du quartier retenu n'est dessiné que pour un repère au quartier. */
  const dashedArea = computed(() => context.value?.precision === 'district')

  /** Une tuile choisie au clavier : flèches entre les tuiles du groupe. */
  function onKey(event: KeyboardEvent): void {
    const index = tiles.value.findIndex(t => t.id === selected.value)
    const delta =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    const next =
      tiles.value[(index + delta + tiles.value.length) % tiles.value.length]
    if (!next) return
    event.preventDefault()
    selected.value = next.id
    const target = (
      event.currentTarget as HTMLElement
    ).querySelector<HTMLElement>(`[data-tile="${next.id}"]`)
    target?.focus()
  }

  const button =
    'inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2 sm:min-h-10'
</script>

<template>
  <div class="grid gap-4" data-testid="tab-neighbourhood">
    <p v-if="isPending" class="text-sm text-muted">Chargement du quartier…</p>
    <p
      v-else-if="error"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ error.message }}
    </p>
    <template v-else-if="context">
      <div
        class="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3"
        role="group"
        aria-label="Le quartier en six tuiles : choisissez-en une pour son détail"
        data-testid="neighbourhood-tiles"
        @keydown="onKey"
      >
        <button
          v-for="tile in tiles"
          :key="tile.id"
          type="button"
          class="grid min-h-24 content-start gap-1 rounded-2xl border-[1.5px] bg-surface px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-28 sm:px-4 sm:py-3.5"
          :class="
            tile.id === selected
              ? 'border-accent'
              : 'border-line hover:border-muted'
          "
          :aria-pressed="tile.id === selected"
          aria-controls="neighbourhood-detail"
          :data-tile="tile.id"
          :data-tone="tile.tone"
          @click="selected = tile.id"
        >
          <span class="text-xs text-muted">{{ tile.kicker }}</span>
          <strong
            class="font-display text-base leading-tight font-bold break-words sm:text-[21px]"
            :class="TONES[tile.tone]"
            >{{ tile.value }}</strong
          >
          <span class="text-xs leading-snug text-muted sm:text-[13px]">{{
            tile.sub
          }}</span>
        </button>
      </div>

      <section
        v-if="current"
        id="neighbourhood-detail"
        class="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:px-5"
        aria-labelledby="neighbourhood-detail-title"
        :data-detail="current.id"
        aria-live="polite"
      >
        <h2 id="neighbourhood-detail-title" class="text-base font-semibold">
          {{ TITLES[current.id] }}
        </h2>
        <p
          v-if="!context.point && current.id !== 'risks'"
          class="text-sm text-warn"
        >
          Adresse non localisée : saisissez une adresse ou une commune pour
          obtenir la desserte, les équipements et le quartier.
        </p>
        <TransitDetails
          v-if="current.id === 'transit'"
          :transit="context.transit"
        />
        <SurroundingsDetails
          v-else-if="current.id === 'shopping'"
          :surroundings="context.surroundings"
          :approximation="context.approximation"
          part="drives"
        />
        <SurroundingsDetails
          v-else-if="current.id === 'sport'"
          :surroundings="context.surroundings"
          :approximation="context.approximation"
          part="sport"
        />
        <SurroundingsDetails
          v-else-if="current.id === 'neighbourhood'"
          :surroundings="context.surroundings"
          :approximation="context.approximation"
          part="neighbourhood"
        />
        <CompliancePanel
          v-else-if="current.id === 'risks'"
          :listing-id="item.listing.id"
          risks-only
        />
        <PlacementDetails
          v-else
          :listing-id="item.listing.id"
          :context="context"
          :location="item.listing.location"
          @precise="emit('precise')"
        />
        <p class="text-xs text-muted" data-testid="detail-source">
          {{ SOURCES[current.id] }}
        </p>
      </section>

      <section
        class="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:px-5"
        aria-labelledby="neighbourhood-map-title"
        data-testid="neighbourhood-map"
      >
        <div
          class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
        >
          <h2 id="neighbourhood-map-title" class="text-base font-semibold">
            Sur la carte
          </h2>
          <span
            v-if="badge"
            class="text-xs text-muted"
            :title="badge.title"
            data-testid="map-precision"
            >Repère : {{ badge.label.toLowerCase() }}</span
          >
        </div>
        <ContextMap v-if="context.point" :context="context" />
        <p v-else class="text-sm text-warn">
          Adresse non localisée : pas de carte tant qu’il n’y a ni adresse ni
          commune.
        </p>
        <p
          v-if="dashedArea || (badge && badge.tone !== 'exact')"
          class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted"
          data-testid="map-note"
        >
          <span v-if="dashedArea"
            >Pointillé : le quartier retenu ; le repère est en son centre.</span
          >
          <!-- Le bouton et la fin de la phrase restent ensemble en se repliant. -->
          <span v-if="badge && badge.tone !== 'exact'"
            ><button
              type="button"
              class="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-2 hover:underline sm:min-h-0"
              data-action="map-precise"
              @click="emit('precise')"
            >
              Préciser l’adresse
            </button>
            pour un repère exact et des distances justes.</span
          >
        </p>
      </section>

      <details
        class="rounded-2xl border border-line bg-surface px-4 sm:px-5"
        data-testid="neighbourhood-sources"
      >
        <summary
          class="flex min-h-[52px] cursor-pointer items-center text-base font-semibold"
        >
          Sources et dates des données ouvertes
        </summary>
        <div class="grid gap-2 pb-4 text-sm text-muted">
          <p>
            Arrêts TBM (Bordeaux Métropole), DVF géolocalisées (Etalab, DGFiP),
            arrêté préfectoral de l’encadrement (Gironde), observatoire DPE
            (ADEME), équipements sportifs (ministère des Sports), ©
            contributeurs OpenStreetMap (ODbL), contours des quartiers (source
            indiquée sous le quartier).
          </p>
          <p data-testid="context-computed-at">
            Contexte calculé le {{ formatDate(context.computedAt) }}, depuis les
            données importées en base (aucun appel réseau à la lecture).
          </p>
          <p v-if="context.surroundings.neighbourhood.value">
            Contour du quartier :
            {{ context.surroundings.neighbourhood.value.source }}.
          </p>
          <p data-testid="sources-georisques">
            <template v-if="compliance?.georisques?.status === 'ok'">
              Géorisques : {{ compliance.georisques.address ?? 'adresse' }},
              relevé le {{ formatDate(compliance.georisques.fetchedAt) }}
              <a
                v-if="compliance.georisques.reportUrl"
                :href="compliance.georisques.reportUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-accent underline"
                >rapport complet</a
              >
              (BRGM, ministère de la Transition écologique, licence Etalab 2.0).
            </template>
            <template v-else>
              Géorisques :
              {{ compliance?.georisques?.message ?? 'rapport non lu.' }}
            </template>
          </p>
          <button
            type="button"
            :class="button"
            class="justify-self-start"
            @click="emit('go', 'negocier')"
          >
            Les ventes comparables (DVF) sont dans Négocier →
          </button>
        </div>
      </details>
    </template>
  </div>
</template>
