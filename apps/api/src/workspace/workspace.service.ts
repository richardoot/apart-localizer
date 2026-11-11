import { Injectable } from '@nestjs/common'
import type {
  ActivityChannel,
  Invitation,
  InvitationState,
  Member as MemberDto,
  WorkspaceMe,
} from '@apart/contracts'
import { GettingStartedSchema } from '@apart/contracts'
import type { GettingStarted } from '@apart/contracts'
import {
  assumptionsSaved,
  claimableMember,
  gettingStarted,
  invitationState,
} from '@apart/domain'
import { PrismaService } from '../prisma/prisma.service'
import { ActivityService } from '../activity/activity.service'
import { Prisma } from '../generated/prisma'
import type { Member, Workspace } from '../generated/prisma'
import type { AuthIdentity } from '../auth/identity'
import { MEMBER_ORDER } from './member-order'

export { MEMBER_ORDER }

/** Les lignes qui comptent pour l'historique : membres actifs et anciens membres. */
export const ROSTER_STATUSES = ['active', 'removed'] as const

/**
 * L'espace de travail (foyer) et ses membres.
 *
 * Un membre peut exister avant sa première connexion : l'import crée Richard
 * et Chloé avec un e-mail et sans `authUserId`, une invitation (lot 8) crée
 * une ligne `invited`. À la première connexion d'une identité dont l'e-mail
 * est vérifié, le membre pré-créé de même e-mail, sinon l'invitation en
 * attente la plus récente, est rattaché (ADR 0004, 0018). Une identité sans
 * correspondance reçoit un espace à elle, pour que l'application reste
 * utilisable par quiconque se connecte, sans jamais voir l'espace d'un autre.
 */
@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService
  ) {}

  /**
   * Lot 23 (ADR 0033) : la mise en route de l'espace. Des faits seulement
   * (hypothèses enregistrées, critères actifs, annonces, annonces à valider,
   * une écriture du connecteur au journal) ; ce qui est fait se décide dans
   * `domain` (`gettingStarted`). Claude n'est vu que s'il a déjà écrit.
   */
  async gettingStarted(member: Member): Promise<GettingStarted> {
    const workspaceId = member.workspaceId
    const [versions, criteriaCount, listingCount, draftCount, mcp] =
      await Promise.all([
        this.prisma.assumptionsVersion.findMany({
          where: { workspaceId },
          select: { label: true },
          take: 2,
        }),
        this.prisma.searchCriteria.count({
          where: { workspaceId, active: true },
        }),
        this.prisma.listing.count({ where: { workspaceId } }),
        this.prisma.listingDraft.count({
          where: { workspaceId, status: 'pending' },
        }),
        this.prisma.activityLog.findFirst({
          where: { workspaceId, channel: 'mcp' },
          select: { id: true },
        }),
      ])
    return GettingStartedSchema.parse(
      gettingStarted({
        assumptionsSaved: assumptionsSaved(versions),
        criteriaCount,
        listingCount,
        draftCount,
        claudeSeen: mcp !== null,
      })
    )
  }

  async resolveMember(
    identity: AuthIdentity,
    channel: ActivityChannel = 'web',
    now = new Date()
  ): Promise<Member> {
    const existing = await this.prisma.member.findUnique({
      where: { authUserId: identity.id },
    })
    if (existing?.status === 'active') return existing
    if (existing) {
      // Invariant rompu (une ligne non active encore reliée) : on la détache.
      await this.prisma.member.updateMany({
        where: { id: existing.id, authUserId: identity.id },
        data: { authUserId: null },
      })
    }

    if (identity.email && identity.emailVerified) {
      const claimed = await this.claim(identity, identity.email, channel, now)
      if (claimed) return claimed
    }

    try {
      return await this.prisma.$transaction(async tx => {
        const workspace = await tx.workspace.create({
          data: { name: 'Mon espace' },
        })
        return tx.member.create({
          data: {
            workspaceId: workspace.id,
            handle: handleFrom(identity.email, identity.id),
            displayName: identity.displayName,
            email: identity.email,
            authUserId: identity.id,
            role: 'owner',
            joinedAt: now,
          },
        })
      })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      const winner = await this.prisma.member.findUnique({
        where: { authUserId: identity.id },
      })
      if (winner) return winner
      throw error
    }
  }

  /** Rattache le membre pré-créé ou l'invitation de cet e-mail, journal compris. */
  private async claim(
    identity: AuthIdentity,
    email: string,
    channel: ActivityChannel,
    now: Date
  ): Promise<Member | null> {
    const candidates = await this.prisma.member.findMany({
      where: {
        authUserId: null,
        email: { equals: email, mode: 'insensitive' },
        status: { in: ['active', 'invited'] },
      },
    })
    const target = claimableMember(candidates, email, now)
    if (!target) return null
    try {
      const joined = await this.prisma.$transaction(async tx => {
        const { count } = await tx.member.updateMany({
          where: { id: target.id, authUserId: null, status: target.status },
          data: { authUserId: identity.id, status: 'active', joinedAt: now },
        })
        if (count === 0) return null
        const row = await tx.member.findUniqueOrThrow({
          where: { id: target.id },
        })
        await this.activity.record(
          {
            workspaceId: row.workspaceId,
            actorMemberId: row.id,
            channel,
            action: 'member.joined',
            after: {
              via: target.status === 'invited' ? 'invitation' : 'precreated',
              displayName: row.displayName,
            },
          },
          tx
        )
        return row
      })
      if (joined) return joined
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
    }
    // A concurrent first request won the race: read what it wrote.
    return this.prisma.member.findUnique({ where: { authUserId: identity.id } })
  }

  async me(member: Member, now = new Date()): Promise<WorkspaceMe> {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: member.workspaceId },
      include: { members: { orderBy: MEMBER_ORDER } },
    })
    return {
      workspace: toWorkspaceDto(workspace, workspace.members, now),
      me: toMemberDto(member),
    }
  }

  /** Les membres actifs (assignation, participants, handles du MCP). */
  async members(workspaceId: string): Promise<Member[]> {
    return this.prisma.member.findMany({
      where: { workspaceId, status: 'active' },
      orderBy: MEMBER_ORDER,
    })
  }

  /** Membres actifs et anciens membres : les noms de l'historique. */
  async roster(workspaceId: string): Promise<Member[]> {
    return this.prisma.member.findMany({
      where: { workspaceId, status: { in: [...ROSTER_STATUSES] } },
      orderBy: MEMBER_ORDER,
    })
  }
}

