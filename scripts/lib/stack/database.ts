import pg from 'pg'

/** Les quelques requêtes de l'orchestrateur, injectées pour les tests. */
export interface StackDatabase {
  query<T extends Record<string, unknown>>(
    url: string,
    sql: string,
    values?: unknown[]
  ): Promise<T[]>
  /** Attend que la base réponde, ou lève une erreur après `timeoutMs`. */
  waitFor(url: string, timeoutMs: number): Promise<void>
}

export const pgDatabase: StackDatabase = {
  async query<T extends Record<string, unknown>>(
    url: string,
    sql: string,
    values: unknown[] = []
  ): Promise<T[]> {
    const client = new pg.Client({ connectionString: url })
    await client.connect()
    try {
      const result = await client.query(sql, values)
      return result.rows as T[]
    } finally {
      await client.end()
    }
  },
  async waitFor(url, timeoutMs) {
    const deadline = Date.now() + timeoutMs
    let last: unknown = null
    while (Date.now() < deadline) {
      const client = new pg.Client({
        connectionString: url,
        connectionTimeoutMillis: 2000,
      })
      try {
        await client.connect()
        await client.query('SELECT 1')
        await client.end()
        return
      } catch (error) {
        last = error
        await client.end().catch(() => undefined)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    throw new Error(
      `La base ${url.replace(/:[^:@/]+@/, ':***@')} ne répond pas après ${Math.round(timeoutMs / 1000)} s` +
        (last instanceof Error ? ` (${last.message})` : '')
    )
  },
}

/** Le résumé par espace : nom, annonces, membres. */
export interface WorkspaceCount extends Record<string, unknown> {
  name: string
  listings: number
  members: number
}

export const WORKSPACE_COUNTS_SQL = `
  SELECT w.name,
         (SELECT count(*)::int FROM app.listings l WHERE l.workspace_id = w.id) AS listings,
         (SELECT count(*)::int FROM app.members m WHERE m.workspace_id = w.id) AS members
  FROM app.workspaces w
  ORDER BY w.created_at`

/** Vrai si le schéma `app` existe (une base neuve ne l'a pas encore). */
export const APP_SCHEMA_EXISTS_SQL = `SELECT to_regclass('app.workspaces') IS NOT NULL AS present`
