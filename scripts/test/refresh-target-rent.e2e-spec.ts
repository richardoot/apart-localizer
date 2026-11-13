import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  NEIGHBOURHOOD_TERRITORY,
  RentObservatoryTableSchema,
} from '@apart/contracts'
import { createE2eDatabase } from '../../apps/api/test/e2e-database.js'
import type { E2eDatabase } from '../../apps/api/test/e2e-database.js'
import { GeoService } from '../../apps/api/src/geo/geo.service.js'
import { RENT_OBSERVATORY_KIND } from '../../apps/api/src/opendata/rent-observatory.service.js'
import type { PrismaService } from '../../apps/api/src/prisma/prisma.service.js'
import type { PrismaClient } from '../../apps/api/src/generated/prisma/index.js'
import { refreshTargetRent } from '../lib/refresh-target-rent.js'

/**
 * Le rattrapage de l'ADR 0046 sur un vrai PostGIS : contours, zones et loyers
 * fictifs ; la simulation n'écrit rien, le rattrapage estime le loyer visé
 * d'une annonce qui n'en a pas (phase 2 créée, provenance « estimated »,
 * journal canal `system`), laisse un loyer donné, et une seconde passe ne
 * change rien.
 */
const TABLE = RentObservatoryTableSchema.parse({
  territory: 'bordeaux',
  observatory: 'L9900',
  year: 2030,
  observedAt: '2030-01-01',
  housingType: 'apartment',
  zones: [
    {
      zone: 2,
      label: 'Zone 2',
      stats: [
        {
          rooms: 2,
          medianPerM2: 15,
          q1PerM2: 13,
          q3PerM2: 17,
          observations: 120,
        },
      ],
    },
  ],
  irisZones: { '339990101': 2 },
  communeZones: {},
  source: {
    url: null,
    file: 'fictif.zip',
    sha256: 'fictif',
    importedAt: '2030-11-11T10:00:00.000Z',
  },
})

describe('refresh:target-rent (e2e, PostGIS)', () => {
  let db: E2eDatabase
  let geo: GeoService
  let withoutRent: string
  let withRent: string
  let unplaced: string

  beforeAll(async () => {
    db = await createE2eDatabase()
    geo = new GeoService(db.prisma as unknown as PrismaService)
    const workspace = await db.prisma.workspace.create({
      data: { name: 'Espace fictif' },
    })
    const listing = (title: string, extra: object = {}) =>
      db.prisma.listing.create({
        data: {
          workspaceId: workspace.id,
          title,
          price: 150_000,
          surface: 40,
          rooms: 2,
          inseeCode: '33999',
          ...extra,
        },
      })
    withoutRent = (await listing('T2 fictif sans loyer')).id
    withRent = (
      await listing('T2 fictif avec loyer', {
        rentalPlan: { create: { targetRent: 700 } },
        fieldSources: {
          rentalPlan: { source: 'user', recordedAt: '2030-01-01T00:00:00Z' },
        },
      })
    ).id
    unplaced = (await listing('T2 fictif sans repère')).id
    for (const id of [withoutRent, withRent]) {
      await geo.setListingPoint(
        id,
        { type: 'Point', coordinates: [-0.58, 44.84] },
        'exact'
      )
    }
    await geo.replaceNeighbourhoods(NEIGHBOURHOOD_TERRITORY, [
      {
        kind: 'iris',
        code: '339990101',
        name: 'IRIS fictif',
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
    await db.prisma.referenceData.create({
      data: {
        kind: RENT_OBSERVATORY_KIND,
        key: 'bordeaux:2030',
        validFrom: new Date('2030-01-01T00:00:00Z'),
        payload: TABLE,
      },
    })
  })

  afterAll(async () => {
    await db.close()
  })

  const deps = () => ({
    prisma: db.prisma as unknown as PrismaClient,
    geo,
  })
  const planOf = async (id: string) =>
    db.prisma.listing.findUniqueOrThrow({
      where: { id },
      select: { fieldSources: true, rentalPlan: true },
    })

  it('simulation : liste sans écrire', async () => {
    const lines: string[] = []
    const stats = await refreshTargetRent(deps(), {
      dryRun: true,
      log: line => lines.push(line),
    })
    expect(stats).toEqual({
      listings: 3,
      given: 1,
      estimated: 1,
      cleared: 0,
      withoutEstimate: 1,
      unchanged: 0,
    })
    expect(lines.join('\n')).toContain(
      'T2 fictif sans loyer : loyer visé estimé 600 € [simulation]'
    )
    expect(lines.join('\n')).toContain(
      'T2 fictif sans repère : pas d’estimation'
    )
    expect((await planOf(withoutRent)).rentalPlan).toBeNull()
    expect(await db.prisma.activityLog.count()).toBe(0)
  })

  it('rattrapage : loyer estimé et journal ; loyer donné laissé ; idempotent', async () => {
    const stats = await refreshTargetRent(deps(), { dryRun: false })
    expect(stats.estimated).toBe(1)
    const estimated = await planOf(withoutRent)
    expect(estimated.rentalPlan?.targetRent?.toNumber()).toBe(600)
    expect(
      (estimated.fieldSources as Record<string, { source: string }>)[
        'rentalPlan.targetRent'
      ]?.source
    ).toBe('estimated')
    expect((await planOf(withRent)).rentalPlan?.targetRent?.toNumber()).toBe(
      700
    )
    expect((await planOf(unplaced)).rentalPlan).toBeNull()
    const log = await db.prisma.activityLog.findFirstOrThrow({
      where: { listingId: withoutRent, action: 'listing.enriched' },
    })
    expect(log.channel).toBe('system')
    expect(log.actorMemberId).toBeNull()
    expect(log.after).toMatchObject({ targetRentEstimated: 600 })

    const again = await refreshTargetRent(deps(), { dryRun: false })
    expect(again).toMatchObject({ estimated: 0, unchanged: 1, given: 1 })
  })
})
