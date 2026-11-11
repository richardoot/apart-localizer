<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import '@/lib/maplibre-worker'
  import * as maplibregl from 'maplibre-gl'
  import type { Map as MapLibreMap, Marker } from 'maplibre-gl'
  import type { GeoJSONStoreFeatures } from 'terra-draw'
  import {
    TerraDraw,
    TerraDrawCircleMode,
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
   */
  const props = defineProps<{
    perimeter: Perimeter | null
    drawMode: 'polygon' | 'circle' | 'pick' | null
  }>()
  const emit = defineEmits<{
    drawn: [perimeter: PerimeterInput]
    pick: [point: { longitude: number; latitude: number }]
  }>()

  const container = ref<HTMLDivElement | null>(null)
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

  function applyMode(): void {
    if (!draw) return
    draw.clear()
    draw.setMode(
      props.drawMode === 'polygon' || props.drawMode === 'circle'
        ? props.drawMode
        : 'static'
    )
    loadEditablePolygon()
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
      })
      draw.start()
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
      })
      applyMode()
    })
    created.on('click', event => {
      const e = event as { lngLat: { lng: number; lat: number } }
      if (props.drawMode !== 'pick') return
      emit('pick', {
        longitude: Math.round(e.lngLat.lng * 1e6) / 1e6,
        latitude: Math.round(e.lngLat.lat * 1e6) / 1e6,
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
    () => {
      applyMode()
      frameForDrawing()
    }
  )
</script>

<template>
  <div class="grid gap-1">
    <MapAddressSearch @found="goTo" />
    <p class="text-sm text-muted" data-testid="draw-hint">
      <template v-if="drawMode === 'polygon'">
        Clique pour poser les sommets, puis sur le premier ou le dernier pour
        fermer le polygone ; fais glisser un sommet pour le modifier.
      </template>
      <template v-else-if="drawMode === 'circle'">
        Clique au centre, puis à la distance voulue.
      </template>
      <template v-else-if="drawMode === 'pick'">
        Clique sur la carte pour placer le point.
      </template>
      <template v-else>Le périmètre du critère.</template>
    </p>
    <div class="relative">
      <div
        ref="container"
        class="h-[45vh] min-h-[280px] w-full overflow-hidden rounded-xl border border-line"
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
