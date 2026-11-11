<script setup lang="ts">
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import { CLAUDE_REQUESTS, MCP_PROMPT_TITLES } from '@apart/contracts'
  import { explorationHeading } from '@apart/domain'
  import ActivityList from '@/components/activity/ActivityList.vue'
  import PendingMessages from '@/components/agency/PendingMessages.vue'
  import { useActivity, useClaudeStatus } from '@/composables/useActivity'
  import { useCopy } from '@/composables/useCopy'
  import { useExplorationList } from '@/composables/useExplorations'
  import { MCP_URL } from '@/lib/api'
  import { CLAUDE_CONNECT_STEPS, isLocalAddress } from '@/lib/claude'
  import { formatDate } from '@/lib/format'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'

  /**
   * Lot 26 (ADR 0036) : la page « Claude ». L'adresse du connecteur et les
   * étapes pour le brancher dans claude.ai ; ce que le journal sait de son
   * usage (une écriture au nom d'un membre ; une lecture ne laisse pas de
   * trace, aucune API ne liste les applications autorisées) ; les demandes
   * courtes à copier, qui lancent les prompts du serveur MCP (titres et
   * demandes de `contracts`, une seule source) ; les explorations et leurs
   * comptes rendus ; ce que Claude a écrit (le journal du canal MCP, filtre
   * dans l'URL de l'activité) ; les messages aux agences à valider.
   */
  const router = useRouter()
  const status = useClaudeStatus()
  const usage = computed(() => status.data.value?.usage ?? null)
  const plugged = computed(() => usage.value?.state === 'me')
  const local = isLocalAddress(MCP_URL)
  const { copied, failure, copy } = useCopy()

  const explorations = useExplorationList(10)
  const journal = useActivity(
    computed(() => ({ channel: 'mcp' as const, page: 1, limit: 5 }))
  )
  function open(listingId: string): void {
    void router.push({ name: 'listing', params: { id: listingId } })
  }
  const USAGE_TONE = { never: 'info', workspace: 'warn', me: 'good' } as const
</script>

