<script setup lang="ts">
  import { nextTick, ref } from 'vue'
  import { BASE_MAPS } from '@/lib/base-maps'
  import type { BaseMapId } from '@/lib/base-maps'

  /**
   * Le choix du fond, posé sur la carte (coin haut gauche) : un groupe de
   * boutons radio (`radiogroup`, `aria-checked`), un seul atteignable par
   * Tab, flèches, Début et Fin. Cibles de 44 px sur mobile ; les jetons de
   * couleur suivent le thème, le fond de carte reste clair.
   */
  const base = defineModel<BaseMapId>({ required: true })

  const buttons = ref<HTMLButtonElement[]>([])

  function select(next: BaseMapId, focus = false): void {
    base.value = next
    if (!focus) return
    void nextTick(() => {
      buttons.value[BASE_MAPS.findIndex(b => b.id === next)]?.focus()
    })
  }

  function onKey(event: KeyboardEvent): void {
    const index = BASE_MAPS.findIndex(b => b.id === base.value)
    const last = BASE_MAPS.length - 1
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    const target = forward
      ? index === last
        ? 0
        : index + 1
      : backward
        ? index <= 0
          ? last
          : index - 1
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : null
    if (target === null) return
    event.preventDefault()
    const next = BASE_MAPS[target]
    if (next) select(next.id, true)
  }
</script>

<template>
  <div
    role="radiogroup"
    aria-label="Fond de carte"
    class="flex gap-0.5 rounded-lg border border-line bg-surface/95 p-0.5 text-fg shadow-sm"
    data-testid="base-map-switcher"
    @keydown="onKey"
  >
    <!-- Lot 22 : contrôle spécialisé posé sur la carte (`role="radio"`, flèches), pas un bouton d'action. -->
    <button
      v-for="(choice, i) in BASE_MAPS"
      :key="choice.id"
      :ref="
        el => {
          if (el) buttons[i] = el as HTMLButtonElement
        }
      "
      type="button"
      role="radio"
      :aria-checked="base === choice.id"
      :tabindex="base === choice.id ? 0 : -1"
      :title="choice.description"
      :data-base-map="choice.id"
      class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2.5 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent sm:min-h-8 sm:min-w-0 sm:pointer-coarse:min-h-11"
      :class="
        base === choice.id
          ? 'bg-accent font-semibold text-accent-fg'
          : 'text-muted hover:bg-surface-2 hover:text-fg'
      "
      @click="select(choice.id)"
    >
      <span class="sm:hidden">{{ choice.shortLabel }}</span>
      <span class="hidden sm:inline">{{ choice.label }}</span>
    </button>
  </div>
</template>
