import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_KIND_LABELS,
  DEFAULT_INVITATION_TTL_DAYS,
  INVITATION_STATE_LABELS,
  InvitationInputSchema,
  InvitationSchema,
  InvitationStateSchema,
  InvitationWriteResultSchema,
  MAX_INVITATION_TTL_DAYS,
  MAX_PENDING_INVITATIONS,
  MEMBER_ROLE_LABELS,
  MEMBER_STATUS_LABELS,
  McpListMembersInputSchema,
  MemberRoleUpdateSchema,
  MemberSchema,
  MemberStatusSchema,
  NOTIFICATION_TYPE_LABELS,
  ReceivedInvitationSchema,
  WorkspaceMeSchema,
  WorkspaceUpdateSchema,
  activityKindOf,
  resolveNotificationPreferences,
} from '../src/index.js'

const ID = '11111111-1111-4111-8111-111111111111'
const WS = '22222222-2222-4222-8222-222222222222'
const AT = '2026-11-04T10:00:00.000Z'

describe('invitations (lot 8)', () => {
  it("normalise l'adresse et le nom, refuse une adresse invalide", () => {
    expect(
      InvitationInputSchema.parse({
        email: '  Lea@Exemple.FR ',
        displayName: '  Léa ',
      })
    ).toEqual({ email: 'lea@exemple.fr', displayName: 'Léa' })
    const bad = InvitationInputSchema.safeParse({
      email: 'pas-une-adresse',
      displayName: 'Léa',
    })
    expect(bad.success).toBe(false)
    expect(bad.error?.issues[0]?.message).toBe('Adresse e-mail invalide')
    expect(
      InvitationInputSchema.safeParse({ email: 'a@b.fr', displayName: '  ' })
        .success
    ).toBe(false)
    expect(
      InvitationInputSchema.safeParse({
        email: `${'a'.repeat(250)}@b.fr`,
        displayName: 'X',
      }).success
    ).toBe(false)
  })

  it('décrit une invitation, sa réponse et une invitation reçue', () => {
    const invitation = InvitationSchema.parse({
      id: ID,
      workspaceId: WS,
      email: 'lea@exemple.fr',
      displayName: 'Léa',
      state: 'pending',
      invitedAt: AT,
      expiresAt: AT,
      invitedBy: { id: ID, displayName: 'Richard' },
      closedAt: null,
    })
    expect(
      InvitationWriteResultSchema.parse({
        invitation,
        renewed: false,
        delivery: { email: 'disabled', link: 'http://localhost:5173/login' },
      }).delivery.email
    ).toBe('disabled')
    expect(
      ReceivedInvitationSchema.parse({
        id: ID,
        workspace: { id: WS, name: 'Appartement' },
        displayName: 'Léa',
        invitedByName: null,
        invitedAt: AT,
        expiresAt: AT,
      }).workspace.name
    ).toBe('Appartement')
  })

  it('a des libellés pour chaque état, rôle et statut', () => {
    for (const state of InvitationStateSchema.options) {
      expect(INVITATION_STATE_LABELS[state]).toBeTruthy()
    }
    for (const status of MemberStatusSchema.options) {
      expect(MEMBER_STATUS_LABELS[status]).toBeTruthy()
    }
    expect(MEMBER_ROLE_LABELS.owner).toBe('Propriétaire')
    expect(DEFAULT_INVITATION_TTL_DAYS).toBe(14)
    expect(MAX_INVITATION_TTL_DAYS).toBe(90)
    expect(MAX_PENDING_INVITATIONS).toBe(10)
  })

  it('valide les changements de rôle et de nom', () => {
    expect(MemberRoleUpdateSchema.parse({ role: 'owner' }).role).toBe('owner')
    expect(MemberRoleUpdateSchema.safeParse({ role: 'admin' }).success).toBe(
      false
    )
    expect(WorkspaceUpdateSchema.parse({ name: ' Appartement ' }).name).toBe(
      'Appartement'
    )
    expect(WorkspaceUpdateSchema.safeParse({ name: '' }).success).toBe(false)
    expect(
      WorkspaceUpdateSchema.safeParse({ name: 'Appart\r\nBcc: x@y.fr' }).success
    ).toBe(false)
    expect(
      InvitationInputSchema.safeParse({
        email: 'a@b.fr',
        displayName: 'Léa\nX',
      }).error?.issues[0]?.message
    ).toBe('Le nom tient sur une ligne')
    expect(McpListMembersInputSchema.parse({})).toEqual({})
  })

  it("porte l'état des membres et les invitations dans l'espace", () => {
    const me = MemberSchema.parse({
      id: ID,
      workspaceId: WS,
      handle: 'richard',
      displayName: 'Richard',
      email: 'richard@exemple.fr',
      authUserId: 'sb',
      role: 'owner',
      status: 'active',
      createdAt: AT,
      joinedAt: null,
      removedAt: null,
    })
    const parsed = WorkspaceMeSchema.parse({
      workspace: {
        id: WS,
        name: 'Appartement',
        createdAt: AT,
        members: [me],
        invitations: [],
      },
      me,
    })
    expect(parsed.workspace.members[0]?.status).toBe('active')
  })

  it('range les écritures des membres dans le journal et les notifications', () => {
    expect(activityKindOf('member.invited')).toBe('member')
    expect(activityKindOf('workspace.renamed')).toBe('member')
    expect(ACTIVITY_KIND_LABELS.member).toBe('Membres')
    expect(NOTIFICATION_TYPE_LABELS.member_joined).toBeTruthy()
    expect(resolveNotificationPreferences({}).member_joined).toEqual({
      in_app: true,
      push: true,
      email: false,
    })
  })
})
