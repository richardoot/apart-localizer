import { describe, expect, it } from 'vitest'
import { planIdentityLinks } from '../lib/link-identities.js'
import type { MemberRow } from '../lib/link-identities.js'

const member = (
  over: Partial<MemberRow> & Pick<MemberRow, 'id' | 'handle'>
): MemberRow => ({
  email: null,
  authUserId: null,
  workspaceName: 'Richard et Chloé',
  createdAt: new Date('2026-11-01T00:00:00Z'),
  ...over,
})

describe('planIdentityLinks (ADR 0004)', () => {
  it('rattache un membre importé au compte local de même e-mail, sans tenir compte de la casse', () => {
    const plan = planIdentityLinks(
      [member({ id: 'm1', handle: 'richard', email: 'Richard@Exemple.fr' })],
      [{ id: 'u1', email: 'richard@exemple.fr' }]
    )
    expect(plan.link).toEqual([
      expect.objectContaining({
        memberId: 'm1',
        authUserId: 'u1',
        replaces: null,
      }),
    ])
  })

  it('relie de nouveau une identité absente de auth.users (restauration, comptes recréés)', () => {
    const plan = planIdentityLinks(
      [
        member({
          id: 'm1',
          handle: 'richard',
          email: 'r@exemple.fr',
          authUserId: 'ancien',
        }),
      ],
      [{ id: 'u1', email: 'r@exemple.fr' }]
    )
    expect(plan.link[0]).toMatchObject({ authUserId: 'u1', replaces: 'ancien' })
  })

  it('ne déplace jamais un membre déjà relié à un compte existant', () => {
    const plan = planIdentityLinks(
      [
        member({
          id: 'm1',
          handle: 'richard',
          email: 'autre@exemple.fr',
          authUserId: 'u1',
        }),
      ],
      [
        { id: 'u1', email: 'r@exemple.fr' },
        { id: 'u2', email: 'autre@exemple.fr' },
      ]
    )
    expect(plan.link).toEqual([])
    expect(plan.linked).toHaveLength(1)
  })

  it('signale un conflit plutôt que de voler l’identité d’un autre membre', () => {
    const plan = planIdentityLinks(
      [
        member({ id: 'm1', handle: 'richard', email: 'r@exemple.fr' }),
        member({
          id: 'm2',
          handle: 'r',
          email: 'r@exemple.fr',
          authUserId: 'u1',
          workspaceName: 'Mon espace',
        }),
      ],
      [{ id: 'u1', email: 'r@exemple.fr' }]
    )
    expect(plan.link).toEqual([])
    expect(plan.conflicts[0]).toMatch(/Mon espace/)
    expect(plan.conflicts[0]).toContain("WHERE id = 'm2'")
  })

  it('le plus ancien de deux membres du même e-mail l’emporte', () => {
    const plan = planIdentityLinks(
      [
        member({
          id: 'jeune',
          handle: 'b',
          email: 'x@exemple.fr',
          createdAt: new Date('2026-11-02T00:00:00Z'),
        }),
        member({
          id: 'ancien',
          handle: 'a',
          email: 'x@exemple.fr',
          createdAt: new Date('2026-10-01T00:00:00Z'),
        }),
      ],
      [{ id: 'u1', email: 'x@exemple.fr' }]
    )
    expect(plan.link.map(l => l.memberId)).toEqual(['ancien'])
    expect(plan.conflicts).toHaveLength(1)
  })

  it('liste les membres sans compte local et sans e-mail', () => {
    const plan = planIdentityLinks(
      [
        member({ id: 'm1', handle: 'richard' }),
        member({ id: 'm2', handle: 'chloe', email: 'c@exemple.fr' }),
      ],
      []
    )
    expect(plan.withoutEmail).toEqual([expect.stringContaining('richard')])
    expect(plan.orphans).toEqual([expect.stringContaining('c@exemple.fr')])
  })
})
