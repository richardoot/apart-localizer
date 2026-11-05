import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NEIGHBOURHOOD_TERRITORY } from '@apart/contracts'
import type { ListingOpenDataContext, ListingPlacement } from '@apart/contracts'
import { createE2eDatabase } from '../../apps/api/test/e2e-database.js'
import type { E2eDatabase } from '../../apps/api/test/e2e-database.js'
import { GeoService } from '../../apps/api/src/geo/geo.service.js'
import type { PrismaService } from '../../apps/api/src/prisma/prisma.service.js'
import type { PrismaClient } from '../../apps/api/src/generated/prisma/index.js'
import { relocateListings } from '../lib/relocate-listings.js'

/**
 * Le rattrapage du lot 12 sur un vrai PostGIS : contours et lieux-dits
 * fictifs écrits par le module geo, annonces fictives au centre de la
 * commune, au quartier, à l'adresse et sans repère. La simulation n'écrit
 * rien ; le rattrapage replace les annonces approchées (jamais celles à
 * l'adresse), recalcule leur instantané, journalise sur le canal `system` ;
 * une seconde passe ne change rien.
 */
const NOW = new Date('2030-01-01T12:00:00Z')

const square = (west: number, south: number, size: number) => ({
  type: 'Polygon' as const,
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

describe('relocate:listings (e2e, PostGIS)', () => {
  let db: E2eDatabase
  let geo: GeoService
  const ids: Record<string, string> = {}

  beforeAll(async () => {
    db = await createE2eDatabase()
    geo = new GeoService(db.prisma as unknown as PrismaService)
    const workspace = await db.prisma.workspace.create({
      data: { name: 'Espace fictif' },
    })
    await geo.replaceNeighbourhoods(NEIGHBOURHOOD_TERRITORY, [
      {
        kind: 'quartier',
        code: 'Q-PLATANES',
        name: 'Les Platanes',
        parent: null,
        commune: 'Commune fictive',
        inseeCode: '33999',
        source: 'Quartiers fictifs',
        geometry: square(-0.6, 44.84, 0.01),
      },
      {
        kind: 'iris',
        code: '339990101',
        name: 'IRIS Témoin',
        parent: null,
        commune: 'Commune fictive',
        inseeCode: '33999',
        source: 'Contours IRIS fictifs',
        geometry: square(-0.6, 44.83, 0.03),
      },
    ])
    await geo.replacePlaces('osm', NEIGHBOURHOOD_TERRITORY, [
      {
        externalId: 'node/7',
        name: 'Le Moulinet',
        placeType: 'neighbourhood',
        longitude: -0.575,
        latitude: 44.835,
      },
    ])
    const make = async (
      key: string,
      data: {
        district?: string
        commune?: string | null
        inseeCode?: string
        point?: [number, number]
        precision?: 'exact' | 'street' | 'district' | 'commune'
      }
    ) => {
      const row = await db.prisma.listing.create({
        data: {
          workspaceId: workspace.id,
          title: `Annonce fictive ${key}`,
          price: 150_000,
          surface: 40,
          rooms: 2,
          commune:
            data.commune === undefined ? 'Commune fictive' : data.commune,
          inseeCode: data.inseeCode ?? '33999',
          district: data.district ?? null,
          openDataContext: {
            dpe: null,
            market: {
              medianPricePerM2: 4000,
              count: 6,
              radiusMeters: 500,
              computedAt: '2029-12-01T00:00:00.000Z',
            },
          },
        },
      })
      ids[key] = row.id
      if (data.point) {
        await geo.setListingPoint(
          row.id,
          { type: 'Point', coordinates: data.point },
          data.precision ?? 'commune'
        )
      }
    }
    await make('quartier', {
      district: 'Les Platanes (bus 9)',
      point: [-0.58, 44.84],
    })
    await make('lieu-dit', {
      district: 'près du Moulinet',
      point: [-0.58, 44.84],
    })
    await make('commune', { district: 'Inconnu', point: [-0.58, 44.84] })
    await make('adresse', {
      district: 'Les Platanes',
      point: [-0.57, 44.85],
      precision: 'exact',
    })
    await make('rue', {
      district: 'Les Platanes',
      point: [-0.57, 44.85],
      precision: 'street',
    })
    await make('sans-repère', { district: null as unknown as string })
    await make('hors-métropole', {
      commune: null,
      inseeCode: undefined,
      district: 'Nulle part',
    })
    // `make` pose 33999 par défaut : on retire le code de la dernière.
    await db.prisma.listing.update({
      where: { id: ids['hors-métropole'] },
      data: { inseeCode: null },
    })
  })

  afterAll(async () => {
    await db.close()
  })

  const deps = () => ({
    prisma: db.prisma as unknown as PrismaClient,
    geo,
  })
  const row = (key: string) =>
    db.prisma.listing.findUniqueOrThrow({ where: { id: ids[key] as string } })

  it('simulation : « annonce : avant → après (quartier) », rien n’est écrit', async () => {
    const lines: string[] = []
    const { stats, plans } = await relocateListings(deps(), {
      dryRun: true,
      at: NOW,
      log: line => lines.push(line),
    })
    expect(stats).toEqual({
      listings: 7,
      candidates: 5,
      kept: 2,
      changed: 4,
      unchanged: 0,
      notLocated: 1,
    })
    expect(lines).toContain(
      '- Annonce fictive quartier : commune → district (Les Platanes) [simulation]'
    )
    expect(lines).toContain(
      '- Annonce fictive lieu-dit : commune → district (Le Moulinet), à vérifier [simulation]'
    )
    expect(lines).toContain(
      '- Annonce fictive commune : commune → commune [simulation]'
    )
    expect(lines).toContain(
      '- Annonce fictive sans-repère : sans repère → commune [simulation]'
    )
    expect(plans.map(p => p.title)).toHaveLength(4)
    expect((await row('quartier')).locationPlacement).toBeNull()
    expect(await db.prisma.activityLog.count()).toBe(0)
  })

  it('replace les annonces approchées, jamais celles à l’adresse, et recalcule leur instantané', async () => {
    const { stats } = await relocateListings(deps(), { dryRun: false, at: NOW })
    expect(stats.changed).toBe(4)

    const quartier = await row('quartier')
    expect(quartier.locationPrecision).toBe('district')
    const placement = quartier.locationPlacement as ListingPlacement
    expect(placement).toMatchObject({
      method: 'neighbourhood_match',
      matchedText: 'Les Platanes',
      area: { level: 'quartier', name: 'Les Platanes', codes: ['Q-PLATANES'] },
    })
    expect(quartier.longitude).toBeGreaterThan(-0.6)
    expect(quartier.longitude).toBeLessThan(-0.59)
    const context = quartier.openDataContext as ListingOpenDataContext
    expect(context.surroundings?.neighbourhood.value?.name).toBe('Les Platanes')
    expect(context.surroundings?.athleticsTrack.reasons).toEqual([
      'Pistes d’athlétisme : source non importée, non disponible.',
    ])
    expect(context.market?.radiusMeters).toBeNull()
    expect(context.rentControl?.status).toBe('not_applicable')
    expect(
      (quartier.fieldSources as Record<string, { source: string }>).point
        ?.source
    ).toBe('open_data')

    const place = await row('lieu-dit')
    expect((place.locationPlacement as ListingPlacement).method).toBe(
      'osm_place'
    )
    expect([place.longitude, place.latitude]).toEqual([-0.575, 44.835])

    const commune = await row('commune')
    expect(commune.locationPrecision).toBe('commune')
    expect([commune.longitude, commune.latitude]).toEqual([-0.58, 44.84])
    expect((commune.locationPlacement as ListingPlacement).reasons).toEqual([
      'Aucun quartier reconnu dans « Inconnu » : repère au centre de la commune.',
      '« Inconnu » : aucun quartier ni lieu-dit de ce nom à Commune fictive.',
    ])

    const unplaced = await row('sans-repère')
    expect(unplaced.locationPrecision).toBe('commune')
    expect(unplaced.latitude).not.toBeNull()

    for (const key of ['adresse', 'rue']) {
      const kept = await row(key)
      expect(kept.locationPlacement).toBeNull()
      expect([kept.longitude, kept.latitude]).toEqual([-0.57, 44.85])
    }
    expect((await row('hors-métropole')).latitude).toBeNull()

    const zones = await db.query<{ id: string; has_area: boolean }>(
      'SELECT "id", "location_area" IS NOT NULL AS "has_area" FROM "app"."listings"'
    )
    const area = new Map(zones.map(z => [z.id, z.has_area]))
    expect(area.get(ids.quartier as string)).toBe(true)
    expect(area.get(ids.commune as string)).toBe(true)
    expect(area.get(ids['lieu-dit'] as string)).toBe(false)

    const logs = await db.prisma.activityLog.findMany({
      where: { action: 'listing.relocated' },
    })
    expect(logs).toHaveLength(4)
    expect(logs.every(l => l.channel === 'system')).toBe(true)
    const quartierLog = logs.find(l => l.listingId === ids.quartier)
    expect(quartierLog?.after).toMatchObject({
      precision: 'district',
      area: 'Les Platanes',
      by: 'relocate:listings',
    })
  })

  it('une seconde passe ne change rien', async () => {
    const { stats } = await relocateListings(deps(), { dryRun: false, at: NOW })
    expect(stats.changed).toBe(0)
    expect(stats.unchanged).toBe(4)
    expect(
      await db.prisma.activityLog.count({
        where: { action: 'listing.relocated' },
      })
    ).toBe(4)
  })
})
