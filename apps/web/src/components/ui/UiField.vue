<script setup lang="ts">
  import { computed, useAttrs, useSlots } from 'vue'
  import type { Provenance } from '@apart/contracts'
  import type { FieldChange } from '@/lib/assumptions-form'
  import ProvenanceBadge from '@/components/listings/ProvenanceBadge.vue'
  import ChangeNote from './ChangeNote.vue'
  import DefinitionButton from './DefinitionButton.vue'
  import UiBadge from './UiBadge.vue'
  import UiInput from './UiInput.vue'
  import UiSelect from './UiSelect.vue'
  import UiTextarea from './UiTextarea.vue'

  defineOptions({ inheritAttrs: false })

  /**
   * Lot 22 : un champ de formulaire, le `UnitField` des Hypothèses (lot 13)
   * généralisé à toute l'application. Intitulé relié, bouton « ? »
   * facultatif, pastille de provenance (IA, annonce, toi, open data),
   * « à compléter » (extraction) et « modifié » (autre membre), case de
   * 44 px à 16 px avec son unité, aide, erreur au champ (`aria-invalid`,
   * `aria-describedby`) et « modifié · avant … ».
   *
   * Sans slot, le champ dessine sa case (`as` : input, select, textarea) et
   * relaie `v-model` ; `class` et `style` habillent le bloc, tout autre
   * attribut va au contrôle. Avec le slot par défaut, la case est fournie
   * par l'appelant, qui reçoit `{ id, describedBy, invalid }`.
   */
  const props = withDefaults(
    defineProps<{
      id: string
      label: string
      /** Intitulé lu par les lecteurs d'écran seulement. */
      srLabel?: boolean | undefined
      as?: 'input' | 'select' | 'textarea' | undefined
      unit?: string | undefined
      hint?: string | null | undefined
      error?: string | null | undefined
      /** Clé du glossaire (`apart://glossaire`) pour le bouton « ? ». */
      term?: string | undefined
      change?: FieldChange | null | undefined
      /** Intitulé discret (détail d'un barème). */
      quiet?: boolean | undefined
      provenance?: Provenance | null | undefined
      /** Champ indispensable non trouvé par l'extraction : mis en évidence. */
      missing?: boolean | undefined
      /** Modifié par l'autre membre (ou Claude) depuis ta dernière ouverture. */
      changed?: boolean | undefined
      /** Sur deux colonnes d'une grille `sm:grid-cols-2`. */
      full?: boolean | undefined
      align?: 'left' | 'right' | undefined
      options?:
        | readonly {
            value: string | number | boolean | null
            label: string
            disabled?: boolean
          }[]
        | undefined
      rows?: number | string | undefined
    }>(),
    {
      unit: undefined,
      hint: undefined,
      error: undefined,
      term: undefined,
      align: undefined,
      options: undefined,
      rows: undefined,
      srLabel: false,
      as: 'input',
      change: null,
      quiet: false,
      provenance: null,
      missing: false,
      changed: false,
      full: false,
    }
  )
  // `v-model.number` / `.trim` passent à la case (`UiInput`).
  const [model, modifiers] = defineModel<
    string | number | boolean | null | undefined
  >()
  function setModel(value: unknown): void {
    model.value = value as typeof model.value
  }
  const attrs = useAttrs()
  const slots = useSlots()
  const blockAttrs = computed(() => ({
    class: attrs.class,
    style: attrs.style,
  }))
  const controlAttrs = computed(() => {
    const { class: _class, style: _style, ...rest } = attrs
    return rest
  })

  const describedBy = computed(
    () =>
      [
        props.error ? `${props.id}-error` : null,
        props.change ? `${props.id}-change` : null,
        props.hint ? `${props.id}-hint` : null,
      ]
        .filter(Boolean)
        .join(' ') || undefined
  )
  const invalid = computed(() => !!props.error)
</script>

<template>
  <div
    v-bind="blockAttrs"
    class="grid min-w-0 content-start gap-1.5"
    :class="[
      full ? 'sm:col-span-2' : '',
      missing ? '-m-1.5 rounded-lg bg-warn-soft/60 p-1.5' : '',
      changed && !missing
        ? '-m-1.5 rounded-lg bg-accent-soft/60 p-1.5 ring-1 ring-accent'
        : '',
    ]"
    :data-field="id"
    :data-changed="change || changed ? 'true' : undefined"
    :data-missing="missing ? 'true' : undefined"
  >
    <div
      class="flex min-h-6 flex-wrap items-center gap-1.5"
      :class="srLabel ? 'sr-only' : ''"
    >
      <label
        :for="id"
        class="text-sm"
        :class="quiet ? 'text-fg' : 'font-semibold'"
        >{{ label }}</label
      >
      <DefinitionButton v-if="term" :term="term" />
      <ProvenanceBadge :provenance="provenance" />
      <UiBadge
        v-if="missing"
        tone="warn"
        variant="solid"
        title="Pas trouvé dans l'annonce : à compléter, sinon une tâche sera créée"
        >à compléter</UiBadge
      >
      <UiBadge
        v-if="changed"
        tone="accent"
        variant="solid"
        title="Modifié depuis ta dernière ouverture de la fiche"
        >modifié</UiBadge
      >
    </div>
    <slot
      v-if="slots.default"
      :id="id"
      :described-by="describedBy"
      :invalid="invalid"
    />
    <UiSelect
      v-else-if="as === 'select'"
      :id="id"
      :model-value="model as never"
      v-bind="controlAttrs"
      :options="options as never"
      :invalid="invalid"
      :changed="!!change"
      :described-by="describedBy"
      @update:model-value="setModel"
    />
    <UiTextarea
      v-else-if="as === 'textarea'"
      :id="id"
      :model-value="model as never"
      v-bind="controlAttrs"
      :rows="rows"
      :invalid="invalid"
      :changed="!!change"
      :described-by="describedBy"
      @update:model-value="setModel"
    />
    <UiInput
      v-else
      :id="id"
      :model-value="model as never"
      :model-modifiers="modifiers"
      v-bind="controlAttrs"
      :unit="unit"
      :align="align"
      :invalid="invalid"
      :changed="!!change"
      :described-by="describedBy"
      @update:model-value="setModel"
    />
    <p
      v-if="error"
      :id="`${id}-error`"
      class="text-sm font-medium text-bad"
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
