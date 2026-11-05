import { createECDH } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { assertLocalUrl, isLocalUrl } from '../lib/local-guard.js'
import {
  parsePodmanMachines,
  pickPodmanMachine,
  resolveDockerHost,
  socketAlive,
} from '../lib/stack/docker-host.js'
import {
  checkNode,
  checkPnpm,
  checkSupabaseCli,
} from '../lib/stack/prerequisites.js'
import {
  localSupabaseFrom,
  parseStatusEnv,
} from '../lib/stack/supabase-status.js'
import { openDataPlan } from '../lib/stack/opendata-plan.js'
import { generateVapidKeys } from '../lib/stack/vapid.js'
import { formatSummary } from '../lib/stack/summary.js'
import { configHash } from '../lib/stack/state.js'
import { DEMO_PASSWORD } from '../lib/demo/accounts.js'

describe('garde-fou local', () => {
  it('accepte localhost, 127.0.0.1 et ::1 seulement', () => {
    expect(
      isLocalUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres')
    ).toBe(true)
    expect(isLocalUrl('postgresql://u:p@localhost:5432/db')).toBe(true)
    expect(isLocalUrl('postgresql://u:p@[::1]:5432/db')).toBe(true)
    expect(isLocalUrl('http://127.0.0.1:54321')).toBe(true)
    expect(
      isLocalUrl('postgresql://u:p@db.abcd.supabase.co:5432/postgres')
    ).toBe(false)
    expect(
      isLocalUrl('postgresql://u:p@aws-0-eu.pooler.supabase.com:6543/postgres')
    ).toBe(false)
    expect(isLocalUrl('postgresql://u:p@127.0.0.1.evil.invalid/db')).toBe(false)
    expect(isLocalUrl('pas une url')).toBe(false)
  })

  it('nomme l’hôte refusé', () => {
    expect(() =>
      assertLocalUrl('postgresql://u:p@db.abcd.supabase.co/postgres', 'le seed')
    ).toThrow(/le seed vise « db\.abcd\.supabase\.co »/)
  })
})

describe('resolveDockerHost', () => {
  const sockets = new Set(['/tmp/podman.sock', '/var/run/docker.sock'])
  const alive = (p: string) => sockets.has(p)

  it('remplace un DOCKER_HOST dont le socket ne répond plus par celui de podman', () => {
    const decision = resolveDockerHost({
      current: 'unix:///Users/moi/docker.sock',
      podmanSocket: '/tmp/podman.sock',
      dockerSocketAlive: false,
      alive,
    })
    expect(decision.value).toBe('unix:///tmp/podman.sock')
    expect(decision.reason).toMatch(/ne répond pas/)
  })

  it('garde un DOCKER_HOST valide ou distant', () => {
    expect(
      resolveDockerHost({
        current: 'unix:///tmp/podman.sock',
        podmanSocket: null,
        dockerSocketAlive: false,
        alive,
      }).value
    ).toBe('unix:///tmp/podman.sock')
    expect(
      resolveDockerHost({
        current: 'tcp://10.0.0.2:2375',
        podmanSocket: null,
        dockerSocketAlive: false,
        alive,
      }).value
    ).toBe('tcp://10.0.0.2:2375')
  })

  it('déduit le socket podman, sinon laisse le défaut de Docker, sinon explique', () => {
    expect(
      resolveDockerHost({
        current: undefined,
        podmanSocket: '/tmp/podman.sock',
        dockerSocketAlive: true,
        alive,
      }).value
    ).toBe('unix:///tmp/podman.sock')
    expect(
      resolveDockerHost({
        current: undefined,
        podmanSocket: null,
        dockerSocketAlive: true,
        alive,
      }).value
    ).toBeUndefined()
    expect(() =>
      resolveDockerHost({
        current: undefined,
        podmanSocket: '/absent',
        dockerSocketAlive: false,
        alive,
      })
    ).toThrow(/Aucun moteur/)
    expect(() =>
      resolveDockerHost({
        current: 'unix:///absent',
        podmanSocket: null,
        dockerSocketAlive: false,
        alive,
      })
    ).toThrow(/ne répond pas/)
  })

  it('lit les machines podman et choisit celle qui tourne, sinon la machine par défaut', () => {
    const machines = parsePodmanMachines(
      JSON.stringify([
        { Name: 'autre', Default: false, Running: false, Starting: false },
        {
          Name: 'podman-machine-default*',
          Default: true,
          Running: false,
          Starting: false,
        },
      ])
    )
    expect(machines.map(m => m.name)).toEqual([
      'autre',
      'podman-machine-default',
    ])
    expect(pickPodmanMachine(machines)?.name).toBe('podman-machine-default')
    expect(
      pickPodmanMachine([
        ...machines,
        { name: 'vive', running: true, starting: false, isDefault: false },
      ])?.name
    ).toBe('vive')
    expect(parsePodmanMachines('pas du json')).toEqual([])
    expect(pickPodmanMachine([])).toBeNull()
  })
})

