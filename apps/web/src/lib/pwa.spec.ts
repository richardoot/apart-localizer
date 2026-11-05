import { describe, expect, it, vi } from 'vitest'
import type { RegisterSWOptions } from 'virtual:pwa-register'
import {
  RELOAD_GUARD_KEY,
  RELOAD_GUARD_MS,
  UPDATE_CHECK_MS,
  installServiceWorker,
  sessionStorageOrNull,
  shouldReload,
} from './pwa'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

function setup(now = 1_000_000) {
  let options: RegisterSWOptions = {}
  const deps = {
    register: vi.fn((o: RegisterSWOptions) => {
      options = o
      return () => Promise.resolve()
    }),
    storage: memoryStorage(),
    reload: vi.fn(),
    now: vi.fn(() => now),
    setInterval: vi.fn(),
  }
  installServiceWorker(deps)
  return { deps, options: () => options }
}

describe('service worker (PWA)', () => {
  it('s’enregistre aussitôt et recharge la page une fois la nouvelle version active', () => {
    const { deps, options } = setup()
    expect(options().immediate).toBe(true)
    options().onNeedReload?.()
    expect(deps.reload).toHaveBeenCalledTimes(1)
    expect(deps.storage.getItem(RELOAD_GUARD_KEY)).toBe('1000000')
  })

  it('pas de boucle : un second signal juste après un rechargement est ignoré', () => {
    const { deps, options } = setup()
    options().onNeedReload?.()
    options().onNeedReload?.()
    expect(deps.reload).toHaveBeenCalledTimes(1)
    // Une nouvelle version plus tard recharge de nouveau.
    deps.now.mockReturnValue(1_000_000 + RELOAD_GUARD_MS + 1)
    options().onNeedReload?.()
    expect(deps.reload).toHaveBeenCalledTimes(2)
  })

  it('cherche une mise à jour toutes les heures', async () => {
    const { deps, options } = setup()
    const update = vi.fn(() => Promise.resolve())
    options().onRegisteredSW?.('/sw.js', {
      update,
    } as unknown as ServiceWorkerRegistration)
    expect(deps.setInterval).toHaveBeenCalledWith(
      expect.any(Function),
      UPDATE_CHECK_MS
    )
    const tick = deps.setInterval.mock.calls[0]?.[0] as () => void
    tick()
    expect(update).toHaveBeenCalledTimes(1)
    options().onRegisteredSW?.('/sw.js', undefined)
    expect(deps.setInterval).toHaveBeenCalledTimes(1)
    await Promise.resolve()
  })

  it('stockage refusé : rechargement simple ; stockage absent : rien ne casse', () => {
    const broken = {
      getItem: () => {
        throw new Error('refusé')
      },
      setItem: () => undefined,
    }
    expect(shouldReload(broken, 1)).toBe(true)
    expect(shouldReload(null, 1)).toBe(true)
    // Une horloge revenue en arrière ne bloque pas le rechargement.
    const storage = memoryStorage()
    storage.setItem(RELOAD_GUARD_KEY, '5000')
    expect(shouldReload(storage, 1000)).toBe(true)
    expect(sessionStorageOrNull()).not.toBeUndefined()
  })
})