<template>
  <section class="mx-auto grid max-w-6xl gap-4 px-4 py-6">
    <header class="grid gap-1">
      <h1 class="font-display text-2xl font-bold">Claude</h1>
      <p class="text-sm text-muted">
        Claude explore les portails, revérifie les annonces et prépare les
        questions aux agences, depuis claude.ai. Ici : le brancher, quoi lui
        demander, ce qu’il a fait.
      </p>
    </header>

    <div
      class="grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
    >
      <div class="grid gap-4">
        <UiCard
          title="Le brancher"
          :tone="plugged ? 'default' : 'accent'"
          data-testid="claude-connect"
        >
          <QueryState
            :query="status"
            skeleton="lines"
            :skeleton-count="2"
            loading-label="l’état du connecteur"
          >
            <div
              v-if="usage"
              class="mb-3 grid gap-1"
              data-testid="claude-usage"
              :data-state="usage.state"
            >
              <p class="flex flex-wrap items-center gap-2 font-semibold">
                <UiBadge :tone="USAGE_TONE[usage.state]">{{
                  usage.state === 'me'
                    ? 'branché'
                    : usage.state === 'workspace'
                      ? 'pas encore pour toi'
                      : 'jamais vu'
                }}</UiBadge>
                {{ usage.title }}
              </p>
              <p class="text-sm text-muted">{{ usage.text }}</p>
            </div>
          </QueryState>
          <div class="grid gap-2">
            <p class="text-sm font-medium">Adresse du connecteur</p>
            <div class="flex flex-wrap items-center gap-2">
              <code
                class="min-w-0 flex-1 rounded-lg bg-surface-2 px-2.5 py-2 text-sm break-all select-all"
                data-testid="claude-mcp-url"
                >{{ MCP_URL }}</code
              >
              <UiButton
                :icon="copied === 'url' ? 'check' : 'copy'"
                data-testid="claude-copy-url"
                @click="copy('url', MCP_URL)"
                >{{ copied === 'url' ? 'Copiée' : 'Copier' }}</UiButton
              >
            </div>
            <UiAlert v-if="local" tone="warn" data-testid="claude-local">
              Adresse locale : claude.ai ne peut pas la joindre. Branche Claude
              sur l’application en ligne.
            </UiAlert>
            <details :open="!plugged" class="group" data-testid="claude-steps">
              <summary
                class="flex min-h-11 cursor-pointer items-center text-sm font-medium text-accent"
              >
                {{
                  plugged
                    ? 'Revoir les étapes pour le brancher'
                    : 'Les étapes pour le brancher'
                }}
              </summary>
              <ol class="m-0 grid list-decimal gap-1.5 pl-5 text-sm">
                <li v-for="step in CLAUDE_CONNECT_STEPS" :key="step">
                  {{ step }}
                </li>
              </ol>
              <p class="mt-2 text-sm text-muted">
                Claude agit en ton nom : chaque écriture s’inscrit au journal ;
                il ne supprime rien et n’envoie aucun message sans ton accord.
                L’application ne le voit qu’à sa première écriture.
              </p>
            </details>
          </div>
        </UiCard>

        <UiCard title="Lui demander" data-testid="claude-requests">
          <p class="mb-3 text-sm text-muted">
            Colle une demande dans une conversation où le connecteur est actif.
            Si claude.ai te propose les invites du connecteur, elles portent le
            titre indiqué.
          </p>
          <ul class="m-0 grid list-none gap-3 p-0">
            <li
              v-for="r in CLAUDE_REQUESTS"
              :key="r.prompt"
              class="grid gap-1.5 border-t border-line pt-3 first:border-t-0 first:pt-0"
              :data-prompt="r.prompt"
            >
              <p class="flex flex-wrap items-baseline gap-x-2 font-semibold">
                {{ r.what }}
                <span class="text-xs font-normal text-muted"
                  >invite « {{ MCP_PROMPT_TITLES[r.prompt] }} »</span
                >
              </p>
              <p
                class="rounded-lg bg-surface-2 px-3 py-2 text-sm select-all"
                data-testid="claude-request"
              >
                {{ r.request }}
              </p>
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <UiButton
                  size="sm"
                  variant="outline"
                  :icon="copied === r.prompt ? 'check' : 'copy'"
                  :data-copy="r.prompt"
                  @click="copy(r.prompt, r.request)"
                  >{{
                    copied === r.prompt ? 'Copiée' : 'Copier la demande'
                  }}</UiButton
                >
                <span v-if="r.note" class="text-sm text-muted">{{
                  r.note
                }}</span>
              </div>
            </li>
          </ul>
          <UiAlert v-if="failure" class="mt-3">{{ failure }}</UiAlert>
        </UiCard>
      </div>

      <div class="grid gap-4">
        <PendingMessages />

        <UiCard title="Explorations" data-testid="claude-explorations">
          <QueryState
            :query="explorations"
            :empty="explorations.data.value?.length === 0"
            empty-title="Aucune exploration pour l’instant."
            empty-text="Demande à Claude d’explorer les portails : ce qu’il trouve attend dans « À valider », avec son compte rendu ici."
            skeleton="rows"
            :skeleton-count="2"
            loading-label="des explorations"
          >
            <ul class="m-0 grid list-none gap-2 p-0">
              <li
                v-for="e in explorations.data.value ?? []"
                :key="e.id"
                class="grid gap-0.5"
              >
                <RouterLink
                  :to="{ name: 'exploration', params: { id: e.id } }"
                  class="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-2 hover:underline sm:min-h-0"
                  >{{ explorationHeading(e) }}</RouterLink
                >
                <span class="text-sm text-muted">{{ e.summary }}</span>
              </li>
            </ul>
          </QueryState>
        </UiCard>

        <UiCard title="Ce que Claude a écrit" data-testid="claude-journal">
          <template #actions>
            <UiButton
              :to="{ name: 'activity', query: { canal: 'mcp' } }"
              variant="link"
              size="sm"
              data-testid="claude-journal-all"
              >Tout voir</UiButton
            >
          </template>
          <QueryState
            :query="journal"
            :empty="journal.data.value?.items.length === 0"
            empty-title="Rien encore."
            empty-text="Chaque écriture de Claude (annonce, vérification, exploration, message préparé) s’inscrit ici, avec le membre pour qui il agit."
            skeleton="rows"
            :skeleton-count="3"
            loading-label="du journal de Claude"
          >
            <template v-if="journal.data.value">
              <ActivityList
                :entries="journal.data.value.items"
                show-listing
                @open="open"
              />
              <p
                v-if="status.data.value?.usage.lastWriteAt"
                class="mt-2 text-xs text-muted"
              >
                Dernière écriture le
                {{ formatDate(status.data.value.usage.lastWriteAt) }}.
              </p>
            </template>
          </QueryState>
        </UiCard>
      </div>
    </div>
  </section>
</template>
