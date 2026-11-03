import { computed, unref } from 'vue'
import type { MaybeRef } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import type { LayerFeatureCollection } from '@apart/contracts'
import { api } from '@/lib/api'

/** Les données des couches de contexte (besoin G7), chargées par la page. */
export interface MapLayerData {
  criteria: unknown
  tram: LayerFeatureCollection | null
  bus: LayerFeatureCollection | null
  dvf: LayerFeatureCollection | null
  rentZones: LayerFeatureCollection | null
}

/** Les couches de contexte de la carte (besoin G7), activables une à une. */
export interface MapLayerToggles {
  criteria: boolean
  tram: boolean
  bus: boolean
  dvf: boolean
  rentZones: boolean
}

export const DEFAULT_LAYER_TOGGLES: MapLayerToggles = {
  criteria: true,
  tram: false,
  bus: false,
  dvf: false,
  rentZones: false,
}

/**
 * Les données des couches, chargées seulement quand la couche est active
 * (arrêts et zonage une fois pour toutes, ventes DVF selon l'emprise).
 */
export function useMapLayers(
  toggles: MaybeRef<MapLayerToggles>,
  bbox: MaybeRef<readonly [number, number, number, number] | null>
) {
  const tram = useQuery({
    queryKey: ['opendata', 'transit-stops', 'tram'],
    queryFn: () => api.opendata.transitStops('tram'),
    enabled: computed(() => unref(toggles).tram),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const bus = useQuery({
    queryKey: ['opendata', 'transit-stops', 'bus'],
    queryFn: () => api.opendata.transitStops('bus'),
    enabled: computed(() => unref(toggles).bus),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const rentZones = useQuery({
    queryKey: ['opendata', 'rent-control-zones'],
    queryFn: () => api.opendata.rentControlZones(),
    enabled: computed(() => unref(toggles).rentZones),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const dvf = useQuery({
    queryKey: computed(() => ['opendata', 'dvf', unref(bbox)]),
    queryFn: () =>
      api.opendata.dvf(
        unref(bbox) as readonly [number, number, number, number]
      ),
    enabled: computed(() => unref(toggles).dvf && unref(bbox) !== null),
    placeholderData: previous => previous,
  })
  return computed(() => ({
    tram: tram.data.value ?? null,
    bus: bus.data.value ?? null,
    rentZones: rentZones.data.value ?? null,
    dvf: dvf.data.value ?? null,
  }))
}
