import { parseArgs } from 'node:util'

/**
 * Les options de `pnpm stack:<commande>`. Analyse pure, testée sans
 * conteneur ; les erreurs sont des phrases à montrer telles quelles.
 */

export const STACK_COMMANDS = ['up', 'down', 'status', 'reset'] as const
export type StackCommand = (typeof STACK_COMMANDS)[number]

export const DATASETS = ['none', 'demo', 'artifact'] as const
export type Dataset = (typeof DATASETS)[number]

export interface StackOptions {
  command: StackCommand
  dataset: Dataset
  opendata: boolean
  dev: boolean
  yes: boolean
  help: boolean
  richardEmail: string | null
  chloeEmail: string | null
  /** `reset` seulement : une base locale jetable plutôt que celle du Supabase CLI. */
  databaseUrl: string | null
}

export class StackUsageError extends Error {}

export const STACK_HELP = `Pile locale d'apart-localizer (Supabase CLI + base de test).

  pnpm stack:up [--dataset none|demo|artifact] [--opendata] [--dev]
                [--richard-email E] [--chloe-email E]
  pnpm stack:down
  pnpm stack:status
  pnpm stack:reset --yes [--dataset none|demo|artifact] [--opendata]

Options :
  --dataset JEU        none (défaut) : ne touche pas aux données ;
                       demo : espace « Démo » fictif à deux membres, recréé à l'identique ;
                       artifact : import de data/private/artifact-export/ (vos annonces).
  --opendata           lance aussi les imports open data dont les fichiers sont dans data/opendata/.
  --dev                lance \`pnpm dev\` (API et web, rechargement à chaud) après le récapitulatif.
  --richard-email E    e-mail du membre « richard » importé (--dataset artifact), aussi
  --chloe-email E      lus dans IMPORT_RICHARD_EMAIL / IMPORT_CHLOE_EMAIL (data/private/import.env).
  --yes                confirme stack:reset, qui VIDE le schéma app local.
  --database-url URL   stack:reset sur une autre base locale (jetable), au lieu de 54322.
  --help               cette aide.

Voir docs/developpement-local.md.`

/** Les arguments d'une commande `stack`, sans le séparateur `--` de pnpm. */
export function parseStackArgs(argv: readonly string[]): StackOptions {
  const args = argv.filter(arg => arg !== '--')
  const [first, ...rest] = args
  if (first === '--help' || first === '-h' || first === undefined) {
    return defaults('up', { help: true })
  }
  if (!(STACK_COMMANDS as readonly string[]).includes(first)) {
    throw new StackUsageError(
      `Commande inconnue « ${first} » : attendu ${STACK_COMMANDS.join(', ')}.`
    )
  }
  const command = first as StackCommand
  let values: Record<string, string | boolean | undefined>
  try {
    values = parseArgs({
      args: rest,
      allowPositionals: false,
      strict: true,
      options: {
        dataset: { type: 'string' },
        opendata: { type: 'boolean' },
        dev: { type: 'boolean' },
        yes: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        'richard-email': { type: 'string' },
        'chloe-email': { type: 'string' },
        'database-url': { type: 'string' },
      },
    }).values
  } catch (error) {
    throw new StackUsageError(
      `${error instanceof Error ? error.message : String(error)}\n\n${STACK_HELP}`
    )
  }

  const dataset = (values.dataset ?? 'none') as string
  if (!(DATASETS as readonly string[]).includes(dataset)) {
    throw new StackUsageError(
      `Jeu de données inconnu « ${dataset} » : attendu ${DATASETS.join(', ')}.`
    )
  }
  const options = defaults(command, {
    dataset: dataset as Dataset,
    opendata: values.opendata === true,
    dev: values.dev === true,
    yes: values.yes === true,
    help: values.help === true,
    richardEmail: (values['richard-email'] as string | undefined) ?? null,
    chloeEmail: (values['chloe-email'] as string | undefined) ?? null,
    databaseUrl: (values['database-url'] as string | undefined) ?? null,
  })

  const onlyFor = (flag: string, allowed: StackCommand[], set: boolean) => {
    if (set && !allowed.includes(command)) {
      throw new StackUsageError(
        `L'option ${flag} ne s'applique pas à stack:${command} (seulement ${allowed.map(c => `stack:${c}`).join(', ')}).`
      )
    }
  }
  onlyFor('--dataset', ['up', 'reset'], values.dataset !== undefined)
  onlyFor('--opendata', ['up', 'reset'], options.opendata)
  onlyFor('--dev', ['up'], options.dev)
  onlyFor('--yes', ['reset'], options.yes)
  onlyFor('--database-url', ['reset'], options.databaseUrl !== null)
  onlyFor(
    '--richard-email / --chloe-email',
    ['up', 'reset'],
    options.richardEmail !== null || options.chloeEmail !== null
  )
  if (
    (options.richardEmail !== null || options.chloeEmail !== null) &&
    options.dataset !== 'artifact'
  ) {
    throw new StackUsageError(
      '--richard-email et --chloe-email ne servent qu’avec --dataset artifact.'
    )
  }
  for (const [flag, email] of [
    ['--richard-email', options.richardEmail],
    ['--chloe-email', options.chloeEmail],
  ] as const) {
    if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new StackUsageError(
        `${flag} : « ${email} » n'est pas une adresse e-mail.`
      )
    }
  }
  return options
}

function defaults(
  command: StackCommand,
  overrides: Partial<StackOptions>
): StackOptions {
  return {
    command,
    dataset: 'none',
    opendata: false,
    dev: false,
    yes: false,
    help: false,
    richardEmail: null,
    chloeEmail: null,
    databaseUrl: null,
    ...overrides,
  }
}
