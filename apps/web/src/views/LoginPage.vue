<script setup lang="ts">
  import { ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { useAuthStore } from '@/stores/auth'
  import { passwordSignInEnabled, safeRedirectPath } from '@/lib/auth-options'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiField from '@/components/ui/UiField.vue'

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
      <UiButton
        variant="primary"
        block
        class="mt-8 min-h-12! text-base"
        data-testid="google-sign-in"
        :loading="busy"
        loading-label="Redirection…"
        @click="signIn"
      >
        Se connecter avec Google
      </UiButton>

      <form
        v-if="passwordEnabled"
        data-testid="password-form"
        class="mt-6 grid gap-3 border-t border-line pt-6"
        @submit.prevent="withPassword('sign-in')"
      >
        <p class="text-sm font-medium">Connexion sur cet ordinateur (essai)</p>
        <UiField
          id="login-email"
          v-model="email"
          label="E-mail"
          type="email"
          name="email"
          autocomplete="username"
          required
        />
        <UiField
          id="login-password"
          v-model="password"
          label="Mot de passe"
          type="password"
          name="password"
          autocomplete="current-password"
          required
          minlength="6"
        />
        <div class="flex gap-2">
          <UiButton
            type="submit"
            variant="outline"
            class="flex-1"
            data-testid="password-sign-in"
            :disabled="busy"
          >
            Se connecter
          </UiButton>
          <UiButton
            class="flex-1"
            data-testid="password-sign-up"
            :disabled="busy"
            @click="withPassword('sign-up')"
          >
            Créer un compte
          </UiButton>
        </div>
        <p class="text-sm text-muted">
          Comptes de démonstration : demo@apart.local et demo2@apart.local. Un
          compte créé ici avec l'e-mail d'un membre le rattache à ses annonces.
        </p>
      </form>

      <UiAlert v-if="auth.error" class="mt-4">
        {{ auth.error }}
      </UiAlert>
      <p class="mt-6 text-sm text-muted">
        Accès réservé aux membres de l'espace.
      </p>
    </div>
  </section>
</template>
