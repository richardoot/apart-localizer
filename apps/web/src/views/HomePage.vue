<script setup lang="ts">
  import { useQuery } from '@tanstack/vue-query'
  import { api } from '@/lib/api'

  const { data, isPending, error } = useQuery({
    queryKey: ['workspace'],
    queryFn: api.workspace,
  })
</script>

<template>
  <section class="mx-auto max-w-5xl px-4 py-8">
    <h1 class="font-display text-2xl font-bold">
      <template v-if="data">{{ data.workspace.name }}</template>
      <template v-else>Accueil</template>
    </h1>
    <p v-if="isPending" class="mt-2 text-muted">
      Chargement de l'espace de travail…
    </p>
    <p
      v-else-if="error"
      role="alert"
      class="mt-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ error.message }}
    </p>
    <template v-else-if="data">
      <p class="mt-2 text-muted">
        Bonjour {{ data.me.displayName }}. Les annonces, le tableau comparatif
        et la carte arrivent avec le lot 1.
      </p>
      <ul class="mt-6 flex flex-wrap gap-2">
        <li
          v-for="member in data.workspace.members"
          :key="member.id"
          class="rounded-full bg-accent-soft px-3 py-1 text-sm text-accent"
        >
          {{ member.displayName }}
        </li>
      </ul>
    </template>
  </section>
</template>
