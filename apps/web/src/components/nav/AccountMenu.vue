<script setup lang="ts">
  import { computed } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import UiMenu from '@/components/ui/UiMenu.vue'
  import UiMenuItem from '@/components/ui/UiMenuItem.vue'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { desktopEntryOf } from '@/lib/navigation'
  import { useAuthStore } from '@/stores/auth'
  import { useThemeStore } from '@/stores/theme'

  /**
   * Lot 23 (ADR 0033) : le menu du compte de l'en-tête d'ordinateur. Le
   * bouton dit qui est connecté ; le menu porte l'espace (membres,
   * critères des avis), les notifications et leurs réglages, le thème et la
   * déconnexion. Il s'allume sur ces pages-là.
   */
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()
  const theme = useThemeStore()
  const { me, data: workspace } = useWorkspace()

  const name = computed(() => me.value?.displayName ?? 'Mon compte')
  const active = computed(() => desktopEntryOf(route.name) === 'account')
  const go = (to: string) => void router.push(to)
  /** Puis la page de connexion ; un échec reste dans `auth.error`. */
  const signOut = () =>
    void auth
      .signOut()
      .then(() => router.push({ name: 'login' }))
      .catch(() => undefined)
</script>

<template>
  <UiMenu
    :label="name"
    variant="ghost"
    icon="user"
    width="w-72"
    :class="active ? 'bg-accent-soft text-fg' : 'text-muted'"
    :aria-label="`Compte de ${name} : espace, notifications, thème, déconnexion`"
    data-testid="account-menu"
  >
    <div class="grid gap-0.5 px-2.5 pt-1 pb-2" data-testid="account-who">
      <span class="text-sm font-semibold">{{ name }}</span>
      <span v-if="auth.user?.email" class="text-xs break-all text-muted">{{
        auth.user.email
      }}</span>
      <span v-if="workspace" class="text-xs text-muted"
        >Espace « {{ workspace.workspace.name }} »</span
      >
    </div>
    <UiMenuItem data-testid="account-workspace" @select="go('/espace')">
      <UiIcon name="users" class="size-4 text-muted" /> Espace et membres
    </UiMenuItem>
    <UiMenuItem @select="go('/espace/criteres-des-avis')">
      <UiIcon name="star" class="size-4 text-muted" /> Critères des avis
    </UiMenuItem>
    <UiMenuItem @select="go('/notifications')">
      <UiIcon name="bell" class="size-4 text-muted" /> Notifications et réglages
    </UiMenuItem>
    <UiMenuItem data-testid="account-theme" @select="theme.toggle()">
      <UiIcon :name="theme.isDark ? 'sun' : 'moon'" class="size-4 text-muted" />
      {{ theme.isDark ? 'Passer au thème clair' : 'Passer au thème sombre' }}
    </UiMenuItem>
    <UiMenuItem data-testid="account-sign-out" @select="signOut">
      <UiIcon name="logout" class="size-4 text-muted" /> Se déconnecter
    </UiMenuItem>
  </UiMenu>
</template>