export function toMemberDto(member: Member): MemberDto {
  return {
    id: member.id,
    workspaceId: member.workspaceId,
    handle: member.handle,
    displayName: member.displayName,
    email: member.email,
    authUserId: member.authUserId,
    role: member.role,
    status: member.status,
    createdAt: member.createdAt.toISOString(),
    joinedAt: member.joinedAt?.toISOString() ?? null,
    removedAt: member.removedAt?.toISOString() ?? null,
  }
}

/** Une ligne d'invitation (invitedAt renseigné) telle que l'espace la montre. */
export function toInvitationDto(
  row: Member,
  now: Date,
  names: ReadonlyMap<string, string>
): Invitation {
  const invitedAt = row.invitedAt ?? row.createdAt
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email ?? '',
    displayName: row.displayName,
    state: (invitationState(row, now) ?? 'pending') as InvitationState,
    invitedAt: invitedAt.toISOString(),
    expiresAt: (row.invitationExpiresAt ?? invitedAt).toISOString(),
    invitedBy: row.invitedById
      ? {
          id: row.invitedById,
          displayName: names.get(row.invitedById) ?? 'Un membre',
        }
      : null,
    closedAt: row.invitationClosedAt?.toISOString() ?? null,
  }
}

/**
 * L'espace tel que ses membres le voient : membres actifs puis anciens
 * membres (leur nom reste sur leur historique), et les invitations en
 * attente, expirées ou refusées (les annulées ne sont plus montrées).
 */
export function toWorkspaceDto(
  workspace: Workspace,
  members: Member[],
  now = new Date()
): WorkspaceMe['workspace'] {
  const names = new Map(members.map(m => [m.id, m.displayName]))
  const active = members.filter(m => m.status === 'active')
  const removed = members
    .filter(m => m.status === 'removed')
    .sort(
      (a, b) => (b.removedAt?.getTime() ?? 0) - (a.removedAt?.getTime() ?? 0)
    )
  const invitations = members
    .filter(
      m =>
        m.invitedAt !== null &&
        (m.status === 'invited' || m.status === 'declined')
    )
    .sort(
      (a, b) => (b.invitedAt?.getTime() ?? 0) - (a.invitedAt?.getTime() ?? 0)
    )
  return {
    id: workspace.id,
    name: workspace.name,
    createdAt: workspace.createdAt.toISOString(),
    members: [...active, ...removed].map(toMemberDto),
    invitations: invitations.map(row => toInvitationDto(row, now, names)),
    decideTogether: workspace.decideTogether,
  }
}

/** A handle from the e-mail's local part, else from the identity: lowercase, [a-z0-9_-]. */
export function handleFrom(email: string | null, authUserId: string): string {
  const base = (email?.split('@')[0] ?? authUserId.slice(0, 8))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return (base || 'membre').slice(0, 40)
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
}
