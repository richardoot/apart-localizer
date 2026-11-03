import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { authorizationServerMetadataUrl } from './discovery'

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/** Durée de vie du cache des métadonnées GoTrue, en millisecondes. */
export const AUTH_SERVER_METADATA_TTL_MS = 5 * 60_000

/**
 * Relaie les métadonnées du serveur d'autorisation (RFC 8414) publiées par
 * GoTrue, pour qu'un client MCP qui ne lit que l'origine de l'API les trouve.
 * Un seul appel sortant, mis en cache ; `fetchImpl` est injectable pour que
 * les tests n'atteignent jamais le réseau.
 */
@Injectable()
export class OAuthDiscoveryService {
  private readonly logger = new Logger(OAuthDiscoveryService.name)
  private cache: { fetchedAt: number; metadata: unknown } | null = null
  fetchImpl: FetchLike = (url, init) => globalThis.fetch(url, init)

  async authorizationServerMetadata(
    now: number = Date.now()
  ): Promise<unknown> {
    if (
      this.cache &&
      now - this.cache.fetchedAt < AUTH_SERVER_METADATA_TTL_MS
    ) {
      return this.cache.metadata
    }
    const url = authorizationServerMetadataUrl(process.env)
    try {
      const response = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) {
        throw new Error(`GoTrue a répondu ${response.status}`)
      }
      const metadata = await response.json()
      this.cache = { fetchedAt: now, metadata }
      return metadata
    } catch (error) {
      this.logger.warn(
        `Métadonnées du serveur d'autorisation injoignables (${url}) : ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      throw new ServiceUnavailableException(
        "Le serveur d'autorisation (Supabase Auth) ne répond pas ; réessayez."
      )
    }
  }

  /** Oublie le cache (tests, rotation). */
  reset(): void {
    this.cache = null
  }
}
