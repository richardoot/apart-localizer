import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  ActivityChannel,
  Opinion,
  OpinionReveal,
  OpinionScoresInput,
} from '@apart/contracts'
import {
  canSeeOthersOpinions,
  opinionAfterVisit,
  opinionHasRating,
  opinionJournalPayload,
  opinionSnapshot,
  sameOpinionSnapshot,
} from '@apart/domain'
import type { OpinionLike } from '@apart/domain'
import { PrismaService } from '../prisma/prisma.service'
import { ActivityService } from '../activity/activity.service'
import type { Member, Prisma } from '../generated/prisma'
import {
  loadOpinionContext,
  opinionViewOf,
  toOpinionDto,
  visitRefs,
} from './opinion-context'
import type { OpinionRow, OpinionWorkspaceContext } from './opinion-context'

/** Une écriture de mon avis : ce qui est donné change, le reste est gardé. */
export interface OpinionWrite {
  rating?: number
  text?: string
  scores?: OpinionScoresInput
  /** Garde-fou optimiste : null = « pas encore d'avis ». */
  expectedUpdatedAt?: string | null
}

/** Un avis en notes de `domain`. */
function asLike(row: OpinionRow): OpinionLike {
  return {
    memberId: row.memberId,
    rating: row.rating,
    text: row.text,
    scores: row.scores.map(s => ({
      key: s.criterionKey,
      score: s.score,
      word: s.word,
    })),
  }
}

/**
 * Les avis (lot 20, ADR 0030) : un par membre et par annonce, note globale
 * sur 5, phrase, et notes par critère de l'espace (1 à 5, mot facultatif).
 * Écrire mon avis remplace ma note et ma phrase quand je les donne et
 * fusionne mes notes par critère (seules les clés données changent, null
 * efface). L'avis à l'aveugle s'applique à toute lecture : tant que je n'ai
 * rien noté, l'avis des autres ne m'est pas rendu, sauf « Voir quand même ».
 * Pas de suppression : un avis vide tient lieu d'effacement.
 */
