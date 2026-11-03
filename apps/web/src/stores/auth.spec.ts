import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { supabase } from '@/lib/supabase'
import { passwordErrorMessage, useAuthStore } from './auth'

const mocked = supabase.auth as unknown as {
  getSession: ReturnType<typeof vi.fn>
  onAuthStateChange: ReturnType<typeof vi.fn>
  signInWithOAuth: ReturnType<typeof vi.fn>
  signInWithPassword: ReturnType<typeof vi.fn>
  signUp: ReturnType<typeof vi.fn>
  signOut: ReturnType<typeof vi.fn>
}

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('reads the session once and listens for changes', async () => {
    const session = {
      access_token: 't',
      user: { id: 'u1', email: 'r@e.invalid' },
    }
    mocked.getSession.mockResolvedValue({ data: { session } })
    const auth = useAuthStore()
    expect(auth.loading).toBe(true)
    await auth.initialize()
    expect(auth.loading).toBe(false)
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.user?.id).toBe('u1')
    expect(mocked.onAuthStateChange).toHaveBeenCalledOnce()

    const listener = mocked.onAuthStateChange.mock.calls[0]?.[0] as (
      event: string,
      session: unknown
    ) => void
    listener('SIGNED_OUT', null)
    expect(auth.isAuthenticated).toBe(false)
  })

  it('starts the Google flow with the requested landing path, or the home page', async () => {
    const auth = useAuthStore()
    await auth.signInWithGoogle('/listings')
    expect(mocked.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/listings` },
    })
    await auth.signInWithGoogle('https://evil.invalid')
    expect(mocked.signInWithOAuth).toHaveBeenLastCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
    await auth.signInWithGoogle('//evil.invalid/x')
    expect(mocked.signInWithOAuth).toHaveBeenLastCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
  })

  it('signs in with e-mail and password and keeps the session', async () => {
    const auth = useAuthStore()
    await auth.signInWithPassword('demo@apart.local', 'secret-local')
    expect(mocked.signInWithPassword).toHaveBeenCalledWith({
      email: 'demo@apart.local',
      password: 'secret-local',
    })
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.session?.access_token).toBe('t')
  })

  it('translates a refused password sign-in', async () => {
    mocked.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: new Error('Invalid login credentials'),
    })
    const auth = useAuthStore()
    await expect(auth.signInWithPassword('a@b.invalid', 'x')).rejects.toThrow()
    expect(auth.error).toBe('E-mail ou mot de passe incorrect.')
    expect(auth.isAuthenticated).toBe(false)
  })

  it('creates a local account; a server asking for confirmation says so', async () => {
    const auth = useAuthStore()
    await auth.signUpWithPassword('me@apart.local', 'secret-local')
    expect(mocked.signUp).toHaveBeenCalledWith({
      email: 'me@apart.local',
      password: 'secret-local',
    })
    expect(auth.isAuthenticated).toBe(true)

    setActivePinia(createPinia())
    mocked.signUp.mockResolvedValueOnce({
      data: { session: null, user: { id: 'u2' } },
      error: null,
    })
    const other = useAuthStore()
    await expect(
      other.signUpWithPassword('me@apart.local', 'secret-local')
    ).rejects.toThrow(/confirmation/)
    expect(other.isAuthenticated).toBe(false)
  })

  it('names the common GoTrue refusals in French', () => {
    expect(passwordErrorMessage('User already registered')).toMatch(
      /existe déjà/
    )
    expect(
      passwordErrorMessage('Password should be at least 6 characters.')
    ).toMatch(/trop court/)
    expect(passwordErrorMessage('Email logins are disabled')).toMatch(
      /désactivée/
    )
    expect(passwordErrorMessage('Autre chose')).toBe('Autre chose')
  })

  it('keeps the error message when Supabase refuses', async () => {
    mocked.signInWithOAuth.mockResolvedValueOnce({
      error: new Error('Provider disabled'),
    })
    const auth = useAuthStore()
    await expect(auth.signInWithGoogle()).rejects.toThrow('Provider disabled')
    expect(auth.error).toBe('Provider disabled')
  })

  it('clears the session on sign-out', async () => {
    mocked.getSession.mockResolvedValue({
      data: { session: { access_token: 't', user: { id: 'u1' } } },
    })
    const auth = useAuthStore()
    await auth.initialize()
    await auth.signOut()
    expect(auth.isAuthenticated).toBe(false)
    expect(mocked.signOut).toHaveBeenCalledOnce()
  })
})
