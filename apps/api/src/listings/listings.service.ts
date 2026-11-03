import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ACTIVE_LISTING_STATUSES, DEFAULT_TASKS } from '@apart/contracts'
import type {
  ActivityChannel,
  Listing as ListingDto,
  ListingFilters,
  ListingInput,
  ListingStatusChange,
  ListingUpdate,
  RenovationInput,
  RentalPlanInput,
} from '@apart/contracts'
import { PrismaService } from '../prisma/prisma.service'
import { ActivityService } from '../activity/activity.service'
import { AssumptionsService } from '../assumptions/assumptions.service'
import { GeoService } from '../geo/geo.service'
import { Prisma } from '../generated/prisma'
import type { Member } from '../generated/prisma'
import { evaluateListing } from './evaluate'
import { listingInclude, toListingDto } from './listing.mapper'
import type { ListingRow } from './listing.mapper'
import type { EvaluatedListing } from './dto/listing.dto'

const dec = (value: number | null | undefined): Prisma.Decimal | null =>
  value == null ? null : new Prisma.Decimal(value)

/**
 * Les annonces : lecture filtrée et calculée, création avec checklist par
 * défaut, mise à jour partielle, changement de statut avec garde-fou,
 * « vu par ». Chaque écriture passe par le journal d'activité ; le point
 * géographique passe par le module geo.
 */
