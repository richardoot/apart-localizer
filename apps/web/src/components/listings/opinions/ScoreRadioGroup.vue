<script setup lang="ts">
  import { computed, nextTick, ref } from 'vue'
  import type { ScoreChoice } from '@/lib/opinions'
  import { scoreToneClass } from '@/lib/opinions'

  /**
   * Lot 20 : un choix de note en `radiogroup` accessible. Une seule note
   * cochée (`aria-checked`) ; au clavier, les flèches passent d'un choix à
   * l'autre et le cochent (tabindex itinérant : seul le choix coché est dans
   * l'ordre de tabulation), Début et Fin vont aux bords, Espace et Entrée
   * cochent. `compact` : les chiffres seuls, en grille (téléphone) ; le mot
   * reste dans le nom accessible. `clearable` : un second clic sur le choix
   * coché l'enlève (note globale : 0 = pas de note).
   */
  const props = withDefaults(
    defineProps<{
      choices: readonly ScoreChoice[]
      /** La note cochée ; null = « — » (ou rien pour la note globale). */
      modelValue: number | null
      /** L'identifiant du libellé du groupe. */
      labelledby: string
      variant?: 'score' | 'global'
      compact?: boolean
      clearable?: boolean
      disabled?: boolean
    }>(),
    { variant: 'score', compact: false, clearable: false, disabled: false }
  )
  const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()

  const buttons = ref<HTMLButtonElement[]>([])
  const checkedIndex = computed(() =>
    props.choices.findIndex(c => c.value === props.modelValue)
  )
  /** Le choix qui reçoit la tabulation : le coché, sinon le premier. */
  const tabIndexOf = (index: number): number =>
    index === (checkedIndex.value < 0 ? 0 : checkedIndex.value) ? 0 : -1

  function pick(choice: ScoreChoice): void {
    if (props.disabled) return
    if (props.clearable && choice.value === props.modelValue) {
      emit('update:modelValue', null)
      return
    }
    emit('update:modelValue', choice.value)
  }

  function move(index: number, event: KeyboardEvent): void {
    const last = props.choices.length - 1
    const target =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (target === null) return
    event.preventDefault()
    const choice = props.choices[target]
    if (!choice || props.disabled) return
    emit('update:modelValue', choice.value)
    void nextTick(() => buttons.value[target]?.focus())
  }

  function classes(choice: ScoreChoice): string {
    const on = choice.value === props.modelValue
    if (props.variant === 'global') {
      return on
        ? 'border-accent bg-accent text-accent-fg'
        : 'border-line bg-surface text-fg hover:bg-surface-2'
    }
    if (!on) return 'border-line bg-surface text-fg hover:bg-surface-2'
    return choice.value === null
      ? 'border-accent bg-surface-2 text-fg'
      : `border-accent ${scoreToneClass(choice.value).replace('border border-line ', '')}`
  }
</script>

<template>
  <div
    role="radiogroup"
    :aria-labelledby="labelledby"
    :aria-disabled="disabled || undefined"
    :class="
      compact
        ? variant === 'global'
          ? 'grid grid-cols-5 gap-1.5'
          : 'grid grid-cols-6 gap-1.5'
        : 'flex flex-wrap gap-1.5'
    "
  >
    <!-- Lot 22 : un bouton radio (role="radio", flèches), pas un UiButton. -->
    <button
      v-for="(choice, index) in choices"
      :key="choice.num"
      :ref="
        el => {
          if (el) buttons[index] = el as HTMLButtonElement
        }
      "
      type="button"
      role="radio"
      :aria-checked="choice.value === modelValue"
      :aria-label="choice.aria"
      :tabindex="tabIndexOf(index)"
      :disabled="disabled"
      :data-value="choice.value ?? 'none'"
      class="rounded-xl border-[1.5px] font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      :class="[
        classes(choice),
        compact || variant === 'global'
          ? 'h-12 text-lg font-bold'
          : 'inline-flex min-h-11 min-w-11 flex-col items-center justify-center px-2.5 text-sm leading-tight',
        !compact && variant === 'global' ? 'w-12' : '',
      ]"
      @click="pick(choice)"
      @keydown="move(index, $event)"
    >
      <span>{{ choice.num }}</span>
      <span
        v-if="!compact && variant === 'score'"
        class="text-xs font-medium"
        aria-hidden="true"
        >{{ choice.word }}</span
      >
    </button>
  </div>
</template>
