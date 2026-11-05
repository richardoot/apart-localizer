import {
  DEFAULT_ASSUMPTIONS,
  ListingOpenDataContextSchema,
  NEIGHBOURHOOD_TERRITORY,
} from '@apart/contracts'
import type {
  FieldProvenanceMap,
  Listing,
  ListingOpenDataContext,
  ListingPlacement,
  LocationPrecision,
  Point,
} from '@apart/contracts'
import {
  communePlacement,
  isAddressPrecision,
  locationApproximation,
  placementAreaName,
  placementImproves,
  surroundingsDigest,
} from '@apart/domain'
import type {
  Prisma,
  PrismaClient,
} from '../../apps/api/src/generated/prisma/index.js'
import type {
  GeoService,
  ListingAreaRef,
} from '../../apps/api/src/geo/geo.service.js'
import {
  listingInclude,
  toListingDto,
} from '../../apps/api/src/listings/listing.mapper.js'
import type { ListingRow } from '../../apps/api/src/listings/listing.mapper.js'
import { MarketService } from '../../apps/api/src/opendata/market.service.js'
import {
  PlacementService,
  listingAreaRef,
} from '../../apps/api/src/opendata/placement.service.js'
import { ReferenceCacheService } from '../../apps/api/src/opendata/reference-cache.service.js'
import { RentControlService } from '../../apps/api/src/opendata/rent-control.service.js'
import { SurroundingsService } from '../../apps/api/src/opendata/surroundings.service.js'
import { TransitService } from '../../apps/api/src/opendata/transit.service.js'
import type { PrismaService } from '../../apps/api/src/prisma/prisma.service.js'

/**
 * Rattrapage du lot 12 (ADR 0022) : replace le repère des annonces placées
 * au centre de la commune, au quartier ou sans repère, d'après leur champ
 * « quartier » (contours et lieux-dits importés, mêmes règles que l'API, sans
 * réseau), puis recalcule l'instantané de contexte qui dépend du point
 * (desserte, marché, encadrement, quartier et équipements). Jamais une
 * annonce à l'adresse (numéro ou rue) ni un point saisi ; jamais une
 * précision moindre (`placementImproves`). Une annonce au centre de la
 * commune sans quartier reconnu garde son point et reçoit son placement et
 * sa zone (la commune). Une ligne de journal `listing.relocated` (canal
 * `system`) par annonce replacée. Idempotent : un second passage ne change
 * rien.
 */

export interface RelocateStats {
  listings: number
  /** Annonces au centre de la commune, au quartier ou sans repère. */
  candidates: number
  /** Repère à l'adresse ou saisi : jamais touché. */
  kept: number
  changed: number
  unchanged: number
  /** Sans repère ni commune exploitable : à géocoder (`geocode:missing`). */
  notLocated: number
}

/** Ce que la simulation affiche et ce que l'écriture applique, par annonce. */
export interface RelocationPlan {
  id: string
  title: string
  before: { precision: LocationPrecision | null; area: string | null }
  after: { precision: LocationPrecision; area: string | null }
  toVerify: boolean
}

interface NextLocation {
  point: Point
  precision: LocationPrecision
  placement: ListingPlacement
  area: ListingAreaRef | null
  inseeCode: string | null
}

const POINT_KEYS = ['point', 'precision'] as const

