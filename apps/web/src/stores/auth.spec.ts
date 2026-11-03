import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'

const mocked = supabase.auth as unknown as {
  getSession: ReturnType<typeof vi.fn>
  onAuthStateChange: ReturnType<typeof vi.fn>
  signInWithOAuth: ReturnType<typeof vi.fn>
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
