/**
 * Les deux comptes de démonstration, créés dans le GoTrue LOCAL par le seed
 * (`pnpm stack:up --dataset demo`) pour tester la collaboration à deux
 * (avis, « nouvelle », notifications). Mot de passe public, documenté, qui
 * n'existe que sur la pile locale : le seed refuse tout hôte non local.
 */
export const DEMO_PASSWORD = 'demo-apart-local'

export const DEMO_ACCOUNTS = [
  {
    handle: 'demo',
    email: 'demo@apart.local',
    displayName: 'Camille (démo)',
    role: 'owner' as const,
  },
  {
    handle: 'demo2',
    email: 'demo2@apart.local',
    displayName: 'Sacha (démo)',
    role: 'member' as const,
  },
] as const

export const DEMO_WORKSPACE_NAME = 'Démo'
