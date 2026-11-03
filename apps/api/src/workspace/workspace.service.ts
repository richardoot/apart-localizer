import { Injectable } from '@nestjs/common'
import type { Member as MemberDto, WorkspaceMe } from '@apart/contracts'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'
import type { Member, Workspace } from '../generated/prisma'

/**
 * L'espace de travail (foyer) et ses membres.
 *
 * Un membre peut exister avant sa première connexion : l'import crée Richard
 * et Chloé avec un e-mail et sans `authUserId`. À la première connexion, le
 * membre dont l'e-mail correspond est rattaché à l'identité Supabase. Une
 * identité inconnue reçoit un espace à elle, pour que l'application reste
 * utilisable par quiconque se connecte, sans jamais voir l'espace d'un autre.
 */
@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveMember(
    authUserId: string,
    email: string | null,
    displayName: string
  ): Promise<Member> {
    const existing = await this.prisma.member.findUnique({
      where: { authUserId },
    })
    if (existing) return existing

    if (email) {
      const claimable = await this.prisma.member.findFirst({
        where: {
          authUserId: null,
          email: { equals: email, mode: 'insensitive' },
        },
        orderBy: { createdAt: 'asc' },
      })
      if (claimable) {
        try {
          return await this.prisma.member.update({
            where: { id: claimable.id },
            data: { authUserId },
          })
        } catch (error) {
          if (!isUniqueViolation(error)) throw error
          // A concurrent first request won the race: read what it wrote.
          const winner = await this.prisma.member.findUnique({
            where: { authUserId },
          })
          if (winner) return winner
          throw error
        }
      }
    }

    try {
      return await this.prisma.$transaction(async tx => {
        const workspace = await tx.workspace.create({
          data: { name: 'Mon espace' },
        })
        return tx.member.create({
          data: {
            workspaceId: workspace.id,
            handle: handleFrom(email, authUserId),
            displayName,
            email,
            authUserId,
            role: 'owner',
          },
        })
      })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      const winner = await this.prisma.member.findUnique({
        where: { authUserId },
      })
      if (winner) return winner
      throw error
    }
  }

  async me(member: Member): Promise<WorkspaceMe> {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: member.workspaceId },
      include: { members: { orderBy: { createdAt: 'asc' } } },
    })
    return {
      workspace: toWorkspaceDto(workspace, workspace.members),
      me: toMemberDto(member),
    }
  }

  async members(workspaceId: string): Promise<Member[]> {
    return this.prisma.member.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
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
    createdAt: member.createdAt.toISOString(),
  }
}

export function toWorkspaceDto(
  workspace: Workspace,
  members: Member[]
): WorkspaceMe['workspace'] {
  return {
    id: workspace.id,
    name: workspace.name,
    createdAt: workspace.createdAt.toISOString(),
    members: members.map(toMemberDto),
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

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
}
