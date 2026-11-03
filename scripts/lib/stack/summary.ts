import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../demo/accounts.js'
import type { Dataset } from './options.js'

/** Les adresses de la pile locale, une fois démarrée. */
export const LOCAL_URLS = {
  web: 'http://localhost:5173',
  api: 'http://localhost:3000',
  swagger: 'http://localhost:3000/api/docs',
  mcp: 'http://localhost:3000/mcp',
  testDatabase: 'postgresql://postgres:postgres@127.0.0.1:54329/postgres',
} as const

export interface SummaryInput {
  supabaseUrl: string
  dbUrl: string
  studioUrl: string | null
  mailUrl: string | null
  dataset: Dataset
  opendata: boolean
  googleEnabled: boolean
  durationMs: number
  /** Lancement de `pnpm dev` juste après. */
  dev: boolean
  warnings: string[]
}

const row = (label: string, value: string, note = '') =>
  `  ${label.padEnd(15)}${value}${note ? `   ${note}` : ''}`

/** Le récapitulatif imprimé à la fin de `stack:up` : adresses, comptes, jeu chargé, commandes. */
export function formatSummary(input: SummaryInput): string {
  const devNote = input.dev ? '' : '(après `pnpm dev`)'
  const lines = [
    '',
    `Pile locale prête en ${(input.durationMs / 1000).toFixed(0)} s.`,
    '',
    row('Web', LOCAL_URLS.web, devNote),
    row('API', LOCAL_URLS.api, devNote),
    row('Swagger', LOCAL_URLS.swagger),
    row(
      'MCP',
      LOCAL_URLS.mcp,
      'découverte : /.well-known/oauth-protected-resource'
    ),
    row('Supabase', input.supabaseUrl),
    ...(input.studioUrl ? [row('Studio', input.studioUrl)] : []),
    ...(input.mailUrl
      ? [
          row(
            'E-mails',
            input.mailUrl,
            'Mailpit (ex-Inbucket) : ce que GoTrue enverrait'
          ),
        ]
      : []),
    row('Base', input.dbUrl),
    row('Base de test', LOCAL_URLS.testDatabase),
    '',
    `Jeu de données : ${datasetLabel(input.dataset)}${input.opendata ? ' ; imports open data lancés' : ''}`,
  ]
  if (input.dataset === 'demo') {
    lines.push(
      'Comptes de démo (pile locale seulement, connexion par e-mail sur la page de connexion) :',
      ...DEMO_ACCOUNTS.map(
        a => `  ${a.email.padEnd(20)} ${DEMO_PASSWORD}   ${a.displayName}`
      )
    )
  }
  lines.push(
    `Connexion Google : ${input.googleEnabled ? 'activée (supabase/.env)' : 'désactivée (identifiants absents de supabase/.env) ; connexion par e-mail et mot de passe'}`
  )
  if (input.warnings.length > 0) {
    lines.push('', 'À noter :', ...input.warnings.map(w => `  ! ${w}`))
  }
  lines.push(
    '',
    'Commandes utiles :',
    '  pnpm dev                          API et web, rechargement à chaud',
    '  pnpm stack:status                 état de la pile, comptes par espace',
    '  pnpm stack:down                   arrêt (données conservées)',
    '  pnpm stack:up --dataset demo      recharger l’espace Démo',
    '  pnpm verify --quick               vérifier avant de pousser (pnpm verify : comme la CI)',
    `  claude mcp add --transport http apart-local ${LOCAL_URLS.mcp}`,
    '  Documentation : docs/developpement-local.md',
    ''
  )
  return lines.join('\n')
}

export function datasetLabel(dataset: Dataset): string {
  switch (dataset) {
    case 'none':
      return 'aucun (données existantes laissées telles quelles)'
    case 'demo':
      return 'démo (espace « Démo » fictif, recréé à l’identique)'
    case 'artifact':
      return 'artefact (data/private/artifact-export, vos annonces)'
  }
}
