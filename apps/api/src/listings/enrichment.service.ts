import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { RENT_EPOCH_LABELS } from '@apart/contracts'
import type {
  ActivityChannel,
  DpeCandidate,
  DpeSearchResult,
  FieldProvenanceMap,
  Listing as ListingDto,
  ListingContext,
  ListingOpenDataContext,
  LocationPrecision,
  MarketContext,
  MarketContextReport,
  MarketContextRequest,
  Point,
  RentControlLookup,
} from '@apart/contracts'
import { REFERENCE_RENT_KEY, dpeValidity } from '@apart/domain'
import { ActivityService } from '../activity/activity.service'
import { AssumptionsService } from '../assumptions/assumptions.service'
import { DpeService } from '../opendata/dpe.service'
import { GeocodingService } from '../opendata/geocoding.service'
import { MarketService } from '../opendata/market.service'
import { RentControlService } from '../opendata/rent-control.service'
import { TransitService } from '../opendata/transit.service'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'
import type { Member } from '../generated/prisma'
import { listingInclude, toListingDto } from './listing.mapper'

/** Clé de provenance du loyer de référence majoré de la phase 2 (définie dans `domain`). */
export { REFERENCE_RENT_KEY }
/** Les champs du DPE renseignés par un DPE vérifié. */
export const DPE_KEYS = [
  'dpeClass',
  'gesClass',
  'dpeConsumption',
  'dpeDate',
  'dpeNumber',
] as const

export interface EnrichOptions {
  /** Interroger l'ADEME (réseau) ; faux = garder la dernière recherche. */
  dpe: boolean
  channel: ActivityChannel
}

export interface EnrichResult {
  snapshot: ListingOpenDataContext
  referenceRentApplied: number | null
  dpeApplied: DpeCandidate | null
}

/** Vrai si le logement est en copropriété d'après la fiche (lots, charges) ; null si on ne sait pas. */
function inCoOwnership(listing: ListingDto): boolean | null {
  if ((listing.lotsCount ?? 0) > 1) return true
  if ((listing.annualCharges ?? 0) > 0) return true
  return null
}

/**
 * Enrichissement d'une annonce par les données ouvertes (lot 4) : arrêt de
 * tram le plus proche, plafond d'encadrement (appliqué à la phase 2 avec la
 * provenance `open_data` tant que le membre ne l'a pas saisi lui-même),
 * prix médian DVF (nourrit le critère « marché » du prix cible), DPE vérifié
 * auprès de l'ADEME. Rien n'est calculé ici : tout vient de `domain` à
 * travers les services open data ; le SQL est dans le module geo.
 */
@Injectable()
export class ListingEnrichmentService {
  private readonly logger = new Logger(ListingEnrichmentService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly assumptions: AssumptionsService,
    private readonly rentControl: RentControlService,
    private readonly market: MarketService,
    private readonly transit: TransitService,
    private readonly dpe: DpeService,
    private readonly geocoding: GeocodingService
  ) {}

  private async load(member: Member, id: string): Promise<ListingDto> {
    const row = await this.prisma.listing.findFirst({
      where: { id, workspaceId: member.workspaceId },
      include: listingInclude,
    })
    if (!row) throw new NotFoundException('Annonce introuvable')
    return toListingDto(row)
  }

  private async rentFor(
    member: Member,
    listing: ListingDto,
    at: Date
  ): Promise<RentControlLookup> {
    const values = await this.assumptions.currentValues(member.workspaceId)
    return this.rentControl.lookup(
      {
        point: listing.location.point,
        precision: listing.location.precision,
        inseeCode: listing.location.inseeCode,
        commune: listing.location.commune,
        rentControl: listing.rentalPlan?.rentControl ?? 'auto',
        rooms: listing.rooms,
        constructionYear: listing.constructionYear,
        constructionPeriod: listing.constructionPeriod,
        leaseType: listing.rentalPlan?.leaseType ?? null,
        surface: listing.surface,
        rentalYear: listing.rentalPlan?.year ?? values.rentalYear,
      },
      at
    )
  }

  private marketFor(listing: ListingDto, at: Date): Promise<MarketContext> {
    return this.market.context(
      {
        point: listing.location.point,
        surface: listing.surface,
        price: listing.price,
      },
      at
    )
  }

