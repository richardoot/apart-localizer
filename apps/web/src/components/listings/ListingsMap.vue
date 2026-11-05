<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import '@/lib/maplibre-worker'
  import * as maplibregl from 'maplibre-gl'
  import type { Map as MapLibreMap, Marker } from 'maplibre-gl'
  import type { EvaluatedListing, PointRadius } from '@apart/contracts'
  import { useBaseMap } from '@/composables/useBaseMap'
  import type {
    MapLayerData,
    MapLayerToggles,
  } from '@/composables/useMapLayers'
  import { DEFAULT_LAYER_TOGGLES } from '@/composables/useMapLayers'
  import { circlePolygon } from '@/lib/geo-circle'
  import {
    ATHLETICS_LAYERS,
    CRITERIA_LAYERS,
    DRIVE_LAYERS,
    FITNESS_LAYERS,
    NEIGHBOURHOOD_HIT_LAYER,
    NEIGHBOURHOOD_HOVER_LAYERS,
    NEIGHBOURHOOD_HOVER_SOURCE,
    NEIGHBOURHOOD_LAYERS,
    POPUP_LAYER_IDS,
    RENT_ZONE_COLORS,
    RENT_ZONE_LAYERS,
    SURROUNDINGS_ATTRIBUTIONS,
    bindNeighbourhoodHover,
    layerFeaturePopupHtml,
    neighbourhoodPopupHtml,
    perimeterLayers,
    pointLayer,
    upsertGeoJsonLayer,
  } from '@/lib/map-layers'
  import { formatDistance, formatEuros, formatPercent } from '@/lib/format'
  import {
    LISTING_STATUS_LABELS,
    VERDICT_COLORS,
    VERDICT_LABELS,
  } from '@/lib/labels'
  import {
    DEFAULT_MAP_CENTER,
    DEFAULT_MAP_ZOOM,
    DEFAULT_RADIUS_METERS,
    RADIUS_STEPS,
  } from '@/lib/map-style'
  import BaseMapSwitcher from '@/components/map/BaseMapSwitcher.vue'
  import SurroundingsLegend from '@/components/map/SurroundingsLegend.vue'

  const props = withDefaults(
    defineProps<{
      items: EvaluatedListing[]
      near: PointRadius | undefined
      colorBy: 'verdict' | 'status'
      layers?: MapLayerData | null
      toggles?: MapLayerToggles
    }>(),
    { layers: null, toggles: () => ({ ...DEFAULT_LAYER_TOGGLES }) }
  )
  const emit = defineEmits<{
    open: [id: string]
    'update:near': [near: PointRadius | undefined]
    'update:toggles': [toggles: MapLayerToggles]
    bounds: [bbox: [number, number, number, number]]
  }>()

  const LAYER_LABELS: { key: keyof MapLayerToggles; label: string }[] = [
    { key: 'criteria', label: 'Périmètres des critères' },
    { key: 'tram', label: 'Arrêts de tram' },
    { key: 'bus', label: 'Arrêts de bus' },
    { key: 'dvf', label: 'Ventes DVF (3 ans)' },
    { key: 'rentZones', label: 'Zones d’encadrement' },
    { key: 'neighbourhoods', label: 'Quartiers' },
    { key: 'athletics', label: 'Pistes d’athlétisme' },
    { key: 'drives', label: 'Supermarchés drive' },
    { key: 'fitness', label: 'Fitness Park' },
  ]

  function toggle(key: keyof MapLayerToggles, event: Event): void {
    emit('update:toggles', {
      ...props.toggles,
      [key]: (event.target as HTMLInputElement).checked,
    })
  }

  /** Les couches de contexte, sous les marqueurs ; une couche éteinte reçoit des données vides. */
  function renderLayers(): void {
    if (!map || !ready.value) return
    const on = props.toggles
    const data = props.layers
    upsertGeoJsonLayer(
      map,
      'rent-zones',
      on.rentZones ? data?.rentZones : null,
      RENT_ZONE_LAYERS
    )
    upsertGeoJsonLayer(
      map,
      'neighbourhoods',
      on.neighbourhoods ? data?.neighbourhoods : null,
      NEIGHBOURHOOD_LAYERS,
      SURROUNDINGS_ATTRIBUTIONS.neighbourhoods
    )
    if (!on.neighbourhoods) hoverLabel.value = null
    upsertGeoJsonLayer(
      map,
      NEIGHBOURHOOD_HOVER_SOURCE,
      null,
      NEIGHBOURHOOD_HOVER_LAYERS
    )
    upsertGeoJsonLayer(
      map,
      'criteria-perimeters',
      on.criteria ? data?.criteria : null,
      CRITERIA_LAYERS
    )
    upsertGeoJsonLayer(
      map,
      'dvf-sales',
      on.dvf ? data?.dvf : null,
      pointLayer('dvf-sales-points', '#7c3aed', 3)
    )
    upsertGeoJsonLayer(
      map,
      'bus-stops',
      on.bus ? data?.bus : null,
      pointLayer('bus-stops-points', '#6b7280', 2.5)
    )
    upsertGeoJsonLayer(
      map,
      'tram-stops',
      on.tram ? data?.tram : null,
      pointLayer('tram-stops-points', '#dc2626', 4)
    )
    upsertGeoJsonLayer(
      map,
      'athletics',
      on.athletics ? data?.athletics : null,
      ATHLETICS_LAYERS,
      SURROUNDINGS_ATTRIBUTIONS.athletics
    )
    upsertGeoJsonLayer(
      map,
      'fitness',
      on.fitness ? data?.fitness : null,
      FITNESS_LAYERS,
      SURROUNDINGS_ATTRIBUTIONS.osm
    )
    upsertGeoJsonLayer(
      map,
      'drives',
      on.drives ? data?.drives : null,
      DRIVE_LAYERS,
      SURROUNDINGS_ATTRIBUTIONS.osm
    )
  }

  /** Le nom du quartier survolé, près du pointeur (lot 11). */
  const hoverLabel = ref<string | null>(null)
  const hoverPoint = ref<{ x: number; y: number } | null>(null)

  function emitBounds(): void {
    const bounds = map?.getBounds()
    if (!bounds) return
    const [[west, south], [east, north]] = bounds.toArray() as [
      [number, number],
      [number, number],
    ]
    emit('bounds', [west, south, east, north])
  }

  const container = ref<HTMLDivElement | null>(null)
  let map: MapLibreMap | null = null
  let markers: Marker[] = []
  const ready = ref(false)
  const { baseMap, setBaseMap, styleOptions } = useBaseMap(() => map)
  const radius = ref(props.near?.radiusMeters ?? DEFAULT_RADIUS_METERS)
  const radiusIndex = ref(Math.max(0, RADIUS_STEPS.indexOf(radius.value)))

  const STATUS_COLORS: Record<string, string> = {
    to_study: 'var(--muted)',
    to_visit: 'var(--accent)',
    visited: 'var(--accent)',
    offer_made: 'var(--good)',
    offer_accepted: 'var(--good)',
    offer_refused: 'var(--bad)',
    discarded: 'var(--line)',
    sold_or_withdrawn: 'var(--line)',
  }

  function colorOf(item: EvaluatedListing): string {
    return props.colorBy === 'status'
      ? (STATUS_COLORS[item.listing.status] ?? 'var(--muted)')
      : VERDICT_COLORS[item.evaluation.metrics.verdict]
  }

  function markerElement(item: EvaluatedListing): HTMLElement {
    const el = document.createElement('button')
    el.type = 'button'
    el.className =
      'h-4 w-4 rounded-full border-2 border-white shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent'
    el.style.background = colorOf(item)
    el.setAttribute('aria-label', item.listing.title)
    el.dataset.id = item.listing.id
    if (item.isNewForMe) el.classList.add('ring-2', 'ring-accent')
    return el
  }

  function popupHtml(item: EvaluatedListing): string {
    const esc = (s: string): string =>
      s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
    const m = item.evaluation.metrics
    const distance =
      item.distanceMeters !== null
        ? ` · à ${formatDistance(item.distanceMeters)}`
        : ''
    return (
      `<strong>${esc(item.listing.title)}</strong><br>` +
      `${esc(formatEuros(item.listing.price))} · brut ${esc(formatPercent(m.grossYield))} · ${esc(VERDICT_LABELS[m.verdict])}<br>` +
      `<span style="opacity:.7">${esc(LISTING_STATUS_LABELS[item.listing.status])}${esc(distance)}</span><br>` +
      `<button type="button" data-open="${esc(item.listing.id)}" style="margin-top:6px;color:var(--accent);text-decoration:underline">Ouvrir la fiche</button>`
    )
  }

  function renderMarkers(): void {
    if (!map) return
    for (const marker of markers) marker.remove()
    markers = []
    for (const item of props.items) {
      const point = item.listing.location.point
      if (!point) continue
      const popup = new maplibregl.Popup({
        offset: 12,
        closeButton: false,
      }).setHTML(popupHtml(item))
      popup.on('open', () => {
        popup
          .getElement()
          ?.querySelector<HTMLButtonElement>('[data-open]')
          ?.addEventListener('click', () => emit('open', item.listing.id))
      })
      const marker = new maplibregl.Marker({ element: markerElement(item) })
        .setLngLat(point.coordinates)
        .setPopup(popup)
        .addTo(map)
      markers.push(marker)
    }
  }

  const RADIUS_SOURCE = 'near-radius'
  const RADIUS_LAYERS = perimeterLayers(RADIUS_SOURCE, '#0e6b63')

  function renderRadius(): void {
    if (!map || !ready.value) return
    const feature = props.near
      ? {
          type: 'Feature' as const,
          properties: {},
          geometry: circlePolygon(
            {
              type: 'Point',
              coordinates: [props.near.longitude, props.near.latitude],
            },
            props.near.radiusMeters
          ),
        }
      : null
    upsertGeoJsonLayer(
      map,
      RADIUS_SOURCE,
      { type: 'FeatureCollection', features: feature ? [feature] : [] },
      RADIUS_LAYERS
    )
  }

  function setCenter(lng: number, lat: number): void {
    emit('update:near', {
      longitude: Math.round(lng * 1e6) / 1e6,
      latitude: Math.round(lat * 1e6) / 1e6,
      radiusMeters: radius.value,
    })
  }

  function onRadiusInput(event: Event): void {
    const index = Number((event.target as HTMLInputElement).value)
    radiusIndex.value = index
    radius.value = RADIUS_STEPS[index] ?? DEFAULT_RADIUS_METERS
    if (props.near) {
      emit('update:near', { ...props.near, radiusMeters: radius.value })
    }
  }

  onMounted(() => {
    if (!container.value) return
    const created = new maplibregl.Map({
      container: container.value,
      ...styleOptions(),
      center: props.near
        ? [props.near.longitude, props.near.latitude]
        : DEFAULT_MAP_CENTER,
      zoom: props.near ? 13 : DEFAULT_MAP_ZOOM,
      attributionControl: { compact: true },
    })
    map = created
    created.addControl(new maplibregl.NavigationControl(), 'top-right')
    created.on('load', () => {
      ready.value = true
      renderLayers()
      renderRadius()
      emitBounds()
    })
    created.on('moveend', emitBounds)
    bindNeighbourhoodHover(created, {
      features: () =>
        props.toggles.neighbourhoods
          ? (props.layers?.neighbourhoods ?? null)
          : null,
      onHover: (label, point) => {
        hoverLabel.value = label
        hoverPoint.value = point
      },
    })
    created.on('click', event => {
      // Un arrêt ou une vente sous le clic : sa fiche, sans déplacer le point.
      const hit = ready.value
        ? created.queryRenderedFeatures(event.point, {
            layers: [...POPUP_LAYER_IDS],
          })[0]
        : undefined
      if (hit) {
        new maplibregl.Popup({ offset: 8, closeButton: false })
          .setLngLat(event.lngLat)
          .setHTML(layerFeaturePopupHtml(hit))
          .addTo(created)
        return
      }
      // Le quartier sous le clic (utile sans survol, sur un téléphone) ; le
      // clic place aussi le point du filtre, comme sans la couche.
      const area =
        ready.value && props.toggles.neighbourhoods
          ? created.queryRenderedFeatures(event.point, {
              layers: [NEIGHBOURHOOD_HIT_LAYER],
            })[0]
          : undefined
      if (area) {
        new maplibregl.Popup({ offset: 8, closeButton: false })
          .setLngLat(event.lngLat)
          .setHTML(neighbourhoodPopupHtml(area.properties))
          .addTo(created)
      }
      setCenter(event.lngLat.lng, event.lngLat.lat)
    })
    renderMarkers()
  })

  onBeforeUnmount(() => {
    for (const marker of markers) marker.remove()
    map?.remove()
    map = null
  })

  watch(() => [props.items, props.colorBy], renderMarkers, { deep: false })
  watch(() => [props.layers, props.toggles], renderLayers, { deep: true })
  watch(
    () => props.near,
    near => {
      if (near) {
        radius.value = near.radiusMeters
        radiusIndex.value = Math.max(0, RADIUS_STEPS.indexOf(near.radiusMeters))
      }
      renderRadius()
    }
  )

  defineExpose({ setCenter })
