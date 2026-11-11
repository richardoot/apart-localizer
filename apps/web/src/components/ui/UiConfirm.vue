<script setup lang="ts">
  import { nextTick, ref, useId } from 'vue'
  import type { ButtonSize, ButtonVariant } from '@/lib/ui'
  import type { IconName } from '@/lib/icons'
  import UiButton from './UiButton.vue'

  defineOptions({ inheritAttrs: false })

  /**
   * Lot 22 : la confirmation sur place d'une action qu'on ne rattrape pas
   * (supprimer, retirer, détacher), à la place de `window.confirm`. Le
   * bouton laisse la place, au même endroit, à la question, « Annuler » et
   * le bouton qui confirme ; le focus va sur « Annuler », Échap annule, et le
   * focus revient au bouton de départ. Les attributs (`data-testid`…) vont
   * au bouton de départ, `confirmAttrs` à celui qui confirme.
   */
  withDefaults(
    defineProps<{
      label: string
      question: string
      confirmLabel?: string | undefined
      cancelLabel?: string | undefined
      variant?: ButtonVariant | undefined
      size?: ButtonSize | undefined
      icon?: IconName | undefined
      busy?: boolean | undefined
      disabled?: boolean | undefined
      confirmAttrs?: Record<string, string> | undefined
    }>(),
    {
      confirmLabel: undefined,
      icon: undefined,
      cancelLabel: 'Annuler',
      variant: 'danger-soft',
      size: 'sm',
      busy: false,
      disabled: false,
      confirmAttrs: () => ({}),
    }
  )
  const emit = defineEmits<{ confirm: [] }>()
  const open = defineModel<boolean>('open', { default: false })
  const questionId = useId()
  const root = ref<HTMLElement | null>(null)

  async function ask(): Promise<void> {
    open.value = true
    await nextTick()
    root.value?.querySelector<HTMLElement>('[data-confirm-cancel]')?.focus()
  }
  async function cancel(): Promise<void> {
    open.value = false
    await nextTick()
    root.value?.querySelector<HTMLElement>('[data-confirm-trigger]')?.focus()
  }
  function confirm(): void {
    emit('confirm')
  }
  defineExpose({ cancel })
</script>

<template>
  <span ref="root" class="contents">
    <UiButton
      v-if="!open"
      v-bind="$attrs"
      :variant="variant"
      :size="size"
      :icon="icon"
      :disabled="disabled"
      data-confirm-trigger
      @click="ask"
      >{{ label }}</UiButton
    >
    <span
      v-else
      role="group"
      :aria-labelledby="questionId"
      class="inline-flex flex-wrap items-center gap-2"
      @keydown.escape.stop.prevent="cancel"
    >
      <span :id="questionId" class="text-sm font-medium">{{ question }}</span>
      <UiButton size="sm" data-confirm-cancel @click="cancel">{{
        cancelLabel
      }}</UiButton>
      <UiButton
        v-bind="confirmAttrs"
        variant="danger"
        size="sm"
        :loading="busy"
        @click="confirm"
        >{{ confirmLabel ?? label }}</UiButton
      >
    </span>
  </span>
</template>
