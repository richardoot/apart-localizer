/**
 * Une lecture gardée en mémoire un temps, par clé (ADR 0049).
 *
 * Pour ce qui ne change qu'à un import (années DVF, contours importés) et que
 * chaque fiche relisait : la petite base de production met 40 à 140 ms à le
 * recompter. Les appels simultanés partagent la même lecture ; une lecture
 * qui échoue n'est pas gardée. `clear` oublie tout : les écritures faites
 * par le même processus l'appellent, un import lancé par un script ailleurs
 * se voit au plus tard au bout de `ttlMs`.
 */
export interface TtlMemo<V> {
  get(key: string, load: () => Promise<V>): Promise<V>
  clear(): void
}

export function ttlMemo<V>(
  ttlMs: number,
  now: () => number = Date.now
): TtlMemo<V> {
  const entries = new Map<string, { until: number; value: Promise<V> }>()
  return {
    get(key, load) {
      const hit = entries.get(key)
      if (hit && hit.until > now()) return hit.value
      const value = load()
      entries.set(key, { until: now() + ttlMs, value })
      value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key)
      })
      return value
    },
    clear() {
      entries.clear()
    },
  }
}
