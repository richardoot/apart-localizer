import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  utimesSync,
  writeFileSync,
  existsSync,
  copyFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { parseEnv } from '../lib/env-file.js'
import type { StackDatabase } from '../lib/stack/database.js'
import { parseStackArgs } from '../lib/stack/options.js'
import type { RunOptions, RunResult, Runner } from '../lib/stack/runner.js'
import { Stack, StackError } from '../lib/stack/stack.js'
import { DEMO_PASSWORD } from '../lib/demo/accounts.js'

const repo = path.resolve(import.meta.dirname, '..', '..')

const STATUS = [
  'Stopped services: [supabase_imgproxy_apart-localizer]',
  'ANON_KEY="anon-locale"',
  'API_URL="http://127.0.0.1:54321"',
  'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
  'MAILPIT_URL="http://127.0.0.1:54324"',
  'SERVICE_ROLE_KEY="service-locale"',
  'STUDIO_URL="http://127.0.0.1:54323"',
].join('\n')

interface Call {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv | undefined
}

/** Un faux monde : la CLI Supabase, podman et pnpm simulés, sans rien lancer. */
class FakeWorld implements Runner {
  calls: Call[] = []
  running = false
  machineRunning = true
  startFailures = 0
  available = new Set(['pnpm', 'supabase', 'podman'])
  constructor(readonly socket: string) {}

  run(
    command: string,
    args: readonly string[],
    options: RunOptions = {}
  ): RunResult {
    const list = [...args]
    this.calls.push({ command, args: list, env: options.env })
    const ok = (stdout = ''): RunResult => ({ status: 0, stdout, stderr: '' })
    const key = `${command} ${list.join(' ')}`
    if (key === 'pnpm --version') return ok('12.5.1\n')
    if (key === 'supabase --version') return ok('3.0.0\n')
    if (key === 'podman machine list --format json') {
      return ok(
        JSON.stringify([
          {
            Name: 'podman-machine-default',
            Default: true,
            Running: this.machineRunning,
            Starting: false,
          },
        ])
      )
    }
    if (key.startsWith('podman machine start')) {
      this.machineRunning = true
      return ok()
    }
    if (key.startsWith('podman machine inspect')) return ok(`${this.socket}\n`)
    if (key === 'supabase status -o env')
      return this.running
        ? ok(STATUS)
        : { status: 1, stdout: '', stderr: 'not running' }
    if (key === 'supabase start') {
      if (this.startFailures > 0) {
        this.startFailures--
        return { status: 1, stdout: '', stderr: 'port already allocated' }
      }
      this.running = true
      return ok()
    }
    if (key === 'supabase stop') {
      this.running = false
      return ok()
    }
    return ok()
  }

  has(command: string): boolean {
    return this.available.has(command)
  }

  commands(): string[] {
    return this.calls
      .map(c => `${c.command} ${c.args.join(' ')}`)
      .filter(
        c => !/--version|machine list|machine inspect|status -o env/.test(c)
      )
  }

  find(fragment: string): Call | undefined {
    return this.calls.find(c =>
      `${c.command} ${c.args.join(' ')}`.includes(fragment)
    )
  }
}

class FakeDb implements StackDatabase {
  queries: Array<{ url: string; sql: string }> = []
  async query<T extends Record<string, unknown>>(
    url: string,
    sql: string
  ): Promise<T[]> {
    this.queries.push({ url, sql })
    if (sql.includes('to_regclass'))
      return [{ present: true }] as unknown as T[]
    if (sql.includes('FROM app.workspaces')) {
      return [
        { name: 'Richard et Chloé', listings: 29, members: 2 },
      ] as unknown as T[]
    }
    return []
  }
  async waitFor(): Promise<void> {}
}

