import { computed, watch } from 'vue'
import type { Map as MapLibreMap, TransformStyleFunction } from 'maplibre-gl'
import {
  baseMapDefinition,
  baseMapStyleUrl,
  baseMapTransform,
} from '@/lib/base-maps'
import type { BaseMapId } from '@/lib/base-maps'
import { useBaseMapStore } from '@/stores/base-map'

/**
 * Relie une carte au fond choisi (store partagé) : `styleOptions()` pour la
 * créer, puis `setStyle` à chaque changement de fond. Le `transformStyle`
 * recopie les couches de l'application et le dessin terra-draw dans le
 * nouveau style (lib/base-maps.ts) : le composant n'a rien à redessiner.
 */
export function useBaseMap(getMap: () => MapLibreMap | null) {
  const store = useBaseMapStore()

  function styleOptions(id: BaseMapId = store.current): {
    style: string
    transformStyle: TransformStyleFunction
  } {
    return {
      style: baseMapStyleUrl(id, import.meta.env),
      transformStyle: baseMapTransform(baseMapDefinition(id)),
    }
  }

  watch(
    () => store.current,
    id => {
      const map = getMap()
      if (!map) return
      const { style, transformStyle } = styleOptions(id)
      map.setStyle(style, { transformStyle })
    }
  )

  return {
    baseMap: computed(() => store.current),
    setBaseMap: (id: BaseMapId) => store.setBaseMap(id),
    styleOptions,
  }
}
