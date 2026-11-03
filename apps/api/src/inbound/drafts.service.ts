import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  DuplicateCandidateSchema,
  ListingDraftSchema,
  ListingInputSchema,
} from '@apart/contracts'
import type {
  ListingDraft,
  ListingDraftDecision,
  ListingDraftStatus,
} from '@apart/contracts'
import { z } from 'zod'
import { ActivityService } from '../activity/activity.service'
import { PrismaService } from '../prisma/prisma.service'
import type { ListingDraft as DraftRow, Member } from '../generated/prisma'

export function toDraftDto(row: DraftRow): ListingDraft {
  const listing = ListingInputSchema.safeParse(row.input)
  return ListingDraftSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    origin: row.origin,
    status: row.status,
    extractedBy: row.extractedBy,
    listing: listing.success
      ? listing.data
      : ListingInputSchema.parse({ title: 'Annonce reçue', price: 0 }),
    duplicates: z
      .array(DuplicateCandidateSchema)
      .catch([])
      .parse(row.duplicates),
    warnings: z.array(z.string()).catch([]).parse(row.warnings),
    url: row.url,
    emailSubject: row.emailSubject,
    emailFrom: row.emailFrom,
    receivedAt: row.receivedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedById: row.decidedById,
    listingId: row.listingId,
    createdAt: row.createdAt.toISOString(),
  })
}

/**
 * Les brouillons reçus : la liste « à valider », la validation (le membre a
 * créé l'annonce depuis la fiche pré-remplie) ou l'écartement. Journalisé.
 */
@Injectable()
export class DraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService
  ) {}

  async list(
    member: Member,
    status: ListingDraftStatus
  ): Promise<ListingDraft[]> {
    const rows = await this.prisma.listingDraft.findMany({
      where: { workspaceId: member.workspaceId, status },
      orderBy: { receivedAt: 'desc' },
      take: 100,
    })
    return rows.map(toDraftDto)
  }

  async get(member: Member, id: string): Promise<ListingDraft> {
    return toDraftDto(await this.row(member, id))
  }

  async decide(
    member: Member,
    id: string,
    decision: ListingDraftDecision
  ): Promise<ListingDraft> {
    const row = await this.row(member, id)
    if (row.status !== 'pending') {
      throw new ConflictException(
        `Ce brouillon est déjà ${row.status === 'accepted' ? 'validé' : 'écarté'}.`
      )
    }
    const createdId =
      decision.status === 'accepted' ? (decision.listingId ?? null) : null
    if (decision.status === 'accepted') {
      const listing = await this.prisma.listing.findFirst({
        where: { id: createdId ?? '', workspaceId: member.workspaceId },
        select: { id: true },
      })
      if (!listing) {
        throw new BadRequestException("L'annonce créée est introuvable")
      }
    }
    const saved = await this.prisma.$transaction(async tx => {
      const updated = await tx.listingDraft.update({
        where: { id },
        data: {
          status: decision.status,
          decidedAt: new Date(),
          decidedById: member.id,
          listingId: createdId,
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: createdId,
          actorMemberId: member.id,
          channel: 'web',
          action:
            decision.status === 'accepted'
              ? 'draft.accepted'
              : 'draft.dismissed',
          after: { draftId: id, url: row.url },
        },
        tx
      )
      return updated
    })
    return toDraftDto(saved)
  }

  private async row(member: Member, id: string): Promise<DraftRow> {
    const row = await this.prisma.listingDraft.findFirst({
      where: { id, workspaceId: member.workspaceId },
    })
    if (!row) throw new NotFoundException('Brouillon introuvable')
    return row
  }
}
