<script setup lang="ts">
  import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import '@/lib/maplibre-worker'
  import * as maplibregl from 'maplibre-gl'
  import type { Map as MapLibreMap, Marker } from 'maplibre-gl'
  import type { GeoJSONStoreFeatures } from 'terra-draw'
  import {
    TerraDraw,
    TerraDrawCircleMode,
    TerraDrawModeUndoRedo,
    TerraDrawPolygonMode,
  } from 'terra-draw'
  import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
  import type {
    GeocodeLookup,
    Perimeter,
    PerimeterInput,
  } from '@apart/contracts'
  import { useBaseMap } from '@/composables/useBaseMap'
  import { TERRA_DRAW_PREFIX } from '@/lib/base-maps'
  import { CRITERIA_LAYERS, upsertGeoJsonLayer } from '@/lib/map-layers'
  import {
    ADDRESS_ZOOM,
    COMMUNE_ZOOM,
    DEFAULT_MAP_CENTER,
    DEFAULT_MAP_ZOOM,
    DRAW_MAP_CENTER,
    DRAW_MAP_ZOOM,
    DRAW_MIN_ZOOM,
  } from '@/lib/map-style'
  import {
    drawnToPerimeter,
    perimeterBounds,
    perimeterPolygon,
  } from '@/lib/perimeter'
  import BaseMapSwitcher from '@/components/map/BaseMapSwitcher.vue'
  import MapAddressSearch from '@/components/map/MapAddressSearch.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import { useMediaQuery } from '@/composables/useMediaQuery'
  import {
    COARSE_POINTER_QUERY,
    criteriaDrawHint,
    roundCoordinate,
  } from '@/lib/map-draw'

  /**
   * La carte du critère : affiche le périmètre courant, dessine un polygone
   * ou un cercle avec terra-draw, ou rend le point cliqué (centre d'un rayon,
   * départ d'une isochrone). Le polygone reste modifiable (sommets à faire
   * glisser), y compris celui d'un critère enregistré. Le dessin part en
   * GeoJSON vers l'API ; rien n'est calculé ici.
   *
   * Lot 10 : pour voir les rues et les bâtiments, la carte s'ouvre cadrée
   * sur le périmètre existant, et entrer en dessin depuis une vue trop large
   * recadre sur le périmètre ou sur le centre de Bordeaux ; une adresse
   * cherchée recentre la carte ; le fond (plan OSM, plan IGN, photo) se
   * change sans perdre le dessin en cours (lib/base-maps.ts).
   *
   * Lot 26 (ADR 0036) : sur iPhone, pas de piège au défilement : hors dessin,
   * un doigt fait défiler le panneau et deux doigts déplacent la carte
   * (`cooperativeGestures`) ; en dessin, la carte prend tous les gestes et
   * vient à l'écran. Les aides disent « Touche » au doigt, « Clique » à la
   * souris. Pendant un tracé : « Annuler le dernier point » (annulation de
   * terra-draw) et « Effacer » (forme en cours et forme tracée, `cleared`).
   * Un point (rayon, départ d'isochrone) se pose aussi depuis une adresse
   * cherchée (« Placer le point ici »), par `GET /opendata/geocode`.
   */
  const props = defineProps<{
    perimeter: Perimeter | null
    drawMode: 'polygon' | 'circle' | 'pick' | null
  }>()
  const emit = defineEmits<{
    drawn: [perimeter: PerimeterInput]
    pick: [point: { longitude: number; latitude: number }]
    /** « Effacer » : plus de forme tracée, le périmètre est à reposer. */
    cleared: []
  }>()

  const coarse = useMediaQuery(COARSE_POINTER_QUERY)
  const container = ref<HTMLDivElement | null>(null)
  /** Un point de tracé peut être annulé (polygone en cours). */
  const canUndo = ref(false)
  /** La dernière adresse trouvée, pour « Placer le point ici ». */
  const found = ref<NonNullable<GeocodeLookup['result']> | null>(null)
  let map: MapLibreMap | null = null
  let draw: TerraDraw | null = null
  let addressMarker: Marker | null = null
  const ready = ref(false)
  const SOURCE = 'criteria-editor-perimeter'
  const FIT_PADDING = 40
  const FIT_MAX_ZOOM = 16

  const { baseMap, setBaseMap, styleOptions } = useBaseMap(() => map)

  function renderPerimeter(): void {
    if (!map || !ready.value) return
    const data = {
      type: 'FeatureCollection',
      features: props.perimeter
        ? [
            {
              type: 'Feature',
              geometry: perimeterPolygon(props.perimeter),
              properties: { selected: true },
            },
          ]
        : [],
    }
    upsertGeoJsonLayer(
      map,
      SOURCE,
      data,
      CRITERIA_LAYERS.map(layer => ({ ...layer, id: `${SOURCE}-${layer.id}` }))
    )
  }

  /** Le polygone d'un critère enregistré, chargé dans terra-draw pour être retouché. */
  function loadEditablePolygon(): void {
    const perimeter = props.perimeter
    if (!draw || props.drawMode !== 'polygon' || perimeter?.type !== 'polygon')
      return
    if (draw.getSnapshot().length) return
    draw.addFeatures([
      {
        id: draw.getFeatureId(),
        type: 'Feature',
        geometry: perimeter.polygon,
        properties: { mode: 'polygon' },
      } as GeoJSONStoreFeatures,
    ])
  }

  function refreshUndo(): void {
    canUndo.value = draw?.canUndo() ?? false
  }

  /** « Annuler le dernier point » : le sommet posé en dernier s'en va. */
  function undoPoint(): void {
    draw?.undo()
    refreshUndo()
  }

  /** « Effacer » : la forme en cours et la forme tracée, le mode reste. */
  function clearDrawing(): void {
    applyMode(false)
    emit('cleared')
  }

  /** Au toucher, hors dessin, deux doigts pour la carte ; en dessin, tous les gestes. */
  function applyGestures(): void {
    const handler = map?.cooperativeGestures
    if (!handler) return
    if (coarse.value && !props.drawMode) handler.enable()
    else handler.disable()
  }

  function placeFound(): void {
    const result = found.value
    if (!result) return
    const [lng, lat] = result.point.coordinates
    emit('pick', {
      longitude: roundCoordinate(lng),
      latitude: roundCoordinate(lat),
    })
  }

  function applyMode(loadSaved = true): void {
    if (!draw) return
    draw.clear()
    draw.setMode(
      props.drawMode === 'polygon' || props.drawMode === 'circle'
        ? props.drawMode
        : 'static'
    )
    if (loadSaved) loadEditablePolygon()
    refreshUndo()
  }

  /** Cadre la carte sur un périmètre ; faux s'il n'y en a pas. */
  function fitPerimeter(perimeter: Perimeter | null): boolean {
    const bounds = perimeter ? perimeterBounds(perimeter) : null
    if (!map || !bounds) return false
    map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM })
    return true
  }

  /**
   * Entrer en dessin (polygone, cercle, point) depuis une vue trop large
   * pour voir les rues : cadrage sur le périmètre, sinon sur Bordeaux. Une
   * vue déjà rapprochée par la personne est laissée telle quelle.
   */
  function frameForDrawing(): void {
    if (!map || !props.drawMode) return
    if (map.getZoom() >= DRAW_MIN_ZOOM) return
    if (fitPerimeter(props.perimeter)) return
    map.easeTo({ center: DRAW_MAP_CENTER, zoom: DRAW_MAP_ZOOM })
  }

  function goTo(result: NonNullable<GeocodeLookup['result']>): void {
    found.value = result
    if (!map) return
    const center = result.point.coordinates
    map.flyTo({
      center,
      zoom: result.precision === 'commune' ? COMMUNE_ZOOM : ADDRESS_ZOOM,
    })
    addressMarker?.remove()
    const element = document.createElement('div')
    element.className =
      'h-3.5 w-3.5 rounded-full border-2 border-white bg-accent shadow ring-2 ring-accent/40'
    element.setAttribute('role', 'img')
    element.setAttribute('aria-label', `Adresse trouvée : ${result.label}`)
    addressMarker = new maplibregl.Marker({ element })
      .setLngLat(center)
      .addTo(map)
  }

  /** La vue d'ouverture : le périmètre existant, sinon Bordeaux si l'on dessine, sinon la métropole. */
  function initialView():
    | { bounds: [[number, number], [number, number]] }
    | { center: [number, number]; zoom: number } {
    const bounds = props.perimeter ? perimeterBounds(props.perimeter) : null
    if (bounds) return { bounds }
    return props.drawMode
      ? { center: DRAW_MAP_CENTER, zoom: DRAW_MAP_ZOOM }
      : { center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM }
  }

  onMounted(() => {
    if (!container.value) return
    const created = new maplibregl.Map({
      container: container.value,
      ...styleOptions(),
      ...initialView(),
      fitBoundsOptions: { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM },
      attributionControl: { compact: true },
      // Lot 26 : au toucher, hors dessin, un doigt fait défiler le panneau.
      cooperativeGestures: coarse.value && !props.drawMode,
    })
    map = created
    created.addControl(new maplibregl.NavigationControl(), 'top-right')
    created.on('load', () => {
      ready.value = true
      renderPerimeter()
      draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({
          map: created,
          // Le préfixe désigne ses couches : un changement de fond les recopie.
          prefixId: TERRA_DRAW_PREFIX,
        }),
        modes: [
          new TerraDrawPolygonMode({ editable: true }),
          new TerraDrawCircleMode(),
        ],
        // Lot 26 : « Annuler le dernier point » pendant un tracé.
        undoRedo: { modeLevel: new TerraDrawModeUndoRedo() },
      })
      draw.start()
      draw.on('change', refreshUndo)
      draw.on('history', refreshUndo)
      // Fin d'un tracé ou d'une retouche : la forme part vers l'éditeur, et
      // remplace la précédente (une seule forme à la fois).
      draw.on('finish', id => {
        const feature = draw?.getSnapshotFeature(id)
        const perimeter = feature ? drawnToPerimeter(feature) : null
        if (perimeter) emit('drawn', perimeter)
        const others = (draw?.getSnapshot() ?? [])
          .map(f => f.id)
          .filter((other): other is string | number => other !== undefined)
          .filter(other => other !== id)
        if (others.length) draw?.removeFeatures(others)
        refreshUndo()
      })
      applyMode()
    })
    created.on('click', event => {
      const e = event as { lngLat: { lng: number; lat: number } }
      if (props.drawMode !== 'pick') return
      emit('pick', {
        longitude: roundCoordinate(e.lngLat.lng),
        latitude: roundCoordinate(e.lngLat.lat),
      })
    })
  })

  onBeforeUnmount(() => {
    addressMarker?.remove()
    draw?.stop()
    map?.remove()
    map = null
    draw = null
  })

  /** Clé d'une isochrone : un nouveau calcul (départ, mode, durée) recadre la carte. */
  function isochroneKey(perimeter: Perimeter | null): string | null {
    if (perimeter?.type !== 'isochrone') return null
    const p = perimeter.params
    return `${p.origin.coordinates.join(',')}|${p.mode}|${p.durationMinutes}`
  }

  watch(
    () => props.perimeter,
    (next, previous) => {
      renderPerimeter()
      const key = isochroneKey(next)
      if (key && key !== isochroneKey(previous)) fitPerimeter(next)
    },
    { deep: true }
  )
  watch(
    () => props.drawMode,
    mode => {
      applyMode()
      frameForDrawing()
      applyGestures()
      // Au téléphone, entrer en dessin amène la carte à l'écran.
      if (mode && coarse.value) {
        void nextTick(() =>
          container.value?.scrollIntoView?.({ block: 'nearest' })
        )
      }
    }
  )
  watch(coarse, applyGestures)
