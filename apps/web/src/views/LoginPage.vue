<script setup lang="ts">
  import { ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { useAuthStore } from '@/stores/auth'
  import { passwordSignInEnabled, safeRedirectPath } from '@/lib/auth-options'

  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()
  const busy = ref(false)

  /** E-mail et mot de passe : pile locale seulement (VITE_AUTH_PASSWORD=1). */
  const passwordEnabled = passwordSignInEnabled()
  const email = ref('')
  const password = ref('')

  const redirectPath = (): string => safeRedirectPath(route.query.redirect)

  async function signIn(): Promise<void> {
    busy.value = true
    try {
      const redirect =
        typeof route.query.redirect === 'string'
          ? route.query.redirect
          : undefined
      await auth.signInWithGoogle(redirect)
    } catch {
      // Le message est dans auth.error, affiché ci-dessous.
    } finally {
      busy.value = false
    }
  }

  async function withPassword(mode: 'sign-in' | 'sign-up'): Promise<void> {
    busy.value = true
    try {
      if (mode === 'sign-in') {
        await auth.signInWithPassword(email.value.trim(), password.value)
      } else {
        await auth.signUpWithPassword(email.value.trim(), password.value)
      }
      await router.replace(redirectPath())
    } catch {
      // Le message est dans auth.error, affiché ci-dessous.
    } finally {
      busy.value = false
    }
  }
</script>

<template>
  <section
    class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12"
  >
    <div class="rounded-2xl border border-line bg-surface p-8 shadow-panel">
      <h1 class="font-display text-3xl font-bold text-accent">
        apart-localizer
      </h1>
      <p class="mt-2 text-muted">
        Suivi partagé des annonces d'appartement : comparateur, carte,
        rentabilité et prix cible.
      </p>
      <button
        type="button"
        data-testid="google-sign-in"
        class="mt-8 w-full rounded-lg bg-accent px-4 py-3 font-medium text-accent-fg hover:opacity-90 disabled:opacity-60"
        :disabled="busy"
        @click="signIn"
      >
        {{ busy ? 'Redirection…' : 'Se connecter avec Google' }}
      </button>

      <form
        v-if="passwordEnabled"
        data-testid="password-form"
        class="mt-6 space-y-3 border-t border-line pt-6"
        @submit.prevent="withPassword('sign-in')"
      >
        <p class="text-sm font-medium">Connexion locale (développement)</p>
        <label class="block text-sm">
          <span class="text-muted">E-mail</span>
          <input
            v-model="email"
            type="email"
            name="email"
            autocomplete="username"
            required
            class="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2"
          />
        </label>
        <label class="block text-sm">
          <span class="text-muted">Mot de passe</span>
          <input
            v-model="password"
            type="password"
            name="password"
            autocomplete="current-password"
            required
            minlength="6"
            class="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2"
          />
        </label>
        <div class="flex gap-2">
          <button
            type="submit"
            data-testid="password-sign-in"
            class="flex-1 rounded-lg border border-accent px-4 py-2 font-medium text-accent hover:bg-accent hover:text-accent-fg disabled:opacity-60"
            :disabled="busy"
          >
            Se connecter
          </button>
          <button
            type="button"
            data-testid="password-sign-up"
            class="flex-1 rounded-lg border border-line px-4 py-2 text-sm hover:border-accent disabled:opacity-60"
            :disabled="busy"
            @click="withPassword('sign-up')"
          >
            Créer un compte local
          </button>
        </div>
        <p class="text-xs text-muted">
          Comptes de démonstration : demo@apart.local et demo2@apart.local
          (<code>pnpm stack:up --dataset demo</code>, mot de passe dans
          docs/developpement-local.md). Un compte local créé avec l'e-mail d'un
          membre importé le rattache à ses annonces.
        </p>
      </form>

      <p
        v-if="auth.error"
        role="alert"
        class="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
      >
        {{ auth.error }}
      </p>
      <p class="mt-6 text-xs text-muted">
        Accès réservé aux membres de l'espace de travail.
      </p>
    </div>
  </section>
</template>
