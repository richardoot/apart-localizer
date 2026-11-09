import { describe, expect, it } from 'vitest'
import {
  handleFrom,
  toInvitationDto,
  toMemberDto,
  toWorkspaceDto,
} from './workspace.service'
import { displayNameOf } from '../auth/guards/supabase.guard'
import type { User } from '@supabase/supabase-js'
import type { Member, Workspace } from '../generated/prisma'

describe('handleFrom', () => {
  it('derives a short stable handle from the e-mail', () => {
    expect(handleFrom('Richard.Boilley+x@example.com', 'uuid')).toBe(
      'richard-boilley-x'
    )
    expect(handleFrom('Chloé@example.com', 'uuid')).toBe('chloe')
    expect(handleFrom(null, '0123456789abcdef')).toBe('01234567')
    expect(handleFrom('@example.com', 'abcdefgh')).toBe('membre')
  })
})

describe('displayNameOf', () => {
  const user = (over: Partial<User>): User =>
    ({ id: 'x', email: 'jean@example.com', user_metadata: {}, ...over }) as User

  it('prefers the name Google gives, then the e-mail local part', () => {
    expect(
      displayNameOf(user({ user_metadata: { full_name: 'Jean Dupont' } }))
    ).toBe('Jean Dupont')
    expect(displayNameOf(user({ user_metadata: { name: ' Jean ' } }))).toBe(
      'Jean'
    )
    expect(displayNameOf(user({}))).toBe('jean')
    expect(displayNameOf(user({ email: undefined }))).toBe('Membre')
  })
})

const NOW = new Date('2026-11-04T10:00:00.000Z')
const WS = '22222222-2222-4222-8222-222222222222'

function row(over: Partial<Member>): Member {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    workspaceId: WS,
    handle: 'richard',
    displayName: 'Richard',
    email: 'richard@exemple.invalid',
    authUserId: 'sb-richard',
    role: 'owner',
    status: 'active',
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    lastVisitAt: null,
    whatsNewSince: null,
    whatsNewSource: null,
    notificationPreferences: {},
    invitedAt: null,
    invitedById: null,
    invitationExpiresAt: null,
    invitationClosedAt: null,
    joinedAt: null,
    removedAt: null,
    removedById: null,
    ...over,
  }
}

describe('toWorkspaceDto', () => {
  it('membres actifs, puis anciens membres, puis invitations visibles', () => {
    const richard = row({})
    const former = row({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      handle: 'chloe',
      displayName: 'Chloé',
      role: 'member',
      status: 'removed',
      authUserId: null,
      removedAt: new Date('2026-11-03T00:00:00.000Z'),
    })
    const olderFormer = row({
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      handle: 'paul',
      status: 'removed',
      authUserId: null,
      removedAt: new Date('2026-11-02T00:00:00.000Z'),
    })
    const pending = row({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      handle: 'lea',
      displayName: 'Léa',
      email: 'lea@exemple.invalid',
      role: 'member',
      status: 'invited',
      authUserId: null,
      invitedAt: new Date('2026-11-04T09:00:00.000Z'),
      invitedById: richard.id,
      invitationExpiresAt: new Date('2026-11-18T09:00:00.000Z'),
    })
    const declined = row({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      handle: 'sam',
      status: 'declined',
      authUserId: null,
      invitedAt: new Date('2026-11-03T09:00:00.000Z'),
      invitedById: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      invitationExpiresAt: new Date('2026-11-17T09:00:00.000Z'),
      invitationClosedAt: new Date('2026-11-03T10:00:00.000Z'),
    })
    const canceled = row({
      id: '99999999-9999-4999-8999-999999999999',
      handle: 'max',
      status: 'canceled',
      authUserId: null,
      invitedAt: new Date('2026-11-02T09:00:00.000Z'),
    })
    const workspace: Workspace = {
      id: WS,
      name: 'Appartement',
      agencySignature: null,
      opinionsBlind: true,
      createdAt: NOW,
      updatedAt: NOW,
    }
    const dto = toWorkspaceDto(
      workspace,
      [olderFormer, declined, richard, pending, canceled, former],
      NOW
    )
    expect(dto.members.map(m => m.handle)).toEqual(['richard', 'chloe', 'paul'])
    expect(dto.members[1]).toMatchObject({
      status: 'removed',
      removedAt: '2026-11-03T00:00:00.000Z',
    })
    expect(dto.invitations.map(i => [i.displayName, i.state])).toEqual([
      ['Léa', 'pending'],
      ['Richard', 'declined'],
    ])
    expect(dto.invitations[0]?.invitedBy).toEqual({
      id: richard.id,
      displayName: 'Richard',
    })
    expect(dto.invitations[1]?.invitedBy?.displayName).toBe('Un membre')
    expect(dto.invitations[1]?.closedAt).toBe('2026-11-03T10:00:00.000Z')
  })

  it("rend une ligne sans dates d'invitation sans échouer", () => {
    const invitation = toInvitationDto(
      row({ status: 'invited', email: null }),
      NOW,
      new Map()
    )
    expect(invitation).toMatchObject({
      email: '',
      state: 'pending',
      invitedAt: '2026-11-01T00:00:00.000Z',
      expiresAt: '2026-11-01T00:00:00.000Z',
      invitedBy: null,
      closedAt: null,
    })
    expect(toMemberDto(row({ joinedAt: NOW })).joinedAt).toBe(NOW.toISOString())
  })
})
