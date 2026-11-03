<script setup lang="ts">
  import type { Provenance } from '@apart/contracts'
  import ProvenanceBadge from '@/components/listings/ProvenanceBadge.vue'

  defineProps<{
    label: string
    forId: string
    hint?: string | undefined
    error?: string | undefined
    full?: boolean
    /** Pastille de provenance (IA avec confiance, annonce, vous, open data). */
    provenance?: Provenance | null | undefined
    /** Champ indispensable non trouvé par l'extraction : mis en évidence. */
    missing?: boolean
    /** Modifié par l'autre membre (ou Claude) depuis la dernière ouverture. */
    changed?: boolean
  }>()
</script>

<template>
  <div
    class="grid gap-1"
    :class="[
      full ? 'sm:col-span-2' : '',
      missing ? 'rounded-lg bg-warn-soft/60 p-1.5 -m-1.5' : '',
      changed && !missing
        ? 'rounded-lg bg-accent-soft/60 p-1.5 -m-1.5 ring-1 ring-accent'
        : '',
    ]"
    :data-missing="missing ? 'true' : undefined"
    :data-changed="changed ? 'true' : undefined"
  >
    <label
      :for="forId"
      class="flex items-center gap-1.5 text-xs font-medium text-muted"
    >
      {{ label }}
      <ProvenanceBadge :provenance="provenance" />
      <span
        v-if="missing"
        class="rounded-full bg-warn px-1.5 py-px text-[10px] font-semibold text-white uppercase"
        title="Non trouvé dans l'annonce : à compléter, sinon une tâche sera créée"
        >à compléter</span
      >
      <span
        v-if="changed"
        class="rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold text-accent-fg uppercase"
        title="Modifié depuis votre dernière ouverture de la fiche"
        >modifié</span
      >
    </label>
    <slot />
    <p v-if="error" class="text-xs text-bad" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="text-xs text-muted">{{ hint }}</p>
  </div>
</template>
