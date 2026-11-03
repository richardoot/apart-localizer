<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import {
    DpeClassSchema,
    IsochroneModeSchema,
    ISOCHRONE_MODE_LABELS,
    ListingStatusSchema,
    VerdictSchema,
  } from '@apart/contracts'
  import type {
    CriteriaFiltersInput,
    DpeClass,
    IsochroneMode,
    ListingStatus,
    Perimeter,
    PerimeterInput,
    SearchCriteriaPreviewRequestInput,
    SearchCriteriaSummary,
    Verdict,
  } from '@apart/contracts'
  import {
    useCriteriaMutations,
    useCriteriaPreview,
  } from '@/composables/useSearchCriteria'
  import { ApiError } from '@/lib/api'
  import { parseNumberInput } from '@/lib/format'
  import { LISTING_STATUS_LABELS, VERDICT_LABELS } from '@/lib/labels'
  import { describePerimeter } from '@/lib/perimeter'
  import CriteriaMap from './CriteriaMap.vue'

  /**
   * Création et modification d'un critère : nom, filtres métier, périmètre
   * (aucun, point et rayon, polygone ou cercle dessinés, isochrone par
   * adresse ou clic), aperçu du nombre d'annonces par le serveur.
   */
  const props = defineProps<{ criteria: SearchCriteriaSummary | null }>()
  const emit = defineEmits<{ saved: [criteria: SearchCriteriaSummary] }>()

  type Kind = 'none' | 'point_radius' | 'polygon' | 'circle' | 'isochrone'
  const KINDS: { value: Kind; label: string }[] = [
    { value: 'none', label: 'Aucun' },
    { value: 'point_radius', label: 'Point et rayon' },
    { value: 'polygon', label: 'Polygone' },
    { value: 'circle', label: 'Cercle' },
    { value: 'isochrone', label: 'Isochrone' },
  ]

  const c = props.criteria
  const name = ref(c?.name ?? '')
  const priceMax = ref(c?.filters.priceMax?.toString() ?? '')
  const priceMin = ref(c?.filters.priceMin?.toString() ?? '')
  const surfaceMin = ref(c?.filters.surfaceMin?.toString() ?? '')
  const roomsMin = ref(c?.filters.roomsMin?.toString() ?? '')
  const tramMax = ref(c?.filters.maxTramDistanceMeters?.toString() ?? '')
  const dpeMax = ref<DpeClass | ''>(c?.filters.dpeMax ?? '')
  const communes = ref(c?.filters.communes.join(', ') ?? '')
  const verdicts = ref<Verdict[]>([...(c?.filters.verdicts ?? [])])
  const statuses = ref<ListingStatus[]>([...(c?.filters.statuses ?? [])])
  const kind = ref<Kind>(
    c?.perimeter
      ? c.perimeter.type === 'point_radius'
        ? 'point_radius'
        : c.perimeter.type
      : 'none'
  )
  /** Le périmètre saisi ; null tant que celui du critère n'a pas été touché. */
  const perimeterInput = ref<PerimeterInput | null>(null)
  const touched = ref(false)
  const radius = ref(
    c?.perimeter?.type === 'point_radius' ? c.perimeter.radiusMeters : 800
  )
  const isoAddress = ref('')
  const isoOrigin = ref<{ longitude: number; latitude: number } | null>(null)
  const isoMode = ref<IsochroneMode>(
    c?.perimeter?.type === 'isochrone' ? c.perimeter.params.mode : 'walking'
  )
  const isoMinutes = ref(
    c?.perimeter?.type === 'isochrone' ? c.perimeter.params.durationMinutes : 15
  )
  const failure = ref<string | null>(null)
  const mutations = useCriteriaMutations()

  const drawMode = computed(() =>
    kind.value === 'polygon' || kind.value === 'circle'
      ? kind.value
      : kind.value === 'point_radius' || kind.value === 'isochrone'
        ? 'pick'
        : null
  )

  const filters = computed<CriteriaFiltersInput>(() => {
    const n = (value: string): number | null => parseNumberInput(value)
    const rooms = n(roomsMin.value)
    const tram = n(tramMax.value)
    return {
      priceMax: n(priceMax.value),
      priceMin: n(priceMin.value),
      surfaceMin: n(surfaceMin.value),
      roomsMin: rooms === null ? null : Math.round(rooms),
      maxTramDistanceMeters: tram === null ? null : Math.round(tram),
      dpeMax: dpeMax.value || null,
      communes: communes.value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
      verdicts: verdicts.value,
      statuses: statuses.value,
    }
  })

  /** Le périmètre envoyé : celui saisi, sinon celui du critère (inchangé), sinon aucun. */
  const effectivePerimeter = computed<PerimeterInput | null>(() => {
    if (touched.value)
      return kind.value === 'none' ? null : perimeterInput.value
    const p = c?.perimeter
    if (!p) return null
    return p.type === 'isochrone'
      ? { type: 'polygon', polygon: p.polygon }
      : p.type === 'point_radius'
        ? p
        : { type: 'polygon', polygon: p.polygon }
  })

  const previewRequest = computed<SearchCriteriaPreviewRequestInput | null>(
    () => {
      if (touched.value && kind.value !== 'none' && !perimeterInput.value) {
        return null
      }
      return { filters: filters.value, perimeter: effectivePerimeter.value }
    }
  )
  const preview = useCriteriaPreview(previewRequest)

  /** Le périmètre affiché : résolu par le serveur (isochrone), sinon celui du critère. */
  const shownPerimeter = computed<Perimeter | null>(() => {
    if (!touched.value) return c?.perimeter ?? null
    if (kind.value === 'none') return null
    return preview.data.value?.perimeter ?? null
  })

  function setKind(value: Kind): void {
    kind.value = value
    touched.value = true
    perimeterInput.value = null
  }

  function onDrawn(perimeter: PerimeterInput): void {
    touched.value = true
    perimeterInput.value = perimeter
    if (perimeter.type === 'point_radius') radius.value = perimeter.radiusMeters
  }

  function onPick(point: { longitude: number; latitude: number }): void {
    touched.value = true
    if (kind.value === 'point_radius') {
      perimeterInput.value = {
        type: 'point_radius',
        ...point,
        radiusMeters: radius.value,
      }
    } else if (kind.value === 'isochrone') {
      isoOrigin.value = point
      isoAddress.value = ''
    }
  }

  watch(radius, value => {
    const p = perimeterInput.value
    if (p?.type === 'point_radius' && value > 0) {
      perimeterInput.value = { ...p, radiusMeters: Math.round(value) }
    }
  })

  function computeIsochrone(): void {
    touched.value = true
    const address = isoAddress.value.trim()
    if (!isoOrigin.value && address.length < 3) {
      failure.value = 'Donnez une adresse de départ ou cliquez sur la carte.'
      return
    }
    failure.value = null
    perimeterInput.value = {
      type: 'isochrone',
      mode: isoMode.value,
      durationMinutes: isoMinutes.value,
      ...(isoOrigin.value
        ? {
            origin: {
              type: 'Point',
              coordinates: [
                isoOrigin.value.longitude,
                isoOrigin.value.latitude,
              ],
            },
          }
        : { address }),
    }
  }

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value)
      ? list.filter(v => v !== value)
      : [...list, value]
  }

  async function save(): Promise<void> {
    failure.value = null
    if (!name.value.trim()) {
      failure.value = 'Donnez un nom au critère.'
      return
    }
    if (touched.value && kind.value !== 'none' && !perimeterInput.value) {
      failure.value =
        'Le périmètre n’est pas encore posé : dessinez-le, cliquez sur la carte, ou calculez l’isochrone.'
      return
    }
    try {
      const saved = c
        ? await mutations.update.mutateAsync({
            id: c.id,
            patch: {
              name: name.value.trim(),
              filters: filters.value,
              ...(touched.value
                ? {
                    perimeter:
                      kind.value === 'none' ? null : perimeterInput.value,
                  }
                : {}),
              expectedUpdatedAt: c.updatedAt,
            },
          })
        : await mutations.create.mutateAsync({
            name: name.value.trim(),
            filters: filters.value,
            perimeter: kind.value === 'none' ? null : perimeterInput.value,
          })
      emit('saved', saved)
    } catch (err) {
      failure.value =
        err instanceof ApiError ? err.message : "L'enregistrement a échoué."
    }
  }

  const saving = computed(
    () => mutations.create.isPending.value || mutations.update.isPending.value
  )
  const dpeClasses = DpeClassSchema.options
  const isoModes = IsochroneModeSchema.options
