import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  ACTIVE_LISTING_STATUSES,
  DEFAULT_TASKS,
  EvaluatedListingSchema,
  HypotheticalListingSchema,
  missingListingFields,
} from '@apart/contracts'
import type {
  ActivityChannel,
  Assumptions,
  EvaluateRequest,
  EvaluateResult,
  EvaluatedListing,
  FieldSource,
  HypotheticalListing,
  Listing as ListingDto,
  ListingCreateResult,
  ListingFilters,
  ListingInput,
  ListingList,
  ListingLocationInput,
  ListingStatusChange,
  ListingUpdate,
  ListingUpdateGuards,
  PriceEventInput,
  RenovationInput,
  RentalPlanInput,
} from '@apart/contracts'
import { mergeAssumptions } from '@apart/domain'
import { PrismaService } from '../prisma/prisma.service'
import { ActivityService } from '../activity/activity.service'
import { AssumptionsService } from '../assumptions/assumptions.service'
import { GeoService } from '../geo/geo.service'
import { GeocodingService } from '../opendata/geocoding.service'
import { Prisma } from '../generated/prisma'
import type { Member } from '../generated/prisma'
import { DuplicatesService } from './duplicates.service'
import { evaluateListing } from './evaluate'
import {
  listingInclude,
  toListingDto,
  toOpinionDto,
  toPriceEventDto,
  toTaskDto,
} from './listing.mapper'
import type { ListingRow } from './listing.mapper'
import {
  applyLocated,
  needsGeocoding,
  withOpenDataProvenance,
} from './location'
import { missingFieldTaskLabels } from './missing-field-tasks'
import { provenanceAfterPatch, withProvenance } from './provenance'

const dec = (value: number | null | undefined): Prisma.Decimal | null =>
  value == null ? null : new Prisma.Decimal(value)

export interface WriteOptions {
  channel?: ActivityChannel
  /** Provenance attribuée aux champs écrits (web : `user`, MCP : `ai` ou `user`). */
  provenance?: FieldSource
}

export interface CreateOptions extends WriteOptions {
  /** Le membre a vu les doublons probables et crée quand même (journalisé). */
  ignoreDuplicates?: boolean
}

/**
 * Les annonces : lecture filtrée, calculée et paginée ; création avec
 * checklist par défaut ; mise à jour partielle avec garde-fous optimistes ;
 * changement de statut ; « vu par » ; historique des prix ; évaluation d'une
 * annonce hypothétique. Chaque écriture passe par le journal d'activité ; le
 * point géographique passe par le module geo ; tout calcul passe par `domain`.
 */
