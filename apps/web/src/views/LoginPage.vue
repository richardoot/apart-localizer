<script setup lang="ts">
  import { ref } from 'vue'
  import { useRoute } from 'vue-router'
  import { useAuthStore } from '@/stores/auth'

  const auth = useAuthStore()
  const route = useRoute()
  const busy = ref(false)

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
        class="mt-8 w-full rounded-lg bg-accent px-4 py-3 font-medium text-accent-fg hover:opacity-90 disabled:opacity-60"
        :disabled="busy"
        @click="signIn"
      >
        {{ busy ? 'Redirection…' : 'Se connecter avec Google' }}
      </button>
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
