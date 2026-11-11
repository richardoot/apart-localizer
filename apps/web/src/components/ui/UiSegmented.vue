<script setup lang="ts" generic="T extends string">
  /**
   * Lot 22 : le sélecteur segmenté (un choix parmi quelques-uns : vue, type,
   * période). Des boutons à bascule groupés (`role="group"`,
   * `aria-pressed`), 44 px au toucher, le choix courant plein.
   */
  defineProps<{
    options: readonly { value: T; label: string; count?: number | null }[]
    label: string
    /** Pleine largeur, segments égaux (téléphone). */
    block?: boolean | undefined
  }>()
  const model = defineModel<T>({ required: true })
</script>

<template>
  <div
    class="inline-flex overflow-hidden rounded-[10px] border border-line bg-surface"
    :class="block ? 'flex w-full' : ''"
    role="group"
    :aria-label="label"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="inline-flex min-h-11 items-center justify-center gap-1.5 px-3 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:min-h-10 sm:pointer-coarse:min-h-11"
      :class="[
        model === option.value
          ? 'bg-accent font-semibold text-accent-fg'
          : 'text-muted hover:bg-surface-2 hover:text-fg',
        block ? 'flex-1' : '',
      ]"
      :aria-pressed="model === option.value"
      :data-value="option.value"
      @click="model = option.value"
    >
      {{ option.label }}
      <span
        v-if="option.count != null"
        class="text-xs tabular-nums"
        :class="model === option.value ? '' : 'text-muted'"
        >{{ option.count }}</span
      >
    </button>
  </div>
</template>
