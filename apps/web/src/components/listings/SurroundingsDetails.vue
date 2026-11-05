<script setup lang="ts">
  import { computed } from 'vue'
  import {
    AMENITY_SOURCE_LABELS,
    DRIVE_STATUS_LABELS,
    NEIGHBOURHOOD_KIND_LABELS,
    OPEN_DATA_STATUS_LABELS,
    PREFERRED_SUPERMARKET_BRANDS,
    SUPERMARKET_BRAND_LABELS,
  } from '@apart/contracts'
  import type {
    AmenityLookup,
    LocationApproximation,
    NearbyAmenity,
    Surroundings,
  } from '@apart/contracts'
  import { formatDistance } from '@/lib/format'

  /**
   * Quartier et équipements les plus proches de l'annonce (lot 11) : tout
   * vient du serveur (contours et équipements importés, distances à vol
   * d'oiseau calculées par PostGIS, règles de `domain`). Une source non
   * importée s'affiche « non disponible ».
   */
  const props = defineProps<{
    surroundings: Surroundings
    /** Lot 12 : d'où partent les distances quand le repère est approché. */
    approximation?: LocationApproximation | null
  }>()

  /** « ≈ 1,2 km » depuis un repère approché (lot 12), « 1,2 km » sinon. */
  function distance(
    meters: number | null | undefined,
    approximate: boolean
  ): string {
    return `${approximate ? '≈ ' : ''}${formatDistance(meters)}`
  }

  const n = computed(() => props.surroundings.neighbourhood)
  /** « quartier Bordeaux maritime, Bordeaux » : le quartier parent et la commune. */
  const place = computed(() => {
    const v = n.value.value
    if (!v) return null
    return (
      [
        v.parent ? `quartier ${v.parent}` : null,
        v.commune !== v.name ? v.commune : null,
      ]
        .filter(Boolean)
        .join(', ') || null
    )
  })
  const drives = computed(() => props.surroundings.supermarkets)
  /** Le drive le plus proche : son nom, et son enseigne si le nom ne la dit pas. */
  const nearestLabel = computed(() => {
    const d = drives.value.nearest
    if (!d) return null
    return d.brand && !d.name.includes(d.brand)
      ? `${d.name} (${d.brand})`
      : d.name
  })

  function nature(amenity: NearbyAmenity): string {
    const d = amenity.details
    return [
      d.facilityType,
      d.covered === true
        ? 'couverte'
        : d.covered === false
          ? 'découverte'
          : null,
      d.lengthMeters ? `${d.lengthMeters} m` : null,
      d.lanes ? `${d.lanes} couloirs` : null,
      d.access.length ? d.access.join(', ') : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  function missing(lookup: Pick<AmenityLookup, 'status' | 'reasons'>): string {
    if (lookup.status === 'unavailable') return 'non disponible'
    return lookup.reasons.join(' ') || 'non disponible'
  }

  const STATUS_CLASSES = {
    ok: 'bg-good-soft text-good',
    to_verify: 'bg-warn-soft text-warn',
    not_applicable: 'bg-surface-2 text-muted',
    unavailable: 'bg-surface-2 text-muted',
  } as const
</script>

<template>
  <div class="grid gap-2 text-sm" data-testid="surroundings">
    <h4 class="text-xs font-medium text-muted">
      Quartier et équipements (à vol d’oiseau<template
        v-if="approximation?.approximate"
        >, ≈ depuis le {{ approximation.origin }}</template
      >)
    </h4>

    <div class="grid gap-0.5" data-testid="surroundings-neighbourhood">
      <p v-if="n.value">
        Quartier :
        <strong>{{ n.value.name }}</strong>
        <template v-if="place"> ({{ place }})</template>
        <span class="text-xs text-muted">
          · {{ NEIGHBOURHOOD_KIND_LABELS[n.value.kind].toLowerCase() }}</span
        >
        <span
          v-if="n.status === 'to_verify'"
          :class="STATUS_CLASSES.to_verify"
          class="ml-1 rounded-full px-2 text-xs"
          >{{ OPEN_DATA_STATUS_LABELS.to_verify }}</span
        >
      </p>
      <p v-else class="text-muted">Quartier : {{ missing(n) }}</p>
      <p v-if="n.value" class="text-xs text-muted">
        Source du contour : {{ n.value.source }}
      </p>
      <p
        v-for="reason in n.value ? n.reasons : []"
        :key="reason"
        class="text-xs text-warn"
      >
        {{ reason }}
      </p>
    </div>

    <div class="grid gap-0.5" data-testid="surroundings-track">
      <p v-if="surroundings.athleticsTrack.nearest">
        Piste d’athlétisme la plus proche :
        <strong>{{ surroundings.athleticsTrack.nearest.name }}</strong>
        à
        {{
          distance(
            surroundings.athleticsTrack.nearest.distanceMeters,
            surroundings.athleticsTrack.approximate
          )
        }}
        <span
          v-if="nature(surroundings.athleticsTrack.nearest)"
          class="block text-xs text-muted"
          >{{ nature(surroundings.athleticsTrack.nearest) }} · source :
          {{
            AMENITY_SOURCE_LABELS[surroundings.athleticsTrack.nearest.source]
          }}</span
        >
      </p>
      <p v-else class="text-muted">
        Piste d’athlétisme : {{ missing(surroundings.athleticsTrack) }}
      </p>
    </div>

    <div class="grid gap-0.5" data-testid="surroundings-drives">
      <p class="text-xs font-medium text-muted">Supermarchés avec drive</p>
      <template v-if="drives.status === 'ok'">
        <ul class="grid gap-0.5">
          <li
            v-for="brand in PREFERRED_SUPERMARKET_BRANDS"
            :key="brand"
            :data-brand="brand"
          >
            <span class="font-medium">{{
              SUPERMARKET_BRAND_LABELS[brand]
            }}</span>
            :
            <template v-if="drives.preferred[brand]">
              {{ drives.preferred[brand]?.name }} à
              {{
                distance(
                  drives.preferred[brand]?.distanceMeters,
                  drives.approximate
                )
              }}
              <span
                v-if="drives.preferred[brand]?.drive === 'to_verify'"
                :class="STATUS_CLASSES.to_verify"
                class="rounded-full px-2 text-xs"
                >{{ DRIVE_STATUS_LABELS.to_verify }}</span
              >
            </template>
            <span v-else class="text-muted"
              >aucun drive à moins de
              {{ formatDistance(surroundings.searchRadiusMeters) }}</span
            >
          </li>
          <li data-brand="any">
            <span class="font-medium">Toutes enseignes</span> :
            <template v-if="drives.nearest">
              {{ nearestLabel }} à
              {{ distance(drives.nearest.distanceMeters, drives.approximate) }}
              <span
                v-if="drives.nearest.drive === 'to_verify'"
                :class="STATUS_CLASSES.to_verify"
                class="rounded-full px-2 text-xs"
                >{{ DRIVE_STATUS_LABELS.to_verify }}</span
              >
            </template>
            <span v-else class="text-muted">aucun dans le rayon</span>
          </li>
        </ul>
      </template>
      <p v-else class="text-muted">{{ missing(drives) }}</p>
    </div>

    <div class="grid gap-0.5" data-testid="surroundings-fitness">
      <p v-if="surroundings.fitnessPark.nearest">
        Fitness Park le plus proche :
        <strong>{{ surroundings.fitnessPark.nearest.name }}</strong>
        à
        {{
          distance(
            surroundings.fitnessPark.nearest.distanceMeters,
            surroundings.fitnessPark.approximate
          )
        }}
        <span
          v-if="surroundings.fitnessPark.nearest.address"
          class="block text-xs text-muted"
          >{{ surroundings.fitnessPark.nearest.address }}</span
        >
      </p>
      <p v-else class="text-muted">
        Fitness Park : {{ missing(surroundings.fitnessPark) }}
      </p>
    </div>

    <p class="text-xs text-muted">
      Distances à vol d’oiseau (calculées sur la carte), pas des temps de
      trajet. Drive : signalé par OpenStreetMap, ou « à vérifier » si la donnée
      est ambiguë ; jamais supposé d’après l’enseigne.
    </p>
  </div>
</template>
