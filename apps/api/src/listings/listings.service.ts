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
  LISTING_STATUS_LABELS,
  missingListingFields,
  taskFieldForLabel,
} from '@apart/contracts'
import type {
  ActivityChannel,
  Assumptions,
  CriteriaFilters,
  EvaluateRequest,
  EvaluateResult,
  EvaluatedListing,
  FieldProvenanceMap,
  FieldSource,
  HypotheticalListing,
  LayerFeatureCollection,
  Listing as ListingDto,
  ListingCreateResult,
  ListingFilters,
  ListingInput,
  ListingLinkOrigin,
  ListingList,
  ListingStageFacts,
  ListingLocationInput,
  ListingPlacement,
  ListingStatus,
  ListingStatusChange,
  LocationPrecision,
  ListingUpdate,
  ListingUpdateGuards,
  PriceEventInput,
  RenovationInput,
  RentalPlanInput,
} from '@apart/contracts'
import {
  addressFieldsForManualPoint,
  archivedByLabel,
  checkReference,
  CONNECTOR_IGNORED_LOCATION_KEYS,
  connectorListingCreate,
  connectorListingUpdate,
  countFits,
  describeUnsupportedEstimates,
  detectLinkPortal,
  fitForCriteria,
  isStale,
  linkKey,
  matchesFitFilter,
  mergeAssumptions,
  mergedListingRefusal,
  normalizeSeller,
  portalOfListingSource,
  priceTrigger,
  primaryLink,
  referenceKey,
  referenceMatchOf,
  restoreKeptProvenance,
  sameUrlMatchOf,
} from '@apart/domain'
import type {
  CriteriaFitTrigger,
  DecisionJournal,
  LinkState,
} from '@apart/domain'
import { PrismaService } from '../prisma/prisma.service'
import { ActivityService } from '../activity/activity.service'
import { AssumptionsService } from '../assumptions/assumptions.service'
import { GeoService } from '../geo/geo.service'
import type { ListingAreaRef } from '../geo/geo.service'
import { GeocodingService } from '../opendata/geocoding.service'
import { Prisma } from '../generated/prisma'
import type { Member } from '../generated/prisma'
import {
  CriteriaMatchService,
  criteriaFiltersOf,
} from './criteria-match.service'
import { DuplicatesService } from './duplicates.service'
import {
  ListingEnrichmentService,
  REFERENCE_RENT_KEY,
} from './enrichment.service'
import { evaluateListing } from './evaluate'
import { assertLinkFree, priceEventData, syncPrimaryLink } from './link-writes'
import {
  closeOpenDecisionsAsStale,
  decisionViewOf,
} from '../decisions/decision-context'
import {
  linkStateOf,
  listingInclude,
  plannedVisitCount,
  toCriteriaMatchDtos,
  toLastCheck,
  toListingCriteriaFit,
  toListingDto,
  toOfferDto,
  toPriceEventDto,
  toRepublication,
  toListingLinkDtos,
  toListingSellerDto,
  toMergeRecord,
  toMergedInto,
  toStageFacts,
  toTaskDto,
} from './listing.mapper'
import type { ListingRow } from './listing.mapper'
import {
  applyLocated,
  manualLocationPlacement,
  needsGeocoding,
  relocationNeeded,
  withOpenDataProvenance,
} from './location'
import { missingFieldTaskLabels } from './missing-field-tasks'
import { loadOpinionContext, opinionViewOf } from '../opinions/opinion-context'
import type { OpinionWorkspaceContext } from '../opinions/opinion-context'
import { provenanceAfterPatch, withProvenance } from './provenance'

const dec = (value: number | null | undefined): Prisma.Decimal | null =>
  value == null ? null : new Prisma.Decimal(value)

export interface WriteOptions {
  channel?: ActivityChannel
  /** Provenance attribuée aux champs écrits (web : `user`, MCP : `ai` ou `user`). */
  provenance?: FieldSource
  /**
   * L'écriture vient du connecteur (MCP) : plafond, loyer de marché et
   * sorties du géocodeur ne sont pas pris de l'entrée (ADR 0040,
   * `connectorListingCreate`, `connectorListingUpdate`).
   */
  connector?: boolean
}

export interface CreateOptions extends WriteOptions {
  /** Le membre a vu les doublons probables et crée quand même (journalisé). */
  ignoreDuplicates?: boolean
  /** Lot 18 : l'origine du lien de l'annonce (« original » par défaut). */
  linkOrigin?: ListingLinkOrigin
  /** Lot 21 : un brouillon gardé à plusieurs : la décision a sa notification. */
  viaDecision?: boolean
}

/** Lot 21 : une écriture de statut née d'une décision à plusieurs. */
export interface StatusWriteOptions {
  decision?: DecisionJournal
}

/** Les statuts rangés aux archives (quand, par qui : lignes de l'étape). */
const ARCHIVE_STATUSES: readonly ListingStatus[] = [
  'discarded',
  'offer_refused',
  'sold_or_withdrawn',
]

/** Lot 18 : l'origine d'un lien saisi par une écriture d'annonce, selon le canal. */
function linkOriginOf(channel: ActivityChannel): ListingLinkOrigin {
  return channel === 'mcp' ? 'claude' : 'manual'
}

