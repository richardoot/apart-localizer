<script setup lang="ts">
  import { ref } from 'vue'
  import type { PriceEvent } from '@apart/contracts'
  import { formatDate, formatEuros, parseNumberInput } from '@/lib/format'

  const props = defineProps<{ events: PriceEvent[]; currentPrice: number }>()
  const emit = defineEmits<{ record: [newPrice: number] }>()

  const newPrice = ref('')
  const error = ref<string | null>(null)

  function submit(): void {
    const value = parseNumberInput(newPrice.value)
    if (value === null || value < 0) {
      error.value = 'Saisissez le nouveau prix en euros.'
      return
    }
    if (value === props.currentPrice) {
      error.value = 'Le prix est déjà celui-là.'
      return
    }
    error.value = null
    emit('record', value)
    newPrice.value = ''
  }

  function delta(event: PriceEvent): string {
    if (event.oldPrice === null) return 'premier prix'
    const diff = event.newPrice - event.oldPrice
    const pct = event.oldPrice > 0 ? (diff / event.oldPrice) * 100 : 0
    const sign = diff > 0 ? '+' : ''
    return `${sign}${formatEuros(diff)} (${sign}${pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %)`
  }
</script>

<template>
  <section class="grid gap-2" aria-labelledby="prices-title">
    <h3 id="prices-title" class="font-display text-base font-semibold">
      Historique des prix
    </h3>
    <ul class="grid gap-1 text-sm">
      <li
        v-for="event in events"
        :key="event.id"
        class="flex flex-wrap items-baseline justify-between gap-2"
      >
        <span class="font-mono">{{ formatEuros(event.newPrice) }}</span>
        <span class="text-xs text-muted">
          {{ formatDate(event.occurredAt) }} · {{ delta(event) }}
        </span>
      </li>
    </ul>
    <form class="flex flex-wrap gap-2" @submit.prevent="submit">
      <input
        v-model="newPrice"
        class="flex-1 rounded-lg border border-line bg-bg px-3 py-1.5 text-sm"
        inputmode="numeric"
        placeholder="Nouveau prix constaté (€)"
        aria-label="Nouveau prix constaté"
      />
      <button
        type="submit"
        class="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2"
      >
        Enregistrer la baisse ou la hausse
      </button>
      <p v-if="error" class="w-full text-xs text-bad" role="alert">
        {{ error }}
      </p>
    </form>
  </section>
</template>
