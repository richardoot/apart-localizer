import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  Invitation,
  InvitationInput,
  InvitationWriteResult,
  Member as MemberDto,
  MemberRole,
  ReceivedInvitation,
  WorkspaceMe,
  WorkspaceUpdate,
} from '@apart/contracts'
import {
  availableHandle,
  cancelRefusal,
  departureFor,
  invitationEmail,
  invitationExpiry,
  invitationRefusal,
  invitationTtlDays,
  isPendingInvitation,
  leaveRefusal,
  ownerRefusal,
  removalRefusal,
  reusableMemberRow,
  roleChangeRefusal,
  sameEmail,
} from '@apart/domain'
import type { MemberRefusal } from '@apart/domain'
import { PrismaService } from '../prisma/prisma.service'
import { ActivityService } from '../activity/activity.service'
import { withdrawDecisionsOf } from '../decisions/decision-context'
import {
  NotificationDispatcher,
  appLink,
} from '../notifications/notification-dispatcher.service'
import type { Member, Prisma } from '../generated/prisma'
import type { AuthIdentity } from '../auth/identity'
import {
  WorkspaceService,
  handleFrom,
  toInvitationDto,
  toMemberDto,
} from './workspace.service'

const CHANNEL = 'web' as const

/** Un refus des règles de `domain` en réponse HTTP. */
export function refusalException(refusal: MemberRefusal): HttpException {
  switch (refusal.code) {
    case 'forbidden':
      return new ForbiddenException(refusal.message)
    case 'not_found':
      return new NotFoundException(refusal.message)
    default:
      return new ConflictException(refusal.message)
  }
}

/**
 * Sérialise les écritures sur les membres d'un espace (invitations, retraits,
 * rôles, départs) le temps de la transaction : deux propriétaires qui se
 * retirent l'un l'autre au même instant ne laissent pas l'espace sans
 * propriétaire. Verrou consultatif, levé à la fin de la transaction.
 */
