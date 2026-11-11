<script setup lang="ts">
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import UiSegmented from '@/components/ui/UiSegmented.vue'
  import { useAction } from '@/composables/useAction'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { MORE_LINKS, initialsOf } from '@/lib/navigation'
  import { useAuthStore } from '@/stores/auth'
  import { useThemeStore } from '@/stores/theme'
  import type { ThemeMode } from '@/stores/theme'
  import UiAlert from '@/components/ui/UiAlert.vue'

  /**
   * Lot 23 (ADR 0033) : « Plus », la cinquième entrée de la barre du bas au
   * téléphone. Qui est connecté et dans quel espace, les pages qui ne
   * tiennent pas dans la barre (critères, hypothèses, activité, espace,
   * critères des avis), le thème et la déconnexion. Sur ordinateur, les
   * mêmes choses sont dans l'en-tête et le menu du compte.
   */
  const router = useRouter()
  const auth = useAuthStore()
  const theme = useThemeStore()
  const { me, data: workspace } = useWorkspace()

  const mode = computed<ThemeMode>({
    get: () => theme.mode,
    set: next => theme.setMode(next),
  })
  const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: 'Clair' },
    { value: 'dark', label: 'Sombre' },
    { value: 'system', label: 'Auto' },
  ]

  const leaving = useAction('La déconnexion a échoué.')
  async function signOut(): Promise<void> {
    await leaving.run(() => auth.signOut())
    if (!leaving.error.value) await router.push({ name: 'login' })
  }
</script>

<template>
  <section class="mx-auto grid max-w-2xl gap-4 px-4 py-5">
    <h1 class="font-display text-2xl font-bold">Plus</h1>

    <UiCard as="div" class="flex items-center gap-3" data-testid="more-who">
      <span
        aria-hidden="true"
        class="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent"
        >{{ initialsOf(me?.displayName) }}</span
      >
      <div class="grid min-w-0 gap-0.5">
        <p class="font-semibold">
          Connecté : {{ me?.displayName ?? 'chargement…' }}
        </p>
        <p v-if="auth.user?.email" class="text-sm break-all text-muted">
          {{ auth.user.email }}
        </p>
        <p v-if="workspace" class="text-sm text-muted">
          Espace « {{ workspace.workspace.name }} »
        </p>
      </div>
    </UiCard>

    <nav aria-label="Autres pages">
      <ul
        class="m-0 grid list-none divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface p-0"
      >
        <li v-for="link in MORE_LINKS" :key="link.entry">
          <RouterLink
            :to="link.to"
            class="flex min-h-15 items-center gap-3 px-4 py-2.5 hover:bg-surface-2"
            :data-entry="link.entry"
          >
            <UiIcon :name="link.icon" class="size-5 text-muted" />
            <span class="grid min-w-0 flex-1 gap-0.5">
              <span class="font-semibold">{{ link.label }}</span>
              <span class="text-sm text-muted">{{ link.hint }}</span>
            </span>
            <UiIcon name="chevron-right" class="size-5 text-muted" />
          </RouterLink>
        </li>
      </ul>
    </nav>

    <UiCard title="Thème" level="h2">
      <UiSegmented
        v-model="mode"
        :options="THEME_OPTIONS"
        label="Thème"
        block
        data-testid="more-theme"
      />
    </UiCard>

    <div class="grid gap-2">
      <UiButton
        variant="outline"
        icon="logout"
        block
        :loading="leaving.pending.value"
        data-testid="more-sign-out"
        @click="signOut"
        >Se déconnecter</UiButton
      >
      <UiAlert v-if="leaving.error.value">{{ leaving.error.value }}</UiAlert>
    </div>
  </section>
</template>
