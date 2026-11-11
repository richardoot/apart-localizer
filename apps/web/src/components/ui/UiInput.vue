<script setup lang="ts">
  import { computed, useAttrs } from 'vue'
  import { controlBoxClasses, controlFocusClasses } from '@/lib/ui'

  defineOptions({ inheritAttrs: false })

  /**
   * Lot 22 : la case de saisie de l'application (le `UnitField` des
   * Hypothèses généralisé) : 44 px de haut, texte à 16 px (pas de zoom
   * d'iOS au focus), unité à droite dans la case, chiffres à droite pour un
   * nombre. `class` et `style` habillent la case ; tout autre attribut
   * (`type`, `inputmode`, `placeholder`, `data-testid`, `aria-*`…) va au
   * champ. Le modèle reste une chaîne : un nombre se lit et se refuse par
   * `readNumberInput` (lib/format.ts), jamais en silence.
   */
  const props = withDefaults(
    defineProps<{
      id?: string | undefined
      unit?: string | undefined
      invalid?: boolean | undefined
      changed?: boolean | undefined
      /** Aligné à droite pour un nombre (par défaut quand `inputmode` est numérique ou qu'il y a une unité). */
      align?: 'left' | 'right' | undefined
      describedBy?: string | undefined
    }>(),
    {
      id: undefined,
      unit: undefined,
      align: undefined,
      describedBy: undefined,
      invalid: false,
      changed: false,
    }
  )
  const [model, modifiers] = defineModel<string | number | null | undefined>({
    set(value) {
      if (modifiers.number && typeof value === 'string') {
        const parsed = Number.parseFloat(value)
        return Number.isNaN(parsed) ? value : parsed
      }
      if (modifiers.trim && typeof value === 'string') return value.trim()
      return value
    },
  })
  const attrs = useAttrs()
  const boxAttrs = computed(() => ({
    class: attrs.class,
    style: attrs.style,
  }))
  const inputAttrs = computed(() => {
    const { class: _class, style: _style, ...rest } = attrs
    return rest
  })
  const numeric = computed(
    () =>
      attrs.inputmode === 'decimal' ||
      attrs.inputmode === 'numeric' ||
      attrs.type === 'number'
  )
  const alignRight = computed(() =>
    props.align ? props.align === 'right' : numeric.value || !!props.unit
  )
  const describedBy = computed(
    () =>
      [props.describedBy, props.unit && props.id ? `${props.id}-unit` : null]
        .filter(Boolean)
        .join(' ') || undefined
  )
</script>

<template>
  <div
    v-bind="boxAttrs"
    class="flex h-11 min-w-0 items-center px-3"
    :class="[
      controlBoxClasses({
        invalid,
        changed,
        disabled: inputAttrs.disabled === true || inputAttrs.disabled === '',
      }),
      controlFocusClasses(invalid),
    ]"
  >
    <input
      :id="id"
      v-model="model"
      v-bind="inputAttrs"
      :aria-describedby="describedBy"
      :aria-invalid="invalid ? 'true' : undefined"
      class="h-full w-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted disabled:cursor-not-allowed"
      :class="alignRight ? 'text-right tabular-nums' : 'text-left'"
    />
    <span
      v-if="unit"
      :id="id ? `${id}-unit` : undefined"
      class="ml-1.5 shrink-0 text-sm text-muted"
      >{{ unit }}</span
    >
  </div>
</template>
