<script setup lang="ts">
  import { nextTick, ref } from 'vue'
  import { DECISION_REASON_MAX, DISCARD_QUICK_REASONS } from '@apart/contracts'

  /**
   * Lot 21 (ADR 0031) : écarter demande une raison, en un clic parmi les
   * raisons courantes, ou un texte libre (« Autre »).
   */
  withDefaults(defineProps<{ title?: string; busy?: boolean }>(), {
    title: 'Pourquoi l’écarter ?',
    busy: false,
  })
  const emit = defineEmits<{ pick: [reason: string]; cancel: [] }>()

  const other = ref(false)
  const text = ref('')
  const input = ref<HTMLInputElement | null>(null)

  function askOther(): void {
    other.value = true
    void nextTick(() => input.value?.focus())
  }

  function submit(): void {
    const reason = text.value.trim()
    if (reason) emit('pick', reason)
  }
</script>

<template>
  <div class="grid gap-2.5" data-testid="discard-reasons">
    <strong id="discard-reasons-title">{{ title }}</strong>
    <div
      class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
      role="group"
      aria-labelledby="discard-reasons-title"
    >
      <button
        v-for="reason in DISCARD_QUICK_REASONS"
        :key="reason"
        type="button"
        class="min-h-12 rounded-xl border border-line bg-surface px-3.5 text-fg hover:border-accent disabled:opacity-60 sm:min-h-11 sm:rounded-full"
        :disabled="busy"
        data-action="reason"
        @click="emit('pick', reason)"
      >
        {{ reason }}
      </button>
      <button
        type="button"
        class="min-h-12 rounded-xl border border-line bg-surface px-3.5 text-fg hover:border-accent sm:min-h-11 sm:rounded-full"
        :aria-pressed="other"
        data-action="reason-other"
        @click="askOther"
      >
        Autre
      </button>
    </div>
    <form
      v-if="other"
      class="flex flex-wrap items-end gap-2"
      @submit.prevent="submit"
    >
      <label class="grid min-w-0 flex-[1_1_16rem] gap-1 text-sm">
        Ta raison
        <input
          ref="input"
          v-model="text"
          type="text"
          :maxlength="DECISION_REASON_MAX"
          class="min-h-11 rounded-lg border border-line bg-bg px-3"
          data-testid="reason-text"
        />
      </label>
      <button
        type="submit"
        class="min-h-11 rounded-[10px] bg-accent px-4 font-semibold text-accent-fg disabled:opacity-60"
        :disabled="busy || !text.trim()"
        data-action="reason-submit"
      >
        Écarter
      </button>
    </form>
    <button
      type="button"
      class="min-h-11 w-fit bg-transparent px-1 text-accent"
      data-action="reason-cancel"
      @click="emit('cancel')"
    >
      Revenir
    </button>
  </div>
</template>