</script>

<template>
  <form class="grid gap-4" @submit.prevent="save">
    <div class="grid gap-1">
      <label for="c-name" class="text-xs font-medium text-muted">Nom</label>
      <input
        id="c-name"
        v-model="name"
        class="rounded-lg border border-line bg-bg px-3 py-1.5 text-sm"
        placeholder="Talence à 10 minutes du tram"
      />
    </div>

    <fieldset class="grid gap-3 rounded-xl border border-line p-3">
      <legend class="px-1 text-sm font-semibold">Filtres</legend>
      <div class="grid gap-3 sm:grid-cols-3">
        <label class="grid gap-1 text-xs text-muted">
          Prix maximal (€)
          <input
            v-model="priceMax"
            inputmode="numeric"
            class="rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
            data-testid="c-price-max"
          />
        </label>
        <label class="grid gap-1 text-xs text-muted">
          Prix minimal (€)
          <input
            v-model="priceMin"
            inputmode="numeric"
            class="rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
          />
        </label>
        <label class="grid gap-1 text-xs text-muted">
          Surface minimale (m²)
          <input
            v-model="surfaceMin"
            inputmode="decimal"
            class="rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
          />
        </label>
        <label class="grid gap-1 text-xs text-muted">
          Pièces minimum
          <input
            v-model="roomsMin"
            inputmode="numeric"
            class="rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
          />
        </label>
        <label class="grid gap-1 text-xs text-muted">
          DPE au plus
          <select
            v-model="dpeMax"
            class="rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
          >
            <option value="">Tous</option>
            <option v-for="dpe in dpeClasses" :key="dpe" :value="dpe">
              {{ dpe }}
            </option>
          </select>
        </label>
        <label class="grid gap-1 text-xs text-muted">
          Tram à moins de (m)
          <input
            v-model="tramMax"
            inputmode="numeric"
            class="rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
            data-testid="c-tram"
          />
        </label>
      </div>
      <label class="grid gap-1 text-xs text-muted">
        Communes (séparées par des virgules ; vide = toutes)
        <input
          v-model="communes"
          class="rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
        />
      </label>
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Verdicts">
        <button
          v-for="verdict in VerdictSchema.options"
          :key="verdict"
          type="button"
          class="rounded-full border px-2.5 py-0.5 text-xs"
          :class="
            verdicts.includes(verdict)
              ? 'border-accent bg-accent-soft'
              : 'border-line text-muted'
          "
          :aria-pressed="verdicts.includes(verdict)"
          @click="verdicts = toggle(verdicts, verdict)"
        >
          {{ VERDICT_LABELS[verdict] }}
        </button>
      </div>
      <div
        class="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Statuts (vide = actifs)"
      >
        <button
          v-for="status in ListingStatusSchema.options"
          :key="status"
          type="button"
          class="rounded-full border px-2.5 py-0.5 text-xs"
          :class="
            statuses.includes(status)
              ? 'border-accent bg-accent-soft'
              : 'border-line text-muted'
          "
          :aria-pressed="statuses.includes(status)"
          @click="statuses = toggle(statuses, status)"
        >
          {{ LISTING_STATUS_LABELS[status] }}
        </button>
      </div>
    </fieldset>

    <fieldset class="grid gap-3 rounded-xl border border-line p-3">
      <legend class="px-1 text-sm font-semibold">Périmètre</legend>
      <div
        class="flex flex-wrap gap-1.5"
        role="radiogroup"
        aria-label="Type de périmètre"
      >
        <button
          v-for="k in KINDS"
          :key="k.value"
          type="button"
          role="radio"
          class="rounded-lg border px-2.5 py-1 text-xs"
          :class="
            kind === k.value
              ? 'border-accent bg-accent-soft'
              : 'border-line text-muted'
          "
          :aria-checked="kind === k.value"
          :data-kind="k.value"
          @click="setKind(k.value)"
        >
          {{ k.label }}
        </button>
      </div>
      <label
        v-if="kind === 'point_radius'"
        class="flex items-center gap-2 text-xs text-muted"
      >
        Rayon (m)
        <input
          v-model.number="radius"
          type="number"
          min="50"
          max="50000"
          step="50"
          class="w-28 rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
        />
      </label>
      <div
        v-if="kind === 'isochrone'"
        class="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
      >
        <label class="grid gap-1 text-xs text-muted">
          Adresse de départ (ou clic sur la carte)
          <input
            v-model="isoAddress"
            class="rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
            data-testid="iso-address"
            :placeholder="
              isoOrigin
                ? `Point ${isoOrigin.latitude}, ${isoOrigin.longitude}`
                : '1 place de la Bourse, Bordeaux'
            "
            @input="isoOrigin = null"
          />
        </label>
        <label class="grid gap-1 text-xs text-muted">
          Mode
          <select
            v-model="isoMode"
            class="rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
          >
            <option v-for="m in isoModes" :key="m" :value="m">
              {{ ISOCHRONE_MODE_LABELS[m] }}
            </option>
          </select>
        </label>
        <label class="grid gap-1 text-xs text-muted">
          Minutes
          <input
            v-model.number="isoMinutes"
            type="number"
            min="1"
            max="60"
            class="w-20 rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
          />
        </label>
        <button
          type="button"
          class="rounded-lg border border-accent px-3 py-1 text-sm"
          data-testid="iso-compute"
          @click="computeIsochrone"
        >
          Calculer
        </button>
        <p
          v-if="isoMode === 'cycling'"
          class="text-xs text-muted sm:col-span-4"
        >
          À vélo : la Géoplateforme n'a pas de profil vélo, l'isochrone est
          approchée par la distance sur le réseau piéton à 15 km/h.
        </p>
      </div>
      <CriteriaMap
        :perimeter="shownPerimeter"
        :draw-mode="drawMode"
        @drawn="onDrawn"
        @pick="onPick"
      />
      <p class="text-sm" aria-live="polite" data-testid="preview">
        {{ describePerimeter(shownPerimeter) }} ·
        <template v-if="preview.isFetching.value">calcul…</template>
        <template v-else-if="preview.error.value">
          <span class="text-bad">{{ preview.error.value.message }}</span>
        </template>
        <template v-else-if="preview.data.value">
          {{ preview.data.value.listingCount }} annonce(s)
          <template v-if="preview.data.value.approximateCount">
            dont {{ preview.data.value.approximateCount }} sous réserve
            (localisation imprécise)
          </template>
        </template>
        <template v-else>périmètre à poser</template>
      </p>
    </fieldset>

    <p
      v-if="failure"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ failure }}
    </p>
    <div class="flex justify-end">
      <button
        type="submit"
        class="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-60"
        :disabled="saving"
      >
        {{
          saving
            ? 'Enregistrement…'
            : criteria
              ? 'Enregistrer'
              : 'Créer le critère'
        }}
      </button>
    </div>
  </form>
</template>
