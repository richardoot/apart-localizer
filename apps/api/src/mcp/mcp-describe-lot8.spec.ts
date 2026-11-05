import { describe, expect, it } from 'vitest'
import type { Member, WorkspaceMe } from '@apart/contracts'
import { MCP_TOOL_NAMES, describeMembers, membersPayload } from './mcp-tools'

const AT = '2026-11-04T10:00:00.000Z'
const WS = '22222222-2222-4222-8222-222222222222'

function member(over: Partial<Member>): Member {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    workspaceId: WS,
    handle: 'richard',
    displayName: 'Richard',
    email: 'richard@exemple.invalid',
    authUserId: 'sb',
    role: 'owner',
    status: 'active',
    createdAt: AT,
    joinedAt: AT,
    removedAt: null,
    ...over,
  }
}

const richard = member({})
const me: WorkspaceMe = {
  me: richard,
  workspace: {
    id: WS,
    name: 'Appartement',
    createdAt: AT,
    members: [
      richard,
      member({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        handle: 'chloe',
        displayName: 'Chloé',
        role: 'member',
        authUserId: null,
      }),
      member({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        handle: 'paul',
        displayName: 'Paul',
        role: 'member',
        status: 'removed',
        authUserId: null,
        removedAt: AT,
      }),
    ],
    invitations: [
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        workspaceId: WS,
        email: 'lea@exemple.invalid',
        displayName: 'Léa',
        state: 'pending',
        invitedAt: AT,
        expiresAt: AT,
        invitedBy: null,
        closedAt: null,
      },
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        workspaceId: WS,
        email: 'sam@exemple.invalid',
        displayName: 'Sam',
        state: 'expired',
        invitedAt: AT,
        expiresAt: AT,
        invitedBy: null,
        closedAt: null,
      },
    ],
  },
}

describe('MCP lot 8', () => {
  it('déclare list_members à la suite des outils du lot 6 (trente et un outils avec le lot 15)', () => {
    expect(MCP_TOOL_NAMES).toHaveLength(31)
    expect(MCP_TOOL_NAMES[28]).toBe('list_members')
  })

  it('décrit les membres sans leurs e-mails', () => {
    const text = describeMembers(me)
    expect(text).toBe(
      [
        'Espace « Appartement » : 2 membre(s).',
        '- Richard (« richard », propriétaire) — vous',
        '- Chloé (« chloe », membre, pas encore connecté)',
        'Anciens membres (historique conservé) : Paul.',
        "Invitations en attente : 1 (gérées dans l'application, page Espace).",
      ].join('\n')
    )
    expect(JSON.stringify(membersPayload(me))).not.toContain('@')
    expect(membersPayload(me).members.map(m => m.connected)).toEqual([
      true,
      false,
    ])
    const alone = describeMembers({
      ...me,
      workspace: { ...me.workspace, members: [richard], invitations: [] },
    })
    expect(alone).toBe(
      'Espace « Appartement » : 1 membre(s).\n- Richard (« richard », propriétaire) — vous'
    )
  })
})
