/*
 * Web Push pour la PWA apart-localizer (lot 6), importé par le service worker
 * généré (vite-plugin-pwa, `workbox.importScripts`). Le serveur envoie
 * `{ title, body, url, tag }` ; un clic ouvre (ou ramène au premier plan)
 * l'application sur `url`, toujours sur la même origine.
 */
/* global self, clients */
self.addEventListener('push', event => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = typeof data.title === 'string' ? data.title : 'apart-localizer'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      lang: 'fr',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      data: { url: typeof data.url === 'string' ? data.url : '/' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const origin = self.location.origin
  let target = new URL('/', origin)
  try {
    const candidate = new URL(event.notification.data?.url ?? '/', origin)
    if (candidate.origin === origin) target = candidate
  } catch {
    // Lien illisible : l'accueil.
  }
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(windows => {
        for (const client of windows) {
          if (client.url.startsWith(origin) && 'focus' in client) {
            return (
              'navigate' in client
                ? client.navigate(target.href)
                : Promise.resolve(client)
            ).then(c => (c ?? client).focus())
          }
        }
        return clients.openWindow(target.href)
      })
  )
})