function makeRoot(): { root: string; socket: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'apart-stack-'))
  const write = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), content)
  }
  write(
    'package.json',
    JSON.stringify({ engines: { node: '24.x' }, packageManager: 'pnpm@12.5.1' })
  )
  for (const file of [
    'apps/api/.env.example',
    'apps/web/.env.example',
    'supabase/.env.example',
    'supabase/config.toml',
    'docker/test-db.yml',
  ]) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    copyFileSync(path.join(repo, file), path.join(root, file))
  }
  // Code déjà construit : sources plus anciennes que les sorties.
  const old = new Date('2026-01-01T00:00:00Z')
  for (const pkg of ['packages/contracts', 'packages/domain']) {
    write(`${pkg}/src/index.ts`, 'export {}')
    utimesSync(path.join(root, pkg, 'src/index.ts'), old, old)
    write(`${pkg}/dist/index.js`, 'export {}')
  }
  write('apps/api/prisma/schema.prisma', '// schéma')
  utimesSync(path.join(root, 'apps/api/prisma/schema.prisma'), old, old)
  write('apps/api/src/generated/prisma/index.js', '// client')
  const socket = path.join(root, 'podman.sock')
  writeFileSync(socket, '')
  return { root, socket }
}

function makeStack(
  root: string,
  world: FakeWorld,
  env: NodeJS.ProcessEnv = {}
) {
  const lines: string[] = []
  const db = new FakeDb()
  let clock = Date.parse('2026-11-03T10:00:00Z')
  const stack = new Stack({
    root,
    runner: world,
    db,
    env: { PATH: '/usr/bin', ...env },
    platform: 'darwin',
    nodeVersion: 'v24.21.0',
    log: line => lines.push(line),
    now: () => (clock += 1000),
    probe: async () => null,
    // Seul le socket de la machine podman répond (l'ancien DOCKER_HOST est mort).
    socketAlive: async (p: string) => p === world.socket,
  })
  return { stack, lines, db }
}

const envOf = (root: string, file: string) =>
  parseEnv(readFileSync(path.join(root, file), 'utf8'))

