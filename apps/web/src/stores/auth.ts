import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/**
 * The Supabase session, and nothing else: the workspace and the member come
 * from the API through TanStack Query. Pinia keeps interface state only.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const session = ref<Session | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => user.value !== null)

  async function initialize(): Promise<void> {
    try {
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      user.value = data.session?.user ?? null
    } catch (err) {
      error.value =
        err instanceof Error
          ? err.message
          : "Impossible d'initialiser la session"
    } finally {
      loading.value = false
    }

    supabase.auth.onAuthStateChange((_event, newSession) => {
      session.value = newSession
      user.value = newSession?.user ?? null
    })
  }

  /** Google sign-in through Supabase; `redirectPath` is where to land afterwards. */
  async function signInWithGoogle(redirectPath?: string): Promise<void> {
    error.value = null
    const target = redirectPath?.startsWith('/') ? redirectPath : '/'
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${target}` },
    })
    if (oauthError) {
      error.value = oauthError.message
      throw oauthError
    }
  }

  async function signOut(): Promise<void> {
    error.value = null
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      error.value = signOutError.message
      throw signOutError
    }
    session.value = null
    user.value = null
  }

  return {
    user,
    session,
    loading,
    error,
    isAuthenticated,
    initialize,
    signInWithGoogle,
    signOut,
  }
})
