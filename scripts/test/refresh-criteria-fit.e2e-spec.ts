import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CRITERIA_TOLERANCE } from '@apart/contracts'
import { createE2eDatabase } from '../../apps/api/test/e2e-database.js'
import type { E2eDatabase } from '../../apps/api/test/e2e-database.js'
import { GeoService } from '../../apps/api/src/geo/geo.service.js'
import type { PrismaService } from '../../apps/api/src/prisma/prisma.service.js'
import type { PrismaClient } from '../../apps/api/src/generated/prisma/index.js'
import {
  describePlan,
  refreshCriteriaFit,
} from '../lib/refresh-criteria-fit.js'

/**
 * Le rattrapage du lot 14 sur un vrai PostGIS : un espace fictif avec un
 * critère à polygone et des annonces jamais comparées (comme en production
 * après la migration), un espace sans critère. La simulation n'écrit rien ;
 * le rattrapage écrit les niveaux, journalise sur le canal `system` sans
 * notification ; une seconde passe ne change rien.
 */
const NOW = new Date('2030-01-01T12:00:00Z')

const square = (
  west: number,
  south: number,
  size: number
): { type: 'Polygon'; coordinates: [number, number][][] } => ({
  type: 'Polygon',
  coordinates: [
    [
      [west, south],
      [west + size, south],
      [west + size, south + size],
      [west, south + size],
      [west, south],
    ],
  ],
})

describe('refresh:criteria-fit (e2e, PostGIS)', () => {
  let db: E2eDatabase
  let geo: GeoService
  const ids: Record<string, string> = {}

  beforeAll(async () => {
    db = await createE2eDatabase()
    geo = new GeoService(db.prisma as unknown as PrismaService)
    const workspace = await db.prisma.workspace.create({
      data: {
        name: 'Espace fictif',
        members: {
          create: [
            {
              handle: 'a',
              displayName: 'Membre A',
              email: 'a@e2e.invalid',
              role: 'owner',
            },
          ],
        },
      },
    })
    await db.prisma.workspace.create({ data: { name: 'Espace sans critère' } })
    const criteria = await db.prisma.searchCriteria.create({
      data: {
        workspaceId: workspace.id,
        name: 'Carré fictif',
        filters: { priceMax: 200_000 },
        tolerance: { ...DEFAULT_CRITERIA_TOLERANCE },
        perimeterType: 'polygon',
        perimeterGeoJson: square(-0.6, 44.8, 0.02),
      },
    })
    await geo.setCriteriaPerimeter(criteria.id, square(-0.6, 44.8, 0.02))
    const make = async (
      key: string,
      price: number,
      at: [number, number]
    ): Promise<void> => {
      const listing = await db.prisma.listing.create({
        data: {
          workspaceId: workspace.id,
          title: `Annonce fictive ${key}`,
          price,
          surface: 45,
          rooms: 2,
        },
      })
      ids[key] = listing.id
      await geo.setListingPoint(
        listing.id,
        { type: 'Point', coordinates: at },
        'exact'
      )
    }
    await make('dedans', 180_000, [-0.59, 44.81])
    await make('marge', 208_000, [-0.59, 44.81])
    await make('dehors', 180_000, [-0.5, 44.81])
  })

  afterAll(async () => {
    await db.close()
  })

  const deps = () => ({ prisma: db.prisma as unknown as PrismaClient, geo })

  it('simulation : le plan, rien d’écrit', async () => {
    const lines: string[] = []
    const { stats, plans } = await refreshCriteriaFit(deps(), {
      dryRun: true,
      at: NOW,
      log: line => lines.push(line),
    })
    expect(stats).toMatchObject({
      workspaces: 2,
      withoutCriteria: 1,
      listings: 3,
      entered: 2,
      left: 0,
      changed: 0,
    })
    expect(plans).toHaveLength(3)
    expect(lines.join('\n')).toContain(
      '- Annonce fictive marge : jamais comparée → À la marge (« Carré fictif » jamais comparée → à la marge : Prix +4 % (maximum 200'
    )
    expect(lines.join('\n')).toContain('[simulation]')
    expect(lines.join('\n')).toContain(
      'Espace « Espace sans critère » : 0 critère(s) actif(s), 0 annonce(s) (aucun critère actif'
    )
    expect(await db.prisma.criteriaMatch.count()).toBe(0)
    expect(await db.prisma.activityLog.count()).toBe(0)
  })

  it('rattrapage : niveaux écrits, journal système sans alerte ; une seconde passe ne change rien', async () => {
    const { stats } = await refreshCriteriaFit(deps(), {
      dryRun: false,
      at: NOW,
    })
    expect(stats).toMatchObject({ entered: 2, initialized: 3 })
    const levels = Object.fromEntries(
      (
        await db.prisma.listing.findMany({
          select: { id: true, criteriaFitLevel: true },
        })
      ).map(l => [l.id, l.criteriaFitLevel])
    )
    expect(levels[ids.dedans as string]).toBe('in')
    expect(levels[ids.marge as string]).toBe('margin')
    expect(levels[ids.dehors as string]).toBe('out')
    expect(await db.prisma.criteriaMatch.count()).toBe(3)
    const logs = await db.prisma.activityLog.findMany()
    expect(logs).toHaveLength(2)
    expect(
      logs.every(l => l.channel === 'system' && l.actorMemberId === null)
    ).toBe(true)
    expect(logs[0]?.after).toMatchObject({ cause: 'refresh' })
    expect(await db.prisma.notification.count()).toBe(0)

    const again = await refreshCriteriaFit(deps(), { dryRun: false, at: NOW })
    expect(again.stats).toMatchObject({
      entered: 0,
      left: 0,
      changed: 0,
      initialized: 0,
    })
    expect(again.plans).toEqual([])
    expect(await db.prisma.activityLog.count()).toBe(2)
  })

  it('une ligne lisible par annonce', () => {
    expect(
      describePlan({
        listingId: 'l',
        title: 'T2',
        before: 'in',
        after: 'out',
        changes: [
          {
            criteriaId: 'c',
            name: 'A',
            transition: 'left',
            before: 'in',
            after: 'out',
            reasons: ['à 2 km du périmètre'],
          },
          {
            criteriaId: 'd',
            name: 'B',
            transition: null,
            before: 'out',
            after: 'out',
            reasons: [],
          },
        ],
      })
    ).toBe(
      '- T2 : Dans les critères → Hors critères (« A » dans les critères → hors critères : À 2 km du périmètre)'
    )
  })
})
