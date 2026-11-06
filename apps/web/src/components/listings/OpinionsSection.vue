<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'
  import type { Member, Opinion } from '@apart/contracts'
  import { formatDate } from '@/lib/format'

  /**
   * « Nos avis » (lot 19 : dans la Synthèse, là où l'on décide) : une ligne
   * par membre actif, sa note sur 5 et son mot, « Pas encore donné » sinon.
   * Mon avis se donne ou se modifie sur place : la note (boutons 1 à 5,
   * `aria-pressed`, un second clic l'enlève) et un mot.
   */
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
  /** Les membres actifs, puis les anciens qui ont laissé un avis. */
  const rows = computed(() => {
    const active = props.members.filter(m => m.status === 'active')
    const former = props.members.filter(
      m =>
        m.status !== 'active' && props.opinions.some(o => o.memberId === m.id)
    )
    return [...active, ...former].map(member => ({
      member,
      opinion: props.opinions.find(o => o.memberId === member.id) ?? null,
      isMe: member.id === props.meId,
    }))
  })

  const editing = ref(false)
  const rating = ref(mine.value?.rating ?? 0)
  const text = ref(mine.value?.text ?? '')
  const firstStar = ref<HTMLButtonElement | null>(null)
  watch(mine, value => {
    if (editing.value) return
    rating.value = value?.rating ?? 0
    text.value = value?.text ?? ''
  })

  function start(): void {
    rating.value = mine.value?.rating ?? 0
    text.value = mine.value?.text ?? ''
    editing.value = true
    void nextTick(() => firstStar.value?.focus())
  }
  function submit(): void {
    emit('save', { rating: rating.value, text: text.value.trim() })
    editing.value = false
  }

  const button =
    'inline-flex min-h-11 items-center rounded-lg border px-3 text-sm sm:min-h-10'
</script>

<template>
  <section
    class="grid content-start gap-3 rounded-2xl border border-line bg-surface p-4 sm:px-5"
    aria-labelledby="opinions-title"
    data-testid="opinions"
  >
    <h2 id="opinions-title" class="text-base font-semibold">Nos avis</h2>
    <ul class="grid gap-2.5">
      <li
        v-for="row in rows"
        :key="row.member.id"
        class="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1"
        :data-member="row.member.id"
      >
        <strong class="truncate">{{ row.member.displayName }}</strong>
        <div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <template v-if="row.opinion">
            <span
              v-if="row.opinion.rating > 0"
              class="font-semibold text-accent tabular-nums"
              :aria-label="`${row.opinion.rating} sur 5`"
              >{{ row.opinion.rating }}/5</span
            >
            <span class="min-w-0 break-words whitespace-pre-line">{{
              row.opinion.text || 'Pas de mot.'
            }}</span>
            <span class="text-xs text-muted">{{
              formatDate(row.opinion.updatedAt)
            }}</span>
          </template>
          <span v-else class="text-muted">Pas encore donné</span>
          <button
            v-if="row.isMe && !editing"
            type="button"
            :class="[
              button,
              'border-accent bg-surface font-semibold text-accent',
            ]"
            :aria-expanded="false"
            aria-controls="my-opinion"
            data-testid="opinion-edit"
            @click="start"
          >
            {{ row.opinion ? 'Modifier mon avis' : 'Donner mon avis' }}
          </button>
        </div>
      </li>
    </ul>

    <form
      v-if="editing"
      id="my-opinion"
      class="grid gap-2 rounded-xl bg-bg p-3"
      aria-label="Mon avis"
      @submit.prevent="submit"
    >
      <fieldset class="m-0 grid gap-1.5 border-0 p-0">
        <legend class="mb-1 p-0 text-xs font-medium text-muted">
          Ma note sur 5 (un second clic l’enlève)
        </legend>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="n in 5"
            :key="n"
            :ref="
              el => {
                if (n === 1) firstStar = el as HTMLButtonElement
              }
            "
            type="button"
            class="size-11 rounded-lg border text-sm font-semibold tabular-nums"
            :class="
              rating === n
                ? 'border-accent bg-accent text-accent-fg'
                : 'border-line bg-surface text-fg hover:bg-surface-2'
            "
            :aria-pressed="rating === n"
            :aria-label="`${n} sur 5`"
            @click="rating = rating === n ? 0 : n"
          >
            {{ n }}
          </button>
        </div>
      </fieldset>
      <label for="opinion-text" class="text-xs font-medium text-muted"
        >Un mot</label
      >
      <textarea
        id="opinion-text"
        v-model="text"
        rows="2"
        class="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        placeholder="Ce qui vous plaît ou vous gêne"
      />
      <div class="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          :class="[button, 'border-line bg-surface hover:bg-surface-2']"
          @click="editing = false"
        >
          Annuler
        </button>
        <button
          type="submit"
          class="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-60 sm:min-h-10"
          :disabled="saving"
          data-testid="opinion-save"
        >
          {{ saving ? 'Enregistrement…' : 'Enregistrer mon avis' }}
        </button>
      </div>
    </form>
  </section>
</template>
