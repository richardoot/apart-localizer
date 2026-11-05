<script setup lang="ts">
  import type { SectionSpec } from '@/lib/assumptions-form'
  import { changedCountLabel } from '@/lib/assumptions-summary'

  /**
   * Une section de la page Hypothèses (lot 13). Sur ordinateur : une carte
   * ouverte, titre en question et phrase « Sert à : … », actions à droite du
   * titre. Sur mobile : un accordéon dont l'en-tête (vrai bouton,
   * `aria-expanded`) porte le titre court, le résumé d'une ligne et le
   * nombre de champs modifiés.
   */
  const props = defineProps<{
    section: SectionSpec
    summary: string
    changed: number
    desktop: boolean
  }>()
  const open = defineModel<boolean>('open', { default: true })

  const titleId = `${props.section.id}-title`
  const panelId = `${props.section.id}-panel`
</script>

<template>
  <section
    :id="section.id"
    :aria-labelledby="titleId"
    class="scroll-mt-20 rounded-2xl border border-line bg-surface"
    :class="desktop ? 'grid gap-4 p-5' : ''"
    :data-section="section.id"
  >
    <template v-if="desktop">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="grid gap-1">
          <h2
            :id="titleId"
            tabindex="-1"
            class="font-display text-lg font-bold focus:outline-none"
          >
            {{ section.question }}
          </h2>
          <p class="text-sm text-muted">{{ section.purpose }}</p>
        </div>
        <slot name="actions" />
      </header>
      <slot />
    </template>
    <template v-else>
      <h2>
        <button
          type="button"
          class="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          :aria-expanded="open"
          :aria-controls="panelId"
          :data-testid="`toggle-${section.id}`"
          @click="open = !open"
        >
          <span class="grid gap-0.5">
            <span :id="titleId" class="font-display text-base font-bold">{{
              section.shortTitle
            }}</span>
            <span class="text-xs text-muted" data-testid="section-summary"
              >{{ summary
              }}<span v-if="changed" class="font-semibold text-accent">
                · {{ changedCountLabel(changed) }}</span
              ></span
            >
          </span>
          <span aria-hidden="true" class="text-muted">{{
            open ? '▾' : '▸'
          }}</span>
        </button>
      </h2>
      <div v-if="open" :id="panelId" class="grid gap-3 px-4 pt-1 pb-4">
        <p class="text-xs text-muted">{{ section.purpose }}</p>
        <slot />
      </div>
    </template>
  </section>
</template>
