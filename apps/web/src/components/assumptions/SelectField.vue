<script setup lang="ts">
  import { computed } from 'vue'
  import type { FieldChange } from '@/lib/assumptions-form'
  import DefinitionButton from '@/components/ui/DefinitionButton.vue'
  import ChangeNote from './ChangeNote.vue'

  /** Une liste de choix de la page Hypothèses (lot 13), même habit que `UnitField`. */
  const props = defineProps<{
    id: string
    label: string
    options: readonly { value: string; label: string }[]
    hint?: string
    term?: string
    change?: FieldChange | null
  }>()
  const model = defineModel<string>({ required: true })

  const describedBy = computed(
    () =>
      [
        props.change ? `${props.id}-change` : null,
        props.hint ? `${props.id}-hint` : null,
      ]
        .filter(Boolean)
        .join(' ') || undefined
  )
</script>

<template>
  <div
    class="grid content-start gap-1.5"
    :data-field="id"
    :data-changed="change ? 'true' : undefined"
  >
    <div class="flex min-h-6 items-center gap-1.5">
      <label :for="id" class="text-sm font-semibold">{{ label }}</label>
      <DefinitionButton v-if="term" :term="term" />
    </div>
    <select
      :id="id"
      v-model="model"
      :aria-describedby="describedBy"
      class="h-12 w-full min-w-0 rounded-lg bg-surface px-3 text-base lg:h-11 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      :class="
        change
          ? 'border border-accent ring-1 ring-accent'
          : 'border border-muted/70'
      "
    >
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
    <ChangeNote :id="`${id}-change`" :change="change ?? null" />
    <p v-if="hint" :id="`${id}-hint`" class="text-xs text-muted">
      {{ hint }}
    </p>
  </div>
</template>
