<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import type { Member, Opinion } from '@apart/contracts'
  import { formatDate } from '@/lib/format'

  const props = defineProps<{
    opinions: Opinion[]
    members: Member[]
    meId: string | null
    saving?: boolean
  }>()
  const emit = defineEmits<{
    save: [input: { rating: number; text: string }]
  }>()

  const mine = computed(
    () => props.opinions.find(o => o.memberId === props.meId) ?? null
  )
  const others = computed(() =>
    props.opinions.filter(o => o.memberId !== props.meId)
  )
  const rating = ref(mine.value?.rating ?? 0)
  const text = ref(mine.value?.text ?? '')
  watch(mine, value => {
    rating.value = value?.rating ?? 0
    text.value = value?.text ?? ''
  })

  const nameOf = (id: string): string =>
    props.members.find(m => m.id === id)?.displayName ?? 'Membre'

  const average = computed(() => {
    const rated = props.opinions.filter(o => o.rating > 0)
    return rated.length
      ? rated.reduce((s, o) => s + o.rating, 0) / rated.length
      : null
  })

  function stars(value: number): string {
    return '★'.repeat(value) + '☆'.repeat(5 - value)
  }
</script>

<template>
  <section class="grid gap-3" aria-labelledby="opinions-title">
    <header class="flex items-center justify-between gap-2">
      <h3 id="opinions-title" class="font-display text-base font-semibold">
        Nos avis
      </h3>
      <span v-if="average !== null" class="text-xs text-muted">
        moyenne
        {{ average.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) }}/5
      </span>
    </header>
    <div class="grid gap-3 sm:grid-cols-2">
      <form
        class="grid gap-2 rounded-xl border border-line p-3"
        @submit.prevent="emit('save', { rating, text })"
      >
        <span class="text-xs font-medium text-muted">Mon avis</span>
        <div class="flex gap-1" role="radiogroup" aria-label="Ma note sur 5">
          <button
            v-for="n in 5"
            :key="n"
            type="button"
            role="radio"
            class="text-xl leading-none"
            :class="n <= rating ? 'text-warn' : 'text-line hover:text-muted'"
            :aria-checked="rating === n"
            :aria-label="`${n} sur 5`"
            @click="rating = rating === n ? 0 : n"
          >
            ★
          </button>
        </div>
        <textarea
          v-model="text"
          rows="3"
          class="rounded-lg border border-line bg-bg px-3 py-1.5 text-sm"
          placeholder="Ce que j'en pense…"
          aria-label="Mon avis"
        />
        <button
          type="submit"
          class="justify-self-start rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-60"
          :disabled="saving"
        >
          {{ saving ? 'Enregistrement…' : 'Enregistrer mon avis' }}
        </button>
      </form>
      <div
        v-for="opinion in others"
        :key="opinion.id"
        class="grid gap-1 rounded-xl border border-line p-3"
      >
        <span class="text-xs font-medium text-muted">{{
          nameOf(opinion.memberId)
        }}</span>
        <span
          v-if="opinion.rating > 0"
          class="text-warn"
          :aria-label="`${opinion.rating} sur 5`"
          >{{ stars(opinion.rating) }}</span
        >
        <p class="text-sm whitespace-pre-line">
          {{ opinion.text || 'Pas encore de texte.' }}
        </p>
        <span class="text-xs text-muted">{{
          formatDate(opinion.updatedAt)
        }}</span>
      </div>
      <p v-if="others.length === 0" class="self-center text-sm text-muted">
        Pas encore d'avis de l'autre membre.
      </p>
    </div>
  </section>
</template>
