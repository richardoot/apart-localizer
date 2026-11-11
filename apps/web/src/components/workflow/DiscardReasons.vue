<script setup lang="ts">
  import { nextTick, ref } from 'vue'
  import { DECISION_REASON_MAX, DISCARD_QUICK_REASONS } from '@apart/contracts'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiChip from '@/components/ui/UiChip.vue'
  import UiField from '@/components/ui/UiField.vue'

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
  function askOther(): void {
    other.value = true
    void nextTick(() => document.getElementById('discard-reason-text')?.focus())
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
      <UiChip
        v-for="reason in DISCARD_QUICK_REASONS"
        :key="reason"
        :toggle="false"
        class="justify-center sm:justify-start"
        :disabled="busy"
        data-action="reason"
        @click="emit('pick', reason)"
      >
        {{ reason }}
      </UiChip>
      <UiChip
        :selected="other"
        class="justify-center sm:justify-start"
        data-action="reason-other"
        @click="askOther"
      >
        Autre
      </UiChip>
    </div>
    <form
      v-if="other"
      class="flex flex-wrap items-end gap-2"
      @submit.prevent="submit"
    >
      <UiField
        id="discard-reason-text"
        v-model="text"
        class="flex-[1_1_16rem]"
        label="Ta raison"
        :maxlength="DECISION_REASON_MAX"
        align="left"
        data-testid="reason-text"
      />
      <UiButton
        type="submit"
        variant="primary"
        :disabled="busy || !text.trim()"
        data-action="reason-submit"
      >
        Écarter
      </UiButton>
    </form>
    <UiButton
      variant="link"
      class="w-fit no-underline"
      data-action="reason-cancel"
      @click="emit('cancel')"
    >
      Revenir
    </UiButton>
  </div>
</template>
