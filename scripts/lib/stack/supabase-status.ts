/**
 * Ce que `supabase status -o env` dit de la pile locale. La CLI imprime
 * aussi des lignes d'état (« Stopped services: […] ») : seules les lignes
 * `CLÉ=valeur` comptent.
 */

export interface LocalSupabase {
  apiUrl: string
  dbUrl: string
  anonKey: string
  serviceRoleKey: string
  studioUrl: string | null
  /** Mailpit (CLI 3) ou Inbucket (CLI 2) : les e-mails que GoTrue enverrait. */
  mailUrl: string | null
}

export function parseStatusEnv(output: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (!match?.[1]) continue
    let value = (match[2] ?? '').trim()
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }
    values.set(match[1], value)
  }
  return values
}

export function localSupabaseFrom(output: string): LocalSupabase {
  const env = parseStatusEnv(output)
  const required = (key: string): string => {
    const value = env.get(key)
    if (!value) {
      throw new Error(
        `\`supabase status -o env\` ne donne pas ${key} : la pile est-elle démarrée ? (pnpm stack:status)`
      )
    }
    return value
  }
  return {
    apiUrl: required('API_URL'),
    dbUrl: required('DB_URL'),
    anonKey: required('ANON_KEY'),
    serviceRoleKey: required('SERVICE_ROLE_KEY'),
    studioUrl: env.get('STUDIO_URL') ?? null,
    mailUrl: env.get('MAILPIT_URL') ?? env.get('INBUCKET_URL') ?? null,
  }
}
