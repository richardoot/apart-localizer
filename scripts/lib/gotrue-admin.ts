import { assertLocalUrl } from './local-guard.js'

/**
 * Les comptes de démonstration dans le GoTrue LOCAL, par son API
 * d'administration (`/auth/v1/admin/users`, clé service_role de la CLI).
 * Création, ou remise à l'identique (mot de passe, e-mail confirmé, nom)
 * d'un compte qui existe déjà. `fetch` injecté : les tests n'atteignent
 * jamais le réseau.
 */

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string }
) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>

export interface DemoUserSpec {
  email: string
  password: string
  displayName: string
}

export interface EnsuredUser {
  id: string
  email: string
  created: boolean
}

export interface GoTrueAdmin {
  ensureUser(spec: DemoUserSpec): Promise<EnsuredUser>
}

export function gotrueAdmin(options: {
  supabaseUrl: string
  serviceRoleKey: string
  fetch?: FetchLike
}): GoTrueAdmin {
  assertLocalUrl(options.supabaseUrl, 'la création des comptes de démo')
  const base = `${options.supabaseUrl.replace(/\/$/, '')}/auth/v1/admin`
  const doFetch: FetchLike =
    options.fetch ?? ((url, init) => globalThis.fetch(url, init))
  const headers = {
    apikey: options.serviceRoleKey,
    Authorization: `Bearer ${options.serviceRoleKey}`,
    'Content-Type': 'application/json',
  }

  async function call(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ status: number; json: unknown }> {
    const response = await doFetch(`${base}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: response.status, json: parseBody(await response.text()) }
  }

  async function findByEmail(email: string): Promise<string | null> {
    const wanted = email.toLowerCase()
    for (let page = 1; page <= 50; page++) {
      const { status, json } = await call(
        'GET',
        `/users?page=${page}&per_page=200`
      )
      if (status !== 200)
        throw new Error(
          `GoTrue : liste des comptes refusée (${status}) ${describe(json)}`
        )
      const users =
        (json as { users?: Array<{ id: string; email?: string }> }).users ?? []
      const found = users.find(u => u.email?.toLowerCase() === wanted)
      if (found) return found.id
      if (users.length < 200) return null
    }
    return null
  }

  return {
    async ensureUser(spec) {
      const attributes = {
        email: spec.email,
        password: spec.password,
        email_confirm: true,
        user_metadata: { full_name: spec.displayName, name: spec.displayName },
      }
      const created = await call('POST', '/users', attributes)
      if (created.status === 200 || created.status === 201) {
        const id = (created.json as { id?: string }).id
        if (!id)
          throw new Error(`GoTrue : compte ${spec.email} créé sans identifiant`)
        return { id, email: spec.email, created: true }
      }
      if (created.status !== 422 && created.status !== 400) {
        throw new Error(
          `GoTrue : création de ${spec.email} refusée (${created.status}) ${describe(created.json)}`
        )
      }
      // Déjà enregistré : remis à l'identique (mot de passe documenté, nom).
      const id = await findByEmail(spec.email)
      if (!id) {
        throw new Error(
          `GoTrue : création de ${spec.email} refusée (${created.status}) ${describe(created.json)}`
        )
      }
      const updated = await call('PUT', `/users/${id}`, attributes)
      if (updated.status !== 200) {
        throw new Error(
          `GoTrue : mise à jour de ${spec.email} refusée (${updated.status}) ${describe(updated.json)}`
        )
      }
      return { id, email: spec.email, created: false }
    },
  }
}

function parseBody(text: string): unknown {
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function describe(json: unknown): string {
  if (json && typeof json === 'object') {
    const record = json as Record<string, unknown>
    return String(
      record.msg ??
        record.message ??
        record.error_description ??
        record.error ??
        JSON.stringify(json)
    )
  }
  return String(json ?? '')
}
