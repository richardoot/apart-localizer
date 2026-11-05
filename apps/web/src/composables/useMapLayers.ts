import { computed, unref } from 'vue'
import type { MaybeRef } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import type { LayerFeatureCollection } from '@apart/contracts'
import { api } from '@/lib/api'

/** Les données des couches de contexte (besoin G7, lot 11), chargées par la page. */
export interface MapLayerData {
  criteria: unknown
  tram: LayerFeatureCollection | null
  bus: LayerFeatureCollection | null
  dvf: LayerFeatureCollection | null
  rentZones: LayerFeatureCollection | null
  athletics?: LayerFeatureCollection | null
  drives?: LayerFeatureCollection | null
  fitness?: LayerFeatureCollection | null
  neighbourhoods?: LayerFeatureCollection | null
}

/** Les couches de contexte de la carte (besoin G7, lot 11), activables une à une. */
export interface MapLayerToggles {
  criteria: boolean
  tram: boolean
  bus: boolean
  dvf: boolean
  rentZones: boolean
  athletics: boolean
  drives: boolean
  fitness: boolean
  neighbourhoods: boolean
}

export const DEFAULT_LAYER_TOGGLES: MapLayerToggles = {
  criteria: true,
  tram: false,
  bus: false,
  dvf: false,
  rentZones: false,
  athletics: false,
  drives: false,
  fitness: false,
  neighbourhoods: false,
}

/** Les couches du lot 11, seules proposées sur la carte du quartier d'une fiche. */
export type SurroundingsLayerKey =
  'athletics' | 'drives' | 'fitness' | 'neighbourhoods'

/**
 * Les données des couches, chargées seulement quand la couche est active :
 * arrêts, zonage, équipements et contours des quartiers une fois pour toutes
 * (quelques centaines de points ; environ 200 contours simplifiés, 0,3 Mo
 * pour toute la métropole), ventes DVF selon l'emprise.
 */
export function useMapLayers(
  toggles: MaybeRef<Partial<MapLayerToggles>>,
  bbox: MaybeRef<readonly [number, number, number, number] | null>
) {
  const on = (key: keyof MapLayerToggles) =>
    computed(() => unref(toggles)[key] === true)
  const tram = useQuery({
    queryKey: ['opendata', 'transit-stops', 'tram'],
    queryFn: () => api.opendata.transitStops('tram'),
    enabled: on('tram'),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const bus = useQuery({
    queryKey: ['opendata', 'transit-stops', 'bus'],
    queryFn: () => api.opendata.transitStops('bus'),
    enabled: on('bus'),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const rentZones = useQuery({
    queryKey: ['opendata', 'rent-control-zones'],
    queryFn: () => api.opendata.rentControlZones(),
    enabled: on('rentZones'),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const dvf = useQuery({
    queryKey: computed(() => ['opendata', 'dvf', unref(bbox)]),
    queryFn: () =>
      api.opendata.dvf(
        unref(bbox) as readonly [number, number, number, number]
      ),
    enabled: computed(
      () => unref(toggles).dvf === true && unref(bbox) !== null
    ),
    placeholderData: previous => previous,
  })
  const athletics = useQuery({
    queryKey: ['opendata', 'amenities', 'athletics_track'],
    queryFn: () => api.opendata.amenities('athletics_track'),
    enabled: on('athletics'),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const drives = useQuery({
    queryKey: ['opendata', 'amenities', 'supermarket_drive'],
    queryFn: () => api.opendata.amenities('supermarket_drive'),
    enabled: on('drives'),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const fitness = useQuery({
    queryKey: ['opendata', 'amenities', 'fitness_park'],
    queryFn: () => api.opendata.amenities('fitness_park'),
    enabled: on('fitness'),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const neighbourhoods = useQuery({
    queryKey: ['opendata', 'neighbourhoods'],
    queryFn: () => api.opendata.neighbourhoods(),
    enabled: on('neighbourhoods'),
    staleTime: Number.POSITIVE_INFINITY,
  })
  return computed(() => ({
    tram: tram.data.value ?? null,
    bus: bus.data.value ?? null,
    rentZones: rentZones.data.value ?? null,
    dvf: dvf.data.value ?? null,
    athletics: athletics.data.value ?? null,
    drives: drives.data.value ?? null,
    fitness: fitness.data.value ?? null,
    neighbourhoods: neighbourhoods.data.value ?? null,
  }))
}
