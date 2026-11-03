import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { assertLocalUrl } from '../local-guard.js'
import { readEnvFile, writeEnvFile } from '../env-file.js'
import type { EnvWriteResult } from '../env-file.js'
import { APP_SCHEMA_EXISTS_SQL, WORKSPACE_COUNTS_SQL } from './database.js'
import type { StackDatabase, WorkspaceCount } from './database.js'
import {
  parsePodmanMachines,
  pickPodmanMachine,
  resolveDockerHost,
} from './docker-host.js'
import { openDataPlan } from './opendata-plan.js'
import type { StackOptions } from './options.js'
import { checkNode, checkPnpm, checkSupabaseCli } from './prerequisites.js'
import type { Check } from './prerequisites.js'
import type { Runner, RunOptions } from './runner.js'
import { localSupabaseFrom } from './supabase-status.js'
import type { LocalSupabase } from './supabase-status.js'
import { configHash, readState, writeState } from './state.js'
import { LOCAL_URLS, datasetLabel, formatSummary } from './summary.js'
import { generateVapidKeys } from './vapid.js'

/**
 * L'orchestrateur de la pile locale : `up`, `down`, `status`, `reset`.
 * Tout ce qui sort de la machine du script (commandes, base, horloge,
 * journal) est injecté : les tests le pilotent avec un faux lanceur, sans
 * conteneur.
 */
export interface StackDeps {
  root: string
  runner: Runner
  db: StackDatabase
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  nodeVersion: string
  log: (line: string) => void
  now: () => number
  /** Requête HTTP courte (état de l'API et du web), injectée. */
  probe: (url: string) => Promise<number | null>
  /** Un processus écoute-t-il sur ce socket Unix ? (`socketAlive`), injecté. */
  socketAlive: (path: string) => Promise<boolean>
}

export class StackError extends Error {}

const TEST_DB_COMPOSE = 'docker/test-db.yml'
const TEST_DB_ADMIN_URL = LOCAL_URLS.testDatabase
const ARTIFACT_DIR = 'data/private/artifact-export'
const IMPORT_ENV = 'data/private/import.env'

export class Stack {
  private childEnv: NodeJS.ProcessEnv
  private warnings: string[] = []
  private engine: 'podman' | 'docker' | null = null

  constructor(private readonly deps: StackDeps) {
    this.childEnv = { ...deps.env }
  }

  // ---------------------------------------------------------------------------
  // Commandes
  // ---------------------------------------------------------------------------

  async up(options: StackOptions): Promise<void> {
    const started = this.deps.now()
    // Un export absent se dit avant de démarrer quoi que ce soit.
    if (options.dataset === 'artifact') this.assertArtifactExport()
    this.section('Prérequis')
    this.checkPrerequisites()
    await this.prepareContainerEngine()

    this.section('Supabase : supabase/.env')
    const google = this.writeSupabaseEnv()

    this.section('Supabase local (supabase start)')
    const supabase = this.ensureSupabase()

    this.section('Fichiers .env de l’API et du web')
    this.writeAppEnvs(supabase)

    this.section('Code : paquets partagés et client Prisma')
    this.ensureBuilt()

    this.section('Base : migrations Prisma')
    this.migrate(supabase.dbUrl)

    this.section('Stockage : bucket des photos de visite')
    this.seedBuckets()

    this.section('Base de test (docker/test-db.yml, port 54329)')
    await this.ensureTestDatabase()

    await this.loadData(options, null)

    this.recordState(options)
    this.deps.log(
      formatSummary({
        supabaseUrl: supabase.apiUrl,
        dbUrl: supabase.dbUrl,
        studioUrl: supabase.studioUrl,
        mailUrl: supabase.mailUrl,
        dataset: options.dataset,
        opendata: options.opendata,
        googleEnabled: google,
        durationMs: this.deps.now() - started,
        dev: options.dev,
        warnings: this.warnings,
      })
    )
    if (options.dev) {
      this.section('pnpm dev (Ctrl+C pour arrêter ; la pile reste démarrée)')
      this.exec('pnpm', ['dev'], { allowFailure: true })
    }
  }

