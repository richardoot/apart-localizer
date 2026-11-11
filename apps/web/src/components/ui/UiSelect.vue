<script setup lang="ts" generic="T extends string | number | boolean | null">
  import { computed, useAttrs } from 'vue'
  import { controlBoxClasses } from '@/lib/ui'

  defineOptions({ inheritAttrs: false })

  /**
   * Lot 22 : la liste de choix de l'application, même case que `UiInput`
   * (44 px, 16 px). Les choix viennent de `options` ou du slot (`<option>`).
   * `class` et `style` habillent la case, le reste va au `<select>`.
   */
  const props = withDefaults(
    defineProps<{
      id?: string | undefined
      options?:
        readonly { value: T; label: string; disabled?: boolean }[] | undefined
      invalid?: boolean | undefined
      changed?: boolean | undefined
      describedBy?: string | undefined
    }>(),
    {
      id: undefined,
      options: undefined,
      describedBy: undefined,
      invalid: false,
      changed: false,
    }
  )
  const model = defineModel<T>()
  const attrs = useAttrs()
  const styleAttr = computed(() => attrs.style as string | undefined)
  const selectAttrs = computed(() => {
    const { class: _class, style: _style, ...rest } = attrs
    return rest
  })
</script>

<template>
  <select
    :id="id"
    v-model="model"
    v-bind="selectAttrs"
    :aria-describedby="describedBy"
    :aria-invalid="invalid ? 'true' : undefined"
    :class="[
      controlBoxClasses({ invalid, changed }),
      'h-11 w-full min-w-0 px-3 disabled:cursor-not-allowed disabled:opacity-60',
      attrs.class,
    ]"
    :style="styleAttr"
  >
    <slot>
      <option
        v-for="option in props.options ?? []"
        :key="String(option.value)"
        :value="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </slot>
  </select>
</template>