describe('stack:up', () => {
  let root: string
  let world: FakeWorld

  beforeEach(() => {
    const made = makeRoot()
    root = made.root
    world = new FakeWorld(made.socket)
  })

  it('démarre tout dans l’ordre et écrit les .env par fusion, sans perdre les valeurs de l’utilisateur', async () => {
    writeFileSync(
      path.join(root, 'apps/api/.env'),
      'ANTHROPIC_API_KEY=sk-ant-perso\nDATABASE_URL=postgresql://ancienne@127.0.0.1:5432/x\nDIRECT_URL=postgresql://ailleurs@db.invalid/x\nSENTRY_DSN=https://k@sentry.invalid/1\n'
    )
    const { stack, lines } = makeStack(root, world, {
      DOCKER_HOST: 'unix:///Users/moi/docker.sock',
    })
    await stack.up(parseStackArgs(['up', '--dataset', 'demo']))

    expect(world.commands()).toEqual([
      'supabase start',
      'pnpm --filter @apart/api prisma:deploy',
      'supabase seed buckets --yes',
      `podman compose -f ${path.join(root, 'docker/test-db.yml')} up -d`,
      'pnpm --filter @apart/scripts exec tsx seed-demo.ts',
      'pnpm --filter @apart/scripts exec tsx link-local-identities.ts',
    ])
    // Le DOCKER_HOST hérité visait un socket disparu : remplacé par podman.
    expect(world.find('supabase start')?.env?.DOCKER_HOST).toBe(
      `unix://${world.socket}`
    )
    // Les migrations ne partent jamais ailleurs que sur la base locale.
    expect(world.find('prisma:deploy')?.env).toMatchObject({
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      DIRECT_URL: '',
    })

    const api = envOf(root, 'apps/api/.env')
    expect(api.get('ANTHROPIC_API_KEY')).toBe('sk-ant-perso')
    expect(api.get('SENTRY_DSN')).toBe('https://k@sentry.invalid/1')
    expect(api.get('DATABASE_URL')).toBe(
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
    )
    expect(api.get('DIRECT_URL')).toBe('')
    expect(api.get('SUPABASE_SERVICE_ROLE_KEY')).toBe('service-locale')
    expect(api.get('TEST_DATABASE_URL')).toBe(
      'postgresql://postgres:postgres@127.0.0.1:54329/postgres'
    )
    expect(api.get('VAPID_PUBLIC_KEY')).toMatch(/^[A-Za-z0-9_-]{87}$/)
    expect(api.get('VAPID_SUBJECT')).toBe('mailto:demo@apart.local')
    expect(
      readFileSync(path.join(root, 'apps/api/.env.backup'), 'utf8')
    ).toContain('ANTHROPIC_API_KEY=sk-ant-perso')

    const web = envOf(root, 'apps/web/.env')
    expect(web.get('VITE_SUPABASE_ANON_KEY')).toBe('anon-locale')
    expect(web.get('VITE_AUTH_PASSWORD')).toBe('1')
    expect(web.get('VITE_API_URL')).toBe('http://localhost:3000')
    expect(existsSync(path.join(root, 'apps/web/.env.backup'))).toBe(false)

    expect(
      envOf(root, 'supabase/.env').get('SUPABASE_AUTH_GOOGLE_ENABLED')
    ).toBe('false')
    const output = lines.join('\n')
    expect(output).toContain(DEMO_PASSWORD)
    expect(output).toContain('http://localhost:3000/mcp')
    expect(output).not.toContain('service-locale')
  })

  it('est idempotent : relancé sur une pile démarrée, il ne redémarre rien et ne réécrit rien', async () => {
    await makeStack(root, world).stack.up(parseStackArgs(['up']))
    const before = {
      api: readFileSync(path.join(root, 'apps/api/.env'), 'utf8'),
      web: readFileSync(path.join(root, 'apps/web/.env'), 'utf8'),
    }
    world.calls = []
    const { stack, lines } = makeStack(root, world)
    await stack.up(parseStackArgs(['up']))
    expect(world.commands()).not.toContain('supabase start')
    expect(world.commands()).not.toContain('supabase stop')
    expect(readFileSync(path.join(root, 'apps/api/.env'), 'utf8')).toBe(
      before.api
    )
    expect(readFileSync(path.join(root, 'apps/web/.env'), 'utf8')).toBe(
      before.web
    )
    expect(lines.join('\n')).toContain('déjà démarrée, configuration inchangée')
    expect(lines.join('\n')).toContain('apps/api/.env : inchangé')
  })

  it('redémarre (données conservées) quand supabase/config.toml a changé', async () => {
    await makeStack(root, world).stack.up(parseStackArgs(['up']))
    writeFileSync(path.join(root, 'supabase/config.toml'), '# modifié\n', {
      flag: 'a',
    })
    world.calls = []
    await makeStack(root, world).stack.up(parseStackArgs(['up']))
    expect(world.commands().slice(0, 2)).toEqual([
      'supabase stop',
      'supabase start',
    ])
    expect(world.commands()).not.toContain('supabase stop --no-backup')
  })

  it('redémarre une pile à moitié démarrée : stop puis start, une fois', async () => {
    world.startFailures = 1
    await makeStack(root, world).stack.up(parseStackArgs(['up']))
    expect(world.commands().slice(0, 3)).toEqual([
      'supabase start',
      'supabase stop',
      'supabase start',
    ])
  })

  it('abandonne avec le dépannage quand start échoue deux fois', async () => {
    world.startFailures = 5
    await expect(
      makeStack(root, world).stack.up(parseStackArgs(['up']))
    ).rejects.toThrow(/Dépannage/)
  })

  it('démarre la machine podman arrêtée', async () => {
    world.machineRunning = false
    await makeStack(root, world).stack.up(parseStackArgs(['up']))
    expect(world.commands()[0]).toBe(
      'podman machine start podman-machine-default'
    )
  })

  it('active Google quand supabase/.env donne identifiant et secret', async () => {
    writeFileSync(
      path.join(root, 'supabase/.env'),
      'SUPABASE_AUTH_GOOGLE_CLIENT_ID=id.apps\nSUPABASE_AUTH_GOOGLE_SECRET=secret\n'
    )
    const { stack, lines } = makeStack(root, world)
    await stack.up(parseStackArgs(['up']))
    const env = envOf(root, 'supabase/.env')
    expect(env.get('SUPABASE_AUTH_GOOGLE_ENABLED')).toBe('true')
    expect(env.get('SUPABASE_AUTH_GOOGLE_SECRET')).toBe('secret')
    expect(lines.join('\n')).toContain('Connexion Google : activée')
  })

  it('reconstruit les paquets et le client Prisma seulement s’ils datent', async () => {
    writeFileSync(
      path.join(root, 'packages/domain/src/index.ts'),
      'export const x = 1'
    )
    writeFileSync(path.join(root, 'apps/api/prisma/schema.prisma'), '// changé')
    await makeStack(root, world).stack.up(parseStackArgs(['up']))
    expect(world.commands()).toContain('pnpm build:packages')
    expect(world.commands()).toContain(
      'pnpm --filter @apart/api prisma:generate'
    )
  })

  it('--dataset artifact sans export : refus clair, rien d’importé', async () => {
    await expect(
      makeStack(root, world).stack.up(
        parseStackArgs(['up', '--dataset', 'artifact'])
      )
    ).rejects.toThrow(/data\/private\/artifact-export\/annonces\/ introuvable/)
    // Refusé avant de démarrer quoi que ce soit.
    expect(world.commands()).toEqual([])
  })

  it('--dataset artifact lit les e-mails des options, sinon de data/private/import.env', async () => {
    mkdirSync(path.join(root, 'data/private/artifact-export/annonces'), {
      recursive: true,
    })
    writeFileSync(
      path.join(root, 'data/private/import.env'),
      'IMPORT_RICHARD_EMAIL=r@exemple.fr\nIMPORT_CHLOE_EMAIL=c@exemple.fr\n'
    )
    await makeStack(root, world).stack.up(
      parseStackArgs([
        'up',
        '--dataset',
        'artifact',
        '--chloe-email',
        'autre@exemple.fr',
      ])
    )
    const call = world.find('import-artifact.ts')
    expect(call?.args).toEqual(
      expect.arrayContaining([
        '--richard-email',
        'r@exemple.fr',
        '--chloe-email',
        'autre@exemple.fr',
      ])
    )
  })

  it('--opendata lance les imports dont les fichiers sont là', async () => {
    mkdirSync(path.join(root, 'data/opendata/dvf'), { recursive: true })
    writeFileSync(path.join(root, 'data/opendata/dvf/33-2024.csv.gz'), '')
    const { stack, lines } = makeStack(root, world)
    await stack.up(parseStackArgs(['up', '--opendata']))
    expect(world.commands()).toContain(
      'pnpm --filter @apart/scripts exec tsx import-dvf.ts --year 2024'
    )
    expect(world.commands().some(c => c.includes('import-rent-control'))).toBe(
      false
    )
    expect(lines.join('\n')).toContain('sauté : encadrement')
  })
})

