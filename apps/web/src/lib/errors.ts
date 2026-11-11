import { ApiError } from './api'

/**
 * Lot 22 (ADR 0032) : le message lisible d'un échec, une seule fois pour
 * toute l'application (au lieu d'un `instanceof ApiError ? … :` par
 * composant). Le serveur dit toujours pourquoi il refuse : son message est
 * repris. Sans réponse du serveur (réseau coupé, hors ligne), on le dit.
 * Sinon, le message de repli de l'action.
 */
export const OFFLINE_MESSAGE =
  'Pas de connexion au serveur : vérifie le réseau, puis réessaie.'

export function errorMessage(
  error: unknown,
  fallback = 'L’action a échoué.'
): string {
  if (error instanceof ApiError) return error.message
  if (isNetworkError(error)) return OFFLINE_MESSAGE
  return fallback
}

/** Vrai pour un `fetch` sans réponse (réseau coupé, serveur injoignable). */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true
  }
  return (
    error instanceof TypeError &&
    /fetch|network|load failed|networkerror/i.test(error.message)
  )
}

/** Un refus pour conflit (fiche modifiée entre-temps, URL déjà prise…). */
export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409
}
