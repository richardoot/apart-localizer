<script setup lang="ts">
  import { ref } from 'vue'
  import { DISCARD_QUICK_REASONS, ListingStatusSchema } from '@apart/contracts'
  import type { ListingStatus } from '@apart/contracts'
  import { LISTING_STATUS_LABELS } from '@/lib/labels'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiField from '@/components/ui/UiField.vue'
  import UiSelect from '@/components/ui/UiSelect.vue'

  const props = defineProps<{
    status: ListingStatus
    busy?: boolean
    /** Lot 22 : le refus du dernier changement, dit sous le menu. */
    error?: string | null
  }>()
  const emit = defineEmits<{
    change: [change: { status: ListingStatus; reason: string | null }]
  }>()

  const statuses = ListingStatusSchema.options
  const pending = ref<ListingStatus | null>(null)
  const reason = ref('')
  const reasonError = ref<string | null>(null)

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
      reasonError.value = 'Écarter une annonce demande une raison.'
      document.getElementById('discard-reason')?.focus()
      return
    }
    reasonError.value = null
    emit('change', { status: 'discarded', reason: reason.value.trim() })
    pending.value = null
    reason.value = ''
  }
</script>

<template>
  <div class="grid gap-2">
    <label class="flex items-center gap-2 text-sm">
      <span class="text-sm font-medium text-muted">Statut</span>
      <UiSelect
        class="w-auto"
        :model-value="status"
        :disabled="busy"
        aria-label="Changer le statut"
        @change="onSelect"
      >
        <option v-for="s in statuses" :key="s" :value="s">
          {{ LISTING_STATUS_LABELS[s] }}
        </option>
      </UiSelect>
    </label>
    <UiAlert v-if="error" data-testid="status-error">{{ error }}</UiAlert>
    <form
      v-if="pending === 'discarded'"
      class="grid gap-2 rounded-2xl border border-bad/40 bg-bad-soft p-3"
      novalidate
      @submit.prevent="confirmDiscard"
    >
      <UiField
        id="discard-reason"
        v-model="reason"
        label="Pourquoi écarter cette annonce ?"
        placeholder="Trop cher, DPE G, copro en procédure…"
        list="discard-reasons-list"
        :error="reasonError"
      />
      <datalist id="discard-reasons-list">
        <option v-for="r in quickReason" :key="r" :value="r" />
      </datalist>
      <div class="flex flex-wrap gap-2">
        <UiButton type="submit" variant="danger">Écarter</UiButton>
        <UiButton @click="pending = null">Annuler</UiButton>
      </div>
    </form>
  </div>
</template>