describe('stack:down et stack:status', () => {
  it('arrête Supabase et la base de test sans rien effacer', async () => {
    const { root, socket } = makeRoot()
    const world = new FakeWorld(socket)
    world.running = true
    await makeStack(root, world).stack.down()
    const commands = world.commands()
    expect(commands).toContain('supabase stop')
    expect(commands).toContain(
      `podman compose -f ${path.join(root, 'docker/test-db.yml')} stop`
    )
    expect(
      commands.some(
        c => c.includes('--no-backup') || / down$/.test(c) || c.includes(' -v')
      )
    ).toBe(false)
  })

  it('crée supabase/.env s’il manque, sans quoi la CLI refuse toute commande', async () => {
    const { root, socket } = makeRoot()
    const world = new FakeWorld(socket)
    await makeStack(root, world).stack.down()
    expect(
      envOf(root, 'supabase/.env').get('SUPABASE_AUTH_GOOGLE_ENABLED')
    ).toBe('false')
  })

  it('montre l’état et les comptes par espace', async () => {
    const { root, socket } = makeRoot()
    const world = new FakeWorld(socket)
    world.running = true
    const { stack, lines } = makeStack(root, world)
    await stack.status()
    const output = lines.join('\n')
    expect(output).toContain(
      'espace « Richard et Chloé » : 29 annonces, 2 membres'
    )
    expect(output).toContain('API http://localhost:3000 : arrêtée')
    expect(world.commands()).toEqual([])
  })
})

