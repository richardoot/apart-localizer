import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_BASE_MAP, isBaseMapId } from '@/lib/base-maps'
import type { BaseMapId } from '@/lib/base-maps'

/** Préfixe de la clé `localStorage` ; suivi de l'identifiant de la personne connectée. */
export const BASE_MAP_STORAGE_KEY = 'apart-localizer-base-map'

export function baseMapStorageKey(userId: string | null | undefined): string {
  return userId ? `${BASE_MAP_STORAGE_KEY}:${userId}` : BASE_MAP_STORAGE_KEY
}

/**
 * Le fond de carte choisi, commun aux trois cartes (annonces, critère,
 * quartier). Retenu par personne et par appareil dans `localStorage`, comme
 * le thème : c'est une préférence d'affichage (le téléphone peut préférer le
 * plan, plus léger que la photo), pas une donnée de l'espace. Stockage
 * indisponible ou valeur inconnue : le plan OpenStreetMap, et le choix vaut
 * pour la session.
 */
export const useBaseMapStore = defineStore('baseMap', () => {
  const current = ref<BaseMapId>(DEFAULT_BASE_MAP)
  const userId = ref<string | null>(null)

  /** Le choix de cette personne sur cet appareil ; appelé à chaque connexion. */
  function load(nextUserId: string | null | undefined): void {
    userId.value = nextUserId ?? null
    let stored: string | null = null
    try {
      stored = localStorage.getItem(baseMapStorageKey(userId.value))
    } catch {
      // Stockage indisponible : le fond par défaut.
    }
    current.value = isBaseMapId(stored) ? stored : DEFAULT_BASE_MAP
  }

  function setBaseMap(id: BaseMapId): void {
    current.value = id
    try {
      localStorage.setItem(baseMapStorageKey(userId.value), id)
    } catch {
      // Stockage indisponible : le choix vaut pour la session.
    }
  }

  return { current, userId, load, setBaseMap }
})
