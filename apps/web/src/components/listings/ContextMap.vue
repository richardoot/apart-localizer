<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import '@/lib/maplibre-worker'
  import * as maplibregl from 'maplibre-gl'
  import type { Map as MapLibreMap } from 'maplibre-gl'
  import type { ListingContext } from '@apart/contracts'
  import { useBaseMap } from '@/composables/useBaseMap'
  import { pointLayer, upsertGeoJsonLayer } from '@/lib/map-layers'
  import BaseMapSwitcher from '@/components/map/BaseMapSwitcher.vue'

  /**
   * Carte miniature du contexte : l'annonce, l'arrêt de tram le plus proche,
   * les ventes comparables. Le fond est celui choisi pour toutes les cartes.
   */
  const props = defineProps<{ context: ListingContext }>()

  const container = ref<HTMLDivElement | null>(null)
  let map: MapLibreMap | null = null
  const ready = ref(false)
  const { baseMap, setBaseMap, styleOptions } = useBaseMap(() => map)

  function feature(coordinates: [number, number], kind: string, label: string) {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates },
      properties: { kind, label },
    }
  }

  function render(): void {
    if (!map || !ready.value) return
    const c = props.context
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
                c.transit.nearestTram.name
              ),
            ]
          : [],
      },
      pointLayer('context-tram-point', '#dc2626', 6)
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
    })
  }

  onMounted(sync)
  onBeforeUnmount(destroy)

  watch(() => props.context.point?.coordinates.join(','), sync, {
    flush: 'post',
  })
  watch(() => props.context, render, { deep: true })
</script>

<template>
  <div v-if="context.point" class="relative">
    <div
      ref="container"
      class="h-56 w-full overflow-hidden rounded-lg border border-line sm:h-48"
      role="region"
      aria-label="Carte du contexte : annonce, tram, ventes comparables"
    />
    <BaseMapSwitcher
      class="absolute top-2 left-2 z-10"
      :model-value="baseMap"
      @update:model-value="setBaseMap"
    />
  </div>
</template>
