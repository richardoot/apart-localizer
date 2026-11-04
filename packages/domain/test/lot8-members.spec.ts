import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INVITATION_TTL_DAYS,
  MAX_PENDING_INVITATIONS,
} from '@apart/contracts'
import {
  activeOwners,
  availableHandle,
  cancelRefusal,
  claimableMember,
  departureFor,
  describeActivity,
  invitationEmail,
  invitationExpiry,
  invitationRefusal,
  invitationState,
  invitationTtlDays,
  isActiveMember,
  isPendingInvitation,
  leaveRefusal,
  normalizeEmail,
  notificationTypeOf,
  notificationsForActivity,
  ownerRefusal,
  removalRefusal,
  reusableMemberRow,
  roleChangeRefusal,
  sameEmail,
} from '../src/index.js'
import type { MemberLike } from '../src/index.js'

const NOW = new Date('2026-11-04T10:00:00.000Z')
const LATER = '2026-11-18T10:00:00.000Z'
const EARLIER = '2026-11-01T10:00:00.000Z'

let seq = 0
function member(over: Partial<MemberLike> = {}): MemberLike {
  seq += 1
  return {
    id: `m${seq}`,
    role: 'member',
    status: 'active',
    email: `m${seq}@exemple.invalid`,
    authUserId: `auth-${seq}`,
    invitedAt: null,
    invitationExpiresAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...over,
  }
}
const owner = (over: Partial<MemberLike> = {}) =>
  member({ role: 'owner', ...over })
const invited = (over: Partial<MemberLike> = {}) =>
  member({
    status: 'invited',
    authUserId: null,
    invitedAt: '2026-11-04T09:00:00.000Z',
    invitationExpiresAt: LATER,
    ...over,
  })

