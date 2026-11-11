<script setup lang="ts">
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiSegmented from '@/components/ui/UiSegmented.vue'
  import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    useId,
    watch,
  } from 'vue'
  import '@/lib/maplibre-worker'
  import * as maplibregl from 'maplibre-gl'
  import type { Map as MapLibreMap, Marker } from 'maplibre-gl'
  import { LISTING_PORTAL_LABELS } from '@apart/contracts'
  import type {
    EvaluatedListing,
    LayerFeatureCollection,
    PointRadius,
  } from '@apart/contracts'
  import {
    locationApproximation,
    orderLinks,
    precisionBadge,
    sellerListLabel,
  } from '@apart/domain'
  import type { PrecisionTone } from '@apart/domain'
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
    LISTING_AREA_LAYERS,
    LISTING_AREA_SOURCE,
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
    listingAreaCollection,
    neighbourhoodPopupHtml,
    perimeterLayers,
    pointLayer,
    upsertGeoJsonLayer,
  } from '@/lib/map-layers'
  import {
    formatDistance,
    formatEuros,
    formatPercent,
    plural,
  } from '@/lib/format'
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
  import { useMediaQuery } from '@/composables/useMediaQuery'
  import {
    COARSE_POINTER_QUERY,
    activeLayerCount,
    layersButtonLabel,
    placingHint,
    roundCoordinate,
  } from '@/lib/map-draw'

  /**
   * La carte des annonces. Lot 26 (ADR 0036) : peu de chrome au-dessus de la
   * carte. Une ligne d'outils : « Filtrer autour d'un point » (le clic
   * suivant pose le point, et seulement lui : un clic ordinaire ne filtre
   * plus rien), le rayon quand un point est posé, « Couches et légende ».
   * Couches, légendes, couleur des repères et fond de carte sont repliés dans
   * un panneau posé sur la carte. Au toucher, un doigt fait défiler la page,
   * deux doigts déplacent la carte (`cooperativeGestures`).
   */

  const props = withDefaults(
    defineProps<{
      items: EvaluatedListing[]
      near: PointRadius | undefined
      colorBy: 'verdict' | 'status'
      layers?: MapLayerData | null
      toggles?: MapLayerToggles
      /** Lot 12 : contours des annonces placées au quartier (`GET /listings/areas`). */
      areas?: LayerFeatureCollection | null
    }>(),
    {
      layers: null,
      toggles: () => ({ ...DEFAULT_LAYER_TOGGLES }),
      areas: null,
    }
  )
  const emit = defineEmits<{
    open: [id: string]
    'update:near': [near: PointRadius | undefined]
    'update:toggles': [toggles: MapLayerToggles]
    'update:colorBy': [colorBy: 'verdict' | 'status']
    bounds: [bbox: [number, number, number, number]]
  }>()

  const coarse = useMediaQuery(COARSE_POINTER_QUERY)
  /** Le placement du point est ouvert : le prochain clic sur la carte le pose. */
  const placing = ref(false)
  const layersOpen = ref(false)
  const panelId = useId()
  const layersButton = ref<{ $el?: HTMLElement } | null>(null)
  const layerCount = computed(() => activeLayerCount(props.toggles))
  const COLOR_OPTIONS: { value: 'verdict' | 'status'; label: string }[] = [
    { value: 'verdict', label: 'par rentabilité' },
    { value: 'status', label: 'par statut' },
  ]
  const colorModel = computed({
    get: () => props.colorBy,
    set: value => emit('update:colorBy', value),
  })

  function closeLayers(): void {
    layersOpen.value = false
    void nextTick(() => layersButton.value?.$el?.focus?.())
  }

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
    renderArea()
  }

  // Lot 12 : le contour du quartier d'un repère au quartier, au survol (ou
  // au focus) de son repère, et tant que sa fenêtre est ouverte.
  const hoveredId = ref<string | null>(null)
  const selectedId = ref<string | null>(null)
  const shownAreaId = computed(() => hoveredId.value ?? selectedId.value)
  function renderArea(): void {
    if (!map || !ready.value) return
    upsertGeoJsonLayer(
      map,
      LISTING_AREA_SOURCE,
      listingAreaCollection(props.areas, shownAreaId.value),
      LISTING_AREA_LAYERS
    )
  }

  /** Combien de repères de chaque sorte, pour la légende. */
  const precisionCounts = computed(() => {
    const counts = { address: 0, district: 0, commune: 0 }
    for (const item of props.items) {
      const tone = precisionBadge(item.listing.location).tone
      if (tone === 'exact' || tone === 'street') counts.address++
      else if (tone === 'district') counts.district++
      else if (tone === 'commune') counts.commune++
    }
    return counts
  })

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

  /**
   * Lot 12 : la forme du repère dit sa précision. Point plein (cerclé de
   * blanc) pour une adresse au numéro ou à la rue ; anneau creux plus grand,
   * de la couleur, liseré de blanc, pour un repère au centre du quartier ;
   * anneau pâle en pointillé pour le centre de la commune.
   */
  const MARKER_SHAPES: Record<PrecisionTone, string> = {
    exact: 'h-4 w-4 rounded-full border-2 border-white shadow',
    street: 'h-4 w-4 rounded-full border-2 border-white shadow',
    district:
      'h-5 w-5 rounded-full border-[3px] shadow-[0_0_0_2px_rgba(255,255,255,0.9)]',
    commune:
      'h-5 w-5 rounded-full border-2 border-dashed opacity-75 shadow-[0_0_0_1px_rgba(255,255,255,0.8)]',
    none: 'h-4 w-4 rounded-full border-2 border-white shadow',
  }

  function markerElement(item: EvaluatedListing): HTMLElement {
    const el = document.createElement('button')
    el.type = 'button'
    const badge = precisionBadge(item.listing.location)
    el.className = `${MARKER_SHAPES[badge.tone]} cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent`
    const color = colorOf(item)
    if (badge.tone === 'district' || badge.tone === 'commune') {
      // Creux : la carte se voit au centre ; seul l'anneau porte la couleur.
      el.style.background = 'transparent'
      el.style.borderColor = color
    } else {
      el.style.background = color
    }
    el.dataset.precision = badge.tone
    el.setAttribute('aria-label', `${item.listing.title} — ${badge.label}`)
    el.title = badge.label
    el.dataset.id = item.listing.id
    if (item.isNewForMe) el.classList.add('ring-2', 'ring-accent')
    if (badge.tone === 'district') {
      const show = () => {
        hoveredId.value = item.listing.id
        renderArea()
      }
      const hide = () => {
        if (hoveredId.value !== item.listing.id) return
        hoveredId.value = null
        renderArea()
      }
      el.addEventListener('mouseenter', show)
      el.addEventListener('focus', show)
      el.addEventListener('mouseleave', hide)
      el.addEventListener('blur', hide)
    }
    return el
  }

  function popupHtml(item: EvaluatedListing): string {
    const esc = (s: string): string =>
      s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
    const m = item.evaluation.metrics
    const distance =
      item.distanceMeters !== null
        ? ` · à ${locationApproximation(item.listing.location).approximate ? '≈ ' : ''}${formatDistance(item.distanceMeters)}`
        : ''
    const badge = precisionBadge(item.listing.location)
    // Lot 18 : les portails (barrés : plus en ligne) et le vendeur.
    const portals = orderLinks(item.links)
      .map(link =>
        link.online
          ? esc(LISTING_PORTAL_LABELS[link.portal])
          : `<s title="plus en ligne">${esc(LISTING_PORTAL_LABELS[link.portal])}</s>`
      )
      .join(' · ')
    const where = portals
      ? `<span data-portals style="opacity:.7">Sur ${portals} · ${esc(sellerListLabel(item.listing.sellerType))}</span><br>`
      : ''
    return (
      `<strong>${esc(item.listing.title)}</strong><br>` +
      `${esc(formatEuros(item.listing.price))} · brut ${esc(formatPercent(m.grossYield))} · ${esc(VERDICT_LABELS[m.verdict])}<br>` +
      `<span style="opacity:.7">${esc(LISTING_STATUS_LABELS[item.listing.status])}${esc(distance)}</span><br>` +
      `<span data-precision="${esc(badge.tone)}" style="opacity:.7">Repère : ${esc(badge.label)}</span><br>` +
      where +
      // Lot 22 : HTML de la bulle MapLibre (pas de composant Vue possible ici).
      `<button type="button" data-open="${esc(item.listing.id)}" style="min-height:44px;margin-top:2px;color:var(--accent);text-decoration:underline">Ouvrir la fiche</button>`
    )
  }

  function renderMarkers(): void {
    if (!map) return
    for (const marker of markers) marker.remove()
    markers = []
    // Les repères sont recréés, leurs fenêtres fermées : plus de contour montré.
    hoveredId.value = null
    selectedId.value = null
    renderArea()
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
        selectedId.value = item.listing.id
        renderArea()
      })
      popup.on('close', () => {
        if (selectedId.value !== item.listing.id) return
        selectedId.value = null
        renderArea()
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
      longitude: roundCoordinate(lng),
      latitude: roundCoordinate(lat),
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
      // Lot 26 : au toucher, un doigt fait défiler la page, deux déplacent la carte.
      cooperativeGestures: coarse.value,
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
      // Lot 26 : le point du filtre ne se pose que si on l'a demandé.
      if (placing.value) {
        placing.value = false
        setCenter(event.lngLat.lng, event.lngLat.lat)
        return
      }
      // Un arrêt ou une vente sous le clic : sa fiche.
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
      // Le quartier sous le clic (utile sans survol, sur un téléphone).
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
  watch(() => props.areas, renderArea)
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
    <!-- Lot 26 : une seule ligne d'outils au-dessus de la carte. -->
    <div
      class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm"
      data-testid="map-toolbar"
    >
      <template v-if="placing">
        <span
          class="font-medium text-fg"
          role="status"
          data-testid="placing-hint"
        >
          {{ placingHint(coarse) }}
        </span>
        <UiButton
          size="sm"
          data-testid="placing-cancel"
          @click="placing = false"
        >
          Annuler
        </UiButton>
      </template>
      <UiButton
        v-else-if="!near"
        size="sm"
        icon="map-pin"
        data-testid="near-start"
        @click="placing = true"
      >
        Filtrer autour d’un point
      </UiButton>
      <template v-else>
        <label class="flex items-center gap-2">
          <span class="text-sm text-muted">Rayon</span>
          <!-- Lot 22 : contrôle de carte (curseur du rayon), sans équivalent partagé. -->
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
          <span class="font-mono text-sm" data-testid="radius-label">{{
            formatDistance(radius)
          }}</span>
        </label>
        <UiButton size="sm" data-testid="near-move" @click="placing = true">
          Déplacer le point
        </UiButton>
        <UiButton
          size="sm"
          icon="close"
          data-testid="near-clear"
          @click="emit('update:near', undefined)"
        >
          Retirer le point
        </UiButton>
      </template>
      <UiButton
        ref="layersButton"
        size="sm"
        icon="sliders"
        :aria-expanded="layersOpen"
        :aria-controls="panelId"
        data-testid="layers-toggle"
        @click="layersOpen = !layersOpen"
      >
        {{ layersButtonLabel(layerCount) }}
      </UiButton>
      <span class="ml-auto text-sm text-muted">
        {{
          plural(
            items.filter(i => i.listing.location.point).length,
            'annonce placée',
            'annonces placées'
          )
        }}
      </span>
    </div>
    <div class="relative">
      <div
        ref="container"
        class="h-[calc(100dvh-var(--bottom-nav,0px)-16rem)] min-h-[360px] w-full overflow-hidden rounded-2xl border border-line sm:h-[60vh]"
        :class="placing ? 'ring-2 ring-accent' : ''"
        role="region"
        aria-label="Carte des annonces"
      />
      <!-- Lot 26 : couches, légendes, couleur et fond repliés, posés sur la carte. -->
      <div
        v-show="layersOpen"
        :id="panelId"
        role="group"
        aria-label="Couches et légende"
        class="absolute top-2 left-2 z-10 grid max-h-[calc(100%-1rem)] w-[min(22rem,calc(100%-4.5rem))] gap-3 overflow-y-auto rounded-xl border border-line bg-surface p-3 text-sm text-fg shadow-lg"
        data-testid="layers-panel"
        @keydown.esc.stop="closeLayers"
      >
        <div class="flex items-center justify-between gap-2">
          <strong class="font-semibold">Couches et légende</strong>
          <UiButton
            variant="ghost"
            size="icon"
            icon="close"
            aria-label="Fermer les couches"
            data-testid="layers-close"
            @click="closeLayers"
          />
        </div>
        <div class="grid gap-1">
          <span class="text-xs text-muted">Fond de carte</span>
          <BaseMapSwitcher
            class="w-fit"
            :model-value="baseMap"
            @update:model-value="setBaseMap"
          />
        </div>
        <div class="grid gap-1">
          <span class="text-xs text-muted">Couleur des repères</span>
          <UiSegmented
            v-model="colorModel"
            :options="COLOR_OPTIONS"
            label="Couleur des repères"
            data-testid="color-by"
          />
        </div>
        <div class="grid gap-0" role="group" aria-label="Couches de la carte">
          <span class="text-xs text-muted">Couches</span>
          <UiCheckbox
            v-for="layer in LAYER_LABELS"
            :key="layer.key"
            :label="layer.label"
            :model-value="toggles[layer.key]"
            :data-layer="layer.key"
            @change="toggle(layer.key, $event)"
          />
        </div>
        <div
          class="grid gap-1 text-xs text-muted"
          data-testid="precision-legend"
        >
          <span>Repères :</span>
          <span class="flex items-center gap-1">
            <span
              class="inline-block h-3 w-3 rounded-full border-2 border-white bg-muted shadow"
              aria-hidden="true"
            />
            à l’adresse ({{ precisionCounts.address }})
          </span>
          <span class="flex items-center gap-1">
            <span
              class="inline-block h-3.5 w-3.5 rounded-full border-[3px] border-muted"
              aria-hidden="true"
            />
            au quartier ({{ precisionCounts.district }}, contour au survol)
          </span>
          <span class="flex items-center gap-1">
            <span
              class="inline-block h-3.5 w-3.5 rounded-full border-2 border-dashed border-muted"
              aria-hidden="true"
            />
            commune seulement ({{ precisionCounts.commune }})
          </span>
        </div>
        <SurroundingsLegend :toggles="toggles" class="text-xs" />
        <span
          v-if="toggles.rentZones"
          class="flex flex-wrap items-center gap-2 text-xs text-muted"
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