</script>

<template>
  <div class="grid gap-1">
    <MapAddressSearch @found="goTo" />
    <UiButton
      v-if="drawMode === 'pick' && found"
      variant="outline"
      icon="map-pin"
      class="w-fit"
      data-testid="place-found"
      @click="placeFound"
    >
      Placer le point ici
    </UiButton>
    <p class="text-sm text-muted" data-testid="draw-hint">
      {{ criteriaDrawHint(drawMode, coarse) }}
    </p>
    <div
      v-if="drawMode === 'polygon' || drawMode === 'circle'"
      class="flex flex-wrap gap-2"
      data-testid="draw-tools"
    >
      <UiButton
        v-if="drawMode === 'polygon'"
        size="sm"
        icon="undo"
        :disabled="!canUndo"
        data-testid="draw-undo"
        @click="undoPoint"
      >
        Annuler le dernier point
      </UiButton>
      <UiButton
        size="sm"
        icon="trash"
        data-testid="draw-clear"
        @click="clearDrawing"
      >
        Effacer
      </UiButton>
    </div>
    <div class="relative">
      <div
        ref="container"
        class="h-[50vh] max-h-[420px] min-h-[280px] w-full overflow-hidden rounded-xl border border-line sm:h-[45vh] sm:max-h-none"
        role="region"
        aria-label="Carte du périmètre"
      />
      <BaseMapSwitcher
        class="absolute top-2 left-2 z-10"
        :model-value="baseMap"
        @update:model-value="setBaseMap"
      />
    </div>
  </div>
</template>
