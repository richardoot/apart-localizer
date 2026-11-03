<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { supabase } from '@/lib/supabase'
  import { leaveApp } from '@/lib/redirect'
  import { describeScope, redirectHost } from '@/lib/oauth-consent'

  /**
   * Page de consentement du serveur OAuth 2.1 de Supabase (GoTrue) : un
   * client MCP (claude.ai, Claude Code, l'inspecteur) demande l'accès ;
   * GoTrue redirige ici (`site_url` + `authorization_url_path`) avec
   * `authorization_id`. La personne connectée accepte ou refuse, puis
   * repart vers le client avec un code ou un refus.
   */
  const route = useRoute()
  const router = useRouter()

  const loading = ref(true)
  const submitting = ref(false)
  const error = ref<string | null>(null)
  const clientName = ref('')
  const redirectUri = ref('')
  const userEmail = ref('')
  const scopes = ref<string[]>([])
  const authorizationId = ref('')

  const destination = computed(() => redirectHost(redirectUri.value))

  onMounted(async () => {
    const id = route.query.authorization_id
    if (typeof id !== 'string' || id === '') {
      error.value =
        "Paramètre authorization_id manquant : relancez la connexion depuis l'application cliente."
      loading.value = false
      return
    }
    authorizationId.value = id
    try {
      const { data, error: fetchError } =
        await supabase.auth.oauth.getAuthorizationDetails(id)
      if (fetchError || !data) {
        error.value =
          fetchError?.message ?? "Impossible de lire la demande d'autorisation."
        return
      }
      if (!('authorization_id' in data)) {
        // Accord déjà donné pour ces portées : GoTrue rend directement l'adresse de retour.
        leaveApp(data.redirect_url)
        return
      }
      clientName.value = data.client?.name || 'Application sans nom'
      redirectUri.value = data.redirect_uri ?? ''
      userEmail.value = data.user?.email ?? ''
      scopes.value = (data.scope ?? '').split(' ').filter(Boolean)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Erreur inattendue.'
    } finally {
      loading.value = false
    }
  })

  async function decide(action: 'approve' | 'deny'): Promise<void> {
    submitting.value = true
    error.value = null
    try {
      const { data, error: decisionError } =
        action === 'approve'
          ? await supabase.auth.oauth.approveAuthorization(
              authorizationId.value,
              { skipBrowserRedirect: true }
            )
          : await supabase.auth.oauth.denyAuthorization(authorizationId.value, {
              skipBrowserRedirect: true,
            })
      if (decisionError) {
        error.value = decisionError.message
        submitting.value = false
        return
      }
      if (data?.redirect_url) {
        leaveApp(data.redirect_url)
        return
      }
      await router.replace({ name: 'home' })
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Erreur inattendue.'
      submitting.value = false
    }
  }
</script>

<template>
  <section
    class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12"
  >
    <div class="rounded-2xl border border-line bg-surface p-8 shadow-panel">
      <h1 class="font-display text-2xl font-bold">Demande d'autorisation</h1>

      <p
        v-if="loading"
        class="mt-6 text-sm text-muted"
        data-testid="consent-loading"
      >
        Chargement de la demande…
      </p>

      <div v-else-if="error && !clientName" class="mt-6 space-y-4">
        <p
          role="alert"
          class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
        >
          {{ error }}
        </p>
        <button
          type="button"
          class="w-full rounded-lg border border-line px-4 py-2 text-sm hover:border-accent"
          @click="router.replace({ name: 'home' })"
        >
          Retour à la synthèse
        </button>
      </div>

      <div v-else class="mt-6 space-y-5">
        <div class="rounded-xl bg-surface-2 p-4">
          <p class="text-sm text-muted">L'application</p>
          <p class="text-lg font-semibold" data-testid="consent-client">
            {{ clientName }}
          </p>
          <p class="mt-2 text-sm text-muted">
            demande l'accès à votre compte<template v-if="userEmail">
              <strong class="text-fg"> {{ userEmail }}</strong></template
            >.
          </p>
          <p v-if="destination" class="mt-1 text-xs text-muted">
            Retour vers :
            <code data-testid="consent-redirect">{{ destination }}</code>
          </p>
        </div>

        <ul class="space-y-2" aria-label="Permissions demandées">
          <li
            v-for="scope in scopes"
            :key="scope"
            :data-testid="`scope-${scope}`"
            class="rounded-lg border border-line px-3 py-2 text-sm"
          >
            {{ describeScope(scope) }}
          </li>
        </ul>

        <p
          class="rounded-lg bg-warn-soft px-3 py-2 text-xs"
          data-testid="consent-warning"
        >
          Une fois autorisée, cette application agit en votre nom par le
          connecteur MCP : elle lit les annonces de votre espace et peut en
          ajouter ou en modifier (avis, tâches, offres, statuts), sans jamais
          rien supprimer. Chaque écriture est journalisée au canal « MCP ».
          N'autorisez que des applications que vous avez lancées vous-même.
        </p>

        <p
          v-if="error"
          role="alert"
          class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
        >
          {{ error }}
        </p>

        <div class="flex gap-3">
          <button
            type="button"
            data-testid="consent-deny"
            class="flex-1 rounded-lg border border-line px-4 py-2 hover:border-accent disabled:opacity-60"
            :disabled="submitting"
            @click="decide('deny')"
          >
            Refuser
          </button>
          <button
            type="button"
            data-testid="consent-approve"
            class="flex-1 rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:opacity-90 disabled:opacity-60"
            :disabled="submitting"
            @click="decide('approve')"
          >
            {{ submitting ? 'Redirection…' : 'Autoriser' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