describe('adresses e-mail', () => {
  it('normalise et compare sans la casse', () => {
    expect(normalizeEmail('  Lea@Exemple.FR ')).toBe('lea@exemple.fr')
    expect(normalizeEmail('   ')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
    expect(sameEmail('LEA@exemple.fr', 'lea@exemple.fr ')).toBe(true)
    expect(sameEmail(null, null)).toBe(false)
    expect(sameEmail('a@b.fr', 'c@b.fr')).toBe(false)
  })
})

describe('durée et échéance', () => {
  it('lit INVITATION_TTL_DAYS entre 1 et 90 jours, sinon 14', () => {
    expect(invitationTtlDays(undefined)).toBe(DEFAULT_INVITATION_TTL_DAYS)
    expect(invitationTtlDays(null)).toBe(14)
    expect(invitationTtlDays('')).toBe(14)
    expect(invitationTtlDays(' 7 ')).toBe(7)
    expect(invitationTtlDays(30)).toBe(30)
    expect(invitationTtlDays('0')).toBe(14)
    expect(invitationTtlDays('91')).toBe(14)
    expect(invitationTtlDays('2.5')).toBe(14)
    expect(invitationTtlDays('abc')).toBe(14)
    expect(invitationExpiry(NOW, 14).toISOString()).toBe(LATER)
  })
})

describe('état des invitations', () => {
  it('distingue en attente, expirée, annulée, refusée, acceptée et non-invitation', () => {
    expect(invitationState(invited(), NOW)).toBe('pending')
    expect(
      invitationState(invited({ invitationExpiresAt: EARLIER }), NOW)
    ).toBe('expired')
    expect(
      invitationState(invited({ invitationExpiresAt: NOW.toISOString() }), NOW)
    ).toBe('expired')
    expect(invitationState(invited({ invitationExpiresAt: null }), NOW)).toBe(
      'expired'
    )
    expect(invitationState(invited({ status: 'canceled' }), NOW)).toBe(
      'canceled'
    )
    expect(invitationState(invited({ status: 'declined' }), NOW)).toBe(
      'declined'
    )
    expect(invitationState(invited({ status: 'active' }), NOW)).toBe('accepted')
    expect(invitationState(member(), NOW)).toBeNull()
    expect(isPendingInvitation(invited(), NOW)).toBe(true)
    expect(isPendingInvitation(member(), NOW)).toBe(false)
    expect(isActiveMember(member())).toBe(true)
    expect(isActiveMember(member({ status: 'removed' }))).toBe(false)
  })

  it('compte les propriétaires actifs seulement', () => {
    expect(
      activeOwners([
        owner(),
        owner({ status: 'removed' }),
        member(),
        owner({ status: 'invited' }),
      ])
    ).toHaveLength(1)
  })
})

describe('rattachement à la première connexion', () => {
  it('préfère le membre pré-créé (import), le plus ancien', () => {
    const old = member({
      authUserId: null,
      email: 'Lea@exemple.fr',
      createdAt: '2026-10-01T00:00:00.000Z',
    })
    const young = member({ authUserId: null, email: 'lea@exemple.fr' })
    const invitation = invited({ email: 'lea@exemple.fr' })
    expect(
      claimableMember([young, invitation, old], 'lea@exemple.fr', NOW)
    ).toBe(old)
  })

  it("sinon l'invitation en attente la plus récente ; jamais expirée, annulée, retirée ni reliée", () => {
    const older = invited({
      email: 'lea@exemple.fr',
      invitedAt: '2026-11-02T00:00:00.000Z',
    })
    const newer = invited({ email: 'lea@exemple.fr' })
    expect(claimableMember([older, newer], 'LEA@exemple.fr', NOW)).toBe(newer)
    expect(
      claimableMember(
        [
          invited({ email: 'lea@exemple.fr', invitationExpiresAt: EARLIER }),
          invited({ email: 'lea@exemple.fr', status: 'canceled' }),
          invited({ email: 'lea@exemple.fr', status: 'declined' }),
          member({
            email: 'lea@exemple.fr',
            status: 'removed',
            authUserId: null,
          }),
          member({ email: 'lea@exemple.fr' }),
          invited({ email: 'autre@exemple.fr' }),
        ],
        'lea@exemple.fr',
        NOW
      )
    ).toBeNull()
  })
})

describe('inviter', () => {
  const me = owner({ email: 'richard@exemple.fr' })

  it('réservé aux propriétaires actifs', () => {
    expect(
      invitationRefusal({
        actor: member(),
        email: 'lea@exemple.fr',
        members: [],
        now: NOW,
      })
    ).toMatchObject({ code: 'forbidden' })
    expect(
      invitationRefusal({
        actor: owner({ status: 'removed' }),
        email: 'lea@exemple.fr',
        members: [],
        now: NOW,
      })?.code
    ).toBe('forbidden')
  })

  it('refuse un membre actif, une invitation en attente, et au-delà de la limite', () => {
    const chloe = member({ email: 'chloe@exemple.fr', authUserId: null })
    expect(
      invitationRefusal({
        actor: me,
        email: 'CHLOE@exemple.fr',
        members: [me, chloe],
        now: NOW,
      })
    ).toEqual({
      code: 'conflict',
      message: "Cette adresse est déjà celle d'un membre de l'espace.",
    })
    expect(
      invitationRefusal({
        actor: me,
        email: 'lea@exemple.fr',
        members: [me, invited({ email: 'lea@exemple.fr' })],
        now: NOW,
      })?.message
    ).toBe('Une invitation est déjà en attente pour cette adresse.')
    const full = Array.from({ length: MAX_PENDING_INVITATIONS }, () =>
      invited()
    )
    expect(
      invitationRefusal({
        actor: me,
        email: 'lea@exemple.fr',
        members: [me, ...full],
        now: NOW,
      })?.message
    ).toContain('Déjà 10 invitations en attente')
    expect(
      invitationRefusal({
        actor: me,
        email: 'lea@exemple.fr',
        members: [me, invited()],
        now: NOW,
        maxPending: 1,
      })?.code
    ).toBe('conflict')
  })

  it('accepte une adresse dont l’invitation a expiré, été annulée ou qui a été retirée', () => {
    expect(
      invitationRefusal({
        actor: me,
        email: 'lea@exemple.fr',
        members: [
          me,
          invited({ email: 'lea@exemple.fr', invitationExpiresAt: EARLIER }),
          member({
            email: 'lea@exemple.fr',
            status: 'removed',
            authUserId: null,
          }),
        ],
        now: NOW,
      })
    ).toBeNull()
  })

  it('réutilise la ligne la plus récente de la même adresse, jamais une active ou en attente', () => {
    const removed = member({
      email: 'lea@exemple.fr',
      status: 'removed',
      authUserId: null,
      createdAt: '2026-09-01T00:00:00.000Z',
    })
    const canceled = invited({
      email: 'lea@exemple.fr',
      status: 'canceled',
      createdAt: '2026-10-01T00:00:00.000Z',
    })
    // L'ancien membre passe avant une invitation plus récente : il a un historique.
    expect(reusableMemberRow([canceled, removed], 'LEA@exemple.fr', NOW)).toBe(
      removed
    )
    const declined = invited({
      email: 'lea@exemple.fr',
      status: 'declined',
      createdAt: '2026-10-15T00:00:00.000Z',
    })
    expect(reusableMemberRow([canceled, declined], 'lea@exemple.fr', NOW)).toBe(
      declined
    )
    expect(
      reusableMemberRow(
        [
          member({ email: 'lea@exemple.fr' }),
          invited({ email: 'lea@exemple.fr' }),
          member({
            email: 'lea@exemple.fr',
            status: 'removed',
            authUserId: 'x',
          }),
        ],
        'lea@exemple.fr',
        NOW
      )
    ).toBeNull()
  })
})

describe('annuler, retirer, partir, changer de rôle', () => {
  const me = owner()

  it('annule une invitation en attente, expirée ou refusée', () => {
    expect(cancelRefusal(member(), invited())?.code).toBe('forbidden')
    expect(cancelRefusal(me, null)?.code).toBe('not_found')
    expect(cancelRefusal(me, member())?.code).toBe('not_found')
    expect(cancelRefusal(me, invited({ status: 'removed' }))?.code).toBe(
      'not_found'
    )
    expect(cancelRefusal(me, invited({ status: 'active' }))?.message).toContain(
      'déjà rejoint'
    )
    expect(cancelRefusal(me, invited({ status: 'canceled' }))?.message).toBe(
      'Cette invitation est déjà annulée.'
    )
    expect(cancelRefusal(me, invited())).toBeNull()
    expect(cancelRefusal(me, invited({ status: 'declined' }))).toBeNull()
  })

  it('retire un membre, jamais le dernier propriétaire', () => {
    const chloe = member()
    expect(removalRefusal(chloe, me, [me, chloe])?.code).toBe('forbidden')
    expect(removalRefusal(me, null, [me])?.code).toBe('not_found')
    expect(removalRefusal(me, member({ status: 'removed' }), [me])?.code).toBe(
      'not_found'
    )
    expect(removalRefusal(me, me, [me, chloe])?.message).toContain(
      'dernier propriétaire'
    )
    expect(removalRefusal(me, chloe, [me, chloe])).toBeNull()
    const other = owner()
    expect(removalRefusal(me, other, [me, other])).toBeNull()
  })

  it('part, sauf le dernier propriétaire (seul ou non)', () => {
    const chloe = member()
    expect(leaveRefusal(chloe, [me, chloe])).toBeNull()
    expect(leaveRefusal(me, [me, chloe])?.message).toContain(
      'nommez un autre propriétaire'
    )
    expect(leaveRefusal(me, [me])?.message).toContain('seul membre')
    const other = owner()
    expect(leaveRefusal(me, [me, other])).toBeNull()
  })

  it('réserve les autres actions aux propriétaires actifs', () => {
    expect(ownerRefusal(me, "renommer l'espace")).toBeNull()
    expect(ownerRefusal(member(), "renommer l'espace")).toEqual({
      code: 'forbidden',
      message: "Seul un propriétaire de l'espace peut renommer l'espace.",
    })
  })

  it('change un rôle ; l’espace garde un propriétaire', () => {
    const chloe = member()
    expect(roleChangeRefusal(chloe, me, 'member', [me, chloe])?.code).toBe(
      'forbidden'
    )
    expect(roleChangeRefusal(me, null, 'owner', [me])?.code).toBe('not_found')
    expect(roleChangeRefusal(me, me, 'member', [me, chloe])?.message).toBe(
      "L'espace doit garder au moins un propriétaire."
    )
    expect(roleChangeRefusal(me, chloe, 'owner', [me, chloe])).toBeNull()
    expect(roleChangeRefusal(me, me, 'owner', [me, chloe])).toBeNull()
    const other = owner()
    expect(roleChangeRefusal(me, other, 'member', [me, other])).toBeNull()
  })
})

describe('quitter son espace pour en rejoindre un autre', () => {
  it('laisse orphelin un espace sans autre membre actif', () => {
    const me = owner()
    expect(
      departureFor(
        me,
        [me, member({ status: 'removed' }), invited()],
        'Mon espace'
      )
    ).toEqual({ refusal: null, orphaned: true })
  })

  it('refuse au seul propriétaire d’un espace qui a d’autres membres', () => {
    const me = owner()
    const result = departureFor(me, [me, member()], 'Mon espace')
    expect(result.orphaned).toBe(false)
    expect(result.refusal?.message).toContain(
      'seul propriétaire de « Mon espace »'
    )
  })

  it('accepte un simple membre, ou un propriétaire qui en laisse un autre', () => {
    const me = owner()
    const chloe = member()
    expect(departureFor(chloe, [me, chloe], 'Foyer')).toEqual({
      refusal: null,
      orphaned: false,
    })
    const other = owner()
    expect(departureFor(me, [me, other, chloe], 'Foyer').refusal).toBeNull()
  })
})

describe('identifiants courts et e-mail', () => {
  it('trouve un identifiant libre', () => {
    expect(availableHandle('lea', ['richard'])).toBe('lea')
    expect(availableHandle('lea', ['lea', 'lea-2'])).toBe('lea-3')
    expect(availableHandle('', [])).toBe('membre')
    const long = 'a'.repeat(45)
    expect(availableHandle(long, [])).toHaveLength(40)
    expect(availableHandle(long, ['a'.repeat(40)])).toBe(`${'a'.repeat(38)}-2`)
  })

  it("écrit l'e-mail d'invitation", () => {
    const mail = invitationEmail({
      workspaceName: 'Appartement',
      inviterName: 'Richard',
      inviteeName: 'Léa',
      email: 'lea@exemple.fr',
      expiresAt: LATER,
      link: 'https://apart.exemple.fr/login',
    })
    expect(mail.subject).toBe(
      'Richard vous invite dans « Appartement » (apart-localizer)'
    )
    expect(mail.text).toContain('Bonjour Léa,')
    expect(mail.text).toContain('https://apart.exemple.fr/login')
    expect(mail.text).toContain("avec l'adresse lea@exemple.fr")
    expect(mail.text).toContain('expire le 18 novembre 2026')
    expect(
      invitationEmail({
        workspaceName: 'Appart\r\nBcc: x',
        inviterName: ' Richard\n',
        inviteeName: 'Léa',
        email: 'lea@exemple.fr',
        expiresAt: new Date(LATER),
        link: 'https://apart.exemple.fr/login',
      }).subject
    ).toBe('Richard vous invite dans « Appart Bcc: x » (apart-localizer)')
  })
})

describe('journal et notifications des membres', () => {
  const names = new Map([
    ['richard', { displayName: 'Richard' }],
    ['lea', { displayName: 'Léa' }],
  ])
  const describeAction = (
    action: string,
    before: unknown,
    after: unknown,
    actor = 'richard'
  ) =>
    describeActivity(
      { action, channel: 'web', actorMemberId: actor, before, after },
      names
    )

  it('met les invitations, arrivées, départs et rôles en phrases', () => {
    const invitedEntry = describeAction('member.invited', null, {
      memberId: 'x',
      email: 'lea@exemple.fr',
      displayName: 'Léa',
      expiresAt: LATER,
      renewed: true,
    })
    expect(invitedEntry.kind).toBe('member')
    expect(invitedEntry.summary).toBe(
      "a invité « Léa » (lea@exemple.fr) (invitation renouvelée), invitation valable jusqu'au 18 novembre 2026 à 11:00"
    )
    expect(describeAction('member.invited', null, {}).summary).toBe('a invité')
    expect(
      describeAction(
        'member.invitation_canceled',
        {
          displayName: 'Léa',
          email: 'lea@exemple.fr',
        },
        null
      ).summary
    ).toBe("a annulé l'invitation de « Léa » (lea@exemple.fr)")
    expect(
      describeAction('member.invitation_declined', null, null, 'lea').summary
    ).toBe("a refusé l'invitation à rejoindre l'espace")
    expect(
      describeAction('member.joined', null, { via: 'invitation' }, 'lea')
        .summary
    ).toBe("a rejoint l'espace (invitation acceptée)")
    expect(
      describeAction('member.joined', null, { via: 'precreated' }, 'lea')
        .summary
    ).toBe("a rejoint l'espace (première connexion)")
    expect(describeAction('member.left', null, {}).summary).toBe(
      "a quitté l'espace"
    )
    expect(
      describeAction('member.left', null, { canceledInvitations: 2 }).summary
    ).toBe("a quitté l'espace ; 2 invitation(s) en attente annulée(s)")
    expect(
      describeAction('member.removed', { displayName: 'Léa' }, null).summary
    ).toBe("a retiré « Léa » de l'espace")
    const role = describeAction(
      'member.role_changed',
      { displayName: 'Léa', role: 'member' },
      { role: 'owner' }
    )
    expect(role.summary).toBe('a changé le rôle de « Léa »')
    expect(role.changes).toEqual([
      { field: 'role', label: 'Rôle', before: 'Membre', after: 'Propriétaire' },
    ])
    const renamed = describeAction(
      'workspace.renamed',
      { name: 'Mon espace' },
      { name: 'Appartement' }
    )
    expect(renamed.kind).toBe('member')
    expect(renamed.changes[0]).toMatchObject({
      label: 'Nom',
      before: 'Mon espace',
      after: 'Appartement',
    })
  })

  it("ne prévient que les propriétaires de l'arrivée d'un membre", () => {
    const event = {
      action: 'member.joined',
      channel: 'web' as const,
      actorMemberId: 'lea',
      listingId: null,
      before: null,
      after: { via: 'invitation', displayName: 'Léa' },
    }
    expect(notificationTypeOf(event)).toBe('member_joined')
    const members = [
      { id: 'richard', displayName: 'Richard', role: 'owner' as const },
      { id: 'chloe', displayName: 'Chloé', role: 'member' as const },
      { id: 'lea', displayName: 'Léa', role: 'owner' as const },
    ]
    const drafts = notificationsForActivity(event, {
      members,
      listingTitle: null,
    })
    expect(drafts).toEqual([
      {
        recipientId: 'richard',
        type: 'member_joined',
        title: "Léa a rejoint l'espace",
        body: "Léa a accepté l'invitation et voit désormais les annonces, avis et tâches de l'espace.",
        url: '/espace',
        listingId: null,
      },
    ])
    // La première connexion d'un membre pré-créé (import) ne notifie pas.
    expect(
      notificationTypeOf({ ...event, after: { via: 'precreated' } })
    ).toBeNull()
    const anonymous = notificationsForActivity(
      { ...event, actorMemberId: null, after: { via: 'invitation' } },
      { members, listingTitle: null }
    )
    expect(anonymous.map(d => d.recipientId)).toEqual(['richard', 'lea'])
    expect(anonymous[0]?.title).toBe("Un membre a rejoint l'espace")
    const named = notificationsForActivity(
      {
        ...event,
        actorMemberId: 'inconnu',
        after: { via: 'invitation', displayName: 'Chloé' },
      },
      {
        members: [{ id: 'richard', displayName: 'Richard', role: 'owner' }],
        listingTitle: null,
      }
    )
    expect(named.map(d => d.title)).toEqual(["Chloé a rejoint l'espace"])
    expect(
      notificationsForActivity(event, {
        members: [{ id: 'richard', displayName: 'Richard' }],
        listingTitle: null,
      })
    ).toEqual([])
  })
})