@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly assumptions: AssumptionsService,
    private readonly geo: GeoService
  ) {}

  async list(
    member: Member,
    filters: ListingFilters
  ): Promise<{ items: EvaluatedListing[]; total: number }> {
    const where: Prisma.ListingWhereInput = {
      workspaceId: member.workspaceId,
      status: { in: filters.status ?? [...ACTIVE_LISTING_STATUSES] },
    }
    if (filters.commune?.length) {
      where.commune = { in: filters.commune, mode: 'insensitive' }
    }
    if (filters.dpe?.length) where.dpeClass = { in: filters.dpe }
    if (filters.newForMe) where.views = { none: { memberId: member.id } }
    if (filters.search) {
      const contains = {
        contains: filters.search,
        mode: 'insensitive' as const,
      }
      where.OR = [
        { title: contains },
        { commune: contains },
        { district: contains },
        { notes: contains },
        { addressRaw: contains },
      ]
    }

    const distances = new Map<string, number>()
    if (filters.near) {
      const nearby = await this.geo.listingsWithinRadius(
        member.workspaceId,
        filters.near
      )
      for (const row of nearby) distances.set(row.id, row.distance_meters)
      where.id = { in: nearby.map(r => r.id) }
    }
    if (filters.criteriaId) {
      await this.applyCriteria(member.workspaceId, filters.criteriaId, where)
    }

    const rows = await this.prisma.listing.findMany({
      where,
      include: listingInclude,
      orderBy: { createdAt: 'desc' },
    })
    const base = await this.assumptions.currentValues(member.workspaceId)
    let items = await Promise.all(
      rows.map(row =>
        this.evaluateRow(row, member, base, distances.get(row.id))
      )
    )
    if (filters.verdict?.length) {
      items = items.filter(item =>
        filters.verdict?.includes(item.evaluation.metrics.verdict)
      )
    }
    items.sort(comparator(filters))
    return { items, total: items.length }
  }

  async get(member: Member, id: string): Promise<EvaluatedListing> {
    const row = await this.findRow(member, id)
    return this.evaluateRow(row, member)
  }

  async create(
    member: Member,
    input: ListingInput,
    channel: ActivityChannel = 'web'
  ): Promise<EvaluatedListing> {
    const id = await this.prisma.$transaction(async tx => {
      const created = await tx.listing.create({
        data: {
          ...scalarData(input),
          title: input.title,
          price: new Prisma.Decimal(input.price),
          workspaceId: member.workspaceId,
          createdById: member.id,
          renovation: input.renovation
            ? { create: renovationData(input.renovation) }
            : undefined,
          rentalPlan: input.rentalPlan
            ? { create: rentalPlanData(input.rentalPlan) }
            : undefined,
          tasks: {
            create: DEFAULT_TASKS.map((label, position) => ({
              label,
              origin: 'default' as const,
              position,
            })),
          },
          priceEvents: {
            create: {
              oldPrice: null,
              newPrice: dec(input.price) as Prisma.Decimal,
              source: 'user',
            },
          },
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: created.id,
          actorMemberId: member.id,
          channel,
          action: 'listing.created',
          after: {
            title: input.title,
            price: input.price,
            status: input.status,
          },
        },
        tx
      )
      return created.id
    })
    if (input.location.point) {
      await this.geo.setListingPoint(
        id,
        input.location.point,
        input.location.precision
      )
    }
    return this.get(member, id)
  }

  async update(
    member: Member,
    id: string,
    patch: ListingUpdate,
    channel: ActivityChannel = 'web'
  ): Promise<EvaluatedListing> {
    const before = toListingDto(await this.findRow(member, id))
    await this.prisma.$transaction(async tx => {
      const { renovation, rentalPlan, location, ...rest } = patch
      await tx.listing.update({
        where: { id },
        data: {
          ...scalarData(rest),
          ...(location ? locationData(location) : {}),
          renovation:
            renovation === undefined
              ? undefined
              : renovation === null
                ? { delete: before.renovation ? true : undefined }
                : {
                    upsert: {
                      create: renovationData(renovation),
                      update: {
                        ...renovationData(renovation),
                        items: {
                          deleteMany: {},
                          create: renovationData(renovation).items.create,
                        },
                      },
                    },
                  },
          rentalPlan:
            rentalPlan === undefined
              ? undefined
              : rentalPlan === null
                ? { delete: before.rentalPlan ? true : undefined }
                : {
                    upsert: {
                      create: rentalPlanData(rentalPlan),
                      update: rentalPlanData(rentalPlan),
                    },
                  },
        },
      })
      if (patch.price !== undefined && patch.price !== before.price) {
        await tx.priceEvent.create({
          data: {
            listingId: id,
            oldPrice: dec(before.price),
            newPrice: dec(patch.price) as Prisma.Decimal,
            source: 'user',
          },
        })
      }
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: id,
          actorMemberId: member.id,
          channel,
          action: 'listing.updated',
          before: pick(before, Object.keys(patch)),
          after: patch,
        },
        tx
      )
    })
    if (patch.location && 'point' in patch.location) {
      await this.geo.setListingPoint(
        id,
        patch.location.point ?? null,
        patch.location.precision ?? null
      )
    }
    return this.get(member, id)
  }

  async setStatus(
    member: Member,
    id: string,
    change: ListingStatusChange,
    channel: ActivityChannel = 'web'
  ): Promise<EvaluatedListing> {
    const current = await this.findRow(member, id)
    if (change.expectedStatus && change.expectedStatus !== current.status) {
      throw new ConflictException(
        `Le statut attendu était « ${change.expectedStatus} », l'annonce est « ${current.status} »`
      )
    }
    if (change.status === 'discarded' && !change.reason) {
      throw new BadRequestException('Écarter une annonce demande une raison')
    }
    await this.prisma.$transaction(async tx => {
      await tx.listing.update({
        where: { id },
        data: {
          status: change.status,
          discardReason: change.status === 'discarded' ? change.reason : null,
          discardedAt: change.status === 'discarded' ? new Date() : null,
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: id,
          actorMemberId: member.id,
          channel,
          action: 'listing.status_changed',
          before: { status: current.status },
          after: { status: change.status, reason: change.reason },
        },
        tx
      )
    })
    return this.get(member, id)
  }

  /** Marque l'annonce comme vue par le membre (le drapeau « nouveau » s'éteint pour lui seul). */
  async markSeen(member: Member, id: string): Promise<EvaluatedListing> {
    await this.findRow(member, id)
    await this.prisma.listingView.upsert({
      where: { listingId_memberId: { listingId: id, memberId: member.id } },
      create: { listingId: id, memberId: member.id },
      update: { seenAt: new Date() },
    })
    return this.get(member, id)
  }

  private async findRow(member: Member, id: string): Promise<ListingRow> {
    const row = await this.prisma.listing.findFirst({
      where: { id, workspaceId: member.workspaceId },
      include: listingInclude,
    })
    if (!row) throw new NotFoundException('Annonce introuvable')
    return row
  }

  private async evaluateRow(
    row: ListingRow,
    member: Member,
    base?: Awaited<ReturnType<AssumptionsService['currentValues']>>,
    distanceMeters?: number
  ): Promise<EvaluatedListing> {
    const listing = toListingDto(row)
    const assumptions = await this.assumptions.forListing(
      member.workspaceId,
      listing.assumptionsOverride
    )
    const merged = base && !listing.assumptionsOverride ? base : assumptions
    return {
      listing,
      evaluation: evaluateListing(listing, merged),
      distanceMeters: distanceMeters ?? null,
      isNewForMe: !listing.views.some(view => view.memberId === member.id),
    }
  }

  /** Applique un critère enregistré : filtres simples en SQL, périmètre par le module geo. */
  private async applyCriteria(
    workspaceId: string,
    criteriaId: string,
    where: Prisma.ListingWhereInput
  ): Promise<void> {
    const criteria = await this.prisma.searchCriteria.findFirst({
      where: { id: criteriaId, workspaceId },
    })
    if (!criteria)
      throw new NotFoundException('Critère de recherche introuvable')
    const filters = (criteria.filters ?? {}) as {
      communes?: string[]
      priceMin?: number | null
      priceMax?: number | null
      surfaceMin?: number | null
      roomsMin?: number | null
    }
    if (filters.communes?.length) {
      where.commune = { in: filters.communes, mode: 'insensitive' }
    }
    if (filters.priceMin != null || filters.priceMax != null) {
      where.price = {
        ...(filters.priceMin != null ? { gte: filters.priceMin } : {}),
        ...(filters.priceMax != null ? { lte: filters.priceMax } : {}),
      }
    }
    if (filters.surfaceMin != null) where.surface = { gte: filters.surfaceMin }
    if (filters.roomsMin != null) where.rooms = { gte: filters.roomsMin }

    let ids: string[] | null = null
    if (
      criteria.perimeterType === 'point_radius' &&
      criteria.centerLatitude !== null &&
      criteria.centerLongitude !== null &&
      criteria.radiusMeters !== null
    ) {
      const rows = await this.geo.listingsWithinRadius(workspaceId, {
        latitude: criteria.centerLatitude,
        longitude: criteria.centerLongitude,
        radiusMeters: criteria.radiusMeters,
      })
      ids = rows.map(r => r.id)
    } else if (
      criteria.perimeterType === 'polygon' ||
      criteria.perimeterType === 'isochrone'
    ) {
      ids = await this.geo.listingsWithinCriteriaPerimeter(
        workspaceId,
        criteriaId
      )
    }
    if (ids !== null) {
      const previous = where.id
      const allowed =
        previous &&
        typeof previous === 'object' &&
        'in' in previous &&
        previous.in
          ? ids.filter(id => (previous.in as string[]).includes(id))
          : ids
      where.id = { in: allowed }
    }
  }
}

