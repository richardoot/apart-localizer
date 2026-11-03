<script setup lang="ts">
  import { useAuthStore } from '@/stores/auth'
  import { useThemeStore } from '@/stores/theme'
  import ThemeToggle from './ThemeToggle.vue'

  const auth = useAuthStore()
  const theme = useThemeStore()

  async function signOut(): Promise<void> {
    await auth.signOut()
  }
</script>

<template>
  <header
    class="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-surface px-4 py-3"
  >
    <RouterLink to="/" class="font-display text-lg font-bold text-accent">
      apart-localizer
    </RouterLink>
    <div class="flex items-center gap-2">
      <ThemeToggle :is-dark="theme.isDark" @toggle="theme.toggle()" />
      <button
        type="button"
        class="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg"
        @click="signOut"
      >
        Se déconnecter
      </button>
    </div>
  </header>
</template>
