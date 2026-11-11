<script setup lang="ts">
  import { computed, useAttrs } from 'vue'

  defineOptions({ inheritAttrs: false })

  /**
   * Lot 22 : une case à cocher et son libellé, sur une ligne de 44 px au
   * toucher (toute la ligne est cliquable). `class` et `style` habillent la
   * ligne, le reste va à la case (`data-testid`, `aria-*`, `disabled`,
   * `value` pour un modèle en tableau). `type="radio"` en fait un bouton
   * radio, avec `value` et un modèle simple.
   */
  const props = withDefaults(
    defineProps<{
      id?: string | undefined
      label?: string | undefined
      hint?: string | undefined
      type?: 'checkbox' | 'radio' | undefined
    }>(),
    { id: undefined, label: undefined, hint: undefined, type: 'checkbox' }
  )
  const model = defineModel<boolean | string | null | unknown[]>()
  const attrs = useAttrs()
  const rowAttrs = computed(() => ({ class: attrs.class, style: attrs.style }))
  const boxAttrs = computed(() => {
    const { class: _class, style: _style, ...rest } = attrs
    return rest
  })
  const hintId = computed(() =>
    props.hint && props.id ? `${props.id}-hint` : undefined
  )
</script>

<template>
  <label
    v-bind="rowAttrs"
    class="flex min-h-11 cursor-pointer items-start gap-2.5 py-2.5 text-sm sm:min-h-9 sm:py-1.5 sm:pointer-coarse:min-h-11 sm:pointer-coarse:py-2.5"
  >
    <input
      :id="id"
      v-model="model"
      v-bind="boxAttrs"
      :type="type"
      :aria-describedby="hintId"
      class="mt-0.5 size-5 shrink-0 accent-[var(--accent)] disabled:cursor-not-allowed"
    />
    <span class="grid min-w-0 gap-0.5">
      <span
        ><slot>{{ label }}</slot></span
      >
      <span v-if="hint" :id="hintId" class="text-xs text-muted">{{
        hint
      }}</span>
    </span>
  </label>
</template>
