<script setup lang="ts">
  import { computed, useId } from 'vue'
  import { cardClasses } from '@/lib/ui'
  import type { CardTone } from '@/lib/ui'

  /**
   * Lot 22 : la carte de section (une seule recette, `rounded-2xl p-4`).
   * Avec `title`, un en-tête (titre au niveau voulu, actions à droite par le
   * slot `actions`) et la section est nommée par son titre.
   */
  const props = withDefaults(
    defineProps<{
      as?: 'section' | 'article' | 'div' | 'li' | 'aside' | 'form' | undefined
      title?: string | undefined
      level?: 'h2' | 'h3' | 'h4' | undefined
      tone?: CardTone | undefined
      padding?: 'md' | 'sm' | 'none' | undefined
    }>(),
    {
      title: undefined,
      as: 'section',
      level: 'h2',
      tone: 'default',
      padding: 'md',
    }
  )
  const titleId = useId()
  const classes = computed(() => cardClasses(props.tone, props.padding))
</script>

<template>
  <component
    :is="as"
    :class="classes"
    :aria-labelledby="title && as !== 'div' ? titleId : undefined"
  >
    <header
      v-if="title || $slots.actions"
      class="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
    >
      <component
        :is="level"
        v-if="title"
        :id="titleId"
        class="text-base font-semibold"
        >{{ title }}</component
      >
      <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </component>
</template>
