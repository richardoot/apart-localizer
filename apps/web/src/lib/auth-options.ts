/**
 * La connexion par e-mail et mot de passe, réservée au développement local
 * (ADR 0016) : visible seulement quand `VITE_AUTH_PASSWORD=1`, ce que
 * `pnpm stack:up` écrit dans apps/web/.env. Absente de `.env.example` et
 * désactivée par défaut : en production, Google reste le seul moyen.
 */
export function passwordSignInEnabled(
  env: Partial<Pick<ImportMetaEnv, 'VITE_AUTH_PASSWORD'>> = import.meta.env
): boolean {
  return env.VITE_AUTH_PASSWORD === '1'
}

/**
 * Où aller après la connexion : un chemin de l'application (`/…`), jamais
 * une autre origine (`//hôte`, `https://…`), sinon la synthèse.
 */
export function safeRedirectPath(value: unknown): string {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\')
    ? value
    : '/'
}
