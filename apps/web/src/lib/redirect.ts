/**
 * Quitter l'application pour une autre adresse (client OAuth après le
 * consentement). Isolé pour que les tests l'observent sans naviguer.
 */
export function leaveApp(url: string): void {
  window.location.assign(url)
}