  async down(): Promise<void> {
    await this.prepareContainerEngine({ startMachine: false })
    this.ensureSupabaseEnv()
    this.section('Arrêt de Supabase (données conservées)')
    if (
      this.deps.runner.has('supabase') &&
      this.exec('supabase', ['stop'], { allowFailure: true }) !== 0
    ) {
      this.deps.log(
        '  ! `supabase stop` a échoué (voir ci-dessus) : la pile est peut-être encore démarrée.'
      )
    }
    this.section(
      'Arrêt de la base de test (conteneur gardé, données conservées)'
    )
    if (this.compose(['stop'], { allowFailure: true }) !== 0) {
      this.deps.log('  ! arrêt de la base de test en échec (voir ci-dessus).')
    }
    this.deps.log(
      '\nPile arrêtée. Les données restent dans les volumes : `pnpm stack:up` les retrouve.\n' +
        'Pour tout effacer : `pnpm stack:reset --yes` (schéma app seulement).'
    )
  }

  async status(): Promise<void> {
    await this.prepareContainerEngine({ startMachine: false })
    this.ensureSupabaseEnv()
    const state = readState(this.deps.root)
    const supabase = this.readSupabase()
    this.section('Supabase')
    if (!supabase) {
      this.deps.log('  arrêtée (ou à moitié démarrée) : `pnpm stack:up`')
    } else {
      this.deps.log(`  démarrée : ${supabase.apiUrl}, base ${supabase.dbUrl}`)
      if (supabase.studioUrl) this.deps.log(`  Studio ${supabase.studioUrl}`)
      if (supabase.mailUrl) this.deps.log(`  E-mails ${supabase.mailUrl}`)
      if (state && state.configHash !== this.currentConfigHash()) {
        this.deps.log(
          '  ! supabase/config.toml ou supabase/.env a changé depuis le démarrage : `pnpm stack:up` redémarre (données conservées).'
        )
      }
      try {
        const counts = await this.workspaceCounts(supabase.dbUrl)
        this.deps.log(
          counts === null
            ? '  schéma app absent : `pnpm stack:up` applique les migrations'
            : counts.length === 0
              ? '  aucun espace de travail'
              : counts
                  .map(
                    c =>
                      `  espace « ${c.name} » : ${c.listings} annonces, ${c.members} membres`
                  )
                  .join('\n')
        )
      } catch (error) {
        this.deps.log(`  base injoignable : ${message(error)}`)
      }
    }
    this.section('Base de test')
    try {
      await this.deps.db.waitFor(TEST_DB_ADMIN_URL, 1500)
      this.deps.log(`  joignable : ${TEST_DB_ADMIN_URL}`)
    } catch {
      this.deps.log('  arrêtée : `pnpm stack:up` ou `pnpm db:test:up`')
    }
    this.section('Application (pnpm dev)')
    const api = await this.deps.probe(`${LOCAL_URLS.api}/health`)
    const web = await this.deps.probe(LOCAL_URLS.web)
    this.deps.log(
      `  API ${LOCAL_URLS.api} : ${api === null ? 'arrêtée' : `répond ${api}`}`
    )
    this.deps.log(
      `  Web ${LOCAL_URLS.web} : ${web === null ? 'arrêté' : `répond ${web}`}`
    )
    this.section('Dernier stack:up')
    this.deps.log(
      state
        ? `  ${state.startedAt} : jeu ${datasetLabel(state.dataset)}${state.opendata ? ', open data' : ''}`
        : '  jamais lancé sur cette machine'
    )
  }

