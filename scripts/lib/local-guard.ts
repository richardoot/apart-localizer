/**
 * Garde-fou des scripts locaux (raccordement des identités, seed de démo,
 * remise à zéro, comptes GoTrue) : ils réécrivent des identifiants ou
 * suppriment des lignes, ce qui sur une vraie base donnerait les annonces de
 * l'un à l'autre ou les effacerait. Ils refusent tout hôte qui n'est pas la
 * machine elle-même.
 */
export const LOCAL_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
])

/** L'hôte d'une URL (base ou HTTP), ou null si elle ne se lit pas. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

export function isLocalUrl(url: string): boolean {
  const host = hostOf(url)
  return host !== null && LOCAL_HOSTS.has(host)
}

/** Lève une erreur lisible si l'URL ne vise pas la machine locale. */
export function assertLocalUrl(url: string, what: string): void {
  if (isLocalUrl(url)) return
  const host = hostOf(url)
  throw new Error(
    `Refusé : ${what} vise « ${host ?? url} », pas la machine locale. ` +
      'Ce script ne s’exécute que sur localhost, 127.0.0.1 ou ::1.'
  )
}
