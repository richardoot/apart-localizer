<script setup lang="ts">
  import { ref, watch } from 'vue'
  import UiButton from '@/components/ui/UiButton.vue'

  /**
   * Lot 21 (ADR 0031) : les annonces hors critères d'une étape, repliées en
   * bas : l'adéquation reste calculée par `domain` (lot 14), rien n'est perdu.
   */
  const props = withDefaults(
    defineProps<{
      label: string
      rows: readonly { id: string; title: string; why: string }[]
      /** Ouverte d'office (ancien lien `?fit=out`). */
      defaultOpen?: boolean
      openable?: boolean
    }>(),
    { defaultOpen: false, openable: true }
  )
  const emit = defineEmits<{ open: [id: string] }>()

  const open = ref(props.defaultOpen)
  watch(
    () => props.defaultOpen,
    value => {
      open.value = value
    }
  )
</script>

<template>
  <section v-if="rows.length" class="grid gap-2" data-testid="out-of-criteria">
    <UiButton
      variant="ghost"
      class="w-fit border border-dashed border-muted"
      :icon-right="open ? 'chevron-up' : 'chevron-down'"
      :aria-expanded="open"
      data-testid="out-toggle"
      @click="open = !open"
    >
      {{ label }}
    </UiButton>
    <ul
      v-if="open"
      class="m-0 list-none overflow-hidden rounded-2xl border border-line bg-surface p-0"
    >
      <li
        v-for="(row, index) in rows"
        :key="row.id"
        class="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5"
        :class="index ? 'border-t border-line' : ''"
        data-testid="out-row"
      >
        <UiButton
          v-if="openable"
          variant="link"
          class="flex-[2_1_280px] justify-start text-left font-medium"
          @click="emit('open', row.id)"
        >
          {{ row.title }}
        </UiButton>
        <span v-else class="flex-[2_1_280px] font-medium">{{ row.title }}</span>
        <span class="flex-[3_1_320px] text-sm text-muted">{{ row.why }}</span>
      </li>
    </ul>
  </section>
</template>
