<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import '@/lib/maplibre-worker'
  import * as maplibregl from 'maplibre-gl'
  import type { Map as MapLibreMap } from 'maplibre-gl'
  import type { ListingContext, NearbyAmenity } from '@apart/contracts'
  import { useBaseMap } from '@/composables/useBaseMap'
  import { useListingAreas } from '@/composables/useListings'
  import { useMapLayers } from '@/composables/useMapLayers'
  import { useSearchCriteriaList } from '@/composables/useSearchCriteria'
  import type {
    MapLayerToggles,
    SurroundingsLayerKey,
  } from '@/composables/useMapLayers'
  import {
    ATHLETICS_LAYERS,
    CRITERIA_LAYERS,
    DRIVE_LAYERS,
    FITNESS_LAYERS,
    LISTING_AREA_COLOR,
    LISTING_AREA_LAYERS,
    LISTING_AREA_SOURCE,
    NEIGHBOURHOOD_CURRENT_LAYERS,
    NEIGHBOURHOOD_HIT_LAYER,
    NEIGHBOURHOOD_HOVER_LAYERS,
    NEIGHBOURHOOD_HOVER_SOURCE,
    NEIGHBOURHOOD_LAYERS,
    POPUP_LAYER_IDS,
    SURROUNDINGS_ATTRIBUTIONS,
    bindNeighbourhoodHover,
    layerFeaturePopupHtml,
    listingAreaCollection,
    neighbourhoodPopupHtml,
    pointLayer,
    surroundingsFrame,
    upsertGeoJsonLayer,
  } from '@/lib/map-layers'
  import { criteriaFeatures } from '@/lib/perimeter'
  import BaseMapSwitcher from '@/components/map/BaseMapSwitcher.vue'
  import SurroundingsLegend from '@/components/map/SurroundingsLegend.vue'

  /**
   * Carte du quartier de la fiche : l'annonce, l'arrêt de tram et les
   * équipements les plus proches (lot 11), les ventes comparables ; en
   * option, les couches complètes des pistes, drives, Fitness Park et
   * contours des quartiers ; lot 14 : les périmètres des critères actifs,
   * sous le contour du quartier retenu, pour voir d'un coup d'œil pourquoi
   * une annonce au quartier est « à confirmer ». Le fond est celui choisi
   * pour toutes les cartes.
   */
  const props = defineProps<{ context: ListingContext }>()

  const container = ref<HTMLDivElement | null>(null)
  let map: MapLibreMap | null = null
  const ready = ref(false)
  const { baseMap, setBaseMap, styleOptions } = useBaseMap(() => map)

  const LAYER_LABELS: { key: SurroundingsLayerKey; label: string }[] = [
    { key: 'neighbourhoods', label: 'Quartiers' },
    { key: 'athletics', label: 'Pistes' },
    { key: 'drives', label: 'Drives' },
    { key: 'fitness', label: 'Fitness Park' },
  ]
  // Les contours sont allumés d'emblée : c'est la carte du quartier.
  const toggles = ref<Pick<MapLayerToggles, SurroundingsLayerKey>>({
    neighbourhoods: true,
    athletics: false,
    drives: false,
    fitness: false,
  })
  // Ces couches se chargent entières (pas d'emprise) : la vue n'est pas suivie.
  const layers = useMapLayers(toggles, null)
  // Lot 12 : le contour du quartier retenu d'une annonce placée au quartier.
  const areas = useListingAreas(
    computed(() => props.context.precision === 'district')
  )
  // Lot 14 : les périmètres des critères actifs (couche marquée, ADR 0020).
  const { data: criteriaData } = useSearchCriteriaList(false)
  const perimeters = computed(() =>
    criteriaFeatures(criteriaData.value ?? [], null)
  )
  const retainedArea = computed(() =>
    props.context.precision === 'district'
      ? listingAreaCollection(areas.data.value, props.context.listingId)
      : listingAreaCollection(null, null)
  )

  function onToggle(key: SurroundingsLayerKey, event: Event): void {
    toggles.value = {
      ...toggles.value,
      [key]: (event.target as HTMLInputElement).checked,
    }
  }

  function feature(
    coordinates: [number, number],
    kind: string,
    label: string,
    extra: Record<string, unknown> = {}
  ) {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates },
      properties: { ...extra, label, marker: kind },
    }
  }

  /** Les équipements les plus proches du contexte, comme ceux des couches. */
  const nearest = computed(() => {
    const s = props.context.surroundings
    const drives = [
      s.supermarkets.preferred.carrefour,
      s.supermarkets.preferred.auchan,
      s.supermarkets.preferred.intermarche,
      s.supermarkets.nearest,
    ].filter((d): d is NearbyAmenity => d !== null)
    const unique = (list: NearbyAmenity[]) =>
      list.filter(
        (item, index) =>
          list.findIndex(other => other.externalId === item.externalId) ===
          index
      )
    const asFeature = (a: NearbyAmenity) =>
      feature(a.point.coordinates, a.kind, a.name, {
        kind: a.kind,
        name: a.name,
        brand: a.brand,
        brandGroup: a.brandGroup,
        drive: a.drive,
        address: a.address,
        commune: a.commune,
        source: a.source,
        facilityType: a.details.facilityType,
        covered: a.details.covered,
        lengthMeters: a.details.lengthMeters,
        access: a.details.access.length ? a.details.access.join(', ') : null,
      })
    return {
      athletics: s.athleticsTrack.nearest
        ? [asFeature(s.athleticsTrack.nearest)]
        : [],
      drives: unique(drives).map(asFeature),
      fitness: s.fitnessPark.nearest ? [asFeature(s.fitnessPark.nearest)] : [],
    }
  })

  /** Le contour du quartier de l'annonce, lu dans la couche des contours. */
  const NEIGHBOURHOOD_CURRENT_SOURCE = 'neighbourhood-current'
  const current = computed(() => {
    const code = props.context.surroundings.neighbourhood.value?.code
    if (!code || !toggles.value.neighbourhoods) return null
    return (
      layers.value.neighbourhoods?.features.find(
        f => f.properties.code === code
      ) ?? null
    )
  })

  /** La couche complète si elle est allumée, sinon les seuls plus proches. */
  function amenityData(key: 'athletics' | 'drives' | 'fitness'): unknown {
    const full = toggles.value[key] ? layers.value[key] : null
    return full ?? { type: 'FeatureCollection', features: nearest.value[key] }
  }

  function render(): void {
    if (!map || !ready.value) return
    const c = props.context
    upsertGeoJsonLayer(
      map,
      'neighbourhoods',
      toggles.value.neighbourhoods ? layers.value.neighbourhoods : null,
      NEIGHBOURHOOD_LAYERS,
      SURROUNDINGS_ATTRIBUTIONS.neighbourhoods
    )
    upsertGeoJsonLayer(
      map,
      NEIGHBOURHOOD_CURRENT_SOURCE,
      {
        type: 'FeatureCollection',
        features: current.value ? [current.value] : [],
      },
      NEIGHBOURHOOD_CURRENT_LAYERS
    )
    upsertGeoJsonLayer(
      map,
      NEIGHBOURHOOD_HOVER_SOURCE,
      null,
      NEIGHBOURHOOD_HOVER_LAYERS
    )
    upsertGeoJsonLayer(
      map,
      'criteria-perimeters',
      perimeters.value,
      CRITERIA_LAYERS
    )
    upsertGeoJsonLayer(
      map,
      LISTING_AREA_SOURCE,
      retainedArea.value,
      LISTING_AREA_LAYERS
    )
    upsertGeoJsonLayer(
      map,
      'context-comparables',
      {
        type: 'FeatureCollection',
        features: c.market.comparables
          .filter(s => s.point)
          .map(s =>
            feature(
              s.point?.coordinates as [number, number],
              'dvf',
              `${s.mutationDate} · ${Math.round(s.pricePerM2)} €/m²`
            )
          ),
      },
      pointLayer('context-comparables-points', '#7c3aed', 4)
    )
    upsertGeoJsonLayer(
      map,
      'context-tram',
      {
        type: 'FeatureCollection',
        features: c.transit.nearestTram
          ? [
              feature(
                c.transit.nearestTram.point.coordinates,
                'tram',
                c.transit.nearestTram.name,
                {
                  name: c.transit.nearestTram.name,
                  mode: 'tram',
                  lines: c.transit.nearestTram.lines.join(', '),
                }
              ),
            ]
          : [],
      },
      pointLayer('context-tram-point', '#dc2626', 6)
    )
    upsertGeoJsonLayer(
      map,
      'athletics',
      amenityData('athletics'),
      ATHLETICS_LAYERS,
      SURROUNDINGS_ATTRIBUTIONS.athletics
    )
    upsertGeoJsonLayer(
      map,
      'fitness',
      amenityData('fitness'),
      FITNESS_LAYERS,
      SURROUNDINGS_ATTRIBUTIONS.osm
    )
    upsertGeoJsonLayer(
      map,
      'drives',
      amenityData('drives'),
      DRIVE_LAYERS,
      SURROUNDINGS_ATTRIBUTIONS.osm
    )
    upsertGeoJsonLayer(
      map,
      'context-listing',
      {
        type: 'FeatureCollection',
        features: c.point
          ? [feature(c.point.coordinates, 'listing', 'Annonce')]
          : [],
      },
      pointLayer('context-listing-point', '#0e6b63', 7)
    )
  }

  const hoverLabel = ref<string | null>(null)
  const hoverPoint = ref<{ x: number; y: number } | null>(null)

  function destroy(): void {
    map?.remove()
    map = null
    ready.value = false
  }

  /**
   * La carte suit le point de l'annonce : créée quand il existe (y compris
   * après une relance du géocodage), recentrée quand il change, retirée
   * quand il disparaît.
   */
  function sync(): void {
    const point = props.context.point
    if (!point) {
      destroy()
      return
    }
    if (map) {
      map.jumpTo({ center: point.coordinates })
      return
    }
    if (!container.value) return
    const created = new maplibregl.Map({
      container: container.value,
      ...styleOptions(),
      center: point.coordinates,
      zoom: 14.5,
      attributionControl: { compact: true },
    })
    map = created
    created.on('load', () => {
      ready.value = true
      render()
      // Cadrage initial : l'annonce et ses équipements proches (3 km au plus).
      const frame = surroundingsFrame(props.context)
      if (frame) {
        created.fitBounds(frame, { padding: 40, maxZoom: 15, animate: false })
      }
    })
    bindNeighbourhoodHover(created, {
      features: () =>
        toggles.value.neighbourhoods
          ? (layers.value.neighbourhoods ?? null)
          : null,
      onHover: (label, at) => {
        hoverLabel.value = label
        hoverPoint.value = at
      },
    })
    created.on('click', event => {
      if (!ready.value) return
      const hit =
        created.queryRenderedFeatures(event.point, {
          layers: [...POPUP_LAYER_IDS, 'context-tram-point'],
        })[0] ??
        (toggles.value.neighbourhoods
          ? created.queryRenderedFeatures(event.point, {
              layers: [NEIGHBOURHOOD_HIT_LAYER],
            })[0]
          : undefined)
      if (!hit) return
      new maplibregl.Popup({ offset: 8, closeButton: false })
        .setLngLat(event.lngLat)
        .setHTML(
          hit.layer.id === NEIGHBOURHOOD_HIT_LAYER
            ? neighbourhoodPopupHtml(hit.properties)
            : layerFeaturePopupHtml(hit)
        )
        .addTo(created)
    })
  }

  onMounted(sync)
  onBeforeUnmount(destroy)

  watch(() => props.context.point?.coordinates.join(','), sync, {
    flush: 'post',
  })
  watch(
    () => [
      props.context,
      toggles.value,
      layers.value,
      retainedArea.value,
      perimeters.value,
    ],
    render,
    { deep: true }
  )
