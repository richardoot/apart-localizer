<script setup lang="ts">
  import { nextTick, onMounted, ref, watch } from 'vue'
  import { LISTING_TABS } from '@/lib/listing-tabs'
  import type { ListingTab } from '@/lib/listing-tabs'
  import UiBadge from '@/components/ui/UiBadge.vue'

  /**
   * Les sept onglets de la fiche (lot 19), en vrai motif d'onglets :
   * `tablist`, `aria-selected`, un seul onglet atteignable par Tab, flèches
   * gauche et droite, Début et Fin. Soulignés, dans une barre qui défile
   * horizontalement quand la place manque (mobile), hauts de 44 px. La
   * pastille de « À faire » compte ce qui est à traiter (tâches ouvertes,
   * messages à valider, relances dues).
   */
  defineProps<{
    /** Lot 19 : à traiter dans « À faire » (`todoPendingCount` de `domain`). */
    todoCount?: number
  }>()
  const tab = defineModel<ListingTab>({ required: true })

  const buttons = ref<HTMLButtonElement[]>([])

  /** La barre défile : l'onglet ouvert reste visible. */
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
    // Lot 25 : le focus ne suit que si l'onglet s'est vraiment ouvert. Si la
    // garde des modifications a retenu le changement (bandeau « Modifications
    // non enregistrées »), il ne va jamais sur l'onglet refusé : le bandeau
    // le prend.
    void nextTick(() => {
      if (tab.value !== next) return
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
    class="relative -mx-4 flex gap-0.5 overflow-x-auto overscroll-x-contain px-2 [scrollbar-width:none] sm:mx-0 sm:px-0"
    @keydown="onKey"
  >
    <!-- Lot 22 : un vrai onglet (role="tab", souligné), pas un UiButton. -->
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
      class="inline-flex min-h-11 flex-none items-center gap-1.5 border-b-[3px] px-2.5 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:px-3"
      :class="
        tab === choice.id
          ? 'border-accent font-semibold text-fg'
          : 'border-transparent text-muted hover:text-fg'
      "
      @click="select(choice.id)"
    >
      {{ choice.label }}
      <UiBadge
        v-if="choice.id === 'a-faire' && todoCount"
        tone="accent"
        variant="solid"
        data-testid="todo-count"
        ><span class="sr-only">, </span>{{ todoCount
        }}<span class="sr-only"> à traiter</span></UiBadge
      >
    </button>
  </div>
</template>
