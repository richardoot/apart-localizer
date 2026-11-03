<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import * as maplibregl from 'maplibre-gl'
  import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl'
  import type { EvaluatedListing, PointRadius } from '@apart/contracts'
  import { circlePolygon } from '@/lib/geo-circle'
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
    mapStyleUrl,
  } from '@/lib/map-style'

  const props = defineProps<{
    items: EvaluatedListing[]
    near: PointRadius | undefined
    colorBy: 'verdict' | 'status'
  }>()
  const emit = defineEmits<{
    open: [id: string]
    'update:near': [near: PointRadius | undefined]
  }>()

  const container = ref<HTMLDivElement | null>(null)
  let map: MapLibreMap | null = null
  let markers: Marker[] = []
  const ready = ref(false)
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

  function renderRadius(): void {
    if (!map || !ready.value) return
    const source = map.getSource(RADIUS_SOURCE) as GeoJSONSource | undefined
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
    const data = {
      type: 'FeatureCollection' as const,
      features: feature ? [feature] : [],
    }
    if (source) {
      source.setData(data)
      return
    }
    map.addSource(RADIUS_SOURCE, { type: 'geojson', data })
    map.addLayer({
      id: `${RADIUS_SOURCE}-fill`,
      type: 'fill',
      source: RADIUS_SOURCE,
      paint: { 'fill-color': '#0e6b63', 'fill-opacity': 0.12 },
    })
    map.addLayer({
      id: `${RADIUS_SOURCE}-line`,
      type: 'line',
      source: RADIUS_SOURCE,
      paint: { 'line-color': '#0e6b63', 'line-width': 2 },
    })
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
      style: mapStyleUrl(import.meta.env),
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
      renderRadius()
    })
    created.on('click', event => setCenter(event.lngLat.lng, event.lngLat.lat))
    renderMarkers()
  })

  onBeforeUnmount(() => {
    for (const marker of markers) marker.remove()
    map?.remove()
    map = null
  })

  watch(() => [props.items, props.colorBy], renderMarkers, { deep: false })
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
      ref="container"
      class="h-[60vh] min-h-[360px] w-full overflow-hidden rounded-xl border border-line"
      role="region"
      aria-label="Carte des annonces"
    />
  </div>
</template>
