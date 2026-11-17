/**
 * Le portier des requêtes vers l'API (ADR 0048).
 *
 * Sur Vercel, une rafale de requêtes simultanées vers une API froide démarre
 * une instance par requête (mesuré : treize démarrages pour une ouverture de
 * l'application), et chaque démarrage coûte de l'ordre d'une seconde de CPU.
 * Une instance chaude, elle, sert plusieurs requêtes à la fois. D'où deux
 * règles :
 * - après un silence de `idleMs` (et à la première requête de la page), la
 *   première requête part seule : elle réveille une instance, les autres
 *   attendent sa réponse (au plus `leaderTimeoutMs`) ;
 * - jamais plus de `maxConcurrent` requêtes en cours ; les suivantes
 *   attendent leur tour, dans l'ordre.
 *
 * Un créneau se libère quand la réponse arrive (en-têtes reçus) ou que la
 * requête échoue. Le temps est injecté, pour les tests.
 */
export interface RequestGateOptions {
  maxConcurrent: number
  idleMs: number
  leaderTimeoutMs: number
  now?: () => number
  setTimer?: (run: () => void, ms: number) => unknown
  clearTimer?: (timer: unknown) => void
}

export const REQUEST_GATE_DEFAULTS = {
  /** Une instance chaude en a servi huit à la fois sans qu'une autre démarre. */
  maxConcurrent: 4,
  /** Une instance restée deux minutes sans requête a pu être arrêtée. */
  idleMs: 2 * 60_000,
  /** Un démarrage à froid et une première lecture tiennent en quelques secondes. */
  leaderTimeoutMs: 5_000,
} as const satisfies RequestGateOptions

export interface RequestGate {
  run<T>(task: () => Promise<T>): Promise<T>
  /** Requêtes en cours et en attente, pour les tests. */
  readonly stats: { active: number; queued: number }
}

export function createRequestGate(
  options: RequestGateOptions = REQUEST_GATE_DEFAULTS
): RequestGate {
  const now = options.now ?? Date.now
  const setTimer =
    options.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms))
  const clearTimer =
    options.clearTimer ??
    ((timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>))
  const max = Math.max(1, options.maxConcurrent)

  let active = 0
  const queue: Array<() => void> = []
  /** Dernière réponse reçue, ou fin d'attente du réveil ; `null` : rien encore. */
  let lastActivity: number | null = null
  /** Le réveil en cours : les autres requêtes attendent qu'il se termine. */
  let waking: Promise<void> | null = null

  const asleep = (): boolean =>
    lastActivity === null || now() - lastActivity > options.idleMs

  function acquire(): Promise<void> {
    if (active < max) {
      active += 1
      return Promise.resolve()
    }
    return new Promise(resolve =>
      queue.push(() => {
        active += 1
        resolve()
      })
    )
  }

  function release(): void {
    active -= 1
    lastActivity = now()
    queue.shift()?.()
  }

  async function slot<T>(task: () => Promise<T>): Promise<T> {
    await acquire()
    try {
      return await task()
    } finally {
      release()
    }
  }

  async function run<T>(task: () => Promise<T>): Promise<T> {
    while (waking) await waking
    if (active === 0 && queue.length === 0 && asleep()) {
      let done: () => void = () => undefined
      const mine = new Promise<void>(resolve => {
        done = resolve
      })
      waking = mine
      let timer: unknown = null
      const wake = (): void => {
        if (waking !== mine) return
        if (timer !== null) clearTimer(timer)
        lastActivity = now()
        waking = null
        done()
      }
      timer = setTimer(wake, options.leaderTimeoutMs)
      try {
        return await slot(task)
      } finally {
        wake()
      }
    }
    return slot(task)
  }

  return {
    run,
    get stats() {
      return { active, queued: queue.length }
    },
  }
}