</script>

<template>
  <div class="grid gap-2">
    <div
      class="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm"
    >
      <span class="text-muted">
        {{
          near
            ? 'Cliquez sur la carte pour déplacer le point.'
            : 'Cliquez sur la carte pour filtrer autour d’un point.'
        }}
      </span>
      <label class="flex items-center gap-2">
        <span class="text-xs text-muted">Rayon</span>
        <input
          type="range"
          class="accent-accent"
          min="0"
          :max="RADIUS_STEPS.length - 1"
          step="1"
          :value="radiusIndex"
          aria-label="Rayon du filtre"
          @input="onRadiusInput"
        />
        <span class="font-mono text-xs" data-testid="radius-label">{{
          formatDistance(radius)
        }}</span>
      </label>
      <button
        v-if="near"
        type="button"
        class="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:text-fg"
        @click="emit('update:near', undefined)"
      >
        Retirer le point
      </button>
      <span class="ml-auto text-xs text-muted">
        {{ items.filter(i => i.listing.location.point).length }} annonce(s)
        placée(s)
      </span>
    </div>
    <div
      class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
      role="group"
      aria-label="Couches de la carte"
    >
      <span class="text-muted">Couches :</span>
      <label
        v-for="layer in LAYER_LABELS"
        :key="layer.key"
        class="flex items-center gap-1"
      >
        <input
          type="checkbox"
          class="accent-accent"
          :checked="toggles[layer.key]"
          :data-layer="layer.key"
          @change="toggle(layer.key, $event)"
        />
        {{ layer.label }}
      </label>
      <SurroundingsLegend :toggles="toggles" />
      <span
        v-if="toggles.rentZones"
        class="flex items-center gap-2 text-muted"
        data-testid="rent-zone-legend"
      >
        Zones :
        <span
          v-for="(color, zone) in RENT_ZONE_COLORS"
          :key="zone"
          class="flex items-center gap-1"
        >
          <span
            class="inline-block h-2.5 w-2.5 rounded-sm"
            :style="{ background: color }"
          />{{ zone }}
        </span>
      </span>
    </div>
    <div class="relative">
      <div
        ref="container"
        class="h-[60vh] min-h-[360px] w-full overflow-hidden rounded-xl border border-line"
        role="region"
        aria-label="Carte des annonces"
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