@Injectable()
export class OpinionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService
  ) {}

  /** Les critères, la règle et les membres de l'espace. */
  context(workspaceId: string): Promise<OpinionWorkspaceContext> {
    return loadOpinionContext(this.prisma, workspaceId)
  }

  async upsert(
    member: Member,
    listingId: string,
    input: OpinionWrite,
    channel: ActivityChannel = 'web'
  ): Promise<Opinion> {
    await this.ensureListing(member, listingId)
    const ctx = await this.context(member.workspaceId)
    this.checkKeys(input.scores ?? {}, ctx)

    const saved = await this.prisma.$transaction(async tx => {
      const [previous, others, reveal, visits] = await Promise.all([
        tx.opinion.findUnique({
          where: { listingId_memberId: { listingId, memberId: member.id } },
          include: { scores: true },
        }),
        tx.opinion.findMany({
          where: {
            listingId,
            memberId: {
              not: member.id,
              in: ctx.members.map(m => m.id),
            },
          },
          include: { scores: true },
        }),
        tx.opinionReveal.findUnique({
          where: { listingId_memberId: { listingId, memberId: member.id } },
        }),
        tx.visit.findMany({
          where: { listingId },
          select: {
            id: true,
            visitedAt: true,
            status: true,
            participantIds: true,
          },
        }),
      ])
      this.checkExpected(previous, input.expectedUpdatedAt)

      // Les notes après fusion, par clé.
      const next = new Map(
        (previous?.scores ?? []).map(s => [
          s.criterionKey,
          { score: s.score, word: s.word },
        ])
      )
      for (const [key, entry] of Object.entries(input.scores ?? {})) {
        if (entry === null) {
          next.delete(key)
          continue
        }
        const word =
          entry.word === undefined ? (next.get(key)?.word ?? null) : entry.word
        if (entry.score === null && word === null) next.delete(key)
        else next.set(key, { score: entry.score, word })
      }
      const rating = input.rating ?? previous?.rating ?? 0
      const text = input.text ?? previous?.text ?? ''
      const after: OpinionLike = {
        memberId: member.id,
        rating,
        text,
        scores: [...next].map(([key, v]) => ({
          key,
          score: v.score,
          word: v.word,
        })),
      }
      const beforeSnapshot = previous
        ? opinionSnapshot(asLike(previous), ctx.visibleKeys)
        : null
      const afterSnapshot = opinionSnapshot(after, ctx.visibleKeys)
      if (previous && sameOpinionSnapshot(beforeSnapshot, afterSnapshot)) {
        // Rien ne change : pas d'écriture, pas de journal.
        return previous
      }

      const now = new Date()
      const ratedNow = opinionHasRating(after, ctx.visibleKeys)
      const wasRated = previous
        ? opinionHasRating(asLike(previous), ctx.visibleKeys)
        : false
      const ratedOthers = others.filter(o =>
        opinionHasRating(asLike(o), ctx.visibleKeys)
      )
      // « Après avoir vu celui de … » : la première note après « Voir quand même ».
      const seen = previous?.seenMemberIds.length
        ? previous.seenMemberIds
        : ratedNow && !wasRated && reveal
          ? ratedOthers.map(o => o.memberId)
          : (previous?.seenMemberIds ?? [])
      const ratedAt =
        previous?.ratedAt ??
        (previous && previous.rating > 0 ? previous.createdAt : null) ??
        (ratedNow ? now : null)

      const opinion = await tx.opinion.upsert({
        where: { listingId_memberId: { listingId, memberId: member.id } },
        create: {
          listingId,
          memberId: member.id,
          rating,
          text,
          ratedAt,
          seenMemberIds: seen,
        },
        update: { rating, text, ratedAt, seenMemberIds: seen },
      })
      await this.writeScores(tx, opinion.id, previous, next)

      const afterVisit = opinionAfterVisit(visitRefs(visits), member.id, now)
      const payload = opinionJournalPayload({
        before: beforeSnapshot,
        opinion: after,
        criteria: ctx.criteria,
        visibleKeys: ctx.visibleKeys,
        afterVisit: afterVisit !== null,
        seenBefore: seen,
        others: ratedOthers.map(asLike),
        blind: ctx.blind,
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel,
          action: previous ? 'opinion.updated' : 'opinion.created',
          before: payload.before,
          after: payload.after,
        },
        tx
      )
      return opinion
    })

    const row = await this.prisma.opinion.findUniqueOrThrow({
      where: { id: saved.id },
      include: { scores: true },
    })
    const visits = await this.prisma.visit.findMany({
      where: { listingId },
      select: { id: true, visitedAt: true, status: true, participantIds: true },
    })
    return toOpinionDto(row, {
      visibleKeys: ctx.visibleKeys,
      visits: visitRefs(visits),
    })
  }

  /** Les notes d'un avis : effacées, créées ou modifiées, clé par clé. */
  private async writeScores(
    tx: Prisma.TransactionClient,
    opinionId: string,
    previous: OpinionRow | null,
    next: Map<string, { score: number | null; word: string | null }>
  ): Promise<void> {
    const before = new Map(
      (previous?.scores ?? []).map(s => [s.criterionKey, s])
    )
    const removed = [...before.keys()].filter(key => !next.has(key))
    if (removed.length) {
      await tx.opinionScore.deleteMany({
        where: { opinionId, criterionKey: { in: removed } },
      })
    }
    for (const [key, value] of next) {
      const old = before.get(key)
      if (old && old.score === value.score && old.word === value.word) continue
      await tx.opinionScore.upsert({
        where: { opinionId_criterionKey: { opinionId, criterionKey: key } },
        create: {
          opinionId,
          criterionKey: key,
          score: value.score,
          word: value.word,
        },
        update: { score: value.score, word: value.word },
      })
    }
  }

  /** Une clé inconnue de l'espace, ou d'un critère masqué, est refusée. */
  private checkKeys(
    scores: OpinionScoresInput,
    ctx: OpinionWorkspaceContext
  ): void {
    for (const key of Object.keys(scores)) {
      const criterion = ctx.criteria.find(c => c.key === key)
      if (!criterion) {
        throw new BadRequestException(
          `Critère inconnu : « ${key} ». Critères de l'espace : ${ctx.criteria
            .filter(c => !c.hidden)
            .map(c => `${c.key} (${c.label})`)
            .join(', ')}.`
        )
      }
      if (criterion.hidden) {
        throw new BadRequestException(
          `Le critère « ${criterion.label} » est masqué dans cet espace : un propriétaire peut le réafficher dans « Critères des avis ».`
        )
      }
    }
  }

  private checkExpected(
    previous: OpinionRow | null,
    expected: string | null | undefined
  ): void {
    if (expected === undefined) return
    const current = previous?.updatedAt.toISOString() ?? null
    if (
      expected === current ||
      (expected !== null &&
        current !== null &&
        Date.parse(expected) === Date.parse(current))
    ) {
      return
    }
    throw new ConflictException(
      current === null
        ? "Ton avis n'existe pas encore : relis la fiche avant d'enregistrer."
        : `Ton avis a changé depuis ta lecture (mis à jour le ${current}) : relis la fiche avant d'enregistrer.`
    )
  }

  /** Les avis que ce membre peut voir sur l'annonce (le sien toujours). */
  async listForListing(member: Member, listingId: string): Promise<Opinion[]> {
    await this.ensureListing(member, listingId)
    const ctx = await this.context(member.workspaceId)
    const row = await this.prisma.listing.findUniqueOrThrow({
      where: { id: listingId },
      select: {
        opinions: { include: { scores: true }, orderBy: { createdAt: 'asc' } },
        opinionReveals: { select: { memberId: true } },
        visits: {
          select: {
            id: true,
            visitedAt: true,
            status: true,
            participantIds: true,
          },
        },
      },
    })
    return opinionViewOf(row, member, ctx).opinions
  }

  /**
   * « Voir quand même » : un membre qui n'a pas encore noté voit l'avis des
   * autres sur cette annonce ; c'est enregistré (et son avis portera la
   * mention « après avoir vu celui de … »).
   */
  async reveal(
    member: Member,
    listingId: string,
    channel: ActivityChannel = 'web'
  ): Promise<OpinionReveal> {
    await this.ensureListing(member, listingId)
    const ctx = await this.context(member.workspaceId)
    const opinions = await this.prisma.opinion.findMany({
      where: { listingId },
      include: { scores: true },
    })
    const mine = opinions.find(o => o.memberId === member.id)
    const viewerRated = mine
      ? opinionHasRating(asLike(mine), ctx.visibleKeys)
      : false
    if (
      canSeeOthersOpinions({
        blind: ctx.blind,
        viewerRated,
        revealed: false,
      })
    ) {
      throw new ConflictException(
        ctx.blind
          ? 'Tu as déjà noté cette annonce : les avis des autres sont visibles.'
          : "Les avis ne sont pas masqués dans cet espace (avis à l'aveugle désactivé)."
      )
    }
    const memberIds = opinions
      .filter(
        o =>
          o.memberId !== member.id &&
          ctx.members.some(m => m.id === o.memberId) &&
          opinionHasRating(asLike(o), ctx.visibleKeys)
      )
      .map(o => o.memberId)
    const reveal = await this.prisma.$transaction(async tx => {
      const existing = await tx.opinionReveal.findUnique({
        where: { listingId_memberId: { listingId, memberId: member.id } },
      })
      if (existing) return existing
      const created = await tx.opinionReveal.create({
        data: { listingId, memberId: member.id, memberIds },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel,
          action: 'opinion.revealed',
          after: { memberIds },
        },
        tx
      )
      return created
    })
    return {
      listingId,
      revealedAt: reveal.revealedAt.toISOString(),
      memberIds: reveal.memberIds,
    }
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
