<script setup lang="ts">
  import { entryLabel } from '@/lib/outbox'
  import type { OutboxEntry, OutboxSummary } from '@/lib/outbox'
  import { plural } from '@/lib/format'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiConfirm from '@/components/ui/UiConfirm.vue'

  /**
   * Lot 24 (ADR 0034) : ce qui n'est pas encore parti, ligne par ligne :
   * en attente du réseau, ou à revoir (refus, conflit : quelqu'un a modifié
   * la même chose entre-temps), avec « Réessayer » et « Abandonner ». Rien
   * n'est jamais retiré de la file sans ce choix.
   */
  defineProps<{
    entries: readonly OutboxEntry[]
    /** Les écritures en attente des autres annonces. */
    others: number
    summary: OutboxSummary
    /** La file survit au rechargement (IndexedDB). */
    persistent: boolean
  }>()
  const emit = defineEmits<{ retry: [id: string]; discard: [id: string] }>()
</script>

<template>
  <div class="grid gap-2 text-sm" data-testid="visit-pending-list">
    <p class="font-semibold">{{ summary.text }}</p>
    <p v-if="!persistent" class="text-warn" data-testid="visit-not-persistent">
      Cet appareil ne garde pas la file : ne recharge pas la page avant le
      retour du réseau.
    </p>
    <ul v-if="entries.length" class="grid gap-1.5">
      <li
        v-for="entry in entries"
        :key="entry.id"
        class="grid gap-1 rounded-lg bg-surface-2 px-3 py-2"
        :data-entry="entry.op.kind"
        :data-state="entry.state"
      >
        <div class="flex items-start gap-2">
          <span class="min-w-0 flex-1 break-words">{{
            entryLabel(entry.op)
          }}</span>
          <UiBadge :tone="entry.state === 'blocked' ? 'bad' : 'warn'">{{
            entry.state === 'blocked'
              ? entry.conflict
                ? 'conflit'
                : 'refusé'
              : 'en attente'
          }}</UiBadge>
        </div>
        <p v-if="entry.error" class="text-muted">
          {{
            entry.conflict
              ? `${entry.error} Relis la fiche : tes valeurs n’ont pas remplacé celles de l’autre.`
              : entry.error
          }}
        </p>
        <div v-if="entry.state === 'blocked'" class="flex flex-wrap gap-2">
          <UiButton size="sm" @click="emit('retry', entry.id)"
            >Réessayer</UiButton
          >
          <UiConfirm
            label="Abandonner"
            :question="
              entry.op.kind === 'visit-create'
                ? 'Abandonner la visite et ce qui s’y rapporte ?'
                : 'Abandonner ce changement ?'
            "
            cancel-label="Garder"
            variant="ghost"
            @confirm="emit('discard', entry.id)"
          />
        </div>
      </li>
    </ul>
    <p v-else-if="summary.clear" class="text-muted">
      Tout ce que tu as fait est sur le serveur.
    </p>
    <p v-if="others" class="text-muted">
      {{ plural(others, 'autre changement') }} en attente pour d’autres
      annonces.
    </p>
  </div>
</template>