describe('stack:reset', () => {
  it('sans --yes : montre ce qui serait supprimé et ne supprime rien', async () => {
    const { root, socket } = makeRoot()
    const world = new FakeWorld(socket)
    world.running = true
    const { stack, lines, db } = makeStack(root, world)
    await expect(stack.reset(parseStackArgs(['reset']))).rejects.toThrow(
      /--yes/
    )
    expect(lines.join('\n')).toContain(
      'espace « Richard et Chloé » : 29 annonces, 2 membres'
    )
    expect(db.queries.some(q => q.sql.includes('DROP'))).toBe(false)
    expect(world.commands()).toEqual([])
  })

  it('refuse un hôte non local, même avec --yes', async () => {
    const { root, socket } = makeRoot()
    const world = new FakeWorld(socket)
    const { stack, db } = makeStack(root, world)
    await expect(
      stack.reset(
        parseStackArgs([
          'reset',
          '--yes',
          '--database-url',
          'postgresql://u:p@db.abcd.supabase.co:5432/postgres',
        ])
      )
    ).rejects.toThrow(StackError)
    expect(db.queries).toEqual([])
    expect(world.commands()).toEqual([])
  })

  it('sans --database-url : vise la base du Supabase CLI et la passe à chaque script', async () => {
    const { root, socket } = makeRoot()
    const world = new FakeWorld(socket)
    world.running = true
    const { stack, db } = makeStack(root, world)
    await stack.reset(parseStackArgs(['reset', '--yes']))
    const local = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
    expect(
      db.queries.filter(q => q.sql.includes('DROP')).map(q => q.url)
    ).toEqual([local, local])
    expect(world.commands()).toContain(
      `pnpm --filter @apart/scripts exec tsx link-local-identities.ts --database-url ${local}`
    )
  })

  it('avec --yes : vide le schéma app, rejoue les migrations puis le jeu, sur la base visée', async () => {
    const { root, socket } = makeRoot()
    const world = new FakeWorld(socket)
    const target = 'postgresql://postgres:postgres@127.0.0.1:54329/jetable'
    const { stack, db } = makeStack(root, world)
    await stack.reset(
      parseStackArgs([
        'reset',
        '--yes',
        '--dataset',
        'demo',
        '--database-url',
        target,
      ])
    )
    expect(
      db.queries.filter(q => q.sql.includes('DROP')).map(q => [q.url, q.sql])
    ).toEqual([
      [target, 'DROP SCHEMA IF EXISTS app CASCADE'],
      [target, 'DROP TABLE IF EXISTS public._prisma_migrations'],
    ])
    expect(world.find('prisma:deploy')?.env).toMatchObject({
      DATABASE_URL: target,
      DIRECT_URL: '',
    })
    expect(world.commands()).toEqual([
      'pnpm --filter @apart/api prisma:deploy',
      `pnpm --filter @apart/scripts exec tsx seed-demo.ts --database-url ${target}`,
      `pnpm --filter @apart/scripts exec tsx link-local-identities.ts --database-url ${target}`,
    ])
  })
})
