import { describe, expect, it } from 'vitest'
import { createRequestGate } from './request-gate'

interface Deferred {
  promise: Promise<string>
  resolve: (value: string) => void
  reject: (error: unknown) => void
}

/** Une promesse qu'on résout à la main. */
function deferred(): Deferred {
  let resolve: (value: string) => void = () => undefined
  let reject: (error: unknown) => void = () => undefined
  const promise = new Promise<string>((ok, ko) => {
    resolve = ok
    reject = ko
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function harness(maxConcurrent = 2, idleMs = 1000, leaderTimeoutMs = 5000) {
  let now = 0
  const timers: Array<{ run: () => void; at: number; cleared: boolean }> = []
  const gate = createRequestGate({
    maxConcurrent,
    idleMs,
    leaderTimeoutMs,
    now: () => now,
    setTimer: (run, ms) => {
      const timer = { run, at: now + ms, cleared: false }
      timers.push(timer)
      return timer
    },
    clearTimer: timer => {
      ;(timer as { cleared: boolean }).cleared = true
    },
  })
  const started: string[] = []
  const pending = new Map<string, Deferred>()
  const request = (name: string) => {
    const d = deferred()
    pending.set(name, d)
    return gate.run(() => {
      started.push(name)
      return d.promise
    })
  }
  const advance = (ms: number) => {
    now += ms
    for (const t of timers) {
      if (!t.cleared && t.at <= now) {
        t.cleared = true
        t.run()
      }
    }
  }
  return { gate, request, started, pending, advance }
}

describe('createRequestGate', () => {
  it('fait partir seule la première requête, puis les autres à sa réponse', async () => {
    const h = harness(4)
    const a = h.request('a')
    const b = h.request('b')
    const c = h.request('c')
    await flush()
    expect(h.started).toEqual(['a'])
    h.pending.get('a')?.resolve('A')
    await flush()
    expect(h.started).toEqual(['a', 'b', 'c'])
    h.pending.get('b')?.resolve('B')
    h.pending.get('c')?.resolve('C')
    expect(await Promise.all([a, b, c])).toEqual(['A', 'B', 'C'])
  })

  it('ne garde jamais plus de requêtes en cours que permis, dans l’ordre', async () => {
    const h = harness(2)
    const first = h.request('wake')
    await flush()
    h.pending.get('wake')?.resolve('ok')
    await first
    const all = ['a', 'b', 'c', 'd'].map(name => h.request(name))
    await flush()
    expect(h.started.slice(1)).toEqual(['a', 'b'])
    expect(h.gate.stats).toEqual({ active: 2, queued: 2 })
    h.pending.get('b')?.resolve('B')
    await flush()
    expect(h.started.slice(1)).toEqual(['a', 'b', 'c'])
    h.pending.get('a')?.resolve('A')
    h.pending.get('c')?.resolve('C')
    await flush()
    expect(h.started.slice(1)).toEqual(['a', 'b', 'c', 'd'])
    h.pending.get('d')?.resolve('D')
    await Promise.all(all)
    expect(h.gate.stats).toEqual({ active: 0, queued: 0 })
  })

  it('après un silence, la requête suivante réveille seule l’API', async () => {
    const h = harness(4, 1000)
    const wake = h.request('wake')
    await flush()
    h.pending.get('wake')?.resolve('ok')
    await wake
    h.advance(500)
    void h.request('warm-1')
    void h.request('warm-2')
    await flush()
    expect(h.started).toEqual(['wake', 'warm-1', 'warm-2'])
    h.pending.get('warm-1')?.resolve('ok')
    h.pending.get('warm-2')?.resolve('ok')
    await flush()
    h.advance(1001)
    void h.request('cold-1')
    void h.request('cold-2')
    await flush()
    expect(h.started.slice(3)).toEqual(['cold-1'])
    h.pending.get('cold-1')?.resolve('ok')
    await flush()
    expect(h.started.slice(3)).toEqual(['cold-1', 'cold-2'])
  })

  it('libère les autres si le réveil tarde', async () => {
    const h = harness(4, 1000, 5000)
    void h.request('slow')
    void h.request('next')
    await flush()
    expect(h.started).toEqual(['slow'])
    h.advance(5000)
    await flush()
    expect(h.started).toEqual(['slow', 'next'])
    // La réponse tardive du réveil ne gêne rien.
    h.pending.get('slow')?.resolve('ok')
    h.pending.get('next')?.resolve('ok')
    await flush()
    expect(h.gate.stats).toEqual({ active: 0, queued: 0 })
  })

  it('un échec libère le créneau et réveille aussi les suivantes', async () => {
    const h = harness(1)
    const failing = h.request('down')
    const next = h.request('next')
    await flush()
    h.pending.get('down')?.reject(new TypeError('Failed to fetch'))
    await expect(failing).rejects.toThrow('Failed to fetch')
    await flush()
    expect(h.started).toEqual(['down', 'next'])
    h.pending.get('next')?.resolve('ok')
    await expect(next).resolves.toBe('ok')
  })
})
