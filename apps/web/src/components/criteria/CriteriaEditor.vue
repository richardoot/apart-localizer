<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import {
    CriteriaFiltersSchema,
    DEFAULT_CRITERIA_TOLERANCE,
    DpeClassSchema,
    IsochroneModeSchema,
    ISOCHRONE_MODE_LABELS,
    ListingStatusSchema,
    MAIN_TAB_FIT_LEVELS,
    STRICT_CRITERIA_TOLERANCE,
    VerdictSchema,
    isStrictTolerance,
  } from '@apart/contracts'
  import type {
    CriteriaFiltersInput,
    CriteriaFitLevel,
    CriteriaTolerance,
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
  import { fitReasonsText, toleranceThresholds } from '@apart/domain'
  import DefinitionButton from '@/components/ui/DefinitionButton.vue'
  import FitBadge from '@/components/listings/FitBadge.vue'
  import { ApiError } from '@/lib/api'
  import { formatEuros, parseNumberInput } from '@/lib/format'
  import { LISTING_STATUS_LABELS, VERDICT_LABELS } from '@/lib/labels'
  import { describePerimeter } from '@/lib/perimeter'
  import CriteriaMap from './CriteriaMap.vue'

  /**
   * Création et modification d'un critère : nom, filtres métier, marge de
   * tolérance (lot 14 : seuils réels « soit 231 000 € », marge appliquée ou
   * désactivée), périmètre (aucun, point et rayon, polygone ou cercle
   * dessinés, isochrone par adresse ou clic), aperçu par niveau d'adéquation
   * calculé par le serveur avant d'enregistrer.
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

  // Lot 14 : la marge de tolérance, saisie en mètres, pour cent et classes.
  const initialTolerance: CriteriaTolerance = c?.tolerance ?? {
    ...DEFAULT_CRITERIA_TOLERANCE,
  }
  const percent = (share: number): string =>
    String(Math.round(share * 1000) / 10)
  const tolPerimeter = ref(String(initialTolerance.perimeterMeters))
  const tolPriceMax = ref(percent(initialTolerance.priceMaxShare))
  const tolPriceMin = ref(percent(initialTolerance.priceMinShare))
  const tolSurface = ref(percent(initialTolerance.surfaceMinShare))
  const tolRooms = ref(String(initialTolerance.roomsMin))
  const tolDpe = ref(initialTolerance.dpeClasses)
  const tolTram = ref(String(initialTolerance.tramMeters))
  /** La dernière marge non nulle, rétablie quand on la réactive. */
  let lastMargin: CriteriaTolerance = isStrictTolerance(initialTolerance)
    ? { ...DEFAULT_CRITERIA_TOLERANCE }
    : initialTolerance

  const tolerance = computed<CriteriaTolerance>(() => {
    const int = (value: string, max: number): number =>
      Math.min(Math.max(Math.round(parseNumberInput(value) ?? 0), 0), max)
    const share = (value: string): number =>
      Math.min(Math.max(parseNumberInput(value) ?? 0, 0), 50) / 100
    return {
      perimeterMeters: int(tolPerimeter.value, 2000),
      priceMaxShare: share(tolPriceMax.value),
      priceMinShare: share(tolPriceMin.value),
      surfaceMinShare: share(tolSurface.value),
      roomsMin: int(tolRooms.value, 3),
      dpeClasses: Math.min(Math.max(tolDpe.value, 0), 3),
      tramMeters: int(tolTram.value, 2000),
    }
  })
  const marginOn = computed(() => !isStrictTolerance(tolerance.value))

  function setTolerance(t: CriteriaTolerance): void {
    tolPerimeter.value = String(t.perimeterMeters)
    tolPriceMax.value = percent(t.priceMaxShare)
    tolPriceMin.value = percent(t.priceMinShare)
    tolSurface.value = percent(t.surfaceMinShare)
    tolRooms.value = String(t.roomsMin)
    tolDpe.value = t.dpeClasses
    tolTram.value = String(t.tramMeters)
  }

  /** Marge appliquée ⇄ désactivée (tout à 0) ; la dernière marge revient. */
  function toggleMargin(): void {
    if (marginOn.value) {
      lastMargin = tolerance.value
      setTolerance(STRICT_CRITERIA_TOLERANCE)
    } else {
      setTolerance(lastMargin)
    }
  }

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

  /** Les seuils réels, marge comprise (« soit 231 000 € »). */
  const thresholds = computed(() => {
    const parsed = CriteriaFiltersSchema.safeParse(filters.value)
    return parsed.success
      ? toleranceThresholds(parsed.data, tolerance.value)
      : null
  })
  const DPE_MARGINS = [
    { value: 0, label: 'aucune' },
    { value: 1, label: 'une classe' },
    { value: 2, label: 'deux classes' },
    { value: 3, label: 'trois classes' },
  ]

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
      return {
        filters: filters.value,
        perimeter: effectivePerimeter.value,
        tolerance: tolerance.value,
      }
    }
  )
  const preview = useCriteriaPreview(previewRequest)

  /** Lot 14 : l'aperçu par niveau, et les raisons des annonces à la marge. */
  const PREVIEW_LEVELS: readonly CriteriaFitLevel[] = [
    ...MAIN_TAB_FIT_LEVELS,
    'out',
  ]
  const marginReasons = computed(() =>
    (preview.data.value?.examples ?? [])
      .filter(e => e.level === 'margin')
      .map(e => fitReasonsText(e.reasons).replace(/^./, ch => ch.toLowerCase()))
  )

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
              tolerance: tolerance.value,
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
            tolerance: tolerance.value,
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

    <fieldset
      class="grid gap-3 rounded-xl border border-line p-3"
      data-testid="tolerance"
    >
      <legend class="px-1 text-sm font-semibold">
        <span class="inline-flex items-center gap-2"
          >Marge de tolérance <DefinitionButton term="criteria_tolerance"
        /></span>
      </legend>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="max-w-xl text-xs text-muted">
          Une annonce qui dépasse un peu reste visible, « à la marge », avec la
          raison. Au-delà, elle passe « hors critères » sans être perdue.
        </p>
        <button
          type="button"
          class="min-h-11 rounded-full border px-4 text-sm font-semibold"
          :class="
            marginOn
              ? 'border-accent bg-accent text-accent-fg'
              : 'border-line bg-surface text-fg'
          "
          :aria-pressed="marginOn"
          data-testid="tolerance-toggle"
          @click="toggleMargin"
        >
          {{ marginOn ? 'Marge appliquée' : 'Marge désactivée' }}
        </button>
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <label class="grid content-start gap-1 text-xs text-muted">
          Autour du périmètre (m)
          <input
            v-model="tolPerimeter"
            inputmode="numeric"
            class="rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
            data-testid="tol-perimeter"
          />
          <span>adresse exacte ou à la rue ; contour du quartier sinon</span>
        </label>
        <label class="grid content-start gap-1 text-xs text-muted">
          Au-dessus du prix maximal (%)
          <input
            v-model="tolPriceMax"
            inputmode="decimal"
            class="rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
            data-testid="tol-price-max"
          />
          <span
            v-if="thresholds?.priceMax != null"
            data-testid="tol-price-max-threshold"
            >soit {{ formatEuros(thresholds.priceMax) }}</span
          >
        </label>
        <label class="grid content-start gap-1 text-xs text-muted">
          Sous le prix minimal (%)
          <input
            v-model="tolPriceMin"
            inputmode="decimal"
            class="rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
          />
          <span v-if="thresholds?.priceMin != null"
            >soit {{ formatEuros(thresholds.priceMin) }}</span
          >
        </label>
        <label class="grid content-start gap-1 text-xs text-muted">
          Sous la surface minimale (%)
          <input
            v-model="tolSurface"
            inputmode="decimal"
            class="rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
          />
          <span v-if="thresholds?.surfaceMin != null"
            >soit {{ thresholds.surfaceMin.toLocaleString('fr-FR') }} m²</span
          >
        </label>
        <label class="grid content-start gap-1 text-xs text-muted">
          Pièces de moins
          <input
            v-model="tolRooms"
            inputmode="numeric"
            class="rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
          />
          <span v-if="thresholds?.roomsMin != null"
            >soit {{ thresholds.roomsMin }} pièce(s)</span
          >
        </label>
        <label class="grid content-start gap-1 text-xs text-muted">
          DPE en plus
          <select
            v-model.number="tolDpe"
            class="rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
          >
            <option v-for="m in DPE_MARGINS" :key="m.value" :value="m.value">
              {{ m.label }}
            </option>
          </select>
          <span v-if="thresholds?.dpeMax != null"
            >soit {{ thresholds.dpeMax }}</span
          >
        </label>
        <label class="grid content-start gap-1 text-xs text-muted">
          Distance au tram en plus (m)
          <input
            v-model="tolTram"
            inputmode="numeric"
            class="rounded-lg border border-line bg-bg px-2 py-1 text-sm text-fg"
          />
          <span v-if="thresholds?.tramMeters != null"
            >soit {{ thresholds.tramMeters.toLocaleString('fr-FR') }} m</span
          >
        </label>
      </div>
      <section
        class="grid gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2.5 text-xs leading-relaxed text-fg"
        aria-labelledby="imprecise-rule-title"
      >
        <h3 id="imprecise-rule-title" class="text-sm font-semibold">
          Annonces sans adresse exacte
        </h3>
        <ul class="grid list-disc gap-1 pl-4">
          <li>
            On compare le contour du quartier ou de la commune, pas le repère.
          </li>
          <li>
            Contour entièrement dedans : « dans les critères ». Contour qui
            touche le périmètre ou la marge : « à confirmer », jusqu’à ce que
            l’adresse soit connue.
          </li>
          <li>
            Une donnée manquante (surface, pièces, DPE) donne aussi « à
            confirmer », jamais « hors critères ».
          </li>
        </ul>
      </section>
    </fieldset>

    <section
      v-if="preview.data.value"
      class="grid gap-2 rounded-xl border border-line p-3"
      aria-labelledby="fit-preview-title"
      data-testid="fit-preview"
    >
      <h3 id="fit-preview-title" class="text-sm font-semibold">
        Aperçu sur vos annonces actives
      </h3>
      <dl class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2">
        <template v-for="level in PREVIEW_LEVELS" :key="level">
          <dt class="flex items-center"><FitBadge :level="level" /></dt>
          <dd
            class="m-0 text-base font-bold tabular-nums"
            :data-preview-level="level"
          >
            {{ preview.data.value.fitCounts[level] }}
          </dd>
        </template>
      </dl>
      <p class="text-xs text-muted" data-testid="fit-preview-note">
        <template v-if="!marginOn"
          >Marge désactivée : une annonce qui dépasse un seuil passe hors
          critères.</template
        >
        <template v-else-if="marginReasons.length"
          >Calculé à la saisie, avant d’enregistrer. À la marge :
          {{ marginReasons.join(' ; ') }}.</template
        >
        <template v-else>Calculé à la saisie, avant d’enregistrer.</template>
      </p>
    </section>

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
          {{ preview.data.value.listingCount }} annonce(s) gardée(s)
          <template v-if="preview.data.value.approximateCount">
            dont {{ preview.data.value.approximateCount }} à confirmer faute
            d’adresse
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