@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly assumptions: AssumptionsService,
    private readonly geo: GeoService,
    private readonly geocoding: GeocodingService,
    private readonly duplicates: DuplicatesService
  ) {}

  /**
   * Liste filtrée. Les filtres SQL (statut, commune, DPE, prix, surface,
   * pièces, texte, rayon PostGIS, critère) réduisent les lignes ; le verdict,
   * le tri et la pagination s'appliquent ensuite sur les annonces évaluées,
   * puisque le verdict dépend des hypothèses.
   */
  async list(member: Member, filters: ListingFilters): Promise<ListingList> {
    const where: Prisma.ListingWhereInput = {
      workspaceId: member.workspaceId,
      status: { in: filters.status ?? [...ACTIVE_LISTING_STATUSES] },
    }
    if (filters.commune?.length) {
      where.commune = { in: filters.commune, mode: 'insensitive' }
    }
    if (filters.dpe?.length) where.dpeClass = { in: filters.dpe }
    if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
      where.price = {
        ...(filters.priceMin !== undefined ? { gte: filters.priceMin } : {}),
        ...(filters.priceMax !== undefined ? { lte: filters.priceMax } : {}),
      }
    }
    if (filters.surfaceMin !== undefined || filters.surfaceMax !== undefined) {
      where.surface = {
        ...(filters.surfaceMin !== undefined
          ? { gte: filters.surfaceMin }
          : {}),
        ...(filters.surfaceMax !== undefined
          ? { lte: filters.surfaceMax }
          : {}),
      }
    }
    if (filters.roomsMin !== undefined) where.rooms = { gte: filters.roomsMin }
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
    let items = rows.map(row =>
      this.evaluateRow(row, member, base, distances.get(row.id))
    )
    if (filters.verdict?.length) {
      items = items.filter(item =>
        filters.verdict?.includes(item.evaluation.metrics.verdict)
      )
    }
    items.sort(comparator(filters))
    const total = items.length
    const start = (filters.page - 1) * filters.limit
    return {
      items: items.slice(start, start + filters.limit),
      total,
      page: filters.page,
      limit: filters.limit,
      pageCount: Math.ceil(total / filters.limit),
    }
  }

  async get(member: Member, id: string): Promise<EvaluatedListing> {
    const row = await this.findRow(member, id)
    const base = await this.assumptions.currentValues(member.workspaceId)
    return this.evaluateRow(row, member, base)
  }

  /**
   * Création : géocode l'adresse si aucun point n'est donné, cherche les
   * doublons probables (sans bloquer), pose la checklist par défaut et, pour
   * une fiche issue de l'IA, une tâche par champ indispensable manquant.
   */
  async create(
    member: Member,
    input: ListingInput,
    options: CreateOptions = {}
  ): Promise<ListingCreateResult> {
    const channel = options.channel ?? 'web'
    const provenance = options.provenance ?? 'user'
    let fieldSources = withProvenance(
      input.fieldSources,
      {
        ...input,
        ...input.location,
        ...(input.rentalPlan ? { rentalPlan: input.rentalPlan } : {}),
        ...(input.renovation ? { renovation: input.renovation } : {}),
      },
      provenance
    )
    let location = input.location
    if (needsGeocoding(location)) {
      const located = await this.geocoding.locate(location)
      if (located) {
        const applied = applyLocated(location, located)
        location = applied.location
        fieldSources = withOpenDataProvenance(fieldSources, applied.keys)
      }
    }
    const listing: ListingInput = { ...input, location, fieldSources }
    const duplicates = await this.duplicates.findForInput(member, listing)
    const aiSourced =
      provenance === 'ai' ||
      Object.values(fieldSources).some(p => p.source === 'ai')
    const missingTaskLabels = aiSourced
      ? missingFieldTaskLabels(
          missingListingFields(listing, fieldSources),
          DEFAULT_TASKS
        )
      : []

    const id = await this.prisma.$transaction(async tx => {
      const created = await tx.listing.create({
        data: {
          ...scalarData({ ...listing, fieldSources }),
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
            create: [
              ...DEFAULT_TASKS.map((label, position) => ({
                label,
                origin: 'default' as const,
                position,
              })),
              ...missingTaskLabels.map((label, index) => ({
                label,
                origin: 'missing_field' as const,
                position: DEFAULT_TASKS.length + index,
              })),
            ],
          },
          priceEvents: {
            create: {
              oldPrice: null,
              newPrice: new Prisma.Decimal(input.price),
              source: provenance,
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
            provenance,
            geocoded: location.point !== null && input.location.point === null,
            duplicates: duplicates.map(d => d.listingId),
            ignoreDuplicates: options.ignoreDuplicates ?? false,
            missingFieldTasks: missingTaskLabels,
          },
        },
        tx
      )
      return created.id
    })
    if (location.point) {
      await this.geo.setListingPoint(id, location.point, location.precision)
    }
    const item = await this.get(member, id)
    return {
      ...item,
      duplicates,
      createdTasks: item.tasks.filter(task => task.origin === 'missing_field'),
    }
  }

  async update(
    member: Member,
    id: string,
    patch: ListingUpdate,
    guards: ListingUpdateGuards = {},
    options: WriteOptions = {}
  ): Promise<EvaluatedListing> {
    const channel = options.channel ?? 'web'
    const provenance = options.provenance ?? 'user'
    const row = await this.findRow(member, id)
    const before = toListingDto(row)
    this.checkGuards(before, guards)
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('Aucun champ à modifier')
    }
    let fieldSources = provenanceAfterPatch(
      before.fieldSources,
      {
        ...patch,
        ...(patch.location ?? {}),
      },
      provenance
    )
    let location = patch.location
    if (location && addressChanged(before.location, location)) {
      const merged: ListingLocationInput = { ...before.location, ...location }
      if (needsGeocoding({ ...merged, point: location.point ?? null })) {
        const located = await this.geocoding.locate(merged)
        if (located) {
          const applied = applyLocated(merged, located)
          location = applied.location
          fieldSources = withOpenDataProvenance(fieldSources, applied.keys)
        }
      }
    }
    await this.prisma.$transaction(async tx => {
      const { renovation, rentalPlan, ...rest } = patch
      await tx.listing.update({
        where: { id },
        data: {
          ...scalarData({ ...rest, fieldSources }),
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
            newPrice: new Prisma.Decimal(patch.price),
            source: provenance,
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
          after: { ...patch, provenance },
        },
        tx
      )
    })
    if (location && 'point' in location) {
      await this.geo.setListingPoint(
        id,
        location.point ?? null,
        location.precision ?? null
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

  /** Baisse ou hausse constatée : nouveau prix affiché, ligne d'historique, journal. */
  async recordPriceChange(
    member: Member,
    id: string,
    input: PriceEventInput,
    channel: ActivityChannel = 'web'
  ): Promise<EvaluatedListing> {
    const row = await this.findRow(member, id)
    const currentPrice = Number(row.price)
    if (
      input.expectedPrice !== undefined &&
      Math.abs(input.expectedPrice - currentPrice) > 0.005
    ) {
      throw new ConflictException(
        `Le prix attendu était ${input.expectedPrice} €, l'annonce est à ${currentPrice} €`
      )
    }
    if (Math.abs(input.newPrice - currentPrice) <= 0.005) {
      throw new BadRequestException(
        `Le prix est déjà de ${currentPrice} € : rien à enregistrer`
      )
    }
    await this.prisma.$transaction(async tx => {
      await tx.listing.update({
        where: { id },
        data: { price: new Prisma.Decimal(input.newPrice) },
      })
      await tx.priceEvent.create({
        data: {
          listingId: id,
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
          oldPrice: new Prisma.Decimal(currentPrice),
          newPrice: new Prisma.Decimal(input.newPrice),
          source: input.source,
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: id,
          actorMemberId: member.id,
          channel,
          action: 'listing.price_changed',
          before: { price: currentPrice },
          after: { price: input.newPrice, source: input.source },
        },
        tx
      )
    })
    return this.get(member, id)
  }

  /**
   * Évalue sans rien enregistrer : une annonce enregistrée avec des champs
   * surchargés, ou une annonce hypothétique ; dans les deux cas avec un
   * scénario d'hypothèses facultatif.
   */
  async evaluate(
    member: Member,
    request: EvaluateRequest
  ): Promise<EvaluateResult> {
    let listing: HypotheticalListing
    let base: Assumptions
    if (request.listingId) {
      const row = await this.findRow(member, request.listingId)
      const stored = toListingDto(row)
      const overrides = request.overrides ?? request.listing ?? {}
      listing = HypotheticalListingSchema.parse({
        ...stripStored(stored),
        ...overrides,
        location: { ...stored.location, ...(overrides.location ?? {}) },
      })
      base = await this.assumptions.forListing(
        member.workspaceId,
        listing.assumptionsOverride
      )
    } else {
      listing = request.listing as HypotheticalListing
      base = await this.assumptions.forListing(
        member.workspaceId,
        listing.assumptionsOverride
      )
    }
    const assumptions = mergeAssumptions(base, request.assumptions ?? null)
    return {
      listing,
      assumptions,
      evaluation: evaluateListing(listing, assumptions),
      persisted: false,
    }
  }

  private checkGuards(before: ListingDto, guards: ListingUpdateGuards): void {
    if (
      guards.expectedUpdatedAt !== undefined &&
      Date.parse(guards.expectedUpdatedAt) !== Date.parse(before.updatedAt)
    ) {
      throw new ConflictException(
        `L'annonce a changé depuis votre lecture (modifiée le ${before.updatedAt}) : relisez-la avant de la modifier`
      )
    }
    if (
      guards.expectedPrice !== undefined &&
      Math.abs(guards.expectedPrice - before.price) > 0.005
    ) {
      throw new ConflictException(
        `Le prix attendu était ${guards.expectedPrice} €, l'annonce est à ${before.price} €`
      )
    }
  }

  private async findRow(member: Member, id: string): Promise<ListingRow> {
    const row = await this.prisma.listing.findFirst({
      where: { id, workspaceId: member.workspaceId },
      include: listingInclude,
    })
    if (!row) throw new NotFoundException('Annonce introuvable')
    return row
  }

  /** La forme « vue » d'une ligne : contrat, calculs, drapeaux pour le membre, avis, tâches, prix. */
  evaluateRow(
    row: ListingRow,
    member: Member,
    base: Assumptions,
    distanceMeters?: number
  ): EvaluatedListing {
    const listing = toListingDto(row)
    const assumptions = mergeAssumptions(base, listing.assumptionsOverride)
    return EvaluatedListingSchema.parse({
      listing,
      evaluation: evaluateListing(listing, assumptions),
      distanceMeters: distanceMeters ?? null,
      isNewForMe: !listing.views.some(view => view.memberId === member.id),
      opinions: row.opinions.map(toOpinionDto),
      tasks: row.tasks.map(toTaskDto),
      priceEvents: row.priceEvents.map(toPriceEventDto),
    })
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

/** Vrai si le patch change l'adresse ou la commune (ce qui relance le géocodage). */
function addressChanged(
  before: ListingLocationInput,
  patch: Partial<ListingLocationInput>
): boolean {
  const changed = (key: 'addressRaw' | 'commune'): boolean =>
    patch[key] !== undefined &&
    (patch[key] ?? '').trim().toLowerCase() !==
      (before[key] ?? '').trim().toLowerCase()
  return changed('addressRaw') || changed('commune')
}

/** Une annonce enregistrée réduite aux champs d'une annonce hypothétique. */
function stripStored(listing: ListingDto): Record<string, unknown> {
  const {
    id: _id,
    workspaceId: _workspaceId,
    createdById: _createdById,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    views: _views,
    status: _status,
    discardReason: _discardReason,
    discardedAt: _discardedAt,
    fieldSources: _fieldSources,
    ...rest
  } = listing
  return rest
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

/** Note moyenne des avis notés (0 = pas de note) ; NaN sans avis noté. */
export function averageRating(item: EvaluatedListing): number {
  const rated = item.opinions.filter(o => o.rating > 0)
  if (rated.length === 0) return Number.NaN
  return rated.reduce((sum, o) => sum + o.rating, 0) / rated.length
}

const SORT_KEYS = {
  score: (item: EvaluatedListing) => item.evaluation.metrics.score,
  grossYield: (item: EvaluatedListing) => item.evaluation.metrics.grossYield,
  netYield: (item: EvaluatedListing) => item.evaluation.metrics.netYield,
  effort: (item: EvaluatedListing) => item.evaluation.metrics.effort,
  pricePerM2: (item: EvaluatedListing) => item.evaluation.metrics.pricePerM2,
  price: (item: EvaluatedListing) => item.listing.price,
  surface: (item: EvaluatedListing) => item.listing.surface ?? Number.NaN,
  rentalRank: (item: EvaluatedListing) => item.evaluation.rental.rank,
  opinion: averageRating,
  createdAt: (item: EvaluatedListing) => Date.parse(item.listing.createdAt),
  discount: (item: EvaluatedListing) =>
    item.evaluation.targetPrice.discount ?? Number.POSITIVE_INFINITY,
} as const

export function comparator(
  filters: Pick<ListingFilters, 'sort' | 'order'>
): (a: EvaluatedListing, b: EvaluatedListing) => number {
  const key = SORT_KEYS[filters.sort]
  const direction = filters.order === 'asc' ? 1 : -1
  return (a, b) => {
    const va = key(a)
    const vb = key(b)
    // NaN (surface ou coût nul, pas d'avis) va toujours en fin de liste.
    if (Number.isNaN(va) && Number.isNaN(vb)) return 0
    if (Number.isNaN(va)) return 1
    if (Number.isNaN(vb)) return -1
    return (va - vb) * direction
  }
}
