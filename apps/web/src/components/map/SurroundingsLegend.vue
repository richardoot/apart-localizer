<script setup lang="ts">
  import type { MapLayerToggles } from '@/composables/useMapLayers'
  import {
    AMENITY_COLORS,
    HALO_COLOR,
    NEIGHBOURHOOD_COLOR,
  } from '@/lib/map-layers'

  /**
   * La légende des couches du lot 11, pour les couches allumées : pistes,
   * drives (enseignes préférées en disque plein, autres en cercle creux : la
   * forme les distingue, pas seulement la couleur), Fitness Park, contours.
   */
  defineProps<{ toggles: Partial<MapLayerToggles> }>()
</script>

<template>
  <span
    v-if="
      toggles.athletics ||
      toggles.drives ||
      toggles.fitness ||
      toggles.neighbourhoods
    "
    class="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted"
    data-testid="surroundings-legend"
  >
    <span v-if="toggles.neighbourhoods" class="flex items-center gap-1">
      <span
        class="inline-block h-0 w-4 border-t"
        :style="{ borderColor: NEIGHBOURHOOD_COLOR }"
        aria-hidden="true"
      />
      quartiers (IRIS ou commune à défaut)
    </span>
    <span v-if="toggles.athletics" class="flex items-center gap-1">
      <span
        class="inline-block h-2.5 w-2.5 rounded-full border"
        :style="{
          background: AMENITY_COLORS.athletics,
          borderColor: HALO_COLOR,
        }"
        aria-hidden="true"
      />
      piste
    </span>
    <template v-if="toggles.drives">
      <span class="flex items-center gap-1">
        <span
          class="inline-block h-3 w-3 rounded-full border-2"
          :style="{
            background: AMENITY_COLORS.drives,
            borderColor: HALO_COLOR,
          }"
          aria-hidden="true"
        />
        drive Carrefour, Auchan, Intermarché
      </span>
      <span class="flex items-center gap-1">
        <span
          class="inline-block h-2 w-2 rounded-full border-2"
          :style="{
            background: HALO_COLOR,
            borderColor: AMENITY_COLORS.drives,
          }"
          aria-hidden="true"
        />
        autre enseigne
      </span>
      <span>(pâle : drive à vérifier)</span>
    </template>
    <span v-if="toggles.fitness" class="flex items-center gap-1">
      <span
        class="inline-block h-2.5 w-2.5 rounded-full border"
        :style="{ background: AMENITY_COLORS.fitness, borderColor: HALO_COLOR }"
        aria-hidden="true"
      />
      Fitness Park
    </span>
  </span>
</template>
