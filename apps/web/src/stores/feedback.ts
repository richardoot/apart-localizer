import { defineStore } from 'pinia'
import { ref } from 'vue'
import { errorMessage } from '@/lib/errors'

/**
 * Lot 22 (ADR 0032) : la zone de messages commune. Un enregistrement
 * réussi le dit ici, avec « Annuler » quand l'action se défait (tâche
 * cochée, « Repêcher », réponse du vendeur…). Une erreur s'affiche d'abord
 * dans la section où l'on a cliqué (`useAction`, `UiAlert`) ; la zone ne
 * sert aux erreurs que pour ce qui n'a pas de section (une annulation qui
 * échoue, une mise à jour de l'application).
 *
 * La zone (`FeedbackHost`) est dessinée une fois par la coquille et une fois
 * par panneau ouvert (`SidePanel`) : un panneau modal rend le reste de la
 * page inerte, seule la zone la plus récente montre les messages.
 */
export type FeedbackTone = 'good' | 'bad' | 'info' | 'warn'

export interface FeedbackAction {
  label: string
  run: () => unknown
}

export interface FeedbackMessage {
  id: number
  tone: FeedbackTone
  text: string
  action: FeedbackAction | null
  /** Durée d'affichage en millisecondes ; null : jusqu'à fermeture. */
  timeout: number | null
}

export interface NotifyOptions {
  tone?: FeedbackTone
  action?: FeedbackAction
  /** « Annuler » : défait l'action ; un échec de l'annulation est dit ici. */
  undo?: () => unknown
  timeout?: number | null
}

/** Durée d'un message simple, et d'un message qu'on peut annuler. */
export const FEEDBACK_TIMEOUT_MS = 5000
export const FEEDBACK_UNDO_TIMEOUT_MS = 10_000
/** Pas plus de messages à la fois : le plus ancien s'en va. */
export const FEEDBACK_MAX = 3

export const useFeedbackStore = defineStore('feedback', () => {
  const messages = ref<FeedbackMessage[]>([])
  const hosts = ref<number[]>([])
  let nextId = 1
  let nextHost = 1
  const timers = new Map<number, ReturnType<typeof setTimeout>>()

  function schedule(message: FeedbackMessage): void {
    clearTimer(message.id)
    if (message.timeout === null) return
    timers.set(
      message.id,
      setTimeout(() => dismiss(message.id), message.timeout)
    )
  }
  function clearTimer(id: number): void {
    const timer = timers.get(id)
    if (timer !== undefined) clearTimeout(timer)
    timers.delete(id)
  }

  function notify(text: string, options: NotifyOptions = {}): number {
    const action: FeedbackAction | null = options.undo
      ? { label: 'Annuler', run: options.undo }
      : (options.action ?? null)
    const tone = options.tone ?? 'good'
    const message: FeedbackMessage = {
      id: nextId++,
      tone,
      text,
      action,
      timeout:
        options.timeout !== undefined
          ? options.timeout
          : action
            ? FEEDBACK_UNDO_TIMEOUT_MS
            : tone === 'bad'
              ? FEEDBACK_UNDO_TIMEOUT_MS
              : FEEDBACK_TIMEOUT_MS,
    }
    messages.value = [...messages.value, message].slice(-FEEDBACK_MAX)
    for (const id of timers.keys()) {
      if (!messages.value.some(m => m.id === id)) clearTimer(id)
    }
    schedule(message)
    return message.id
  }

  function success(text: string, options: Omit<NotifyOptions, 'tone'> = {}) {
    return notify(text, { ...options, tone: 'good' })
  }

  function error(
    errorOrText: unknown,
    fallback?: string,
    options: Omit<NotifyOptions, 'tone'> = {}
  ): number {
    const text =
      typeof errorOrText === 'string'
        ? errorOrText
        : errorMessage(errorOrText, fallback)
    return notify(text, { ...options, tone: 'bad' })
  }

  function dismiss(id: number): void {
    clearTimer(id)
    messages.value = messages.value.filter(message => message.id !== id)
  }

  /** L'action du message (« Annuler ») ; le message s'en va, l'échec se dit. */
  async function act(id: number): Promise<void> {
    const message = messages.value.find(m => m.id === id)
    if (!message?.action) return
    dismiss(id)
    try {
      await message.action.run()
    } catch (err) {
      error(err, 'L’annulation a échoué.')
    }
  }

  /** Le survol ou le focus retient le message ; il repart à la sortie. */
  function hold(id: number): void {
    clearTimer(id)
  }
  function release(id: number): void {
    const message = messages.value.find(m => m.id === id)
    if (message) schedule(message)
  }

  function registerHost(): number {
    const token = nextHost++
    hosts.value = [...hosts.value, token]
    return token
  }
  function unregisterHost(token: number): void {
    hosts.value = hosts.value.filter(host => host !== token)
  }
  function isActiveHost(token: number): boolean {
    return hosts.value[hosts.value.length - 1] === token
  }

  function clear(): void {
    for (const id of [...timers.keys()]) clearTimer(id)
    messages.value = []
  }

  return {
    messages,
    hosts,
    notify,
    success,
    error,
    dismiss,
    act,
    hold,
    release,
    registerHost,
    unregisterHost,
    isActiveHost,
    clear,
  }
})
