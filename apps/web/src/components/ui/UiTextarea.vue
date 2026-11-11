<script setup lang="ts">
  import { computed, useAttrs } from 'vue'
  import { controlBoxClasses, controlFocusClasses } from '@/lib/ui'

  defineOptions({ inheritAttrs: false })

  /** Lot 22 : la zone de texte de l'application, même habit que `UiInput` (16 px). */
  withDefaults(
    defineProps<{
      id?: string | undefined
      rows?: number | string | undefined
      invalid?: boolean | undefined
      changed?: boolean | undefined
      describedBy?: string | undefined
    }>(),
    {
      id: undefined,
      describedBy: undefined,
      rows: 3,
      invalid: false,
      changed: false,
    }
  )
  const model = defineModel<string | null | undefined>()
  const attrs = useAttrs()
  const styleAttr = computed(() => attrs.style as string | undefined)
  const textareaAttrs = computed(() => {
    const { class: _class, style: _style, ...rest } = attrs
    return rest
  })
</script>

<template>
  <textarea
    :id="id"
    v-model="model"
    v-bind="textareaAttrs"
    :rows="rows"
    :aria-describedby="describedBy"
    :aria-invalid="invalid ? 'true' : undefined"
    :class="[
      controlBoxClasses({ invalid, changed }),
      'block w-full min-w-0 px-3 py-2.5 leading-snug placeholder:text-muted',
      controlFocusClasses(invalid, 'visible'),
      attrs.class,
    ]"
    :style="styleAttr"
  />
</template>
