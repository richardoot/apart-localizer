import { Injectable, NotFoundException } from '@nestjs/common'
import type { ActivityChannel, Opinion, OpinionInput } from '@apart/contracts'
import { PrismaService } from '../prisma/prisma.service'
import { ActivityService } from '../activity/activity.service'
import { toOpinionDto } from '../listings/listing.mapper'
import type { Member } from '../generated/prisma'

/**
 * Les avis : un par membre et par annonce, note sur 5 et texte. Écrire son
 * avis crée ou remplace le sien ; l'avis de l'autre membre reste visible dans
 * la fiche. Pas de suppression : un avis vide (note 0, texte vide) tient lieu
 * d'effacement.
 */
@Injectable()
export class OpinionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService
  ) {}

  async upsert(
    member: Member,
    listingId: string,
    input: OpinionInput,
    channel: ActivityChannel = 'web'
  ): Promise<Opinion> {
    await this.ensureListing(member, listingId)
    const previous = await this.prisma.opinion.findUnique({
      where: { listingId_memberId: { listingId, memberId: member.id } },
    })
    const saved = await this.prisma.$transaction(async tx => {
      const opinion = await tx.opinion.upsert({
        where: { listingId_memberId: { listingId, memberId: member.id } },
        create: {
          listingId,
          memberId: member.id,
          rating: input.rating,
          text: input.text,
        },
        update: { rating: input.rating, text: input.text },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel,
          action: previous ? 'opinion.updated' : 'opinion.created',
          before: previous
            ? { rating: previous.rating, text: previous.text }
            : null,
          after: { rating: input.rating, text: input.text },
        },
        tx
      )
      return opinion
    })
    return toOpinionDto(saved)
  }

  async listForListing(member: Member, listingId: string): Promise<Opinion[]> {
    await this.ensureListing(member, listingId)
    const rows = await this.prisma.opinion.findMany({
      where: { listingId },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toOpinionDto)
  }

  private async ensureListing(
    member: Member,
    listingId: string
  ): Promise<void> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, workspaceId: member.workspaceId },
      select: { id: true },
    })
    if (!listing) throw new NotFoundException('Annonce introuvable')
  }
}