describe('socketAlive', () => {
  it('vrai seulement si un processus écoute : un fichier de socket orphelin ne compte pas', async () => {
    const { createServer } = await import('node:net')
    const { mkdtempSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const path = await import('node:path')
    const dir = mkdtempSync(path.join(tmpdir(), 'apart-sock-'))
    const live = path.join(dir, 'live.sock')
    const server = createServer().listen(live)
    await new Promise(resolve => server.once('listening', resolve))
    const orphan = path.join(dir, 'orphan.sock')
    writeFileSync(orphan, '')
    expect(await socketAlive(live)).toBe(true)
    expect(await socketAlive(orphan)).toBe(false)
    expect(await socketAlive(path.join(dir, 'absent.sock'))).toBe(false)
    await new Promise(resolve => server.close(resolve))
  })
})

describe('prérequis', () => {
  it('Node : la majeure de engines', () => {
    expect(checkNode('v24.21.0', '24.x').ok).toBe(true)
    expect(checkNode('v22.1.0', '24.x')).toMatchObject({ ok: false })
  })

  it('pnpm : majeure exigée, mineure différente seulement signalée', () => {
    expect(checkPnpm('12.5.1\n', 'pnpm@12.5.1')).toMatchObject({ ok: true })
    expect(checkPnpm('12.6.0', 'pnpm@12.5.1')).toMatchObject({
      ok: true,
      warning: true,
    })
    expect(checkPnpm('9.15.0', 'pnpm@12.5.1')).toMatchObject({ ok: false })
  })

  it('Supabase CLI : présente et 3.0 au moins', () => {
    expect(checkSupabaseCli('3.0.0\n')).toMatchObject({ ok: true })
    expect(checkSupabaseCli('2.54.11')).toMatchObject({ ok: false })
    expect(checkSupabaseCli(null).message).toMatch(/introuvable/)
  })
})

describe('supabase status -o env', () => {
  const output = [
    'Stopped services: [supabase_imgproxy_apart-localizer]',
    'ANON_KEY="eyJanon"',
    'API_URL="http://127.0.0.1:54321"',
    'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
    'MAILPIT_URL="http://127.0.0.1:54324"',
    'SERVICE_ROLE_KEY="eyJservice"',
    'STUDIO_URL="http://127.0.0.1:54323"',
  ].join('\n')

  it('lit les clés et ignore les lignes d’état', () => {
    expect(parseStatusEnv(output).get('API_URL')).toBe('http://127.0.0.1:54321')
    expect(parseStatusEnv(output).has('Stopped services')).toBe(false)
    expect(localSupabaseFrom(output)).toEqual({
      apiUrl: 'http://127.0.0.1:54321',
      dbUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      anonKey: 'eyJanon',
      serviceRoleKey: 'eyJservice',
      studioUrl: 'http://127.0.0.1:54323',
      mailUrl: 'http://127.0.0.1:54324',
    })
  })

  it('accepte Inbucket (CLI 2) et refuse une sortie incomplète', () => {
    const v2 = output.replace('MAILPIT_URL', 'INBUCKET_URL')
    expect(localSupabaseFrom(v2).mailUrl).toBe('http://127.0.0.1:54324')
    expect(() => localSupabaseFrom('API_URL=x')).toThrow(/DB_URL/)
  })
})

describe('openDataPlan', () => {
  it('lance chaque import dont les fichiers sont là, années DVF comprises', () => {
    const plan = openDataPlan({
      encadrement: [
        'l_zonage_oll_bordeaux.gml',
        'loyers-reference.csv',
        'Tableaux_loyers_reference_Bordeaux_Arrete_2026-07-06.xlsx',
      ],
      tbm: ['sv_arret_p.geojson', 'sv_ligne_a.json', 'sv_chem_l.geojson'],
      dvf: ['33-2024.csv.gz', '33-2023.csv.gz', 'notes.txt'],
    })
    expect(plan.steps.map(s => s.script)).toEqual([
      'import-rent-control.ts',
      'import-transit-stops.ts',
      'import-dvf.ts',
      // Lot 14 : les arrêts de tram changent l'adéquation aux critères.
      'refresh-criteria-fit.ts',
    ])
    expect(plan.steps[2]?.args).toEqual(['--year', '2023', '--year', '2024'])
    // Seules les sources des lots 11 et 12, absentes ici, sont sautées.
    expect(plan.skipped.map(line => line.split(' :')[0])).toEqual([
      'quartiers',
      'lieux-dits',
      'équipements sportifs',
      'drives',
    ])
  })

  it('saute une source incomplète en le disant', () => {
    const plan = openDataPlan({
      encadrement: ['loyers-reference.csv'],
      tbm: [],
      dvf: [],
    })
    expect(plan.steps).toEqual([])
    expect(plan.skipped).toHaveLength(7)
  })

  it('lots 11 et 12 : quartiers, lieux-dits, équipements, drives, puis rattrapage des annonces', () => {
    const plan = openDataPlan({
      encadrement: [],
      tbm: [],
      dvf: [],
      quartiers: ['se_quart_s.geojson', 'se_quartvie_s.geojson'],
      iris: ['bm-contours_iris-2026.geojson'],
      res: ['bm-athletisme.json'],
      osm: [
        'athletics-tracks.json',
        'fitness-park.json',
        'supermarkets.json',
        'quartiers-places.json',
      ],
    })
    expect(plan.steps.map(s => [s.script, s.args])).toEqual([
      ['import-neighbourhoods.ts', []],
      ['import-places.ts', []],
      ['import-sports-facilities.ts', []],
      ['import-supermarkets.ts', []],
      ['relocate-listings.ts', []],
      ['refresh-surroundings.ts', []],
      ['refresh-criteria-fit.ts', []],
    ])
    const partial = openDataPlan({
      encadrement: [],
      tbm: [],
      dvf: [],
      quartiers: ['se_quart_s.geojson'],
      iris: ['bm-contours_iris-2026.geojson'],
      res: ['bm-athletisme.json'],
      osm: [],
    })
    expect(partial.steps.map(s => [s.script, s.args])).toEqual([
      ['import-neighbourhoods.ts', ['--no-secteurs']],
      ['import-sports-facilities.ts', ['--only', 'tracks', '--no-osm-tracks']],
      ['relocate-listings.ts', []],
      ['refresh-surroundings.ts', []],
      ['refresh-criteria-fit.ts', []],
    ])
    expect(partial.skipped.at(-1)).toContain('drives')
    const fitnessOnly = openDataPlan({
      encadrement: [],
      tbm: [],
      dvf: [],
      osm: ['fitness-park.json'],
    })
    expect(fitnessOnly.steps[0]).toMatchObject({
      label: 'Fitness Park',
      args: ['--only', 'fitness'],
    })
  })
})

describe('generateVapidKeys', () => {
  it('rend une paire P-256 au format de web-push : 65 et 32 octets en base64url, la publique dérivée de la privée', () => {
    const { publicKey, privateKey } = generateVapidKeys()
    const pub = Buffer.from(publicKey, 'base64url')
    const priv = Buffer.from(privateKey, 'base64url')
    expect(pub).toHaveLength(65)
    expect(pub[0]).toBe(0x04)
    expect(priv).toHaveLength(32)
    expect(publicKey).toMatch(/^[A-Za-z0-9_-]+$/)
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(priv)
    expect(ecdh.getPublicKey().toString('base64url')).toBe(publicKey)
    expect(generateVapidKeys().privateKey).not.toBe(privateKey)
  })
})

describe('formatSummary', () => {
  const base = {
    supabaseUrl: 'http://127.0.0.1:54321',
    dbUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    studioUrl: 'http://127.0.0.1:54323',
    mailUrl: 'http://127.0.0.1:54324',
    opendata: false,
    googleEnabled: false,
    durationMs: 42_000,
    dev: false,
    warnings: [],
  }

  it('donne les adresses, les comptes de démo et les commandes utiles', () => {
    const text = formatSummary({ ...base, dataset: 'demo' })
    for (const expected of [
      'http://localhost:5173',
      'http://localhost:3000/api/docs',
      'http://localhost:3000/mcp',
      'http://127.0.0.1:54323',
      'http://127.0.0.1:54324',
      'demo@apart.local',
      'demo2@apart.local',
      DEMO_PASSWORD,
      'pnpm stack:down',
      'claude mcp add --transport http apart-local http://localhost:3000/mcp',
      'en 42 s',
    ]) {
      expect(text).toContain(expected)
    }
  })

  it("ne montre les comptes de démo qu'avec le jeu démo, et signale les avertissements", () => {
    const text = formatSummary({
      ...base,
      dataset: 'none',
      warnings: ['attention'],
    })
    expect(text).not.toContain(DEMO_PASSWORD)
    expect(text).toContain('! attention')
    expect(text).toContain('désactivée')
  })
})

describe('configHash', () => {
  it('change quand la configuration change, pas autrement', () => {
    expect(configHash(['a', 'b'])).toBe(configHash(['a', 'b']))
    expect(configHash(['a', 'b'])).not.toBe(configHash(['a', 'c']))
    expect(configHash(['a', null])).not.toBe(configHash(['a', '']))
  })
})
