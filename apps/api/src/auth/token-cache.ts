import { createHash } from 'node:crypto'

/**
 * Les jetons déjà validés par Supabase, gardés une minute par instance
 * (ADR 0048).
 *
 * Sans cache, chaque requête appelle `GET /auth/v1/user` : une connexion
 * TLS et un aller-retour de plus, alors que l'application en envoie des
 * dizaines à la minute. Le jeton est gardé sous son empreinte SHA-256,
 * jamais en clair, au plus `TOKEN_CACHE_TTL_MS` et jamais au-delà de son
 * expiration. Contrepartie acceptée : une session révoquée reste acceptée
 * au plus une minute sur une instance qui l'a déjà vue. Le membre, lui, est
 * relu à chaque requête : un membre retiré perd l'accès tout de suite.
 */
export const TOKEN_CACHE_TTL_MS = 60_000

/** Au-delà, les plus anciennes entrées partent : deux membres, quelques appareils. */
export const TOKEN_CACHE_MAX_ENTRIES = 200

/** L'expiration d'un JWT en millisecondes (champ `exp`), ou `null` sans champ lisible. */
export function tokenExpiry(token: string): number | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    )
    const exp =
      typeof claims === 'object' && claims !== null && 'exp' in claims
        ? claims.exp
        : undefined
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null
  } catch {
    return null
  }
}

function keyOf(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface TokenCacheOptions {
  ttlMs?: number
  maxEntries?: number
  now?: () => number
}

export class TokenCache<T> {
  private readonly entries = new Map<string, { value: T; until: number }>()
  private readonly ttlMs: number
  private readonly maxEntries: number
  private readonly now: () => number

  constructor(options: TokenCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? TOKEN_CACHE_TTL_MS
    this.maxEntries = options.maxEntries ?? TOKEN_CACHE_MAX_ENTRIES
    this.now = options.now ?? Date.now
  }

  get size(): number {
    return this.entries.size
  }

  /** La valeur gardée pour ce jeton, si elle n'a pas expiré. */
  get(token: string): T | undefined {
    const key = keyOf(token)
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.until <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  /** Garde la valeur, sauf pour un jeton déjà expiré. */
  set(token: string, value: T): void {
    const now = this.now()
    const expiry = tokenExpiry(token)
    const until = Math.min(now + this.ttlMs, expiry ?? Number.POSITIVE_INFINITY)
    if (until <= now) return
    const key = keyOf(token)
    this.entries.delete(key)
    if (this.entries.size >= this.maxEntries) this.evict(now)
    this.entries.set(key, { value, until })
  }

  /** Les entrées expirées d'abord, puis la plus ancienne s'il le faut. */
  private evict(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.until <= now) this.entries.delete(key)
    }
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next()
      if (oldest.done) return
      this.entries.delete(oldest.value)
    }
  }
}
