import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NEIGHBOURHOOD_TERRITORY } from '@apart/contracts'
import type { ListingOpenDataContext } from '@apart/contracts'
import { createE2eDatabase } from '../../apps/api/test/e2e-database.js'
import type { E2eDatabase } from '../../apps/api/test/e2e-database.js'
import { GeoService } from '../../apps/api/src/geo/geo.service.js'
import type { PrismaService } from '../../apps/api/src/prisma/prisma.service.js'
import type { PrismaClient } from '../../apps/api/src/generated/prisma/index.js'
import { refreshSurroundings } from '../lib/refresh-surroundings.js'

/**
 * Le rattrapage du lot 11 sur un vrai PostGIS : contours et équipements
 * fictifs écrits par le module geo, annonces fictives ; la simulation
 * n'écrit rien, le rattrapage ne change que `surroundings` et journalise,
 * une seconde passe ne touche plus rien.
 */
const NOW = new Date('2030-01-01T12:00:00Z')

describe('refresh:surroundings (e2e, PostGIS)', () => {
  let db: E2eDatabase
  let geo: GeoService
  let placed: string
  let unplaced: string

  beforeAll(async () => {
    db = await createE2eDatabase()
    geo = new GeoService(db.prisma as unknown as PrismaService)
    const workspace = await db.prisma.workspace.create({
      data: { name: 'Espace fictif' },
    })
    const listing = await db.prisma.listing.create({
      data: {
        workspaceId: workspace.id,
        title: 'Annonce fictive placée',
        price: 150_000,
        openDataContext: {
          market: {
            medianPricePerM2: 4000,
            count: 6,
            radiusMeters: 500,
            computedAt: '2029-12-01T00:00:00.000Z',
          },
        },
      },
    })
    placed = listing.id
    await geo.setListingPoint(
      placed,
      { type: 'Point', coordinates: [-0.58, 44.84] },
      'exact'
    )
    unplaced = (
      await db.prisma.listing.create({
        data: {
          workspaceId: workspace.id,
          title: 'Annonce fictive sans adresse',
          price: 90_000,
        },
      })
    ).id
    await geo.replaceNeighbourhoods(NEIGHBOURHOOD_TERRITORY, [
      {
        kind: 'iris',
        code: '339990101',
        name: 'IRIS Fictif',
        parent: null,
        commune: 'Commune fictive',
        inseeCode: '33999',
        source: 'Contours IRIS fictifs',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-0.6, 44.83],
              [-0.56, 44.83],
              [-0.56, 44.85],
              [-0.6, 44.85],
              [-0.6, 44.83],
            ],
          ],
        },
      },
    ])
    await geo.replaceAmenities('fitness_park', 'osm', [
      {
        externalId: 'node/1',
        name: 'Fitness Park fictif',
        brand: 'Fitness Park',
        brandGroup: null,
        drive: null,
        address: null,
        commune: null,
        inseeCode: null,
        details: {},
        longitude: -0.57,
        latitude: 44.84,
        sourceUpdatedAt: null,
      },
    ])
  })

  afterAll(async () => {
    await db.close()
  })

  const deps = () => ({
    prisma: db.prisma as unknown as PrismaClient,
    geo,
  })
  const snapshot = async (id: string) =>
    (await db.prisma.listing.findUniqueOrThrow({ where: { id } }))
      .openDataContext as ListingOpenDataContext | null

  it('simulation : liste sans écrire', async () => {
    const lines: string[] = []
    const stats = await refreshSurroundings(deps(), {
      dryRun: true,
      at: NOW,
      log: line => lines.push(line),
    })
    expect(stats).toEqual({
      listings: 2,
      changed: 2,
      unchanged: 0,
      withoutPoint: 1,
    })
    expect(lines.join('\n')).toContain('IRIS Fictif [simulation]')
    expect((await snapshot(placed))?.surroundings).toBeUndefined()
    expect(await db.prisma.activityLog.count()).toBe(0)
  })

  it('rattrapage : seule la clé surroundings change, journal par annonce ; idempotent', async () => {
    const stats = await refreshSurroundings(deps(), { dryRun: false, at: NOW })
    expect(stats.changed).toBe(2)
    const s = await snapshot(placed)
    expect(s?.market?.medianPricePerM2).toBe(4000)
    expect(s?.surroundings?.neighbourhood.value?.name).toBe('IRIS Fictif')
    expect(s?.surroundings?.fitnessPark.nearest?.name).toBe(
      'Fitness Park fictif'
    )
    expect(s?.surroundings?.athleticsTrack.status).toBe('unavailable')
    expect(s?.surroundings?.computedAt).toBe(NOW.toISOString())
    const none = await snapshot(unplaced)
    expect(none?.surroundings?.neighbourhood.status).toBe('not_applicable')
    const logs = await db.prisma.activityLog.findMany({
      where: { listingId: placed },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      channel: 'system',
      action: 'listing.enriched',
      after: {
        by: 'refresh:surroundings',
        surroundings: { neighbourhood: 'IRIS Fictif' },
      },
    })
    const again = await refreshSurroundings(deps(), {
      dryRun: false,
      at: new Date('2030-01-02T12:00:00Z'),
      workspace: 'Espace fictif',
    })
    expect(again).toMatchObject({ changed: 0, unchanged: 2 })
    expect(await db.prisma.activityLog.count()).toBe(2)
    expect(
      await refreshSurroundings(deps(), {
        dryRun: true,
        workspace: 'Autre espace',
      })
    ).toMatchObject({ listings: 0 })
  })
})