/** Les champs dont un changement relance le plafond, le marché et l'arrêt le plus proche. */
const ENRICHMENT_KEYS = [
  'surface',
  'rooms',
  'constructionYear',
  'constructionPeriod',
  'rentalPlan',
  'floor',
] as const

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
    private readonly duplicates: DuplicatesService,
    private readonly criteriaMatches: CriteriaMatchService,
    private readonly enrichment: ListingEnrichmentService
  ) {}

  /**
   * Liste filtrée. Les filtres SQL (statut, commune, DPE, prix, surface,
   * pièces, texte, rayon PostGIS) réduisent les lignes ; le verdict,
   * l'adéquation aux critères (lot 14 : enregistrée, l'onglet principal par
   * défaut), le tri et la pagination s'appliquent ensuite sur les annonces
   * évaluées, puisque le verdict dépend des hypothèses. Les compteurs par
   * niveau (onglets) suivent tous les filtres sauf l'adéquation.
   */
  async list(member: Member, filters: ListingFilters): Promise<ListingList> {
    const where: Prisma.ListingWhereInput = {
      workspaceId: member.workspaceId,
      status: { in: filters.status ?? [...ACTIVE_LISTING_STATUSES] },
      // Lot 27 : un doublon fusionné n'est dans aucune liste, archives
      // comprises ; il se retrouve depuis la fiche qui l'a absorbé.
      mergedIntoId: null,
    }
    if (filters.commune?.length) {
      where.commune = { in: filters.commune, mode: 'insensitive' }
    }
    if (filters.dpe?.length) where.dpeClass = { in: filters.dpe }
    if (filters.precision?.length) {
      // Lot 12 : par précision du repère ; « none » = sans repère.
      const precisions = filters.precision.filter(
        (p): p is LocationPrecision => p !== 'none'
      )
      const clauses: Prisma.ListingWhereInput[] = []
      if (precisions.length) {
        clauses.push({
          locationPrecision: { in: precisions },
          latitude: { not: null },
        })
      }
      if (filters.precision.includes('none')) {
        clauses.push({
          OR: [{ latitude: null }, { locationPrecision: null }],
        })
      }
      where.AND = [{ OR: clauses }]
    }
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
    if (filters.sellerType?.length) {
      // Lot 18 : le vendeur (« à relever » = inconnu).
      where.sellerType = { in: filters.sellerType }
    }
    if (filters.reference !== undefined) {
      // Lot 18 : la référence, sans espaces, tirets ni points.
      // Une référence trop courte ne trouve rien (« # » n'est dans aucune clé).
      where.sellerReferenceKey = referenceKey(filters.reference) ?? '#'
    }
    if (filters.search) {
      const contains = {
        contains: filters.search,
        mode: 'insensitive' as const,
      }
      const reference = referenceKey(filters.search)
      where.OR = [
        { title: contains },
        { commune: contains },
        { district: contains },
        { notes: contains },
        { addressRaw: contains },
        // Lot 18 : l'agence, et la référence espaces et tirets ignorés.
        { sellerName: contains },
        ...(reference ? [{ sellerReferenceKey: { contains: reference } }] : []),
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
      // Le critère choisi : ses statuts quand la liste n'en fixe pas ;
      // l'adéquation lue est alors la sienne.
      const statuses = await this.criteriaStatuses(
        member.workspaceId,
        filters.criteriaId
      )
      if (filters.status === undefined && statuses.length) {
        where.status = { in: statuses }
      }
    }

    const [rows, active] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        include: listingInclude,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.searchCriteria.findMany({
        where: { workspaceId: member.workspaceId, active: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true },
      }),
    ])
    const [base, opinions] = await Promise.all([
      this.assumptions.currentValues(member.workspaceId),
      this.opinionContext(member),
    ])
    const criteriaId = filters.criteriaId
    let items = rows.map(row => {
      const item = this.evaluateRow(
        row,
        member,
        base,
        opinions,
        distances.get(row.id)
      )
      return criteriaId
        ? {
            ...item,
            criteriaFit: fitForCriteria(
              item.criteriaFit,
              criteriaId,
              row.status,
              plannedVisitCount(row)
            ),
          }
        : item
    })
    if (filters.verdict?.length) {
      items = items.filter(item =>
        filters.verdict?.includes(item.evaluation.metrics.verdict)
      )
    }
    if (filters.staleDays !== undefined) {
      // Lot 15 : la file « à revérifier » (règle de `domain`).
      const now = new Date()
      const days = filters.staleDays
      items = items.filter(item => isStale(item.listing, now, days))
    }
    if (filters.multiPortal) {
      // Lot 18 : publiées sur plusieurs portails (deux liens ou plus).
      items = items.filter(item => item.links.length >= 2)
    }
    if (filters.opinions) {
      // Lot 20 : « À rediscuter » (un désaccord) ou « Avis en attente »
      // (un avis manque ou est masqué), selon ce que le membre voit.
      items = items.filter(item =>
        filters.opinions === 'to_discuss'
          ? (item.opinionSummary?.disagreementKeys.length ?? 0) > 0
          : item.opinionSummary?.status === 'pending'
      )
    }
    // Lot 14 : sans critère actif, rien n'est filtré (tout est « dans »).
    const { counts, kept } = countFits(items.map(item => item.criteriaFit))
    if (active.length > 0) {
      items = items.filter(item =>
        matchesFitFilter(item.criteriaFit, filters.fit)
      )
    }
    items.sort(comparator(filters))
    // Lot 21 : quand et par qui une annonce est entrée aux archives.
    if (
      filters.status?.length &&
      filters.status.every(s => ARCHIVE_STATUSES.includes(s))
    ) {
      items = await this.withArchiveFacts(member, items, opinions.names)
    }
    const total = items.length
    const start = (filters.page - 1) * filters.limit
    return {
      items: items.slice(start, start + filters.limit),
      total,
      page: filters.page,
      limit: filters.limit,
      pageCount: Math.ceil(total / filters.limit),
      fit: {
        activeCriteria: active,
        counts,
        kept,
        criteriaId: criteriaId ?? null,
      },
    }
  }

  /** Lot 21 : l'entrée aux archives, lue dans le journal des changements de statut. */
  private async withArchiveFacts(
    member: Member,
    items: EvaluatedListing[],
    names: ReadonlyMap<string, string>
  ): Promise<EvaluatedListing[]> {
    const logs = await this.prisma.activityLog.findMany({
      where: {
        workspaceId: member.workspaceId,
        listingId: { in: items.map(i => i.listing.id) },
        action: 'listing.status_changed',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        listingId: true,
        createdAt: true,
        channel: true,
        actorMemberId: true,
        after: true,
      },
    })
    const latest = new Map<string, (typeof logs)[number]>()
    for (const log of logs) {
      if (log.listingId && !latest.has(log.listingId)) {
        latest.set(log.listingId, log)
      }
    }
    return items.map(item => {
      const log = latest.get(item.listing.id)
      const stage: ListingStageFacts = item.stage ?? {
        nextVisitAt: null,
        nextVisitNames: [],
        lastVisitAt: null,
        archivedAt: null,
        archivedBy: null,
      }
      return {
        ...item,
        stage: {
          ...stage,
          archivedAt:
            log?.createdAt.toISOString() ??
            item.listing.discardedAt ??
            item.listing.updatedAt,
          archivedBy: archivedByLabel({
            status: item.listing.status,
            channel: log?.channel ?? null,
            actorName: log?.actorMemberId
              ? (names.get(log.actorMemberId) ?? null)
              : null,
            after: log?.after ?? null,
          }),
        },
      }
    })
  }

  /** Lot 12 : les contours des annonces de l'espace placées au quartier (carte). */
  areas(member: Member): Promise<LayerFeatureCollection> {
    return this.geo.listingAreasGeoJson(member.workspaceId)
  }

  async get(member: Member, id: string): Promise<EvaluatedListing> {
    const row = await this.findRow(member, id)
    const [base, opinions] = await Promise.all([
      this.assumptions.currentValues(member.workspaceId),
      this.opinionContext(member),
    ])
    return this.evaluateRow(row, member, base, opinions)
  }

  /** Lot 20 : les critères des avis, l'avis à l'aveugle et les membres de l'espace. */
  opinionContext(member: Member): Promise<OpinionWorkspaceContext> {
    return loadOpinionContext(this.prisma, member.workspaceId)
  }

  /**
   * Création : géocode l'adresse si aucun point n'est donné, cherche les
   * doublons probables (sans bloquer), pose la checklist par défaut et, pour
   * une fiche issue de l'IA, une tâche par champ indispensable manquant.
   */
  async create(
    member: Member,
    received: ListingInput,
    options: CreateOptions = {}
  ): Promise<ListingCreateResult> {
    const input = options.connector
      ? connectorListingCreate(received, options.provenance ?? 'user')
      : received
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
    // Lot 12 : un point saisi prime ; sinon adresse, quartier, commune. Un
    // point déjà géocodé (fiche extraite par l'IA, provenance `open_data`)
    // n'est pas une saisie : il est replacé pour retrouver son placement et
    // sa zone (géocodeur en cache), ou gardé tel quel, sans placement.
    const geocodedPoint =
      location.point !== null &&
      input.fieldSources.point?.source === 'open_data'
    let placement = geocodedPoint ? null : manualLocationPlacement(location)
    let area: ListingAreaRef | null = null
    if (needsGeocoding(location) || geocodedPoint) {
      const located = await this.geocoding.locate(location)
      if (located) {
        const applied = applyLocated(location, located)
        location = applied.location
        placement = applied.placement
        area = applied.area
        fieldSources = withOpenDataProvenance(fieldSources, applied.keys)
      }
    } else {
      const filled = await this.addressForManualPoint(location)
      if (filled) {
        location = { ...location, ...filled.fields }
        fieldSources = withManualPointProvenance(fieldSources, filled.keys)
      }
    }
    const listing: ListingInput = { ...input, location, fieldSources }
    const duplicates = await this.duplicates.findForInput(member, listing)
    // Lot 18 : un lien n'est que sur une fiche ; même agence et même
    // référence, c'est la même annonce : on propose d'y ajouter le lien.
    const sameUrl = sameUrlMatchOf(duplicates)
    if (sameUrl) {
      throw new ConflictException(
        `Ce lien est déjà celui de l’annonce « ${sameUrl.title} » [id ${sameUrl.listingId}] : une même URL ne peut pas être sur deux fiches. Ouvre cette annonce plutôt que d’en créer une autre.`
      )
    }
    const sameReference = referenceMatchOf(duplicates)
    if (sameReference && !options.ignoreDuplicates) {
      throw new ConflictException(
        `Même agence et même référence que « ${sameReference.title} » [id ${sameReference.listingId}] : c’est la même annonce, publiée sur un autre portail. Ajoute ce lien à sa fiche (add_listing_link, ou « C’est la même : ajouter ce lien à la fiche »), ou confirmez qu’il s’agit d’une autre annonce (ignoreDuplicates).`
      )
    }
    const seller = normalizeSeller(input)
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
          sellerType: seller.sellerType,
          sellerName: seller.sellerName,
          sellerReference: seller.sellerReference,
          sellerReferenceKey: seller.sellerReferenceKey,
          locationPlacement: placementJson(placement),
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
                // Lot 17 : le champ de la fiche que la tâche demande.
                field: taskFieldForLabel(label),
              })),
              ...missingTaskLabels.map((label, index) => ({
                label,
                origin: 'missing_field' as const,
                position: DEFAULT_TASKS.length + index,
                field: taskFieldForLabel(label),
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
            placement: placementDigest(placement),
            duplicates: duplicates.map(d => d.listingId),
            ignoreDuplicates: options.ignoreDuplicates ?? false,
            missingFieldTasks: missingTaskLabels,
            ...(options.viaDecision ? { viaDecision: true } : {}),
          },
        },
        tx
      )
      // Lot 18 : le lien de l'annonce devient son lien d'origine.
      if (input.url) {
        const normalizedUrl = linkKey(input.url) as string
        await assertLinkFree(tx, member.workspaceId, normalizedUrl, null)
        const now = new Date()
        await tx.listingLink.create({
          data: {
            workspaceId: member.workspaceId,
            listingId: created.id,
            portal: portalOfListingSource(
              input.source,
              input.sourceLabel,
              input.url
            ),
            url: input.url.trim(),
            normalizedUrl,
            externalId: input.externalId,
            price: input.price > 0 ? new Prisma.Decimal(input.price) : null,
            priceAt: input.price > 0 ? now : null,
            firstSeenAt: now,
            origin: options.linkOrigin ?? 'original',
            readSellerName: seller.sellerName,
            readReference: seller.sellerReference,
            addedById: member.id,
          },
        })
        await syncPrimaryLink(tx, created.id)
      }
      return created.id
    })
    if (location.point) {
      await this.geo.setListingPoint(
        id,
        location.point,
        location.precision,
        area
      )
    }
    // Données ouvertes (arrêt, plafond, marché, DPE vérifié), puis alertes.
    await this.enrichment.enrich(member, id, { dpe: true, channel })
    const item = await this.afterWrite(member, id, channel, 'created', {
      quiet: options.viaDecision ?? false,
    })
    return {
      ...item,
      duplicates,
      createdTasks: item.tasks.filter(task => task.origin === 'missing_field'),
    }
  }

  async update(
    member: Member,
    id: string,
    received: ListingUpdate,
    guards: ListingUpdateGuards = {},
    options: WriteOptions = {}
  ): Promise<EvaluatedListing> {
    const channel = options.channel ?? 'web'
    const provenance = options.provenance ?? 'user'
    const row = await this.findRow(member, id)
    this.assertNotMerged(row)
    const before = toListingDto(row)
    this.checkGuards(before, guards)
    // ADR 0040 : le connecteur n'écrit ni le plafond, ni le loyer de marché,
    // ni les sorties du géocodeur ; la fiche garde les siens.
    const { patch, keptKeys, ignoredEstimates } = options.connector
      ? connectorListingUpdate(received, before, provenance)
      : { patch: received, keptKeys: [], ignoredEstimates: [] }
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException(
        describeUnsupportedEstimates(ignoredEstimates) ??
          'Aucun champ à modifier'
      )
    }
    // Lot 21 : le statut suit ses règles (décisions à plusieurs).
    if (patch.status !== undefined && patch.status !== before.status) {
      throw new BadRequestException(
        'Le statut ne se change pas ici : utilisez le changement de statut (POST /listings/:id/status, set_listing_status)'
      )
    }
    let fieldSources = provenanceAfterPatch(
      before.fieldSources,
      {
        ...patch,
        ...(patch.location ?? {}),
      },
      provenance
    )
    // Un loyer de référence saisi à la main l'emporte sur le plafond automatique.
    if (patch.rentalPlan !== undefined) {
      const next = patch.rentalPlan?.referenceRentPerM2 ?? null
      const previous = before.rentalPlan?.referenceRentPerM2 ?? null
      if (next !== previous) {
        if (next === null) {
          const { [REFERENCE_RENT_KEY]: _dropped, ...rest } = fieldSources
          fieldSources = rest
        } else {
          fieldSources = {
            ...fieldSources,
            [REFERENCE_RENT_KEY]: {
              source: provenance,
              recordedAt: new Date().toISOString(),
            },
          }
        }
      }
    }
    fieldSources = restoreKeptProvenance(
      fieldSources,
      before.fieldSources,
      keptKeys
    )
    let location = patch.location
    const locationChanged =
      location !== undefined &&
      ('point' in location || addressChanged(before.location, location))
    // Lot 12 : le placement suit la localisation écrite. Un point nouveau
    // saisi prime ; une adresse, une commune ou (repère pas à l'adresse) un
    // quartier changés replacent le repère, même si le formulaire renvoie
    // l'ancien point.
    let placement: ListingPlacement | null | undefined
    let area: ListingAreaRef | null = null
    /** Le point renvoyé tel quel : ni le point, ni le placement, ni la zone ne bougent. */
    let pointUnchanged = false
    const target = location
      ? { ...before.location, ...location }
      : before.location
    const located =
      location && relocationNeeded(before, location)
        ? await this.geocoding.locate({
            addressRaw: target.addressRaw,
            commune: target.commune,
            district: target.district,
            inseeCode: target.inseeCode,
          })
        : null
    if (location && located) {
      const merged: ListingLocationInput = {
        ...before.location,
        ...location,
      }
      const applied = applyLocated(merged, located)
      location = applied.location
      placement = applied.placement
      area = applied.area
      fieldSources = withOpenDataProvenance(fieldSources, applied.keys)
    } else if (location && 'point' in location) {
      // Pas replacé (ou géocodeur muet) : le point du patch, tel quel.
      pointUnchanged =
        location.point !== null &&
        location.point !== undefined &&
        before.location.point !== null &&
        location.point.coordinates.join(',') ===
          before.location.point.coordinates.join(',') &&
        (location.precision ?? null) === before.location.precision
      if (!pointUnchanged) {
        placement = manualLocationPlacement({
          point: location.point ?? null,
          precision: location.precision ?? null,
        })
        // ADR 0040 : une nouvelle adresse avec un point saisi ne garde pas
        // l'identifiant BAN ni le code INSEE de l'ancienne.
        const filled = addressChanged(before.location, location)
          ? await this.addressForManualPoint(location)
          : null
        if (filled) {
          location = { ...location, ...filled.fields }
          fieldSources = withManualPointProvenance(fieldSources, filled.keys)
        }
      }
    }
    // Lot 18 : le vendeur, nettoyé (un particulier n'a ni agence ni référence).
    const sellerTouched =
      patch.sellerType !== undefined ||
      patch.sellerName !== undefined ||
      patch.sellerReference !== undefined
    const seller = sellerTouched
      ? normalizeSeller({
          sellerType: patch.sellerType ?? before.sellerType,
          sellerName:
            patch.sellerName !== undefined
              ? patch.sellerName
              : before.sellerName,
          sellerReference:
            patch.sellerReference !== undefined
              ? patch.sellerReference
              : before.sellerReference,
        })
      : null
    // Lot 18 : le lien principal suit `url`, `source` et `externalId`.
    const links = row.links.map(linkStateOf)
    const primary = primaryLink(links)
    if (patch.url === null && links.length > 0) {
      throw new BadRequestException(
        'Le lien principal ne s’efface pas : retire un lien dans « Où la trouver » (le dernier lien d’une annonce reste)'
      )
    }
    await this.prisma.$transaction(async tx => {
      const { renovation, rentalPlan, ...rest } = patch
      await tx.listing.update({
        where: { id },
        data: {
          ...scalarData({ ...rest, fieldSources }),
          ...(seller
            ? {
                sellerType: seller.sellerType,
                sellerName: seller.sellerName,
                sellerReference: seller.sellerReference,
                sellerReferenceKey: seller.sellerReferenceKey,
              }
            : {}),
          ...(location ? locationData(location) : {}),
          ...(placement !== undefined
            ? { locationPlacement: placementJson(placement) }
            : {}),
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
      await this.syncMainLink(tx, {
        listingId: id,
        workspaceId: member.workspaceId,
        primary,
        patch,
        provenance,
        origin: linkOriginOf(channel),
        memberId: member.id,
      })
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
    if (location && 'point' in location && !pointUnchanged) {
      await this.geo.setListingPoint(
        id,
        location.point ?? null,
        location.precision ?? null,
        area
      )
    }
    if (locationChanged || ENRICHMENT_KEYS.some(key => key in patch)) {
      await this.enrichment.enrich(member, id, {
        dpe: locationChanged,
        channel,
      })
    }
    const trigger: CriteriaFitTrigger =
      patch.price !== undefined && patch.price !== before.price
        ? priceTrigger(before.price, patch.price)
        : locationChanged
          ? 'location'
          : 'updated'
    return this.afterWrite(member, id, channel, trigger)
  }

  async setStatus(
    member: Member,
    id: string,
    change: ListingStatusChange,
    channel: ActivityChannel = 'web',
    options: StatusWriteOptions = {}
  ): Promise<EvaluatedListing> {
    const current = await this.findRow(member, id)
    this.assertNotMerged(current)
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
          after: {
            status: change.status,
            reason: change.reason,
            ...(options.decision ? { decision: options.decision } : {}),
          },
        },
        tx
      )
      // Lot 21 : un fait appliqué directement rend caduque la proposition
      // ouverte de l'annonce.
      if (!options.decision) {
        await closeOpenDecisionsAsStale(tx, this.activity, {
          workspaceId: member.workspaceId,
          target: { listingId: id },
          actorMemberId: member.id,
          channel,
          why: `l’annonce est passée « ${LISTING_STATUS_LABELS[change.status]} »`,
        })
      }
    })
    return this.afterWrite(member, id, channel, 'status', {
      quiet: options.decision !== undefined,
    })
  }

  /**
   * Marque l'annonce comme vue par le membre (le drapeau « nouveau »
   * s'éteint pour lui seul, « ce qui a changé » repart de maintenant pour
   * cette fiche) ; ses notifications sur l'annonce passent lues.
   */
  async markSeen(member: Member, id: string): Promise<EvaluatedListing> {
    await this.findRow(member, id)
    const now = new Date()
    await this.prisma.$transaction([
      this.prisma.listingView.upsert({
        where: { listingId_memberId: { listingId: id, memberId: member.id } },
        create: { listingId: id, memberId: member.id, seenAt: now },
        update: { seenAt: now },
      }),
      this.prisma.notification.updateMany({
        where: { recipientId: member.id, listingId: id, readAt: null },
        data: { readAt: now },
      }),
    ])
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
    const primary = primaryLink(row.links.map(linkStateOf))
    await this.prisma.$transaction(async tx => {
      await tx.listing.update({
        where: { id },
        data: {
          price: new Prisma.Decimal(input.newPrice),
          // Lot 18 : la provenance du prix suit l'écriture (un prix saisi à
          // la main n'est plus remplacé par le plus bas en ligne sans
          // proposition ; un prix lu sur le portail suit de nouveau les liens).
          fieldSources: {
            ...(toListingDto(row).fieldSources ?? {}),
            price: {
              source: input.source,
              recordedAt: new Date().toISOString(),
            },
          } as Prisma.InputJsonValue,
        },
      })
      if (primary && input.source !== 'user') {
        // Lu sur le portail : c'est le prix affiché du lien principal.
        await tx.listingLink.update({
          where: { id: primary.id },
          data: {
            price: new Prisma.Decimal(input.newPrice),
            priceAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
          },
        })
      }
      await tx.priceEvent.create({
        data: priceEventData(
          id,
          currentPrice,
          input.newPrice,
          input.source,
          input.occurredAt ? new Date(input.occurredAt) : undefined
        ),
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
    return this.afterWrite(
      member,
      id,
      channel,
      priceTrigger(currentPrice, input.newPrice)
    )
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
    if (request.listingId) {
      const row = await this.findRow(member, request.listingId)
      const stored = toListingDto(row)
      const overrides = request.overrides ?? request.listing ?? {}
      listing = HypotheticalListingSchema.parse({
        ...stripStored(stored),
        ...overrides,
        location: { ...stored.location, ...(overrides.location ?? {}) },
      })
    } else {
      listing = request.listing as HypotheticalListing
    }
    // Lot 19 : les hypothèses de l'espace, sans surcharge par annonce ; le
    // scénario éventuel (`assumptions`) les remplace champ par champ.
    const base = await this.assumptions.currentValues(member.workspaceId)
    const assumptions = mergeAssumptions(base, request.assumptions ?? null)
    return {
      listing,
      assumptions,
      evaluation: evaluateListing(listing, assumptions),
      persisted: false,
    }
  }

  /** Les garde-fous optimistes d'une écriture (mise à jour, vérification du lot 15). */
  checkGuards(before: ListingDto, guards: ListingUpdateGuards): void {
    if (
      guards.expectedUpdatedAt !== undefined &&
      Date.parse(guards.expectedUpdatedAt) !== Date.parse(before.updatedAt)
    ) {
      throw new ConflictException(
        `L'annonce a changé depuis ta lecture (modifiée le ${before.updatedAt}) : relis-la avant de la modifier`
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

  /**
   * Lot 27 : une fiche fusionnée dans une autre n'est plus suivie ; elle ne
   * se modifie plus tant que la fusion n'est pas annulée.
   */
  assertNotMerged(row: {
    mergedIntoId: string | null
    mergedInto?: { title: string } | null
  }): void {
    if (row.mergedIntoId) {
      throw new ConflictException(
        mergedListingRefusal(row.mergedInto?.title ?? 'une autre fiche')
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

  /**
   * La forme « vue » d'une ligne : contrat, calculs, drapeaux pour le
   * membre, avis, tâches, prix. Lot 20 : seulement les avis que ce membre
   * peut voir (avis à l'aveugle), et leur confrontation.
   */
  evaluateRow(
    row: ListingRow,
    member: Member,
    base: Assumptions,
    opinions: OpinionWorkspaceContext,
    distanceMeters?: number
  ): EvaluatedListing {
    const listing = toListingDto(row)
    const view = opinionViewOf(row, member, opinions)
    return EvaluatedListingSchema.parse({
      listing,
      evaluation: evaluateListing(listing, base),
      distanceMeters: distanceMeters ?? null,
      isNewForMe: !listing.views.some(view => view.memberId === member.id),
      opinions: view.opinions,
      opinionSummary: view.summary,
      tasks: row.tasks.map(toTaskDto),
      priceEvents: row.priceEvents.map(toPriceEventDto),
      offers: row.offers.map(toOfferDto),
      criteriaMatches: toCriteriaMatchDtos(row),
      lastCheck: toLastCheck(row),
      republication: toRepublication(row),
      criteriaFit: toListingCriteriaFit(row),
      links: toListingLinkDtos(row.links),
      // Lot 27 : les autres agences, et les fusions des deux côtés.
      sellers: row.sellers.map(toListingSellerDto),
      mergedInto: toMergedInto(row),
      absorbed: row.mergesAsKept.map(toMergeRecord),
      // Lot 21 : la proposition en cours et les faits des lignes de l'étape.
      decision: row.decisionProposals[0]
        ? decisionViewOf(row.decisionProposals[0], member, {
            active: opinions.members,
            names: opinions.names,
          })
        : null,
      stage: toStageFacts(row, opinions.names),
    })
  }

  /**
   * Lot 18 : le lien principal suit une modification de l'annonce. Une URL
   * nouvelle remplace celle du lien principal (ou crée le premier lien),
   * refusée si elle est déjà sur une autre fiche ; une URL qui est déjà un
   * des liens de l'annonce ne crée rien. `source` et `externalId` modifiés
   * vont au lien principal. Un prix lu sur le portail (provenance autre que
   * « user ») devient le prix affiché du lien principal. Puis l'annonce
   * recopie son lien principal.
   */
  private async syncMainLink(
    tx: Prisma.TransactionClient,
    input: {
      listingId: string
      workspaceId: string
      primary: LinkState | null
      patch: ListingUpdate
      provenance: FieldSource
      origin: ListingLinkOrigin
      memberId: string
    }
  ): Promise<void> {
    const { patch, primary } = input
    const now = new Date()
    let touched = false
    if (patch.url !== undefined && patch.url !== null) {
      const normalizedUrl = linkKey(patch.url) as string
      const own = await assertLinkFree(
        tx,
        input.workspaceId,
        normalizedUrl,
        input.listingId
      )
      if (!own) {
        const portal = detectLinkPortal(
          patch.url,
          patch.source !== undefined
            ? portalOfListingSource(
                patch.source,
                patch.sourceLabel ?? null,
                null
              )
            : (primary?.portal ?? null)
        )
        if (primary) {
          await tx.listingLink.update({
            where: { id: primary.id },
            data: { url: patch.url.trim(), normalizedUrl, portal },
          })
        } else {
          await tx.listingLink.create({
            data: {
              workspaceId: input.workspaceId,
              listingId: input.listingId,
              portal,
              url: patch.url.trim(),
              normalizedUrl,
              externalId: patch.externalId ?? null,
              firstSeenAt: now,
              origin: input.origin,
              addedById: input.memberId,
            },
          })
        }
        touched = true
      }
    } else if (patch.source !== undefined && primary) {
      await tx.listingLink.update({
        where: { id: primary.id },
        data: {
          portal: portalOfListingSource(
            patch.source,
            patch.sourceLabel ?? null,
            primary.url
          ),
        },
      })
      touched = true
    }
    if (patch.externalId !== undefined && primary) {
      await tx.listingLink.update({
        where: { id: primary.id },
        data: { externalId: patch.externalId },
      })
      touched = true
    }
    if (patch.price !== undefined && input.provenance !== 'user' && primary) {
      await tx.listingLink.update({
        where: { id: primary.id },
        data: { price: new Prisma.Decimal(patch.price), priceAt: now },
      })
    }
    if (touched) await syncPrimaryLink(tx, input.listingId)
  }

  /** Les statuts d'un critère de l'espace (404 s'il n'en est pas). */
  private async criteriaStatuses(
    workspaceId: string,
    criteriaId: string
  ): Promise<CriteriaFilters['statuses']> {
    const criteria = await this.prisma.searchCriteria.findFirst({
      where: { id: criteriaId, workspaceId },
      select: { filters: true },
    })
    if (!criteria) {
      throw new NotFoundException('Critère de recherche introuvable')
    }
    return criteriaFiltersOf(criteria.filters).statuses
  }

  /**
   * L'annonce vue après une écriture, avec son adéquation aux critères
   * recalculée (lot 14) : les critères dans lesquels elle entre, dont elle
   * sort ou dont le niveau change (enregistrés, journalisés, une entrée
   * alerte). Public pour les écritures faites hors de ce service (DPE retenu
   * ou appliqué par l'enrichissement).
   */
  /**
   * ADR 0040 : à côté d'un point saisi, l'adresse de l'annonce est géocodée
   * pour ce que seul le géocodeur rend, sans bouger le repère. Null sans point
   * ni adresse ni commune.
   */
  private async addressForManualPoint(
    location: ListingLocationInput
  ): Promise<ReturnType<typeof addressFieldsForManualPoint> | null> {
    const hasAddress =
      Boolean(location.addressRaw?.trim()) || Boolean(location.commune?.trim())
    if (!location.point || !hasAddress) return null
    const located = await this.geocoding.locate({
      addressRaw: location.addressRaw,
      commune: location.commune,
      district: location.district,
    })
    return addressFieldsForManualPoint(location, located)
  }

  async afterWrite(
    member: Member,
    id: string,
    channel: ActivityChannel,
    trigger: CriteriaFitTrigger = 'updated',
    options: { quiet?: boolean } = {}
  ): Promise<EvaluatedListing> {
    const criteriaChanges = await this.criteriaMatches.refreshForListing(
      member,
      id,
      channel,
      trigger,
      options
    )
    const item = await this.get(member, id)
    return { ...item, criteriaChanges }
  }

  /**
   * Relance le géocodage d'une annonce (sans le cache : le géocodeur était
   * peut-être en panne, ou l'adresse n'avait donné que la commune), puis les
   * enrichissements. Refus si l'annonce n'a ni adresse ni commune.
   */
  async regeocode(
    member: Member,
    id: string,
    channel: ActivityChannel = 'web'
  ): Promise<EvaluatedListing> {
    const row = await this.findRow(member, id)
    const before = toListingDto(row)
    if (
      !before.location.addressRaw?.trim() &&
      !before.location.commune?.trim()
    ) {
      throw new BadRequestException(
        "L'annonce n'a ni adresse ni commune à géocoder"
      )
    }
    const located = await this.geocoding.locate(before.location, {
      fresh: true,
    })
    if (located) {
      const applied = applyLocated(before.location, located)
      const fieldSources = withOpenDataProvenance(
        before.fieldSources,
        applied.keys
      )
      await this.prisma.$transaction(async tx => {
        await tx.listing.update({
          where: { id },
          data: {
            ...locationData(applied.location),
            locationPlacement: placementJson(applied.placement),
            fieldSources: fieldSources as Prisma.InputJsonValue,
          },
        })
        await this.activity.record(
          {
            workspaceId: member.workspaceId,
            listingId: id,
            actorMemberId: member.id,
            channel,
            action: 'listing.geocoded',
            before: {
              point: before.location.point,
              precision: before.location.precision,
            },
            after: {
              point: located.point,
              precision: located.precision,
              addressNormalized: located.addressNormalized,
              banId: located.banId,
              placement: placementDigest(located.placement),
            },
          },
          tx
        )
      })
      await this.geo.setListingPoint(
        id,
        located.point,
        located.precision,
        applied.area
      )
    }
    await this.enrichment.enrich(member, id, { dpe: true, channel })
    return this.afterWrite(member, id, channel, 'location')
  }
}

/** Vrai si le patch change l'adresse ou la commune (ce qui relance le géocodage). */
/**
 * La provenance des sorties du géocodeur à côté d'un point saisi : `open_data`
 * pour celles qu'il a rendues, aucune pour celles restées vides.
 */
function withManualPointProvenance(
  fieldSources: FieldProvenanceMap,
  keys: readonly string[]
): FieldProvenanceMap {
  const result = withOpenDataProvenance(fieldSources, keys)
  for (const key of CONNECTOR_IGNORED_LOCATION_KEYS) {
    if (!keys.includes(key)) delete result[key]
  }
  return result
}

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

/** Le placement en colonne JSON (null : colonne vide). */
function placementJson(
  placement: ListingPlacement | null
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return placement
    ? (placement as unknown as Prisma.InputJsonValue)
    : Prisma.DbNull
}

/** Ce que le journal garde d'un placement : méthode, précision, zone retenue. */
function placementDigest(placement: ListingPlacement | null): {
  method: string
  precision: string
  area: string | null
  toVerify: boolean
} | null {
  return placement
    ? {
        method: placement.method,
        precision: placement.precision,
        area: placement.area?.name ?? null,
        toVerify: placement.toVerify,
      }
    : null
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
  'renovation' | 'rentalPlan' | 'location' | 'fieldSources'
> & {
  fieldSources?: ListingInput['fieldSources']
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
  // Lot 19 : plus d'hypothèses propres à une annonce ; la colonne
  // `assumptions_override` n'est plus écrite ni lue.
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

/**
 * La phase 2 d'une annonce. L'année et le type de location ne s'écrivent plus
 * (lot 19) : ils viennent des hypothèses de l'espace ; les colonnes gardent
 * leur valeur (défaut ou ancienne saisie) sans être lues.
 */
function rentalPlanData(input: RentalPlanInput) {
  return {
    rentControl: input.rentControl,
    referenceRentPerM2: dec(input.referenceRentPerM2),
    targetRent: dec(input.targetRent),
    marketRent: dec(input.marketRent),

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
  // Lot 15 : dernière vérification, à défaut date d'ajout (croissant = la plus ancienne d'abord).
  lastCheckedAt: (item: EvaluatedListing) =>
    Date.parse(checkReference(item.listing)),
  // Lot 20 : note commune et plus gros désaccord ; en attente en fin de liste.
  commonScore: (item: EvaluatedListing) =>
    item.opinionSummary?.commonScore ?? Number.NaN,
  disagreement: (item: EvaluatedListing) =>
    item.opinionSummary?.maxGap ?? Number.NaN,
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
