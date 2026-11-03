import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { Prisma } from '../generated/prisma'

/**
 * Le cache des appels open data dans `ReferenceData` (sorte, clé, charge
 * utile, date de récupération). Une entrée plus vieille que `maxAgeMs` est
 * ignorée ; une panne de la source n'est jamais mise en cache.
 */
@Injectable()
export class ReferenceCacheService {
  constructor(private readonly prisma: PrismaService) {}

  async get<T>(
    kind: string,
    key: string,
    maxAgeMs?: number
  ): Promise<{ payload: T; fetchedAt: Date } | null> {
    const row = await this.prisma.referenceData.findUnique({
      where: { kind_key: { kind, key } },
    })
    if (!row) return null
    if (
      maxAgeMs !== undefined &&
      Date.now() - row.fetchedAt.getTime() > maxAgeMs
    ) {
      return null
    }
    return { payload: row.payload as T, fetchedAt: row.fetchedAt }
  }

  async set(kind: string, key: string, payload: unknown): Promise<void> {
    const value = JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue
    await this.prisma.referenceData.upsert({
      where: { kind_key: { kind, key } },
      create: { kind, key, payload: value },
      update: { payload: value, fetchedAt: new Date() },
    })
  }

  /** Toutes les entrées d'une sorte (tables de loyers de référence). */
  async all<T>(kind: string): Promise<{ key: string; payload: T }[]> {
    const rows = await this.prisma.referenceData.findMany({
      where: { kind },
      orderBy: { key: 'asc' },
    })
    return rows.map(row => ({ key: row.key, payload: row.payload as T }))
  }
}
