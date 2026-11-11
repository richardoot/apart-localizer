<script setup lang="ts">
  import type { WorkflowAgendaItem } from '@apart/contracts'
  import { agendaActionLabel } from '@apart/domain'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import { AGENDA_TONES, agendaTarget } from '@/lib/home'

  /**
   * Lot 23 (ADR 0033) : « Ce qui t'attend » en tête de l'accueil. Toutes les
   * lignes de `workflowOverview` (domain) : à trier, à confirmer, à
   * trancher, à finaliser, visites à venir et à planifier, avis à donner,
   * messages à valider, relances dues, tâches en retard. Chaque ligne est un
   * lien vers le bon travail (`agendaTarget`) ; rien n'y dit une note.
   * Vide : rien ne t'attend, et où aller.
   */
  defineProps<{ items: readonly WorkflowAgendaItem[] }>()
</script>

<template>
  <section
    aria-labelledby="home-agenda-title"
    class="grid gap-2"
    data-testid="home-agenda"
  >
    <h2 id="home-agenda-title" class="font-display text-lg font-bold">
      Ce qui t’attend
    </h2>
    <ul
      v-if="items.length"
      class="m-0 grid list-none divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface p-0 sm:grid-cols-2 sm:divide-y-0 sm:gap-px sm:bg-line"
    >
      <li v-for="item in items" :key="item.key" class="bg-surface">
        <RouterLink
          :to="agendaTarget(item)"
          class="flex min-h-14 items-center gap-3 px-3.5 py-2 hover:bg-surface-2"
          :data-agenda="item.key"
        >
          <span
            class="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg px-1.5 font-display text-lg font-bold tabular-nums"
            :class="AGENDA_TONES[item.key]"
            >{{ item.count }}</span
          >
          <span class="grid min-w-0 flex-1">
            <span class="font-semibold first-letter:uppercase">{{
              item.label
            }}</span>
            <span
              v-if="item.detail"
              class="text-sm text-muted"
              data-testid="agenda-detail"
              >{{ item.detail }}</span
            >
          </span>
          <span
            class="hidden shrink-0 text-sm font-medium text-accent sm:inline"
            aria-hidden="true"
            >{{ agendaActionLabel(item.key) }}</span
          >
          <UiIcon name="chevron-right" class="size-5 shrink-0 text-muted" />
        </RouterLink>
      </li>
    </ul>
    <div
      v-else
      class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-4 py-3"
      data-testid="home-agenda-empty"
    >
      <p class="text-sm">
        <strong>Rien ne t’attend.</strong>
        <span class="text-muted">
          Ni tri, ni décision, ni visite, ni message, ni tâche en retard.</span
        >
      </p>
      <UiButton :to="{ name: 'listings' }" size="sm" icon-right="arrow-right"
        >Voir les annonces</UiButton
      >
    </div>
  </section>
</template>