type ScalarInput = Omit<
  Partial<ListingInput>,
  | 'renovation'
  | 'rentalPlan'
  | 'location'
  | 'fieldSources'
  | 'assumptionsOverride'
> & {
  fieldSources?: ListingInput['fieldSources']
  assumptionsOverride?: ListingInput['assumptionsOverride']
  location?: ListingInput['location']
}

/**
 * Les colonnes scalaires d'une annonce à partir du contrat. Des valeurs
 * simples (pas de `{ set }`), donc acceptées telles quelles par `create`
 * comme par `update`.
 */
type ScalarData = Partial<Prisma.ListingUncheckedCreateInput>

function scalarData(input: ScalarInput): ScalarData {
  const data: ScalarData = {}
  const set = <K extends keyof ScalarData>(
    key: K,
    value: ScalarData[K] | undefined
  ): void => {
    if (value !== undefined) data[key] = value
  }
  set('source', input.source)
  set('sourceLabel', input.sourceLabel)
  set('url', input.url)
  set('externalId', input.externalId)
  set('title', input.title)
  set(
    'publishedAt',
    input.publishedAt === undefined ? undefined : toDate(input.publishedAt)
  )
  set(
    'sourceUpdatedAt',
    input.sourceUpdatedAt === undefined
      ? undefined
      : toDate(input.sourceUpdatedAt)
  )
  set('description', input.description)
  set('notes', input.notes)
  set('sourceText', input.sourceText)
  set(
    'price',
    input.price === undefined ? undefined : new Prisma.Decimal(input.price)
  )
  set(
    'feesAmount',
    input.feesAmount === undefined ? undefined : dec(input.feesAmount)
  )
  set('feesPercent', input.feesPercent)
  set('feesPayer', input.feesPayer)
  set('surface', input.surface === undefined ? undefined : dec(input.surface))
  set(
    'surfaceTotal',
    input.surfaceTotal === undefined ? undefined : dec(input.surfaceTotal)
  )
  set('rooms', input.rooms)
  set('bedrooms', input.bedrooms)
  set('floor', input.floor)
  set('floorsTotal', input.floorsTotal)
  set('floorLabel', input.floorLabel)
  set('elevator', input.elevator)
  set('constructionYear', input.constructionYear)
  set('constructionPeriod', input.constructionPeriod)
  set('dpeClass', input.dpeClass)
  set('dpeConsumption', input.dpeConsumption)
  set('gesClass', input.gesClass)
  set(
    'dpeDate',
    input.dpeDate === undefined ? undefined : toDate(input.dpeDate)
  )
  set('heatingType', input.heatingType)
  set('heatingCollective', input.heatingCollective)
  set('outdoor', input.outdoor)
  set('parking', input.parking)
  set('cellar', input.cellar)
  set('orientation', input.orientation)
  set('condition', input.condition)
  set(
    'annualCharges',
    input.annualCharges === undefined ? undefined : dec(input.annualCharges)
  )
  set(
    'nonRecoverableChargesMonthly',
    input.nonRecoverableChargesMonthly === undefined
      ? undefined
      : dec(input.nonRecoverableChargesMonthly)
  )
  set('lotsCount', input.lotsCount)
  set('proceedings', input.proceedings)
  set('votedWorks', input.votedWorks)
  set('syndic', input.syndic)
  set(
    'propertyTax',
    input.propertyTax === undefined ? undefined : dec(input.propertyTax)
  )
  set(
    'furnitureValue',
    input.furnitureValue === undefined ? undefined : dec(input.furnitureValue)
  )
  set('status', input.status)
  set('discardReason', input.discardReason)
  set(
    'fieldSources',
    input.fieldSources === undefined
      ? undefined
      : (input.fieldSources as Prisma.InputJsonValue)
  )
  set(
    'assumptionsOverride',
    input.assumptionsOverride === undefined
      ? undefined
      : input.assumptionsOverride === null
        ? Prisma.DbNull
        : (input.assumptionsOverride as Prisma.InputJsonValue)
  )
  if (input.location) Object.assign(data, locationData(input.location))
  return data
}

