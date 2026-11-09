<script setup lang="ts">
  import { ref } from 'vue'
  import { DISCARD_QUICK_REASONS, ListingStatusSchema } from '@apart/contracts'
  import type { ListingStatus } from '@apart/contracts'
  import { LISTING_STATUS_LABELS } from '@/lib/labels'

  const props = defineProps<{ status: ListingStatus; busy?: boolean }>()
  const emit = defineEmits<{
    change: [change: { status: ListingStatus; reason: string | null }]
  }>()

  const statuses = ListingStatusSchema.options
  const pending = ref<ListingStatus | null>(null)
  const reason = ref('')
  const error = ref<string | null>(null)

  function onSelect(event: Event): void {
    const select = event.target as HTMLSelectElement
    const next = select.value as ListingStatus
    // Lot 21 : le statut affiché reste le statut réel tant que la décision
    // n'est pas appliquée (le menu crée peut-être une proposition).
    select.value = props.status
    if (next === props.status) return
    if (next === 'discarded') {
      pending.value = next
      return
    }
    emit('change', { status: next, reason: null })
  }

  const quickReason = DISCARD_QUICK_REASONS
  function confirmDiscard(): void {
    if (!reason.value.trim()) {
      error.value = 'Écarter une annonce demande une raison.'
      return
    }
    error.value = null
    emit('change', { status: 'discarded', reason: reason.value.trim() })
    pending.value = null
    reason.value = ''
  }
</script>

<template>
  <div class="grid gap-2">
    <label class="flex items-center gap-2 text-sm">
      <span class="text-xs font-medium text-muted">Statut</span>
      <select
        class="rounded-lg border border-line bg-bg px-3 py-1.5 text-sm"
        :value="status"
        :disabled="busy"
        aria-label="Changer le statut"
        @change="onSelect"
      >
        <option v-for="s in statuses" :key="s" :value="s">
          {{ LISTING_STATUS_LABELS[s] }}
        </option>
      </select>
    </label>
    <form
      v-if="pending === 'discarded'"
      class="grid gap-2 rounded-xl border border-bad/40 bg-bad-soft p-3"
      @submit.prevent="confirmDiscard"
    >
      <label for="discard-reason" class="text-xs font-medium text-bad">
        Pourquoi écarter cette annonce ?
      </label>
      <input
        id="discard-reason"
        v-model="reason"
        class="rounded-lg border border-line bg-bg px-3 py-1.5 text-sm"
        placeholder="Trop cher, DPE G, copro en procédure…"
        list="discard-reasons-list"
      />
      <datalist id="discard-reasons-list">
        <option v-for="r in quickReason" :key="r" :value="r" />
      </datalist>
      <p v-if="error" class="text-xs text-bad" role="alert">{{ error }}</p>
      <div class="flex gap-2">
        <button
          type="submit"
          class="rounded-lg bg-bad px-3 py-1.5 text-sm font-medium text-white"
        >
          Écarter
        </button>
        <button
          type="button"
          class="rounded-lg border border-line px-3 py-1.5 text-sm"
          @click="pending = null"
        >
          Annuler
        </button>
      </div>
    </form>
  </div>
</template>
