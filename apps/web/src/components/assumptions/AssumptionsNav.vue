<script setup lang="ts">
  import { changedCountLabel } from '@/lib/assumptions-summary'

  /**
   * Le sommaire de la page Hypothèses sur ordinateur (lot 13) : une colonne
   * collée en haut, un lien d'ancre par section avec son résumé d'une ligne
   * et le nombre de champs modifiés, puis l'historique.
   */
  defineProps<{
    items: {
      id: string
      index: number
      title: string
      summary: string
      changed: number
    }[]
    active: string | null
  }>()
  const emit = defineEmits<{ go: [id: string] }>()

  function go(event: MouseEvent, id: string): void {
    event.preventDefault()
    emit('go', id)
  }
</script>

<template>
  <nav
    aria-label="Sections des hypothèses"
    class="sticky top-20 grid gap-1 self-start"
    data-testid="assumptions-nav"
  >
    <a
      v-for="item in items"
      :key="item.id"
      :href="`#${item.id}`"
      :aria-current="item.id === active ? 'location' : undefined"
      class="grid gap-0.5 rounded-xl border px-3 py-2.5 text-fg no-underline hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      :class="
        item.id === active ? 'border-line bg-surface' : 'border-transparent'
      "
      @click="go($event, item.id)"
    >
      <span class="font-semibold">{{ item.index }} · {{ item.title }}</span>
      <span class="text-xs text-muted">{{ item.summary }}</span>
      <span v-if="item.changed" class="text-xs font-semibold text-accent">{{
        changedCountLabel(item.changed)
      }}</span>
    </a>
    <a
      href="#historique"
      class="flex min-h-11 items-center rounded-xl border px-3 py-2.5 text-sm text-muted hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      :class="
        active === 'historique'
          ? 'border-line bg-surface'
          : 'border-transparent'
      "
      :aria-current="active === 'historique' ? 'location' : undefined"
      @click="go($event, 'historique')"
    >
      Historique des versions
    </a>
  </nav>
</template>
