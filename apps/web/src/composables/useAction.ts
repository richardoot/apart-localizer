import { ref } from 'vue'
import type { Ref } from 'vue'
import { errorMessage } from '@/lib/errors'
import { useFeedbackStore } from '@/stores/feedback'

/**
 * Lot 22 (ADR 0032) : une action d'un bloc de l'écran (enregistrer,
 * cocher, répondre). `run` l'exécute ; en cas d'échec, le message lisible
 * va dans `error`, que le bloc affiche à côté du bouton (`UiAlert`) ; en
 * cas de réussite, `success` part dans la zone de messages, avec
 * « Annuler » si `undo` est donné. Remplace les `failure` et les
 * `instanceof ApiError ? … :` de chaque composant.
 */
export interface ActionOptions<T> {
  /** Le message de réussite (zone de messages) ; rien si absent. */
  success?: string | ((result: T) => string | null | undefined)
  /** Défait l'action (« Annuler » dans la zone de messages). */
  undo?: (result: T) => unknown
  /** Le message si l'échec ne dit rien de lisible. */
  fallback?: string
  /** Relancer l'erreur après l'avoir affichée (un formulaire garde sa saisie). */
  rethrow?: boolean
}

export interface Action {
  /** Le message de la dernière erreur de ce bloc, ou null. */
  error: Ref<string | null>
  /** Une action est en cours. */
  pending: Ref<boolean>
  run: <T>(
    action: () => Promise<T>,
    options?: ActionOptions<T>
  ) => Promise<T | undefined>
  /** Affiche une erreur venue d'ailleurs (validation locale). */
  fail: (error: unknown, fallback?: string) => void
  clear: () => void
}

export function useAction(defaultFallback = 'L’action a échoué.'): Action {
  const feedback = useFeedbackStore()
  const error = ref<string | null>(null)
  const pending = ref(false)

  async function run<T>(
    action: () => Promise<T>,
    options: ActionOptions<T> = {}
  ): Promise<T | undefined> {
    error.value = null
    pending.value = true
    try {
      const result = await action()
      const text =
        typeof options.success === 'function'
          ? options.success(result)
          : options.success
      if (text) {
        const undo = options.undo
        feedback.success(text, undo ? { undo: () => undo(result) } : {})
      }
      return result
    } catch (err) {
      error.value = errorMessage(err, options.fallback ?? defaultFallback)
      if (options.rethrow) throw err
      return undefined
    } finally {
      pending.value = false
    }
  }

  function fail(err: unknown, fallback?: string): void {
    error.value =
      typeof err === 'string'
        ? err
        : errorMessage(err, fallback ?? defaultFallback)
  }

  return {
    error,
    pending,
    run,
    fail,
    clear: () => {
      error.value = null
    },
  }
}
