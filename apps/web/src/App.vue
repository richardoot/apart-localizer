<script setup lang="ts">
  import AppHeader from '@/components/AppHeader.vue'
  import { useAuthStore } from '@/stores/auth'

  const auth = useAuthStore()
</script>

<template>
  <div class="min-h-screen bg-bg text-fg">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-fg"
    >
      Aller au contenu
    </a>
    <AppHeader v-if="auth.isAuthenticated" />
    <main id="main" tabindex="-1" class="focus:outline-none">
      <RouterView />
    </main>
  </div>
</template>
