import { describe, expect, it } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { identityOf, isEmailVerified } from './identity'

const user = (over: Partial<User>): User =>
  ({
    id: 'sb-1',
    email: 'Lea@Exemple.FR',
    email_confirmed_at: '2026-11-04T10:00:00Z',
    user_metadata: { full_name: 'Léa Dupont' },
    identities: [
      {
        provider: 'google',
        identity_data: { email: 'lea@exemple.fr', email_verified: true },
      },
    ],
    ...over,
  }) as User

describe('isEmailVerified', () => {
  it('exige une adresse confirmée par GoTrue', () => {
    expect(isEmailVerified(user({}))).toBe(true)
    expect(isEmailVerified(user({ email_confirmed_at: undefined }))).toBe(false)
    expect(isEmailVerified(user({ email: undefined }))).toBe(false)
    expect(isEmailVerified(user({ email: '  ' }))).toBe(false)
  })

  it("refuse si le fournisseur externe dit l'adresse non vérifiée", () => {
    expect(
      isEmailVerified(
        user({
          identities: [
            {
              provider: 'google',
              identity_data: { email: 'LEA@exemple.fr', email_verified: false },
            } as never,
          ],
        })
      )
    ).toBe(false)
    // Une autre adresse du même fournisseur ne compte pas.
    expect(
      isEmailVerified(
        user({
          identities: [
            {
              provider: 'google',
              identity_data: {
                email: 'autre@exemple.fr',
                email_verified: false,
              },
            } as never,
          ],
        })
      )
    ).toBe(true)
  })

  it("ignore l'identité e-mail (confirmée par lien) et user_metadata, que la personne peut réécrire", () => {
    expect(
      isEmailVerified(
        user({
          identities: [
            {
              provider: 'email',
              identity_data: { email: 'lea@exemple.fr', email_verified: false },
            } as never,
            { provider: 'github', identity_data: undefined } as never,
          ],
          user_metadata: { email_verified: true },
        })
      )
    ).toBe(true)
    expect(
      isEmailVerified(
        user({
          email_confirmed_at: undefined,
          user_metadata: { email_verified: true },
        })
      )
    ).toBe(false)
    expect(isEmailVerified(user({ identities: undefined }))).toBe(true)
  })
})

describe('identityOf', () => {
  it("rend l'adresse en minuscules, sa vérification et le nom", () => {
    expect(identityOf(user({}))).toEqual({
      id: 'sb-1',
      email: 'lea@exemple.fr',
      emailVerified: true,
      displayName: 'Léa Dupont',
    })
    expect(identityOf(user({ email: undefined, user_metadata: {} }))).toEqual({
      id: 'sb-1',
      email: null,
      emailVerified: false,
      displayName: 'Membre',
    })
  })
})
