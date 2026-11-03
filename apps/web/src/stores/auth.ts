import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { safeRedirectPath } from '@/lib/auth-options'

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
    const target = safeRedirectPath(redirectPath)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${target}` },
    })
    if (oauthError) {
      error.value = oauthError.message
      throw oauthError
    }
  }

  /**
   * E-mail and password, for the local stack only (VITE_AUTH_PASSWORD=1,
   * ADR 0016): the demo accounts, or a local account created with the same
   * e-mail as a pre-created member (ADR 0004).
   */
  async function signInWithPassword(
    email: string,
    password: string
  ): Promise<void> {
    error.value = null
    const { data, error: signInError } = await supabase.auth.signInWithPassword(
      { email, password }
    )
    if (signInError) {
      error.value = passwordErrorMessage(signInError.message)
      throw signInError
    }
    session.value = data.session
    user.value = data.user
  }

  /**
   * A local account. The local stack confirms e-mails automatically, so the
   * session is there at once; a server asking for confirmation says so.
   */
  async function signUpWithPassword(
    email: string,
    password: string
  ): Promise<void> {
    error.value = null
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    })
    if (signUpError) {
      error.value = passwordErrorMessage(signUpError.message)
      throw signUpError
    }
    if (!data.session) {
      error.value =
        'Compte créé, mais le serveur demande une confirmation par e-mail : consultez Mailpit (http://127.0.0.1:54324).'
      throw new Error(error.value)
    }
    session.value = data.session
    user.value = data.user
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
    signInWithPassword,
    signUpWithPassword,
    signOut,
  }
})

/** GoTrue answers in English; the two messages a person meets here, in French. */
export function passwordErrorMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return 'E-mail ou mot de passe incorrect.'
  }
  if (/already registered|already exists/i.test(message)) {
    return 'Un compte existe déjà pour cet e-mail : connectez-vous.'
  }
  if (/password should be at least/i.test(message)) {
    return 'Mot de passe trop court (6 caractères au moins).'
  }
  if (/email logins are disabled|signups not allowed/i.test(message)) {
    return 'La connexion par e-mail est désactivée sur ce serveur.'
  }
  return message
}
