<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import * as maplibregl from 'maplibre-gl'
  import type { Map as MapLibreMap } from 'maplibre-gl'
  import type { GeoJSONStoreFeatures } from 'terra-draw'
  import {
    TerraDraw,
    TerraDrawCircleMode,
    TerraDrawPolygonMode,
  } from 'terra-draw'
  import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
  import type { Perimeter, PerimeterInput } from '@apart/contracts'
  import { CRITERIA_LAYERS, upsertGeoJsonLayer } from '@/lib/map-layers'
  import {
    DEFAULT_MAP_CENTER,
    DEFAULT_MAP_ZOOM,
    mapStyleUrl,
  } from '@/lib/map-style'
  import { drawnToPerimeter, perimeterPolygon } from '@/lib/perimeter'

  /**
   * La carte du critère : affiche le périmètre courant, dessine un polygone
   * ou un cercle avec terra-draw, ou rend le point cliqué (centre d'un rayon,
   * départ d'une isochrone). Le polygone reste modifiable (sommets à faire
   * glisser), y compris celui d'un critère enregistré. Le dessin part en
   * GeoJSON vers l'API ; rien n'est calculé ici.
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
  const ready = ref(false)
  const SOURCE = 'criteria-editor-perimeter'

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

  onMounted(() => {
    if (!container.value) return
    const created = new maplibregl.Map({
      container: container.value,
      style: mapStyleUrl(import.meta.env),
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
      attributionControl: { compact: true },
    })
    map = created
    created.addControl(new maplibregl.NavigationControl(), 'top-right')
    created.on('load', () => {
      ready.value = true
      renderPerimeter()
      draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map: created }),
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
    draw?.stop()
    map?.remove()
    map = null
    draw = null
  })

  watch(() => props.perimeter, renderPerimeter, { deep: true })
  watch(() => props.drawMode, applyMode)
</script>

<template>
  <div class="grid gap-1">
    <p class="text-xs text-muted" data-testid="draw-hint">
      <template v-if="drawMode === 'polygon'">
        Cliquez pour poser les sommets, puis sur le premier ou le dernier pour
        fermer le polygone ; faites glisser un sommet pour le modifier.
      </template>
      <template v-else-if="drawMode === 'circle'">
        Cliquez au centre, puis cliquez à la distance voulue.
      </template>
      <template v-else-if="drawMode === 'pick'">
        Cliquez sur la carte pour placer le point.
      </template>
      <template v-else>Le périmètre du critère.</template>
    </p>
    <div
      ref="container"
      class="h-[45vh] min-h-[280px] w-full overflow-hidden rounded-xl border border-line"
      role="region"
      aria-label="Carte du périmètre"
    />
  </div>
</template>
