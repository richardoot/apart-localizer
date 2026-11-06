import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { RENT_COMPARABLES_MAX } from '@apart/contracts'
import type {
  ActivityChannel,
  RentComparable as RentComparableDto,
  RentComparableInput,
  RentComparableList,
  RentComparableUpdate,
  RentComparableWriteResult,
  RentMarketReport,
} from '@apart/contracts'
import { rentMarket } from '@apart/domain'
import { PrismaService } from '../prisma/prisma.service'
import { ActivityService } from '../activity/activity.service'
import { ListingsService } from '../listings/listings.service'
import { AssumptionsService } from '../assumptions/assumptions.service'
import { Prisma } from '../generated/prisma'
import type { Member } from '../generated/prisma'
import { toRentComparableDto } from './study.mapper'

const dec = (value: number): Prisma.Decimal => new Prisma.Decimal(value)

/** Les colonnes d'un comparable à partir du contrat (création complète ou modification partielle). */
function comparableData(
  input: Partial<RentComparableInput>
): Partial<Prisma.RentComparableUncheckedCreateInput> {
  const data: Partial<Prisma.RentComparableUncheckedCreateInput> = {}
  if (input.rent !== undefined) data.rent = dec(input.rent)
  if (input.surface !== undefined) data.surface = dec(input.surface)
  if (input.furnished !== undefined) data.furnished = input.furnished
  if (input.rooms !== undefined) data.rooms = input.rooms
  if (input.observedAt !== undefined) {
    data.observedAt =
      input.observedAt === null
        ? null
        : new Date(`${input.observedAt}T00:00:00Z`)
  }
  if (input.source !== undefined) data.source = input.source
  if (input.sourceLabel !== undefined) data.sourceLabel = input.sourceLabel
  if (input.url !== undefined) data.url = input.url
  if (input.address !== undefined) data.address = input.address
  if (input.note !== undefined) data.note = input.note
  return data
}

/**
 * Annonces de location comparables d'une annonce (besoin L4) : saisie
 * manuelle, jamais de collecte sur les portails. La synthèse (médiane,
 * quartiles, position du loyer visé et du plafond) vient de `domain`.
 */
@Injectable()
export class RentComparablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly listings: ListingsService,
    private readonly assumptions: AssumptionsService
  ) {}

  async list(member: Member, listingId: string): Promise<RentComparableList> {
    const items = await this.rows(member, listingId)
    return { items, market: await this.market(member, listingId, items) }
  }

  async create(
    member: Member,
    listingId: string,
    input: RentComparableInput,
    channel: ActivityChannel = 'web'
  ): Promise<RentComparableWriteResult> {
    const existing = await this.rows(member, listingId)
    if (existing.length >= RENT_COMPARABLES_MAX) {
      throw new BadRequestException(
        `${RENT_COMPARABLES_MAX} comparables au plus par annonce : modifiez-en un plutôt que d'en ajouter`
      )
    }
    const row = await this.prisma.$transaction(async tx => {
      const created = await tx.rentComparable.create({
        data: {
          ...comparableData(input),
          rent: dec(input.rent),
          surface: dec(input.surface),
          listingId,
          createdById: member.id,
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel,
          action: 'rent_comparable.created',
          after: { id: created.id, ...input },
        },
        tx
      )
      return created
    })
    const comparable = toRentComparableDto(row)
    return {
      comparable,
      market: await this.market(member, listingId, [comparable, ...existing]),
    }
  }

  async update(
    member: Member,
    listingId: string,
    comparableId: string,
    patch: RentComparableUpdate,
    channel: ActivityChannel = 'web'
  ): Promise<RentComparableWriteResult> {
    const current = await this.find(member, listingId, comparableId)
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('Aucun champ à modifier')
    }
    const row = await this.prisma.$transaction(async tx => {
      const saved = await tx.rentComparable.update({
        where: { id: comparableId },
        data: comparableData(patch),
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel,
          action: 'rent_comparable.updated',
          before: current,
          after: patch,
        },
        tx
      )
      return saved
    })
    const comparable = toRentComparableDto(row)
    return { comparable, market: await this.market(member, listingId) }
  }

  /** Suppression (application web seulement), journalisée. */
  async remove(
    member: Member,
    listingId: string,
    comparableId: string
  ): Promise<RentComparableList> {
    const current = await this.find(member, listingId, comparableId)
    await this.prisma.$transaction(async tx => {
      await tx.rentComparable.delete({ where: { id: comparableId } })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel: 'web',
          action: 'rent_comparable.deleted',
          before: current,
        },
        tx
      )
    })
    return this.list(member, listingId)
  }

  /** La synthèse du loyer de marché d'une annonce, d'après ses comparables. */
  async market(
    member: Member,
    listingId: string,
    items?: RentComparableDto[]
  ): Promise<RentMarketReport> {
    const item = await this.listings.get(member, listingId)
    const comparables = items ?? (await this.rows(member, listingId))
    const plan = item.listing.rentalPlan
    // Lot 19 : meublé ou vide selon le type de location de l'espace.
    const { leaseType } = await this.assumptions.currentValues(
      member.workspaceId
    )
    return rentMarket(comparables, {
      listingId,
      surface: item.listing.surface,
      furnished: leaseType !== 'unfurnished',
      targetRent: plan?.targetRent ?? null,
      rentCap: item.evaluation.metrics.rentCap,
      at: new Date(),
    })
  }

  private async rows(
    member: Member,
    listingId: string
  ): Promise<RentComparableDto[]> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, workspaceId: member.workspaceId },
      select: { id: true },
    })
    if (!listing) throw new NotFoundException('Annonce introuvable')
    const rows = await this.prisma.rentComparable.findMany({
      where: { listingId },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toRentComparableDto)
  }

  private async find(
    member: Member,
    listingId: string,
    comparableId: string
  ): Promise<RentComparableDto> {
    const row = await this.prisma.rentComparable.findFirst({
      where: {
        id: comparableId,
        listingId,
        listing: { workspaceId: member.workspaceId },
      },
    })
    if (!row) throw new NotFoundException('Comparable introuvable')
    return toRentComparableDto(row)
  }
}
