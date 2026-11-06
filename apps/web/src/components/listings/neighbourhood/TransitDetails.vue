<script setup lang="ts">
  import { TRANSIT_MODE_LABELS } from '@apart/contracts'
  import type { TransitContext } from '@apart/contracts'
  import { formatDistance } from '@/lib/format'

  /**
   * Lot 19 : le détail de la tuile « Tram » de l'onglet Quartier : l'arrêt
   * de tram le plus proche (2 km au plus), l'arrêt le plus proche s'il est
   * autre, et les réserves de la mesure (repère approché). Distances à vol
   * d'oiseau depuis le repère, calculées par le serveur (arrêts TBM
   * importés) ; aucun temps de trajet ni aucune fréquence.
   */
  defineProps<{ transit: TransitContext }>()
</script>

<template>
  <div class="grid gap-1 text-sm" data-testid="transit">
    <p v-if="transit.nearestTram">
      Tram le plus proche :
      <strong>{{ transit.nearestTram.name }}</strong>
      <template v-if="transit.nearestTram.lines.length">
        (ligne {{ transit.nearestTram.lines.join(', ') }})
      </template>
      à {{ transit.approximate ? '≈ ' : ''
      }}{{ formatDistance(transit.nearestTram.distanceMeters) }}
    </p>
    <p v-else class="text-muted">Aucun arrêt de tram à moins de 2 km.</p>
    <p
      v-if="
        transit.nearestStop &&
        transit.nearestStop.name !== transit.nearestTram?.name
      "
      class="text-muted"
    >
      Arrêt le plus proche : {{ transit.nearestStop.name }} ({{
        TRANSIT_MODE_LABELS[transit.nearestStop.mode].toLowerCase()
      }}
      {{ transit.nearestStop.lines.join(', ') }}) à
      {{ transit.approximate ? '≈ ' : ''
      }}{{ formatDistance(transit.nearestStop.distanceMeters) }}
    </p>
    <p
      v-for="reason in transit.reasons"
      :key="reason"
      class="text-xs text-muted"
    >
      {{ reason }}
    </p>
    <p class="text-xs text-muted">
      Distances à vol d’oiseau depuis le repère, pas des temps de trajet.
    </p>
  </div>
</template>
