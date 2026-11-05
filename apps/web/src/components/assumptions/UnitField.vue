<script setup lang="ts">
  import { computed } from 'vue'
  import type { FieldChange } from '@/lib/assumptions-form'
  import DefinitionButton from '@/components/ui/DefinitionButton.vue'
  import ChangeNote from './ChangeNote.vue'

  /**
   * Un champ de la page Hypothèses (lot 13) : intitulé relié, bouton « ? »
   * facultatif, unité à droite dans la case, chiffres alignés à droite, case
   * haute de 44 px, explication courte, erreur et « modifié · avant … ».
   * L'unité, l'erreur, la modification et l'explication décrivent le champ
   * (`aria-describedby`).
   */
  const props = defineProps<{
    id: string
    label: string
    unit?: string
    inputmode?: 'numeric' | 'decimal'
    type?: 'text' | 'date'
    hint?: string
    placeholder?: string
    /** Clé du glossaire (`apart://glossaire`) pour le bouton « ? ». */
    term?: string
    change?: FieldChange | null
    error?: string | null
    /** Intitulé discret (détail du barème). */
    quiet?: boolean
    /** Texte libre : aligné à gauche, comme une date. */
    align?: 'left' | 'right'
  }>()
  const model = defineModel<string>({ required: true })

  const describedBy = computed(
    () =>
      [
        props.unit ? `${props.id}-unit` : null,
        props.error ? `${props.id}-error` : null,
        props.change ? `${props.id}-change` : null,
        props.hint ? `${props.id}-hint` : null,
      ]
        .filter(Boolean)
        .join(' ') || undefined
  )
  const alignLeft = computed(
    () => props.type === 'date' || props.align === 'left'
  )
</script>

<template>
  <div
    class="grid min-w-0 content-start gap-1.5"
    :data-field="id"
    :data-changed="change ? 'true' : undefined"
  >
    <div class="flex min-h-6 items-center gap-1.5">
      <label
        :for="id"
        class="text-sm"
        :class="quiet ? 'text-fg' : 'font-semibold'"
        >{{ label }}</label
      >
      <DefinitionButton v-if="term" :term="term" />
    </div>
    <div
      class="flex h-12 min-w-0 items-center rounded-lg bg-surface px-3 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent lg:h-11"
      :class="
        change
          ? 'border border-accent ring-1 ring-accent'
          : error
            ? 'border border-bad ring-1 ring-bad'
            : 'border border-muted/70'
      "
    >
      <input
        :id="id"
        v-model="model"
        :type="type ?? 'text'"
        :inputmode="inputmode"
        :placeholder="placeholder"
        :aria-describedby="describedBy"
        :aria-invalid="error ? 'true' : undefined"
        autocomplete="off"
        class="h-full w-full min-w-0 flex-1 bg-transparent text-base tabular-nums outline-none placeholder:text-muted"
        :class="alignLeft ? 'text-left' : 'text-right'"
      />
      <span
        v-if="unit"
        :id="`${id}-unit`"
        class="ml-1.5 shrink-0 text-sm text-muted"
        >{{ unit }}</span
      >
    </div>
    <p
      v-if="error"
      :id="`${id}-error`"
      class="text-xs font-medium text-bad"
      data-testid="field-error"
    >
      {{ error }}
    </p>
    <ChangeNote :id="`${id}-change`" :change="change ?? null" />
    <p v-if="hint" :id="`${id}-hint`" class="text-xs text-muted">
      {{ hint }}
    </p>
  </div>
</template>