  async reset(options: StackOptions): Promise<void> {
    await this.prepareContainerEngine({ startMachine: false })
    this.ensureSupabaseEnv()
    let target = options.databaseUrl
    if (!target) {
      const supabase = this.readSupabase()
      if (!supabase) {
        throw new StackError(
          'Supabase local ne répond pas : `pnpm stack:up` d’abord (ou --database-url vers une base locale).'
        )
      }
      target = supabase.dbUrl
    }
    try {
      assertLocalUrl(target, 'stack:reset')
    } catch (error) {
      throw new StackError(message(error))
    }

    this.section(`Remise à zéro de ${redact(target)}`)
    const counts = await this.workspaceCounts(target)
    this.deps.log(
      '  Sera supprimé : le schéma `app` entier (tables, types, données) et public._prisma_migrations.'
    )
    if (counts === null) {
      this.deps.log('  (le schéma app n’existe pas encore)')
    } else if (counts.length === 0) {
      this.deps.log('  aucun espace de travail')
    } else {
      for (const c of counts) {
        this.deps.log(
          `  - espace « ${c.name} » : ${c.listings} annonces, ${c.members} membres`
        )
      }
    }
    this.deps.log(
      '  Conservés : les comptes de connexion (auth.users), les fichiers du stockage (photos orphelines), la base de test.'
    )
    if (!options.yes) {
      throw new StackError(
        'Rien n’a été supprimé. Relancez avec --yes pour confirmer : pnpm stack:reset --yes'
      )
    }
    await this.deps.db.query(target, 'DROP SCHEMA IF EXISTS app CASCADE')
    await this.deps.db.query(
      target,
      'DROP TABLE IF EXISTS public._prisma_migrations'
    )
    this.deps.log('  schéma app supprimé.')

    this.section('Base : migrations Prisma')
    this.migrate(target)
    // La base visée est passée à chaque script : pas de dépendance à apps/api/.env.
    await this.loadData(options, target)
    this.deps.log(
      `\nRemise à zéro terminée : jeu ${datasetLabel(options.dataset)}.`
    )
  }

  // ---------------------------------------------------------------------------
  // Étapes
  // ---------------------------------------------------------------------------

  private checkPrerequisites(): void {
    const pkg = JSON.parse(
      readFileSync(path.join(this.deps.root, 'package.json'), 'utf8')
    ) as {
      engines?: { node?: string }
      packageManager?: string
    }
    const pnpm = this.capture('pnpm', ['--version'])
    const supabase = this.deps.runner.has('supabase')
      ? this.capture('supabase', ['--version'])
      : null
    this.report(checkNode(this.deps.nodeVersion, pkg.engines?.node ?? '24.x'))
    this.report(checkPnpm(pnpm ?? '', pkg.packageManager ?? 'pnpm@12.5.1'))
    this.report(checkSupabaseCli(supabase))
  }

