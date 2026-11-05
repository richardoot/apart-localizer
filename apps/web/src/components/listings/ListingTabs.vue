<script setup lang="ts">
  import { nextTick, onMounted, ref, watch } from 'vue'
  import { LISTING_TABS } from '@/lib/listing-tabs'
  import type { ListingTab } from '@/lib/listing-tabs'

  /**
   * Les onglets de la fiche (lot 9), en vrai motif d'onglets : `tablist`,
   * `aria-selected`, un seul onglet atteignable par Tab, flèches gauche et
   * droite, Début et Fin. Soulignés sur ordinateur ; en pastilles qui
   * défilent horizontalement sur mobile, hautes de 44 px au moins.
   */
  defineProps<{
    /** Nombre de tâches ouvertes, affiché sur l'onglet Suivi. */
    openTasks?: number
    /** Lot 17 : messages à valider, affichés sur l'onglet Échanges. */
    pendingMessages?: number
  }>()
  const tab = defineModel<ListingTab>({ required: true })

  const buttons = ref<HTMLButtonElement[]>([])

  /** Sur mobile, les pastilles défilent : l'onglet ouvert reste visible (lot 17 : six onglets). */
  function reveal(): void {
    const index = LISTING_TABS.findIndex(t => t.id === tab.value)
    buttons.value[index]?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
    })
  }
  onMounted(reveal)
  watch(tab, () => void nextTick(reveal))

  function select(next: ListingTab, focus = false): void {
    tab.value = next
    if (!focus) return
    void nextTick(() => {
      const index = LISTING_TABS.findIndex(t => t.id === next)
      buttons.value[index]?.focus()
    })
  }

  function onKey(event: KeyboardEvent): void {
    const index = LISTING_TABS.findIndex(t => t.id === tab.value)
    const last = LISTING_TABS.length - 1
    const target =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (target === null) return
    event.preventDefault()
    const next = LISTING_TABS[target]
    if (next) select(next.id, true)
  }
</script>

<template>
  <div
    role="tablist"
    aria-label="Sections de la fiche"
    class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:gap-1 sm:border-b sm:border-line sm:px-0 sm:pb-0"
    @keydown="onKey"
  >
    <button
      v-for="(choice, i) in LISTING_TABS"
      :id="`listing-tab-${choice.id}`"
      :key="choice.id"
      :ref="
        el => {
          if (el) buttons[i] = el as HTMLButtonElement
        }
      "
      type="button"
      role="tab"
      :aria-selected="tab === choice.id"
      :aria-controls="`listing-panel-${choice.id}`"
      :tabindex="tab === choice.id ? 0 : -1"
      :data-testid="`tab-${choice.id}`"
      class="inline-flex min-h-11 flex-none items-center gap-1 rounded-full border px-3.5 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:-mb-px sm:min-h-10 sm:rounded-none sm:border-0 sm:border-b-[3px] sm:px-3"
      :class="
        tab === choice.id
          ? 'border-accent bg-accent font-semibold text-accent-fg sm:bg-transparent sm:text-fg'
          : 'border-line bg-surface text-fg hover:bg-surface-2 sm:border-transparent sm:bg-transparent sm:text-muted sm:hover:bg-transparent sm:hover:text-fg'
      "
      @click="select(choice.id)"
    >
      <span class="sm:hidden">{{ choice.short }}</span>
      <span class="hidden sm:inline">{{ choice.label }}</span>
      <span
        v-if="choice.id === 'suivi' && openTasks"
        class="text-xs font-normal"
        data-testid="open-tasks-count"
        >· {{ openTasks }} tâche{{ openTasks > 1 ? 's' : '' }}</span
      >
      <span
        v-if="choice.id === 'echanges' && pendingMessages"
        class="rounded-full bg-warn-soft px-1.5 text-xs font-medium text-warn"
        data-testid="pending-messages-count"
        >{{ pendingMessages }} à valider</span
      >
    </button>
  </div>
</template>
