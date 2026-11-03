import source from '../../public/push-handler.js?raw'
import { describe, expect, it, vi } from 'vitest'

/**
 * Le script du service worker (public/push-handler.js) chargé dans un faux
 * `self` : il affiche la notification reçue et, au clic, ouvre l'application
 * sur le lien donné, jamais ailleurs que sur son origine.
 */

function load() {
  const listeners = new Map<string, (event: unknown) => void>()
  const showNotification = vi.fn().mockResolvedValue(undefined)
  const openWindow = vi.fn().mockResolvedValue(undefined)
  const windows: Array<{
    url: string
    focus: () => unknown
    navigate?: (u: string) => Promise<unknown>
  }> = []
  const self = {
    addEventListener: (type: string, listener: (event: unknown) => void) =>
      listeners.set(type, listener),
    registration: { showNotification },
    location: { origin: 'https://apart.invalid' },
  }
  const clients = {
    matchAll: vi.fn().mockImplementation(() => Promise.resolve(windows)),
    openWindow,
  }
  new Function('self', 'clients', source)(self, clients)
  return { listeners, showNotification, openWindow, windows }
}

function waitUntil(): {
  waitUntil: (p: Promise<unknown>) => void
  done: Promise<unknown>[]
} {
  const done: Promise<unknown>[] = []
  return { waitUntil: p => done.push(p), done }
}

describe('push-handler.js', () => {
  it('affiche la notification envoyée par le serveur', async () => {
    const sw = load()
    const wait = waitUntil()
    sw.listeners.get('push')?.({
      data: {
        json: () => ({
          title: 'Nouvelle annonce : T2',
          body: 'Par Chloé',
          url: '/annonces/1',
          tag: 'l1',
        }),
      },
      ...wait,
    })
    await Promise.all(wait.done)
    expect(sw.showNotification).toHaveBeenCalledWith('Nouvelle annonce : T2', {
      body: 'Par Chloé',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      lang: 'fr',
      tag: 'l1',
      data: { url: '/annonces/1' },
    })
  })

  it('tolère un message illisible', async () => {
    const sw = load()
    const wait = waitUntil()
    sw.listeners.get('push')?.({
      data: {
        json: () => {
          throw new Error('pas du JSON')
        },
        text: () => 'texte brut',
      },
      ...wait,
    })
    await Promise.all(wait.done)
    expect(sw.showNotification).toHaveBeenCalledWith(
      'apart-localizer',
      expect.objectContaining({ body: 'texte brut', data: { url: '/' } })
    )
  })

  it('au clic, ramène une fenêtre ouverte ou en ouvre une, sur la même origine seulement', async () => {
    const sw = load()
    const close = vi.fn()
    const wait = waitUntil()
    sw.listeners.get('notificationclick')?.({
      notification: { close, data: { url: 'https://evil.invalid/phish' } },
      ...wait,
    })
    await Promise.all(wait.done)
    expect(close).toHaveBeenCalled()
    expect(sw.openWindow).toHaveBeenCalledWith('https://apart.invalid/')
    const focus = vi.fn()
    const navigate = vi.fn().mockResolvedValue(null)
    sw.windows.push({ url: 'https://apart.invalid/annonces', focus, navigate })
    const again = waitUntil()
    sw.listeners.get('notificationclick')?.({
      notification: { close, data: { url: '/annonces/42' } },
      ...again,
    })
    await Promise.all(again.done)
    expect(navigate).toHaveBeenCalledWith('https://apart.invalid/annonces/42')
    expect(focus).toHaveBeenCalled()
  })
})