  /**
   * Recalcule et enregistre l'instantané ; applique le plafond et le DPE
   * vérifié quand c'est sans ambiguïté. Ne lance jamais : un enrichissement
   * raté laisse l'annonce telle quelle (journal d'erreur).
   */
  async enrich(
    member: Member,
    id: string,
    options: EnrichOptions
  ): Promise<EnrichResult | null> {
    try {
      return await this.enrichOrThrow(member, id, options)
    } catch (error) {
      if (error instanceof NotFoundException) throw error
      this.logger.warn(
        `Enrichissement de ${id} impossible : ${error instanceof Error ? error.message : String(error)}`
      )
      return null
    }
  }

  private async enrichOrThrow(
    member: Member,
    id: string,
    options: EnrichOptions
  ): Promise<EnrichResult> {
    const now = new Date()
    const computedAt = now.toISOString()
    const listing = await this.load(member, id)
    const point = listing.location.point
    const [transit, rent, market] = await Promise.all([
      this.transit.at(point),
      this.rentFor(member, listing, now),
      this.marketFor(listing, now),
    ])
    let dpeResult: DpeSearchResult | null = listing.openDataContext?.dpe ?? null
    let dpeApplied: DpeCandidate | null = null
    if (options.dpe) {
      const found = await this.dpe.search(
        {
          banId: listing.location.banId,
          inseeCode: listing.location.inseeCode,
          precision: listing.location.precision,
          surface: listing.surface,
          floor: listing.floor,
          declaredClass: listing.dpeClass,
        },
        now
      )
      dpeResult = found.result
      dpeApplied = found.apply
    }

    const snapshot: ListingOpenDataContext = {
      transit: { nearestTram: transit.nearestTram, computedAt },
      market: {
        medianPricePerM2: market.stats?.medianPricePerM2 ?? null,
        count: market.stats?.count ?? 0,
        radiusMeters: market.radiusMeters,
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
      dpe: dpeResult,
    }

    // Écriture relue dans sa transaction : une modification faite pendant les
    // appels (ADEME, DVF) n'est pas écrasée, seules les clés open data
    // changent ; une valeur saisie entre-temps par le membre l'emporte.
    const outcome = await this.prisma.$transaction(async tx => {
      const fresh = await tx.listing.findUniqueOrThrow({
        where: { id },
        select: {
          fieldSources: true,
          dpeClass: true,
          rentalPlan: { select: { id: true, referenceRentPerM2: true } },
        },
      })
      const fieldSources: FieldProvenanceMap = {
        ...((fresh.fieldSources ?? {}) as FieldProvenanceMap),
      }
      const data: Prisma.ListingUpdateInput = {
        openDataContext: snapshot as unknown as Prisma.InputJsonValue,
      }

      // Plafond d'encadrement : rempli d'office tant que le membre n'a rien saisi.
      let referenceRentApplied: number | null = null
      const current = fresh.rentalPlan?.referenceRentPerM2?.toNumber() ?? null
      const automatic =
        current === null ||
        fieldSources[REFERENCE_RENT_KEY]?.source === 'open_data'
      // Sans phase 2, rien n'est créé d'office : le plafond reste dans
      // l'instantané et le contexte, la phase 2 le recevra à sa saisie.
      if (
        fresh.rentalPlan &&
        rent.status === 'ok' &&
        rent.referenceRentPerM2 !== null &&
        rent.row &&
        automatic
      ) {
        referenceRentApplied = rent.referenceRentPerM2
        fieldSources[REFERENCE_RENT_KEY] = {
          source: 'open_data',
          confidence: 1,
          recordedAt: computedAt,
          evidence: `Arrêté du ${rent.decree?.decreeDate ?? '?'}, zone ${rent.zone?.zone ?? '?'}, ${rent.row.rooms === 4 ? '4 pièces et plus' : `${rent.row.rooms} pièce(s)`}, ${RENT_EPOCH_LABELS[rent.row.epoch].toLowerCase()}, ${rent.row.furnished ? 'meublé' : 'vide'} : loyer de référence majoré ${rent.row.upperRent} €/m²`,
        }
        if (current !== rent.referenceRentPerM2) {
          data.rentalPlan = {
            update: {
              referenceRentPerM2: new Prisma.Decimal(rent.referenceRentPerM2),
            },
          }
        }
      } else if (fresh.rentalPlan && current !== null && automatic) {
        // Le plafond posé d'office ne vaut plus pour cette annonce (adresse,
        // phase 2 ou arrêté) : retiré plutôt que gardé périmé, « à vérifier ».
        delete fieldSources[REFERENCE_RENT_KEY]
        data.rentalPlan = { update: { referenceRentPerM2: null } }
      }

      // DPE vérifié : un seul candidat de l'ADEME, clair et cohérent, et une
      // classe déclarée qui n'a pas changé pendant la recherche.
      const dpeWritten =
        dpeApplied && (fresh.dpeClass ?? null) === (listing.dpeClass ?? null)
          ? dpeApplied
          : null
      if (dpeWritten) {
        const evidence = `DPE n° ${dpeWritten.number} établi le ${dpeWritten.issuedAt} (observatoire DPE de l'ADEME)`
        for (const key of DPE_KEYS) {
          fieldSources[key] = {
            source: 'open_data',
            confidence: 1,
            recordedAt: computedAt,
            evidence,
          }
        }
        Object.assign(data, dpeData(dpeWritten))
      }
      data.fieldSources = fieldSources as Prisma.InputJsonValue

      await tx.listing.update({ where: { id }, data })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: id,
          actorMemberId: member.id,
          channel: options.channel,
          action: 'listing.enriched',
          after: {
            tram: transit.nearestTram
              ? {
                  name: transit.nearestTram.name,
                  lines: transit.nearestTram.lines,
                  distanceMeters: transit.nearestTram.distanceMeters,
                }
              : null,
            rentControl: {
              status: rent.status,
              zone: rent.zone?.zone ?? null,
              referenceRentPerM2: rent.referenceRentPerM2,
              applied: referenceRentApplied !== null,
            },
            market: {
              medianPricePerM2: snapshot.market?.medianPricePerM2 ?? null,
              count: snapshot.market?.count ?? 0,
              radiusMeters: market.radiusMeters,
            },
            dpe: options.dpe
              ? {
                  status: dpeResult?.status ?? null,
                  candidates: dpeResult?.candidates.length ?? 0,
                  applied: dpeWritten?.number ?? null,
                }
              : 'non recherché',
          },
        },
        tx
      )
      return { referenceRentApplied, dpeWritten }
    })
    return {
      snapshot,
      referenceRentApplied: outcome.referenceRentApplied,
      dpeApplied: outcome.dpeWritten,
    }
  }

  /** Le bloc « Contexte » de la fiche, calculé à la lecture (rien n'est écrit). */
  async context(member: Member, id: string): Promise<ListingContext> {
    const now = new Date()
    const listing = await this.load(member, id)
    const [transit, rentControl, market] = await Promise.all([
      this.transit.at(listing.location.point),
      this.rentFor(member, listing, now),
      this.marketFor(listing, now),
    ])
    return {
      listingId: listing.id,
      point: listing.location.point,
      precision: listing.location.precision,
      transit,
      rentControl,
      dpe: {
        verified: listing.fieldSources.dpeClass?.source === 'open_data',
        validity: dpeValidity({
          dpeClass: listing.dpeClass,
          dpeDate: listing.dpeDate,
          inCoOwnership: inCoOwnership(listing),
          at: now,
        }),
        search: listing.openDataContext?.dpe ?? null,
      },
      market,
      computedAt: now.toISOString(),
    }
  }

  /** Les comparables DVF de l'annonce (`GET /listings/:id/market`). */
  async marketOf(member: Member, id: string): Promise<MarketContext> {
    return this.marketFor(await this.load(member, id), new Date())
  }

  /** Relance la recherche du DPE à l'ADEME (et l'applique s'il est sans ambiguïté). */
  async searchDpe(
    member: Member,
    id: string,
    channel: ActivityChannel
  ): Promise<void> {
    await this.enrichOrThrow(member, id, { dpe: true, channel })
  }

  /**
   * Le membre retient un candidat de la dernière recherche : la fiche reçoit
   * classe, GES, consommation, date et numéro, provenance `open_data`.
   */
  async verifyDpe(
    member: Member,
    id: string,
    number: string,
    channel: ActivityChannel
  ): Promise<DpeCandidate> {
    const listing = await this.load(member, id)
    const search = listing.openDataContext?.dpe
    const candidate = search?.candidates.find(c => c.number === number)
    if (!search || !candidate) {
      throw new NotFoundException(
        `DPE n° ${number} absent de la dernière recherche : relancez la recherche du DPE.`
      )
    }
    const recordedAt = new Date().toISOString()
    const evidence = `DPE n° ${candidate.number} établi le ${candidate.issuedAt} (observatoire DPE de l'ADEME), retenu par ${member.displayName}`
    const fieldSources: FieldProvenanceMap = { ...listing.fieldSources }
    for (const key of DPE_KEYS) {
      fieldSources[key] = {
        source: 'open_data',
        confidence: 1,
        recordedAt,
        evidence,
      }
    }
    const snapshot: ListingOpenDataContext = {
      market: listing.openDataContext?.market ?? null,
      rentControl: listing.openDataContext?.rentControl ?? null,
      transit: listing.openDataContext?.transit ?? null,
      dpe: { ...search, status: 'verified', message: evidence },
    }
    await this.prisma.$transaction(async tx => {
      await tx.listing.update({
        where: { id },
        data: {
          ...dpeData(candidate),
          fieldSources: fieldSources as Prisma.InputJsonValue,
          openDataContext: snapshot as unknown as Prisma.InputJsonValue,
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: id,
          actorMemberId: member.id,
          channel,
          action: 'listing.dpe_verified',
          before: {
            dpeClass: listing.dpeClass,
            dpeDate: listing.dpeDate,
            dpeNumber: listing.dpeNumber,
          },
          after: {
            dpeClass: candidate.dpeClass,
            dpeDate: candidate.issuedAt,
            dpeNumber: candidate.number,
          },
        },
        tx
      )
    })
    return candidate
  }

  /**
   * `get_market_context` et `POST /market-context` : DVF, encadrement et
   * desserte pour une annonce, une adresse (géocodée) ou un point.
   */
  async marketReport(
    member: Member,
    request: MarketContextRequest
  ): Promise<MarketContextReport> {
    const now = new Date()
    let point: Point | null = null
    let precision: LocationPrecision | null = null
    let label: string | null = null
    let commune: string | null = null
    let inseeCode: string | null = null
    let listing: ListingDto | null = null
    if (request.listingId) {
      listing = await this.load(member, request.listingId)
      point = listing.location.point
      precision = listing.location.precision
      label = listing.location.addressNormalized ?? listing.location.addressRaw
      commune = listing.location.commune
      inseeCode = listing.location.inseeCode
    } else if (request.address) {
      const located = await this.geocoding.locate({
        addressRaw: request.address,
      })
      if (located) {
        point = located.point
        precision = located.precision
        label = located.addressNormalized ?? request.address
        commune = located.commune
        inseeCode = located.inseeCode
      } else {
        label = request.address
      }
    } else if (request.point) {
      point = request.point
      precision = 'exact'
    }
    const surface = request.surface ?? listing?.surface ?? null
    const leaseType =
      request.furnished === true
        ? 'furnished'
        : request.furnished === false
          ? 'unfurnished'
          : (listing?.rentalPlan?.leaseType ?? null)
    const values = await this.assumptions.currentValues(member.workspaceId)
    const [market, rentControl, transit] = await Promise.all([
      this.market.context(
        {
          point,
          surface,
          price: listing?.price ?? null,
          radiusMeters: request.radiusMeters ?? null,
        },
        now
      ),
      this.rentControl.lookup(
        {
          point,
          precision,
          inseeCode,
          commune,
          rentControl: listing?.rentalPlan?.rentControl ?? 'auto',
          rooms: request.rooms ?? listing?.rooms ?? null,
          constructionYear:
            request.constructionYear ?? listing?.constructionYear ?? null,
          constructionPeriod: listing?.constructionPeriod ?? null,
          leaseType,
          surface,
          rentalYear: listing?.rentalPlan?.year ?? values.rentalYear,
        },
        now
      ),
      this.transit.at(point),
    ])
    return {
      location: { point, label, precision, commune, inseeCode },
      market,
      rentControl,
      transit,
    }
  }
}

/** Les colonnes du DPE d'un candidat de l'ADEME. */
function dpeData(candidate: DpeCandidate): Prisma.ListingUpdateInput {
  return {
    dpeClass: candidate.dpeClass,
    gesClass: candidate.gesClass,
    dpeConsumption: candidate.consumption,
    dpeDate: new Date(`${candidate.issuedAt}T00:00:00.000Z`),
    dpeNumber: candidate.number,
  }
}