export async function relocateListings(
  deps: { prisma: PrismaClient; geo: GeoService },
  options: {
    dryRun: boolean
    workspace?: string | undefined
    at?: Date
    log?: (line: string) => void
  }
): Promise<{ stats: RelocateStats; plans: RelocationPlan[] }> {
  const at = options.at ?? new Date()
  const computedAt = at.toISOString()
  const log = options.log ?? (() => undefined)
  const prisma = deps.prisma as unknown as PrismaService
  const placement = new PlacementService(deps.geo)
  const surroundings = new SurroundingsService(deps.geo)
  const transit = new TransitService(deps.geo)
  const market = new MarketService(deps.geo)
  const rentControl = new RentControlService(
    deps.geo,
    new ReferenceCacheService(prisma)
  )
  const rows = (await deps.prisma.listing.findMany({
    where: options.workspace ? { workspace: { name: options.workspace } } : {},
    include: listingInclude,
    orderBy: { createdAt: 'asc' },
  })) as unknown as ListingRow[]
  const stats: RelocateStats = {
    listings: rows.length,
    candidates: 0,
    kept: 0,
    changed: 0,
    unchanged: 0,
    notLocated: 0,
  }
  const plans: RelocationPlan[] = []
  for (const row of rows) {
    const listing = toListingDto(row)
    const location = listing.location
    if (
      location.point &&
      (isAddressPrecision(location.precision) ||
        location.placement?.method === 'manual')
    ) {
      stats.kept++
      continue
    }
    stats.candidates++
    const next = await nextLocation(listing)
    if (!next) {
      if (!location.point) {
        stats.notLocated++
        log(
          `- ${listing.title} : sans repère, ni quartier reconnu ni commune importée → pnpm geocode:missing`
        )
      } else stats.unchanged++
      continue
    }
    if (
      !placementImproves(
        {
          point: location.point,
          precision: location.precision,
          placement: location.placement,
        },
        next
      )
    ) {
      stats.unchanged++
      continue
    }
    stats.changed++
    const plan: RelocationPlan = {
      id: listing.id,
      title: listing.title,
      before: {
        precision: location.point ? location.precision : null,
        area: placementAreaName(location),
      },
      after: {
        precision: next.precision,
        area: placementAreaName({
          precision: next.precision,
          placement: next.placement,
        }),
      },
      toVerify: next.placement.toVerify,
    }
    plans.push(plan)
    log(
      `- ${listing.title} : ${plan.before.precision ?? 'sans repère'} → ${plan.after.precision}${plan.after.area ? ` (${plan.after.area})` : ''}${plan.toVerify ? ', à vérifier' : ''}${options.dryRun ? ' [simulation]' : ''}`
    )
    if (options.dryRun) continue
    const snapshot = await snapshotFor(listing, next)
    const fieldSources: FieldProvenanceMap = { ...listing.fieldSources }
    for (const key of POINT_KEYS) {
      fieldSources[key] = { source: 'open_data', recordedAt: computedAt }
    }
    await deps.prisma.$transaction(async tx => {
      await tx.listing.update({
        where: { id: listing.id },
        data: {
          locationPlacement: next.placement as unknown as Prisma.InputJsonValue,
          ...(location.inseeCode || !next.inseeCode
            ? {}
            : { inseeCode: next.inseeCode }),
          fieldSources: fieldSources as Prisma.InputJsonValue,
          openDataContext: snapshot as unknown as Prisma.InputJsonValue,
        },
      })
      await deps.geo.setListingPoint(
        listing.id,
        next.point,
        next.precision,
        next.area,
        tx
      )
      await tx.activityLog.create({
        data: {
          workspaceId: listing.workspaceId,
          listingId: listing.id,
          channel: 'system',
          action: 'listing.relocated',
          before: {
            point: location.point,
            precision: location.point ? location.precision : null,
          } as Prisma.InputJsonValue,
          after: {
            point: next.point,
            precision: next.precision,
            method: next.placement.method,
            area: plan.after.area,
            toVerify: next.placement.toVerify,
            surroundings: snapshot.surroundings
              ? surroundingsDigest(snapshot.surroundings)
              : null,
            by: 'relocate:listings',
          } as Prisma.InputJsonValue,
        },
      })
    })
  }
  return { stats, plans }

  /** Le repère que les règles du lot 12 donnent à l'annonce, sans réseau. */
  async function nextLocation(listing: Listing): Promise<NextLocation | null> {
    const location = listing.location
    const lookup = await placement.locateDistrict(
      {
        district: location.district,
        commune: location.commune,
        inseeCode: location.inseeCode,
      },
      at
    )
    if (lookup.located) {
      return {
        point: lookup.located.point,
        precision: 'district',
        placement: lookup.located.placement,
        area: lookup.located.area,
        inseeCode: lookup.located.inseeCode,
      }
    }
    const inseeCode = location.inseeCode ?? lookup.inseeCode
    if (location.point && location.precision === 'district') return null
    const point =
      location.point ??
      (inseeCode
        ? await deps.geo.communeInteriorPoint(
            NEIGHBOURHOOD_TERRITORY,
            inseeCode
          )
        : null)
    if (!point) return null
    return {
      point,
      precision: 'commune',
      placement: communePlacement({
        commune: location.commune,
        inseeCode,
        district: location.district,
        reasons: lookup.reasons,
        ...(location.point
          ? {}
          : { source: 'Contours importés (point intérieur de la commune)' }),
        computedAt,
      }),
      area: inseeCode
        ? { kind: 'commune', territory: NEIGHBOURHOOD_TERRITORY, inseeCode }
        : null,
      inseeCode,
    }
  }

  /**
   * L'instantané de contexte au nouveau repère : desserte, marché,
   * encadrement, quartier et équipements, comme l'enrichissement de l'API ;
   * le DPE reste celui de la dernière recherche. Le plafond posé d'office
   * n'est pas concerné : un repère approché ne le pose jamais.
   */
  async function snapshotFor(
    listing: Listing,
    next: NextLocation
  ): Promise<ListingOpenDataContext> {
    const moved = {
      ...listing.location,
      point: next.point,
      precision: next.precision,
      placement: next.placement,
      inseeCode: listing.location.inseeCode ?? next.inseeCode,
    }
    const approximation = locationApproximation(moved)
    const rentalYear =
      listing.rentalPlan?.year ?? (await workspaceRentalYear(listing))
    const [nearby, sales, rent, around] = await Promise.all([
      transit.at(next.point, approximation),
      market.context(
        {
          point: next.point,
          surface: listing.surface,
          price: listing.price,
          precision: next.precision,
          approximation,
        },
        at
      ),
      rentControl.lookup(
        {
          point: next.point,
          precision: next.precision,
          inseeCode: moved.inseeCode,
          commune: moved.commune,
          rentControl: listing.rentalPlan?.rentControl ?? 'auto',
          rooms: listing.rooms,
          constructionYear: listing.constructionYear,
          constructionPeriod: listing.constructionPeriod,
          leaseType: listing.rentalPlan?.leaseType ?? null,
          surface: listing.surface,
          rentalYear,
          area: listingAreaRef(moved),
          placement: next.placement,
        },
        at
      ),
      surroundings.at(next.point, next.precision, at, {
        placement: next.placement,
        commune: moved.commune,
      }),
    ])
    const parsed = ListingOpenDataContextSchema.safeParse(
      listing.openDataContext ?? {}
    )
    const current = parsed.success
      ? parsed.data
      : ListingOpenDataContextSchema.parse({})
    return {
      ...current,
      transit: { nearestTram: nearby.nearestTram, computedAt },
      market: {
        medianPricePerM2: sales.stats?.medianPricePerM2 ?? null,
        count: sales.stats?.count ?? 0,
        radiusMeters: sales.radiusMeters,
        computedAt,
      },
      rentControl: {
        status: rent.status,
        zone: rent.zone?.zone ?? null,
        referenceRentPerM2: rent.referenceRentPerM2,
        decreeDate: rent.decree?.decreeDate ?? null,
        validUntil: rent.decree?.validUntil ?? null,
        reasons: rent.reasons,
        computedAt,
      },
      surroundings: around,
    }
  }

  /** L'année de mise en location des hypothèses en vigueur de l'espace. */
  async function workspaceRentalYear(listing: Listing): Promise<number> {
    const latest = await deps.prisma.assumptionsVersion.findFirst({
      where: { workspaceId: listing.workspaceId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: { values: true },
    })
    const year = (latest?.values as { rentalYear?: unknown } | null)?.rentalYear
    return typeof year === 'number' ? year : DEFAULT_ASSUMPTIONS.rentalYear
  }
}
