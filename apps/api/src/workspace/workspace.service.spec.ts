import { describe, expect, it } from 'vitest'
import { handleFrom } from './workspace.service'
import { displayNameOf } from '../auth/guards/supabase.guard'
import type { User } from '@supabase/supabase-js'

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