/** Les colonnes d'adresse (le point lui-même passe par GeoService). */
function locationData(location: Partial<ListingInput['location']>): ScalarData {
  const data: ScalarData = {}
  if (location.addressRaw !== undefined) data.addressRaw = location.addressRaw
  if (location.addressNormalized !== undefined) {
    data.addressNormalized = location.addressNormalized
  }
  if (location.banId !== undefined) data.banId = location.banId
  if (location.commune !== undefined) data.commune = location.commune
  if (location.inseeCode !== undefined) data.inseeCode = location.inseeCode
  if (location.district !== undefined) data.district = location.district
  return data
}

function renovationData(input: RenovationInput) {
  return {
    active: input.active,
    level: input.level,
    durationMonths: input.durationMonths,
    notes: input.notes,
    items: {
      create: input.items.map((item, position) => ({
        label: item.label,
        amount: dec(item.amount),
        position,
      })),
    },
  }
}

function rentalPlanData(input: RentalPlanInput) {
  return {
    year: input.year,
    leaseType: input.leaseType,
    rentControl: input.rentControl,
    referenceRentPerM2: dec(input.referenceRentPerM2),
    targetRent: dec(input.targetRent),
    marketRent: dec(input.marketRent),
    comparables: input.comparables as unknown as Prisma.InputJsonValue,
    demand: input.demand,
    coOwnershipAllowsRental: input.coOwnershipAllowsRental,
    decencyCompliant: input.decencyCompliant,
    rentalPermitRequired: input.rentalPermitRequired,
    notes: input.notes,
  }
}

function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(value)
}

function pick(source: ListingDto, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    if (key in source)
      out[key] = (source as unknown as Record<string, unknown>)[key]
  }
  return out
}

const SORT_KEYS = {
  score: (item: EvaluatedListing) => item.evaluation.metrics.score,
  grossYield: (item: EvaluatedListing) => item.evaluation.metrics.grossYield,
  effort: (item: EvaluatedListing) => item.evaluation.metrics.effort,
  pricePerM2: (item: EvaluatedListing) => item.evaluation.metrics.pricePerM2,
  price: (item: EvaluatedListing) => item.listing.price,
  createdAt: (item: EvaluatedListing) => Date.parse(item.listing.createdAt),
  discount: (item: EvaluatedListing) =>
    item.evaluation.targetPrice.discount ?? Number.POSITIVE_INFINITY,
} as const

function comparator(
  filters: ListingFilters
): (a: EvaluatedListing, b: EvaluatedListing) => number {
  const key = SORT_KEYS[filters.sort]
  const direction = filters.order === 'asc' ? 1 : -1
  return (a, b) => {
    const va = key(a)
    const vb = key(b)
    // NaN (surface ou coût nul) va toujours en fin de liste.
    if (Number.isNaN(va) && Number.isNaN(vb)) return 0
    if (Number.isNaN(va)) return 1
    if (Number.isNaN(vb)) return -1
    return (va - vb) * direction
  }
}