  /**
   * podman ou docker, la machine podman démarrée si besoin (macOS), et le
   * `DOCKER_HOST` que la CLI Supabase et compose doivent viser.
   */
  async prepareContainerEngine(
    options: { startMachine?: boolean } = {}
  ): Promise<void> {
    const { runner } = this.deps
    const startMachine = options.startMachine ?? true
    let podmanSocket: string | null = null
    if (runner.has('podman')) {
      this.engine = 'podman'
      if (this.deps.platform === 'darwin' || this.deps.platform === 'win32') {
        const machines = parsePodmanMachines(
          this.capture('podman', ['machine', 'list', '--format', 'json']) ??
            '[]'
        )
        const machine = pickPodmanMachine(machines)
        if (!machine) {
          throw new StackError(
            'podman est installé mais aucune machine n’existe : `podman machine init` puis relancez.'
          )
        }
        if (!machine.running && startMachine) {
          this.deps.log(
            `  machine podman « ${machine.name} » arrêtée : démarrage…`
          )
          this.exec('podman', ['machine', 'start', machine.name])
        }
        podmanSocket =
          this.capture('podman', [
            'machine',
            'inspect',
            machine.name,
            '--format',
            '{{.ConnectionInfo.PodmanSocket.Path}}',
          ])?.trim() || null
      } else {
        const remote =
          this.capture('podman', [
            'info',
            '--format',
            '{{.Host.RemoteSocket.Path}}',
          ])?.trim() ?? ''
        podmanSocket = remote.replace(/^unix:\/\//, '') || null
      }
    } else if (runner.has('docker')) {
      this.engine = 'docker'
    } else {
      throw new StackError(
        'Ni podman ni docker : installez l’un des deux (podman recommandé, voir docs/developpement-local.md).'
      )
    }
    const current = this.deps.env.DOCKER_HOST || undefined
    const candidates = [
      current?.startsWith('unix://') ? current.slice('unix://'.length) : null,
      podmanSocket,
      '/var/run/docker.sock',
    ].filter((p): p is string => p !== null)
    const alive = new Set<string>()
    for (const candidate of candidates) {
      if (existsSync(candidate) && (await this.deps.socketAlive(candidate)))
        alive.add(candidate)
    }
    const decision = resolveDockerHost({
      current,
      podmanSocket,
      dockerSocketAlive: alive.has('/var/run/docker.sock'),
      alive: p => alive.has(p),
    })
    if (decision.value) this.childEnv.DOCKER_HOST = decision.value
    else delete this.childEnv.DOCKER_HOST
    this.deps.log(`  ✓ conteneurs : ${this.engine}, ${decision.reason}`)
  }

  /**
   * Sans `supabase/.env`, la CLI refuse toute commande (`env(SUPABASE_AUTH_GOOGLE_ENABLED)`
   * non défini) : `down`, `status` et `reset` le créent depuis le modèle s'il manque.
   */
  private ensureSupabaseEnv(): void {
    if (!existsSync(path.join(this.deps.root, 'supabase/.env'))) {
      this.writeSupabaseEnv()
    }
  }

  /** `supabase/.env` : Google activé seulement si l'identifiant et le secret y sont. */
  private writeSupabaseEnv(): boolean {
    const file = path.join(this.deps.root, 'supabase/.env')
    const current = readEnvFile(file)
    const google =
      (current.get('SUPABASE_AUTH_GOOGLE_CLIENT_ID') ?? '') !== '' &&
      (current.get('SUPABASE_AUTH_GOOGLE_SECRET') ?? '') !== ''
    const result = writeEnvFile(
      file,
      {
        managed: { SUPABASE_AUTH_GOOGLE_ENABLED: google ? 'true' : 'false' },
        defaults: {
          SUPABASE_AUTH_GOOGLE_CLIENT_ID: '',
          SUPABASE_AUTH_GOOGLE_SECRET: '',
        },
      },
      path.join(this.deps.root, 'supabase/.env.example')
    )
    this.reportEnv('supabase/.env', result)
    this.deps.log(
      `  Google : ${google ? 'activé' : 'désactivé (identifiants absents), connexion par e-mail en local'}`
    )
    return google
  }

  private ensureSupabase(): LocalSupabase {
    const hash = this.currentConfigHash()
    const state = readState(this.deps.root)
    const running = this.readSupabase()
    if (running && state?.configHash === hash) {
      this.deps.log('  ✓ déjà démarrée, configuration inchangée')
      return running
    }
    if (running) {
      this.deps.log(
        state
          ? '  configuration modifiée depuis le démarrage : redémarrage (les données restent)'
          : '  démarrée hors de stack:up : redémarrage pour appliquer la configuration (les données restent)'
      )
      this.exec('supabase', ['stop'])
    }
    if (this.exec('supabase', ['start'], { allowFailure: true }) !== 0) {
      this.deps.log(
        '  échec du démarrage : arrêt de la pile à moitié démarrée puis nouvel essai (les données restent)'
      )
      this.exec('supabase', ['stop'], { allowFailure: true })
      if (this.exec('supabase', ['start'], { allowFailure: true }) !== 0) {
        throw new StackError(
          '`supabase start` échoue deux fois. Voir docs/developpement-local.md, « Dépannage » (ports occupés, DOCKER_HOST, machine podman).'
        )
      }
    }
    const started = this.readSupabase()
    if (!started) {
      throw new StackError(
        '`supabase start` a réussi mais `supabase status -o env` ne répond pas.'
      )
    }
    this.saveConfigHash(hash)
    this.deps.log(`  ✓ démarrée : ${started.apiUrl}`)
    return started
  }

  private writeAppEnvs(supabase: LocalSupabase): void {
    const root = this.deps.root
    const apiFile = path.join(root, 'apps/api/.env')
    const api = readEnvFile(apiFile)
    const defaults: Record<string, string> = {
      FRONTEND_URL: LOCAL_URLS.web,
      PORT: '3000',
      VAPID_SUBJECT: 'mailto:demo@apart.local',
    }
    if (!api.get('VAPID_PUBLIC_KEY') && !api.get('VAPID_PRIVATE_KEY')) {
      const keys = generateVapidKeys()
      defaults.VAPID_PUBLIC_KEY = keys.publicKey
      defaults.VAPID_PRIVATE_KEY = keys.privateKey
      this.deps.log('  clés VAPID locales générées (web push)')
    } else if (!api.get('VAPID_PUBLIC_KEY') || !api.get('VAPID_PRIVATE_KEY')) {
      this.warnings.push(
        'apps/api/.env n’a qu’une des deux clés VAPID : le web push reste désactivé.'
      )
    }
    const apiResult = writeEnvFile(
      apiFile,
      {
        managed: {
          DATABASE_URL: supabase.dbUrl,
          DIRECT_URL: '',
          TEST_DATABASE_URL: LOCAL_URLS.testDatabase,
          SUPABASE_URL: supabase.apiUrl,
          SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
        },
        defaults,
      },
      path.join(root, 'apps/api/.env.example')
    )
    this.reportEnv('apps/api/.env', apiResult)

    const webResult = writeEnvFile(
      path.join(root, 'apps/web/.env'),
      {
        managed: {
          VITE_SUPABASE_URL: supabase.apiUrl,
          VITE_SUPABASE_ANON_KEY: supabase.anonKey,
          VITE_AUTH_PASSWORD: '1',
        },
        defaults: { VITE_API_URL: LOCAL_URLS.api },
      },
      path.join(root, 'apps/web/.env.example')
    )
    this.reportEnv('apps/web/.env', webResult)
  }

  /** Les paquets partagés (`dist`) et le client Prisma, seulement s'ils manquent ou datent. */
  private ensureBuilt(): void {
    const root = this.deps.root
    const stale = ['packages/contracts', 'packages/domain'].filter(dir =>
      isStale(
        path.join(root, dir, 'src'),
        path.join(root, dir, 'dist/index.js')
      )
    )
    if (stale.length > 0) {
      this.deps.log(`  construction de ${stale.join(', ')}…`)
      this.exec('pnpm', ['build:packages'])
    } else {
      this.deps.log('  ✓ paquets partagés à jour')
    }
    const generated = path.join(root, 'apps/api/src/generated/prisma/index.js')
    if (isStale(path.join(root, 'apps/api/prisma/schema.prisma'), generated)) {
      this.deps.log('  génération du client Prisma…')
      this.exec('pnpm', ['--filter', '@apart/api', 'prisma:generate'])
    } else {
      this.deps.log('  ✓ client Prisma à jour')
    }
  }

  private migrate(databaseUrl: string): void {
    try {
      assertLocalUrl(databaseUrl, 'les migrations de stack')
    } catch (error) {
      throw new StackError(message(error))
    }
    // DIRECT_URL vide : `prisma.config.ts` la préfère à DATABASE_URL ; une
    // valeur héritée ne doit jamais envoyer les migrations ailleurs.
    this.exec('pnpm', ['--filter', '@apart/api', 'prisma:deploy'], {
      env: { DATABASE_URL: databaseUrl, DIRECT_URL: '' },
    })
  }

  private seedBuckets(): void {
    if (
      this.exec('supabase', ['seed', 'buckets', '--yes'], {
        allowFailure: true,
      }) !== 0
    ) {
      this.warnings.push(
        '`supabase seed buckets` a échoué : les photos de visite ne s’enverront pas (voir Dépannage).'
      )
    }
  }

  /** La base de test : démarrée par compose, puis attendue. `strict` : un échec arrête. */
  async ensureTestDatabase(options: { strict?: boolean } = {}): Promise<void> {
    if (this.compose(['up', '-d'], { allowFailure: true }) !== 0) {
      if (options.strict)
        throw new StackError(
          '`compose up` de docker/test-db.yml a échoué (voir Dépannage).'
        )
      this.warnings.push(
        'la base de test (54329) ne démarre pas : `pnpm verify` la relancera ; voir Dépannage.'
      )
      return
    }
    await this.deps.db.waitFor(TEST_DB_ADMIN_URL, 60_000)
    this.deps.log(`  ✓ base de test joignable : ${TEST_DB_ADMIN_URL}`)
  }

  /** Jeu de données, open data, puis raccordement des identités. */
  private async loadData(
    options: StackOptions,
    databaseUrl: string | null
  ): Promise<void> {
    const dbArgs = databaseUrl ? ['--database-url', databaseUrl] : []
    this.section(`Jeu de données : ${datasetLabel(options.dataset)}`)
    if (options.dataset === 'demo') {
      this.script('seed-demo.ts', dbArgs)
    } else if (options.dataset === 'artifact') {
      this.importArtifact(options, dbArgs)
    } else {
      this.deps.log('  rien à charger')
    }
    if (options.opendata) {
      this.section('Données ouvertes (data/opendata/)')
      const dir = (name: string) =>
        listDir(path.join(this.deps.root, 'data/opendata', name))
      const plan = openDataPlan({
        encadrement: dir('encadrement'),
        tbm: dir('tbm'),
        dvf: dir('dvf'),
      })
      for (const skipped of plan.skipped) this.deps.log(`  sauté : ${skipped}`)
      for (const step of plan.steps) {
        this.deps.log(`  import : ${step.label}`)
        this.script(step.script, [...step.args, ...dbArgs])
      }
    }
    this.section('Identités locales (membres ↔ comptes GoTrue)')
    this.script('link-local-identities.ts', dbArgs)
  }

  private assertArtifactExport(): void {
    const dir = path.join(this.deps.root, ARTIFACT_DIR)
    if (!existsSync(path.join(dir, 'annonces'))) {
      throw new StackError(
        `--dataset artifact : ${ARTIFACT_DIR}/annonces/ introuvable. Placez l'export de l'artefact ` +
          '(annonces/*.json et reglages/financement.json) dans data/private/artifact-export/ ' +
          '(README, « Import des données de l’artefact »), ou prenez --dataset demo.'
      )
    }
  }

  private importArtifact(options: StackOptions, dbArgs: string[]): void {
    this.assertArtifactExport()
    const fromFile = readEnvFile(path.join(this.deps.root, IMPORT_ENV))
    const richard =
      options.richardEmail ??
      fromFile.get('IMPORT_RICHARD_EMAIL') ??
      this.deps.env.IMPORT_RICHARD_EMAIL ??
      ''
    const chloe =
      options.chloeEmail ??
      fromFile.get('IMPORT_CHLOE_EMAIL') ??
      this.deps.env.IMPORT_CHLOE_EMAIL ??
      ''
    const args = [...dbArgs]
    if (richard) args.push('--richard-email', richard)
    if (chloe) args.push('--chloe-email', chloe)
    if (!richard || !chloe) {
      this.warnings.push(
        `membre sans e-mail (${[!richard && 'richard', !chloe && 'chloe'].filter(Boolean).join(', ')}) : il ne sera rattaché à aucune connexion. ` +
          `Passez --richard-email / --chloe-email ou écrivez IMPORT_RICHARD_EMAIL / IMPORT_CHLOE_EMAIL dans ${IMPORT_ENV}.`
      )
    }
    this.script('import-artifact.ts', args)
  }

  private recordState(options: StackOptions): void {
    writeState(this.deps.root, {
      configHash: this.currentConfigHash(),
      dataset: options.dataset,
      opendata: options.opendata,
      startedAt: new Date(this.deps.now()).toISOString(),
    })
  }

  private saveConfigHash(hash: string): void {
    const previous = readState(this.deps.root)
    writeState(this.deps.root, {
      configHash: hash,
      dataset: previous?.dataset ?? 'none',
      opendata: previous?.opendata ?? false,
      startedAt: previous?.startedAt ?? new Date(this.deps.now()).toISOString(),
    })
  }

  // ---------------------------------------------------------------------------
  // Outils
  // ---------------------------------------------------------------------------

  private currentConfigHash(): string {
    const read = (file: string) => {
      const full = path.join(this.deps.root, file)
      return existsSync(full) ? readFileSync(full, 'utf8') : null
    }
    return configHash([read('supabase/config.toml'), read('supabase/.env')])
  }

  private readSupabase(): LocalSupabase | null {
    if (!this.deps.runner.has('supabase')) return null
    const result = this.deps.runner.run('supabase', ['status', '-o', 'env'], {
      capture: true,
      env: this.childEnv,
      cwd: this.deps.root,
    })
    if (result.status !== 0) return null
    try {
      return localSupabaseFrom(result.stdout)
    } catch {
      return null
    }
  }

  private async workspaceCounts(url: string): Promise<WorkspaceCount[] | null> {
    const [presence] = await this.deps.db.query<{ present: boolean }>(
      url,
      APP_SCHEMA_EXISTS_SQL
    )
    if (!presence?.present) return null
    return this.deps.db.query<WorkspaceCount>(url, WORKSPACE_COUNTS_SQL)
  }

  private compose(
    args: string[],
    options: { allowFailure?: boolean } = {}
  ): number {
    const file = path.join(this.deps.root, TEST_DB_COMPOSE)
    const engine =
      this.engine ?? (this.deps.runner.has('podman') ? 'podman' : 'docker')
    return this.exec(engine, ['compose', '-f', file, ...args], options)
  }

  /** Un script TypeScript de `scripts/`, par tsx, depuis le paquet des scripts. */
  private script(file: string, args: string[]): void {
    this.exec('pnpm', [
      '--filter',
      '@apart/scripts',
      'exec',
      'tsx',
      file,
      ...args,
    ])
  }

  private exec(
    command: string,
    args: string[],
    options: { allowFailure?: boolean; env?: NodeJS.ProcessEnv } = {}
  ): number {
    this.deps.log(
      `  $ ${[command, ...args].map(a => (a.includes(' ') ? `'${a}'` : a)).join(' ')}`
    )
    const runOptions: RunOptions = {
      cwd: this.deps.root,
      env: { ...this.childEnv, ...options.env },
    }
    const result = this.deps.runner.run(command, args, runOptions)
    if (result.status !== 0 && !options.allowFailure) {
      throw new StackError(
        `\`${command} ${args.join(' ')}\` a échoué (code ${result.status}).`
      )
    }
    return result.status
  }

  private capture(command: string, args: string[]): string | null {
    const result = this.deps.runner.run(command, args, {
      capture: true,
      cwd: this.deps.root,
      env: this.childEnv,
    })
    return result.status === 0 ? result.stdout : null
  }

  private report(check: Check): void {
    if (!check.ok) throw new StackError(check.message)
    if (check.warning) this.warnings.push(check.message)
    this.deps.log(`  ${check.warning ? '!' : '✓'} ${check.message}`)
  }

  private reportEnv(label: string, result: EnvWriteResult): void {
    const keys = [...result.added, ...result.updated]
    const what =
      result.action === 'unchanged'
        ? 'inchangé'
        : `${result.action === 'created' ? 'créé' : 'mis à jour'} (${keys.join(', ') || 'mise en forme'})`
    this.deps.log(
      `  ✓ ${label} : ${what}${result.backup ? ` ; sauvegarde de l’original : ${path.relative(this.deps.root, result.backup)}` : ''}`
    )
  }

  private section(title: string): void {
    this.deps.log(`\n▸ ${title}`)
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function redact(url: string): string {
  return url.replace(/:[^:@/]+@/, ':***@')
}

function listDir(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir) : []
}

/** Vrai si la cible manque ou si un fichier de la source est plus récent qu'elle. */
export function isStale(source: string, target: string): boolean {
  if (!existsSync(target)) return true
  const targetTime = statSync(target).mtimeMs
  return newestMtime(source) > targetTime
}

function newestMtime(entry: string): number {
  if (!existsSync(entry)) return 0
  const stat = statSync(entry)
  if (!stat.isDirectory()) return stat.mtimeMs
  let newest = 0
  for (const name of readdirSync(entry)) {
    newest = Math.max(newest, newestMtime(path.join(entry, name)))
  }
  return newest
}
