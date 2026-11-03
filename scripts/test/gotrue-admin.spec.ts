import { describe, expect, it } from 'vitest'
import { gotrueAdmin } from '../lib/gotrue-admin.js'
import type { FetchLike } from '../lib/gotrue-admin.js'

interface Recorded {
  method: string
  url: string
  body: unknown
  headers: Record<string, string>
}

function fakeFetch(responses: Array<[number, unknown]>): {
  fetch: FetchLike
  calls: Recorded[]
} {
  const calls: Recorded[] = []
  const queue = [...responses]
  const fetch: FetchLike = async (url, init) => {
    calls.push({
      method: init.method,
      url,
      body: init.body ? JSON.parse(init.body) : undefined,
      headers: init.headers,
    })
    const [status, json] = queue.shift() ?? [500, { msg: 'inattendu' }]
    return { status, ok: status < 300, text: async () => JSON.stringify(json) }
  }
  return { fetch, calls }
}

const spec = {
  email: 'demo@apart.local',
  password: 'demo-apart-local',
  displayName: 'Camille (démo)',
}

describe('gotrueAdmin', () => {
  it('crée le compte confirmé avec son nom, par la clé service_role', async () => {
    const { fetch, calls } = fakeFetch([[200, { id: 'u1', email: spec.email }]])
    const admin = gotrueAdmin({
      supabaseUrl: 'http://127.0.0.1:54321/',
      serviceRoleKey: 'service',
      fetch,
    })
    await expect(admin.ensureUser(spec)).resolves.toEqual({
      id: 'u1',
      email: spec.email,
      created: true,
    })
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'http://127.0.0.1:54321/auth/v1/admin/users',
      body: {
        email: spec.email,
        password: spec.password,
        email_confirm: true,
        user_metadata: { full_name: 'Camille (démo)' },
      },
    })
    expect(calls[0]?.headers.Authorization).toBe('Bearer service')
  })

  it('remet à l’identique un compte qui existe déjà (mot de passe documenté)', async () => {
    const { fetch, calls } = fakeFetch([
      [
        422,
        {
          code: 422,
          error_code: 'email_exists',
          msg: 'A user with this email address has already been registered',
        },
      ],
      [
        200,
        {
          users: [
            { id: 'autre', email: 'x@apart.local' },
            { id: 'u1', email: 'DEMO@apart.local' },
          ],
        },
      ],
      [200, { id: 'u1' }],
    ])
    const admin = gotrueAdmin({
      supabaseUrl: 'http://localhost:54321',
      serviceRoleKey: 'service',
      fetch,
    })
    await expect(admin.ensureUser(spec)).resolves.toEqual({
      id: 'u1',
      email: spec.email,
      created: false,
    })
    expect(
      calls.map(
        c =>
          `${c.method} ${c.url.replace('http://localhost:54321/auth/v1/admin', '')}`
      )
    ).toEqual([
      'POST /users',
      'GET /users?page=1&per_page=200',
      'PUT /users/u1',
    ])
    expect(calls[2]?.body).toMatchObject({
      password: spec.password,
      email_confirm: true,
    })
  })

  it('refuse un GoTrue qui n’est pas local, avant tout appel', () => {
    const { fetch, calls } = fakeFetch([])
    expect(() =>
      gotrueAdmin({
        supabaseUrl: 'https://abcd.supabase.co',
        serviceRoleKey: 's',
        fetch,
      })
    ).toThrow(/pas la machine locale/)
    expect(calls).toEqual([])
  })

  it('rend lisible un refus de GoTrue', async () => {
    const { fetch } = fakeFetch([[401, { msg: 'invalid JWT' }]])
    const admin = gotrueAdmin({
      supabaseUrl: 'http://127.0.0.1:54321',
      serviceRoleKey: 'faux',
      fetch,
    })
    await expect(admin.ensureUser(spec)).rejects.toThrow(
      /refusée \(401\) invalid JWT/
    )
  })
})
