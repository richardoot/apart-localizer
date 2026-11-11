/**
 * Lot 26 (ADR 0036) : les textes de la page « Claude » qui ne viennent ni du
 * serveur ni de `contracts` : les étapes pour brancher le connecteur dans
 * claude.ai, et la mise en garde d'une adresse locale. Pur.
 */

/** Les étapes, dans l'ordre (claude.ai, réglages des connecteurs ; page de consentement de l'application). */
export const CLAUDE_CONNECT_STEPS: readonly string[] = [
  'Dans claude.ai, ouvre Paramètres, puis Connecteurs.',
  'Choisis « Ajouter un connecteur personnalisé » et colle l’adresse ci-dessus.',
  'Claude ouvre la page d’autorisation de l’application : connecte-toi avec ton compte de l’espace, puis « Autoriser ».',
  'Dans une conversation, active le connecteur apart-localizer ; pour lire les portails, active aussi Claude in Chrome.',
]

/** Vrai si l'adresse ne peut pas être jointe par claude.ai (développement local). */
export function isLocalAddress(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.local')
    )
  } catch {
    return false
  }
}
