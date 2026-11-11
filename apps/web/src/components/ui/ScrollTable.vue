<script setup lang="ts">
  defineOptions({ inheritAttrs: false })

  /**
   * Lot 25 (ADR 0035) : un tableau large (projection, sensibilité, critères
   * du prix cible) défile dans son propre cadre, jamais la page. Le cadre se
   * prend au clavier (Tab, puis flèches) et se nomme pour un lecteur d'écran ;
   * au téléphone, une ligne dit qu'il se fait glisser. Les attributs
   * (`data-testid`…) vont au cadre qui défile.
   */
  defineProps<{
    /** Le nom du cadre (« Tableau annuel de la projection »). */
    label: string
  }>()
</script>

<template>
  <div class="grid min-w-0 gap-1">
    <p class="text-xs text-muted sm:hidden" data-testid="scroll-hint">
      Fais glisser le tableau pour voir les autres colonnes.
    </p>
    <div
      role="region"
      :aria-label="label"
      tabindex="0"
      class="max-w-full overflow-x-auto overscroll-x-contain rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      data-scroll-table
      v-bind="$attrs"
    >
      <slot />
    </div>
  </div>
</template>