</script>

<template>
  <div v-if="context.point" class="grid gap-2">
    <div
      class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
      role="group"
      aria-label="Couches de la carte du quartier"
    >
      <span class="text-muted">Couches :</span>
      <label
        v-for="layer in LAYER_LABELS"
        :key="layer.key"
        class="flex min-h-8 items-center gap-1"
      >
        <input
          type="checkbox"
          class="accent-accent"
          :checked="toggles[layer.key]"
          :data-layer="layer.key"
          @change="onToggle(layer.key, $event)"
        />
        {{ layer.label }}
      </label>
      <SurroundingsLegend :toggles="toggles" />
      <span
        v-if="retainedArea.features.length"
        class="flex items-center gap-1 text-muted"
        data-testid="retained-area-legend"
      >
        <span
          class="inline-block h-2.5 w-4 rounded-sm border-2 border-dashed"
          :style="{ borderColor: LISTING_AREA_COLOR }"
          aria-hidden="true"
        />
        quartier retenu (repère en son centre)
      </span>
      <span
        v-if="perimeters.features.length"
        class="flex items-center gap-1 text-muted"
        data-testid="criteria-perimeters-legend"
      >
        <span
          class="inline-block h-2.5 w-4 rounded-sm border-2 border-dashed border-accent bg-accent-soft"
          aria-hidden="true"
        />
        périmètres des critères actifs
      </span>
    </div>
    <div class="relative">
      <div
        ref="container"
        class="h-64 w-full overflow-hidden rounded-lg border border-line sm:h-72"
        role="region"
        aria-label="Carte du quartier : annonce, tram, équipements, ventes comparables"
      />
      <BaseMapSwitcher
        class="absolute top-2 left-2 z-10"
        :model-value="baseMap"
        @update:model-value="setBaseMap"
      />
      <div
        v-if="hoverLabel && hoverPoint"
        class="pointer-events-none absolute z-10 rounded-md bg-surface px-2 py-1 text-xs font-medium text-fg shadow"
        :style="{
          left: `${hoverPoint.x + 12}px`,
          top: `${hoverPoint.y + 12}px`,
        }"
        data-testid="neighbourhood-hover"
      >
        {{ hoverLabel }}
      </div>
    </div>
  </div>
</template>