async function lockWorkspaces(
  tx: Prisma.TransactionClient,
  ...workspaceIds: string[]
): Promise<void> {
  for (const id of [...new Set(workspaceIds)].sort()) {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${id}, 0))`
  }
}

/**
 * Invitations, rôles, retraits et départs (lot 8, besoins K5 et K6). Les
 * règles sont dans `domain` (members.ts) ; ici, la transaction, le verrou,
 * le journal et l'envoi de l'e-mail d'invitation. Uniquement par le REST et
 * l'interface : aucun outil MCP n'écrit ici.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly workspace: WorkspaceService,
    private readonly dispatcher: NotificationDispatcher
  ) {}

  /** Durée de validité d'une invitation (`INVITATION_TTL_DAYS`, 14 jours par défaut). */
  get ttlDays(): number {
    return invitationTtlDays(process.env.INVITATION_TTL_DAYS)
  }

  async rename(
    actor: Member,
    update: WorkspaceUpdate,
    now = new Date()
  ): Promise<WorkspaceMe> {
    const refusal = ownerRefusal(actor, "renommer l'espace")
    if (refusal) throw refusalException(refusal)
    await this.prisma.$transaction(async tx => {
      const before = await tx.workspace.findUniqueOrThrow({
        where: { id: actor.workspaceId },
      })
      if (before.name === update.name) return
      await tx.workspace.update({
        where: { id: actor.workspaceId },
        data: { name: update.name },
      })
      await this.activity.record(
        {
          workspaceId: actor.workspaceId,
          actorMemberId: actor.id,
          channel: CHANNEL,
          action: 'workspace.renamed',
          before: { name: before.name },
          after: { name: update.name },
        },
        tx
      )
    })
    return this.workspace.me(actor, now)
  }

  async invite(
    actor: Member,
    input: InvitationInput,
    now = new Date()
  ): Promise<InvitationWriteResult> {
    const { row, renewed, workspaceName } = await this.prisma.$transaction(
      async tx => {
        await lockWorkspaces(tx, actor.workspaceId)
        const members = await tx.member.findMany({
          where: { workspaceId: actor.workspaceId },
        })
        const self = members.find(m => m.id === actor.id) ?? actor
        const refusal = invitationRefusal({
          actor: self,
          email: input.email,
          members,
          now,
        })
        if (refusal) throw refusalException(refusal)
        const expiresAt = invitationExpiry(now, this.ttlDays)
        const reusable = reusableMemberRow(members, input.email, now)
        const data = {
          displayName: input.displayName,
          email: input.email,
          role: 'member' as const,
          status: 'invited' as const,
          invitedAt: now,
          invitedById: actor.id,
          invitationExpiresAt: expiresAt,
          invitationClosedAt: null,
          joinedAt: null,
          removedAt: null,
          removedById: null,
        }
        const written = reusable
          ? await tx.member.update({ where: { id: reusable.id }, data })
          : await tx.member.create({
              data: {
                ...data,
                workspaceId: actor.workspaceId,
                handle: availableHandle(
                  handleFrom(input.email, 'membre'),
                  members.map(m => m.handle)
                ),
              },
            })
        await this.activity.record(
          {
            workspaceId: actor.workspaceId,
            actorMemberId: actor.id,
            channel: CHANNEL,
            action: 'member.invited',
            after: {
              memberId: written.id,
              email: input.email,
              displayName: input.displayName,
              expiresAt: expiresAt.toISOString(),
              renewed: reusable !== null,
            },
          },
          tx
        )
        const workspace = await tx.workspace.findUniqueOrThrow({
          where: { id: actor.workspaceId },
          select: { name: true },
        })
        return {
          row: written,
          renewed: reusable !== null,
          workspaceName: workspace.name,
        }
      }
    )
    const link = appLink('/login')
    const message = invitationEmail({
      workspaceName,
      inviterName: actor.displayName,
      inviteeName: row.displayName,
      email: input.email,
      expiresAt: row.invitationExpiresAt ?? now,
      link,
    })
    const email = await this.dispatcher.sendDirect({
      to: input.email,
      ...message,
    })
    return {
      invitation: toInvitationDto(
        row,
        now,
        new Map([[actor.id, actor.displayName]])
      ),
      renewed,
      delivery: { email, link },
    }
  }

  async cancel(
    actor: Member,
    invitationId: string,
    now = new Date()
  ): Promise<Invitation> {
    return this.prisma.$transaction(async tx => {
      await lockWorkspaces(tx, actor.workspaceId)
      const members = await tx.member.findMany({
        where: { workspaceId: actor.workspaceId },
      })
      const self = members.find(m => m.id === actor.id) ?? actor
      const target = members.find(m => m.id === invitationId) ?? null
      const refusal = cancelRefusal(self, target)
      if (refusal || !target) {
        throw refusalException(
          refusal ?? { code: 'not_found', message: 'Invitation introuvable' }
        )
      }
      const updated = await tx.member.update({
        where: { id: target.id },
        data: { status: 'canceled', invitationClosedAt: now },
      })
      await this.activity.record(
        {
          workspaceId: actor.workspaceId,
          actorMemberId: actor.id,
          channel: CHANNEL,
          action: 'member.invitation_canceled',
          before: {
            memberId: target.id,
            email: target.email,
            displayName: target.displayName,
          },
        },
        tx
      )
      return toInvitationDto(
        updated,
        now,
        new Map(members.map(m => [m.id, m.displayName]))
      )
    })
  }

  async changeRole(
    actor: Member,
    memberId: string,
    role: MemberRole
  ): Promise<MemberDto> {
    return this.prisma.$transaction(async tx => {
      await lockWorkspaces(tx, actor.workspaceId)
      const members = await tx.member.findMany({
        where: { workspaceId: actor.workspaceId },
      })
      const self = members.find(m => m.id === actor.id) ?? actor
      const target = members.find(m => m.id === memberId) ?? null
      const refusal = roleChangeRefusal(self, target, role, members)
      if (refusal || !target) {
        throw refusalException(
          refusal ?? { code: 'not_found', message: 'Membre introuvable' }
        )
      }
      if (target.role === role) return toMemberDto(target)
      const updated = await tx.member.update({
        where: { id: target.id },
        data: { role },
      })
      await this.activity.record(
        {
          workspaceId: actor.workspaceId,
          actorMemberId: actor.id,
          channel: CHANNEL,
          action: 'member.role_changed',
          before: {
            memberId: target.id,
            displayName: target.displayName,
            role: target.role,
          },
          after: { role },
        },
        tx
      )
      return toMemberDto(updated)
    })
  }

  /**
   * Retire un membre : sa ligne reste (avis, tâches, visites et journal
   * gardent son nom), son identité est détachée, ses appareils push oubliés.
   * Dès la requête suivante, son jeton (web ou MCP) ne mène plus à l'espace.
   */
  async remove(
    actor: Member,
    memberId: string,
    now = new Date()
  ): Promise<MemberDto> {
    if (memberId === actor.id) {
      await this.leave(actor, now)
      const row = await this.prisma.member.findUniqueOrThrow({
        where: { id: actor.id },
      })
      return toMemberDto(row)
    }
    return this.prisma.$transaction(async tx => {
      await lockWorkspaces(tx, actor.workspaceId)
      const members = await tx.member.findMany({
        where: { workspaceId: actor.workspaceId },
      })
      const self = members.find(m => m.id === actor.id) ?? actor
      const target = members.find(m => m.id === memberId) ?? null
      const refusal = removalRefusal(self, target, members)
      if (refusal || !target) {
        throw refusalException(
          refusal ?? { code: 'not_found', message: 'Membre introuvable' }
        )
      }
      const updated = await this.detach(tx, target, actor.id, now)
      await this.activity.record(
        {
          workspaceId: actor.workspaceId,
          actorMemberId: actor.id,
          channel: CHANNEL,
          action: 'member.removed',
          before: {
            memberId: target.id,
            displayName: target.displayName,
            email: target.email,
            role: target.role,
          },
        },
        tx
      )
      return toMemberDto(updated)
    })
  }

  /** Quitter l'espace soi-même ; à la requête suivante, une invitation en attente ou un espace à soi. */
  async leave(member: Member, now = new Date()): Promise<void> {
    await this.prisma.$transaction(async tx => {
      await lockWorkspaces(tx, member.workspaceId)
      const members = await tx.member.findMany({
        where: { workspaceId: member.workspaceId },
      })
      const self = members.find(m => m.id === member.id) ?? member
      const refusal = leaveRefusal(self, members)
      if (refusal) throw refusalException(refusal)
      await this.detach(tx, self, self.id, now)
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          actorMemberId: member.id,
          channel: CHANNEL,
          action: 'member.left',
          after: { reason: 'left' },
        },
        tx
      )
    })
  }

  /** Les invitations en attente vers d'autres espaces, pour l'adresse vérifiée de la personne. */
  async received(
    member: Member,
    identity: AuthIdentity,
    now = new Date()
  ): Promise<ReceivedInvitation[]> {
    if (!identity.email || !identity.emailVerified) return []
    const rows = await this.prisma.member.findMany({
      where: {
        status: 'invited',
        authUserId: null,
        email: { equals: identity.email, mode: 'insensitive' },
        invitationExpiresAt: { gt: now },
        workspaceId: { not: member.workspaceId },
      },
      include: {
        workspace: { select: { id: true, name: true } },
        invitedBy: { select: { displayName: true } },
      },
      orderBy: { invitedAt: 'desc' },
    })
    return rows.map(row => ({
      id: row.id,
      workspace: { id: row.workspace.id, name: row.workspace.name },
      displayName: row.displayName,
      invitedByName: row.invitedBy?.displayName ?? null,
      invitedAt: (row.invitedAt ?? row.createdAt).toISOString(),
      expiresAt: (row.invitationExpiresAt ?? now).toISOString(),
    }))
  }

  /**
   * Rejoindre l'espace qui invite (personne déjà inscrite, bandeau) :
   * l'identité quitte son membre actuel (ligne gardée, « parti ») et se
   * rattache à l'invitation. L'espace quitté reste intact ; s'il n'a plus
   * aucun membre actif, ses invitations en attente sont annulées (ADR 0018).
   */
  async accept(
    member: Member,
    identity: AuthIdentity,
    invitationId: string,
    now = new Date()
  ): Promise<WorkspaceMe> {
    const email = this.verifiedEmail(identity)
    const joined = await this.prisma.$transaction(async tx => {
      const invitation = await this.findReceived(tx, invitationId, email, now)
      if (invitation.workspaceId === member.workspaceId) {
        throw new ConflictException('Vous êtes déjà membre de cet espace.')
      }
      await lockWorkspaces(tx, member.workspaceId, invitation.workspaceId)
      const current = await tx.member.findUniqueOrThrow({
        where: { id: member.id },
      })
      if (current.authUserId !== identity.id || current.status !== 'active') {
        throw new ConflictException(
          'Votre espace vient de changer : rechargez la page.'
        )
      }
      const [oldMembers, oldWorkspace] = await Promise.all([
        tx.member.findMany({ where: { workspaceId: current.workspaceId } }),
        tx.workspace.findUniqueOrThrow({
          where: { id: current.workspaceId },
        }),
      ])
      const departure = departureFor(current, oldMembers, oldWorkspace.name)
      if (departure.refusal) throw refusalException(departure.refusal)

      await this.detach(tx, current, current.id, now, { keepDevices: true })
      const canceled = departure.orphaned
        ? (
            await tx.member.updateMany({
              where: { workspaceId: current.workspaceId, status: 'invited' },
              data: { status: 'canceled', invitationClosedAt: now },
            })
          ).count
        : 0
      await this.activity.record(
        {
          workspaceId: current.workspaceId,
          actorMemberId: current.id,
          channel: CHANNEL,
          action: 'member.left',
          after: {
            reason: 'joined_another_workspace',
            canceledInvitations: canceled,
          },
        },
        tx
      )

      const { count } = await tx.member.updateMany({
        where: { id: invitation.id, status: 'invited', authUserId: null },
        data: { authUserId: identity.id, status: 'active', joinedAt: now },
      })
      if (count === 0) {
        throw new ConflictException(
          'Cette invitation vient de changer : rechargez la page.'
        )
      }
      // Les appareils abonnés au push suivent la personne.
      await tx.pushSubscription.updateMany({
        where: { memberId: current.id },
        data: { memberId: invitation.id },
      })
      await this.activity.record(
        {
          workspaceId: invitation.workspaceId,
          actorMemberId: invitation.id,
          channel: CHANNEL,
          action: 'member.joined',
          after: { via: 'invitation', displayName: invitation.displayName },
        },
        tx
      )
      return tx.member.findUniqueOrThrow({ where: { id: invitation.id } })
    })
    return this.workspace.me(joined, now)
  }

  /** Refuser une invitation reçue : elle passe « refusée », le propriétaire le voit. */
  async decline(
    identity: AuthIdentity,
    invitationId: string,
    now = new Date()
  ): Promise<void> {
    const email = this.verifiedEmail(identity)
    await this.prisma.$transaction(async tx => {
      const invitation = await this.findReceived(tx, invitationId, email, now)
      const { count } = await tx.member.updateMany({
        where: { id: invitation.id, status: 'invited', authUserId: null },
        data: { status: 'declined', invitationClosedAt: now },
      })
      if (count === 0) {
        throw new NotFoundException(
          'Invitation introuvable, expirée ou annulée'
        )
      }
      await this.activity.record(
        {
          workspaceId: invitation.workspaceId,
          actorMemberId: invitation.id,
          channel: CHANNEL,
          action: 'member.invitation_declined',
          before: {
            memberId: invitation.id,
            email: invitation.email,
            displayName: invitation.displayName,
          },
        },
        tx
      )
    })
  }

  private verifiedEmail(identity: AuthIdentity): string {
    if (!identity.email || !identity.emailVerified) {
      throw new ForbiddenException(
        "Votre adresse e-mail n'est pas vérifiée par votre fournisseur de connexion : impossible de répondre à une invitation."
      )
    }
    return identity.email
  }

  /** Une invitation en attente adressée à cet e-mail, sinon 404 (sans dire pourquoi). */
  private async findReceived(
    tx: Prisma.TransactionClient,
    invitationId: string,
    email: string,
    now: Date
  ): Promise<Member> {
    const invitation = await tx.member.findUnique({
      where: { id: invitationId },
    })
    if (
      !invitation ||
      invitation.authUserId !== null ||
      !sameEmail(invitation.email, email) ||
      !isPendingInvitation(invitation, now)
    ) {
      throw new NotFoundException('Invitation introuvable, expirée ou annulée')
    }
    return invitation
  }

  /** Détache l'identité d'une ligne de membre et la marque retirée (ou partie). */
  private async detach(
    tx: Prisma.TransactionClient,
    target: Member,
    byId: string,
    now: Date,
    options: { keepDevices?: boolean } = {}
  ): Promise<Member> {
    const updated = await tx.member.update({
      where: { id: target.id },
      data: {
        status: 'removed',
        authUserId: null,
        removedAt: now,
        removedById: byId,
      },
    })
    if (!options.keepDevices) {
      await tx.pushSubscription.deleteMany({ where: { memberId: target.id } })
    }
    // Lot 21 : on ne l'attend plus ; ses propres propositions sont retirées.
    await withdrawDecisionsOf(tx, this.activity, {
      workspaceId: target.workspaceId,
      memberId: target.id,
      actorMemberId: byId,
      channel: CHANNEL,
    })
    await tx.notification.updateMany({
      where: { recipientId: target.id, pushStatus: 'pending' },
      data: { pushStatus: 'skipped' },
    })
    await tx.notification.updateMany({
      where: { recipientId: target.id, emailStatus: 'pending' },
      data: { emailStatus: 'skipped' },
    })
    return updated
  }
}
