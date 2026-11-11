<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'
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
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiChip from '@/components/ui/UiChip.vue'
  import UiField from '@/components/ui/UiField.vue'
  import UiInput from '@/components/ui/UiInput.vue'
  import UiSegmented from '@/components/ui/UiSegmented.vue'
  import FitBadge from '@/components/listings/FitBadge.vue'
  import { errorMessage } from '@/lib/errors'
  import {
    formatEuros,
    numberInputError,
    parseNumberInput,
    plural,
  } from '@/lib/format'
  import { LISTING_STATUS_LABELS, VERDICT_LABELS } from '@/lib/labels'
  import { describePerimeter } from '@/lib/perimeter'
  import CriteriaMap from './CriteriaMap.vue'

  /**
   * Création et modification d'un critère : nom, filtres métier, marge de
   * tolérance (lot 14 : seuils réels « soit 231 000 € », marge appliquée ou
   * désactivée), périmètre (aucun, point et rayon, polygone ou cercle
   * dessinés, isochrone par adresse ou clic), aperçu par niveau d'adéquation
   * calculé par le serveur avant d'enregistrer.
   *
   * Lot 22 : un nombre illisible (« 250k ») ou une marge hors de ses bornes
   * est refusé au champ, jamais transformé en « pas de filtre » ni ramené en
   * silence dans ses bornes ; l'enregistrement est bloqué et le premier
   * champ en erreur reçoit le focus. `isDirty` sert à la garde du panneau.
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

  /** Une marge doit rester dans ses bornes : sinon, on le dit au champ. */
  function rangeError(raw: string, max: number, unit: string): string | null {
    const unreadable = numberInputError(raw)
    if (unreadable) return unreadable
    const value = parseNumberInput(raw)
    if (value === null) return null
    if (value < 0 || value > max) {
      return `Entre 0 et ${max.toLocaleString('fr-FR')} ${unit}.`
    }
    return null
  }

  /** Les erreurs de saisie, par champ (identifiant du champ). */
  const fieldErrors = computed<Record<string, string>>(() => {
    const entries: [string, string | null][] = [
      ['c-price-max', numberInputError(priceMax.value)],
      ['c-price-min', numberInputError(priceMin.value)],
      ['c-surface-min', numberInputError(surfaceMin.value)],
      ['c-rooms-min', numberInputError(roomsMin.value)],
      ['c-tram', numberInputError(tramMax.value)],
      ['tol-perimeter', rangeError(tolPerimeter.value, 2000, 'm')],
      ['tol-price-max', rangeError(tolPriceMax.value, 50, '%')],
      ['tol-price-min', rangeError(tolPriceMin.value, 50, '%')],
      ['tol-surface', rangeError(tolSurface.value, 50, '%')],
      ['tol-rooms', rangeError(tolRooms.value, 3, 'pièces')],
      ['tol-tram', rangeError(tolTram.value, 2000, 'm')],
    ]
    return Object.fromEntries(
      entries.filter((entry): entry is [string, string] => entry[1] !== null)
    )
  })
  const hasFieldErrors = computed(
    () => Object.keys(fieldErrors.value).length > 0
  )

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
      // Une saisie refusée ne part pas, même en aperçu.
      if (hasFieldErrors.value) return null
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
    // Lot 26 : périmètre effacé ou pas encore posé, rien à montrer (pas l'aperçu d'avant).
    if (!perimeterInput.value) return null
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

  /**
   * Lot 26 : « Effacer » sur la carte : plus de forme, le périmètre est à
   * reposer (comme un changement de type) ; le critère enregistré ne change
   * qu'à « Enregistrer ».
   */
  function onCleared(): void {
    touched.value = true
    perimeterInput.value = null
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
      failure.value =
        'Donne une adresse de départ ou pose le point sur la carte.'
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

  /** Un champ numérique (`type="number"`) : seule une valeur lisible remplace l'ancienne. */
  function setNumber(value: unknown, set: (next: number) => void): void {
    const parsed = parseNumberInput(
      typeof value === 'number' ? value : String(value ?? '')
    )
    if (parsed !== null) set(parsed)
  }

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value)
      ? list.filter(v => v !== value)
      : [...list, value]
  }

  const formRef = ref<HTMLFormElement | null>(null)
  const nameError = ref<string | null>(null)

  /** Après un refus, le premier champ en erreur reçoit le focus. */
  async function focusFirstInvalid(): Promise<void> {
    await nextTick()
    const field =
      formRef.value?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? null
    field?.focus?.()
    field?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }

  async function save(): Promise<void> {
    failure.value = null
    nameError.value = null
    if (!name.value.trim()) {
      nameError.value = 'Donne un nom au critère.'
      await focusFirstInvalid()
      return
    }
    if (hasFieldErrors.value) {
      failure.value =
        'Des valeurs ne sont pas lisibles : corrige les champs signalés.'
      await focusFirstInvalid()
      return
    }
    if (touched.value && kind.value !== 'none' && !perimeterInput.value) {
      failure.value =
        'Le périmètre n’est pas encore posé : dessine-le, pose le point sur la carte, ou calcule l’isochrone.'
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
      failure.value = errorMessage(err, "L'enregistrement a échoué.")
    }
  }

  /** L'état de la saisie, pour savoir si elle a changé depuis l'ouverture. */
  function snapshot(): string {
    return JSON.stringify([
      name.value,
      priceMax.value,
      priceMin.value,
      surfaceMin.value,
      roomsMin.value,
      tramMax.value,
      dpeMax.value,
      communes.value,
      verdicts.value,
      statuses.value,
      tolPerimeter.value,
      tolPriceMax.value,
      tolPriceMin.value,
      tolSurface.value,
      tolRooms.value,
      tolDpe.value,
      tolTram.value,
      isoAddress.value,
    ])
  }
  const initialSnapshot = snapshot()
  /** Lot 22 : vrai si la saisie ou le périmètre ont changé depuis l'ouverture. */
  function isDirty(): boolean {
    return touched.value || snapshot() !== initialSnapshot
  }
  defineExpose({ isDirty })

  const saving = computed(
    () => mutations.create.isPending.value || mutations.update.isPending.value
  )
  const dpeClasses = DpeClassSchema.options
  const isoModes = IsochroneModeSchema.options
</script>

<template>
  <form ref="formRef" class="grid gap-4" novalidate @submit.prevent="save">
    <UiField
      id="c-name"
      v-model="name"
      label="Nom"
      placeholder="Talence à 10 minutes du tram"
      :error="nameError"
    />

    <fieldset class="grid gap-3 rounded-2xl border border-line p-4">
      <legend class="px-1 text-sm font-semibold">Filtres</legend>
      <div class="grid gap-3 sm:grid-cols-3">
        <UiField
          id="c-price-max"
          v-model="priceMax"
          label="Prix maximal"
          unit="€"
          quiet
          inputmode="numeric"
          :error="fieldErrors['c-price-max']"
          data-testid="c-price-max"
        />
        <UiField
          id="c-price-min"
          v-model="priceMin"
          label="Prix minimal"
          unit="€"
          quiet
          inputmode="numeric"
          :error="fieldErrors['c-price-min']"
        />
        <UiField
          id="c-surface-min"
          v-model="surfaceMin"
          label="Surface minimale"
          unit="m²"
          quiet
          inputmode="decimal"
          :error="fieldErrors['c-surface-min']"
        />
        <UiField
          id="c-rooms-min"
          v-model="roomsMin"
          label="Pièces minimum"
          quiet
          inputmode="numeric"
          :error="fieldErrors['c-rooms-min']"
        />
        <UiField
          id="c-dpe-max"
          v-model="dpeMax"
          as="select"
          label="DPE au plus"
          quiet
          :options="[
            { value: '', label: 'Tous' },
            ...dpeClasses.map(dpe => ({ value: dpe, label: dpe })),
          ]"
        />
        <UiField
          id="c-tram"
          v-model="tramMax"
          label="Tram à moins de"
          unit="m"
          quiet
          inputmode="numeric"
          :error="fieldErrors['c-tram']"
          data-testid="c-tram"
        />
      </div>
      <UiField
        id="c-communes"
        v-model="communes"
        label="Communes"
        quiet
        hint="séparées par des virgules ; vide = toutes"
      />
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Verdicts">
        <UiChip
          v-for="verdict in VerdictSchema.options"
          :key="verdict"
          :selected="verdicts.includes(verdict)"
          @click="verdicts = toggle(verdicts, verdict)"
        >
          {{ VERDICT_LABELS[verdict] }}
        </UiChip>
      </div>
      <div
        class="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Statuts (vide = actifs)"
      >
        <UiChip
          v-for="status in ListingStatusSchema.options"
          :key="status"
          :selected="statuses.includes(status)"
          @click="statuses = toggle(statuses, status)"
        >
          {{ LISTING_STATUS_LABELS[status] }}
        </UiChip>
      </div>
    </fieldset>

    <fieldset
      class="grid gap-3 rounded-2xl border border-line p-4"
      data-testid="tolerance"
    >
      <legend class="px-1 text-sm font-semibold">
        <span class="inline-flex items-center gap-2"
          >Marge de tolérance <DefinitionButton term="criteria_tolerance"
        /></span>
      </legend>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="max-w-xl text-sm text-muted">
          Une annonce qui dépasse un peu reste visible, « à la marge », avec la
          raison. Au-delà, elle passe « hors critères » sans être perdue.
        </p>
        <UiButton
          :variant="marginOn ? 'primary' : 'secondary'"
          class="rounded-full! px-4 font-semibold"
          :aria-pressed="marginOn"
          data-testid="tolerance-toggle"
          @click="toggleMargin"
        >
          {{ marginOn ? 'Marge appliquée' : 'Marge désactivée' }}
        </UiButton>
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <UiField
          id="tol-perimeter"
          v-model="tolPerimeter"
          label="Autour du périmètre"
          unit="m"
          quiet
          inputmode="numeric"
          hint="adresse exacte ou à la rue ; contour du quartier sinon"
          :error="fieldErrors['tol-perimeter']"
          data-testid="tol-perimeter"
        />
        <UiField
          id="tol-price-max"
          label="Au-dessus du prix maximal"
          quiet
          :error="fieldErrors['tol-price-max']"
        >
          <template #default="{ id, describedBy, invalid }">
            <UiInput
              :id="id"
              v-model="tolPriceMax"
              unit="%"
              inputmode="decimal"
              :invalid="invalid"
              :described-by="describedBy"
              data-testid="tol-price-max"
            />
            <span
              v-if="thresholds?.priceMax != null"
              class="text-xs text-muted"
              data-testid="tol-price-max-threshold"
              >soit {{ formatEuros(thresholds.priceMax) }}</span
            >
          </template>
        </UiField>
        <UiField
          id="tol-price-min"
          v-model="tolPriceMin"
          label="Sous le prix minimal"
          unit="%"
          quiet
          inputmode="decimal"
          :hint="
            thresholds?.priceMin != null
              ? `soit ${formatEuros(thresholds.priceMin)}`
              : null
          "
          :error="fieldErrors['tol-price-min']"
        />
        <UiField
          id="tol-surface"
          v-model="tolSurface"
          label="Sous la surface minimale"
          unit="%"
          quiet
          inputmode="decimal"
          :hint="
            thresholds?.surfaceMin != null
              ? `soit ${thresholds.surfaceMin.toLocaleString('fr-FR')} m²`
              : null
          "
          :error="fieldErrors['tol-surface']"
        />
        <UiField
          id="tol-rooms"
          v-model="tolRooms"
          label="Pièces de moins"
          quiet
          inputmode="numeric"
          :hint="
            thresholds?.roomsMin != null
              ? `soit ${plural(thresholds.roomsMin, 'pièce')}`
              : null
          "
          :error="fieldErrors['tol-rooms']"
        />
        <UiField
          id="tol-dpe"
          v-model="tolDpe"
          as="select"
          label="DPE en plus"
          quiet
          :options="DPE_MARGINS"
          :hint="
            thresholds?.dpeMax != null ? `soit ${thresholds.dpeMax}` : null
          "
        />
        <UiField
          id="tol-tram"
          v-model="tolTram"
          label="Distance au tram en plus"
          unit="m"
          quiet
          inputmode="numeric"
          :hint="
            thresholds?.tramMeters != null
              ? `soit ${thresholds.tramMeters.toLocaleString('fr-FR')} m`
              : null
          "
          :error="fieldErrors['tol-tram']"
        />
      </div>
      <section
        class="grid gap-1.5 rounded-xl border border-accent/40 bg-accent-soft px-3 py-2.5 text-sm leading-relaxed text-fg"
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
      class="grid gap-2 rounded-2xl border border-line p-4"
      aria-labelledby="fit-preview-title"
      data-testid="fit-preview"
    >
      <h3 id="fit-preview-title" class="text-sm font-semibold">
        Aperçu sur tes annonces actives
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
      <p class="text-sm text-muted" data-testid="fit-preview-note">
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

    <fieldset class="grid gap-3 rounded-2xl border border-line p-4">
      <legend class="px-1 text-sm font-semibold">Périmètre</legend>
      <UiSegmented
        :model-value="kind"
        :options="KINDS"
        label="Type de périmètre"
        class="flex-wrap"
        @update:model-value="setKind"
      />
      <UiField
        v-if="kind === 'point_radius'"
        id="c-radius"
        :model-value="radius"
        label="Rayon"
        unit="m"
        quiet
        class="max-w-40"
        type="number"
        min="50"
        max="50000"
        step="50"
        @update:model-value="value => setNumber(value, next => (radius = next))"
      />
      <div
        v-if="kind === 'isochrone'"
        class="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
      >
        <UiField
          id="c-iso-address"
          v-model="isoAddress"
          label="Adresse de départ (ou point sur la carte)"
          quiet
          data-testid="iso-address"
          :placeholder="
            isoOrigin
              ? `Point ${isoOrigin.latitude}, ${isoOrigin.longitude}`
              : '1 place de la Bourse, Bordeaux'
          "
          @input="isoOrigin = null"
        />
        <UiField
          id="c-iso-mode"
          v-model="isoMode"
          as="select"
          label="Mode"
          quiet
          :options="
            isoModes.map(m => ({ value: m, label: ISOCHRONE_MODE_LABELS[m] }))
          "
        />
        <UiField
          id="c-iso-minutes"
          :model-value="isoMinutes"
          label="Minutes"
          quiet
          class="w-24"
          type="number"
          min="1"
          max="60"
          @update:model-value="
            value => setNumber(value, next => (isoMinutes = next))
          "
        />
        <UiButton
          variant="outline"
          data-testid="iso-compute"
          @click="computeIsochrone"
        >
          Calculer
        </UiButton>
        <p
          v-if="isoMode === 'cycling'"
          class="text-sm text-muted sm:col-span-4"
        >
          À vélo, il n’y a pas d’itinéraire vélo : l'isochrone est approchée par
          la distance à pied sur le réseau, à 15 km/h.
        </p>
      </div>
      <CriteriaMap
        :perimeter="shownPerimeter"
        :draw-mode="drawMode"
        @drawn="onDrawn"
        @pick="onPick"
        @cleared="onCleared"
      />
      <p class="text-sm" aria-live="polite" data-testid="preview">
        {{ describePerimeter(shownPerimeter) }} ·
        <template v-if="hasFieldErrors"
          >aperçu en attente des corrections</template
        >
        <template v-else-if="preview.isFetching.value">calcul…</template>
        <template v-else-if="preview.error.value">
          <span class="text-bad">{{
            errorMessage(preview.error.value, 'L’aperçu a échoué.')
          }}</span>
        </template>
        <template v-else-if="preview.data.value">
          {{
            plural(
              preview.data.value.listingCount,
              'annonce gardée',
              'annonces gardées'
            )
          }}
          <template v-if="preview.data.value.approximateCount">
            dont {{ preview.data.value.approximateCount }} à confirmer faute
            d’adresse
          </template>
        </template>
        <template v-else>périmètre à poser</template>
      </p>
    </fieldset>
    <UiAlert v-if="failure">
      {{ failure }}
    </UiAlert>
    <div class="flex justify-end">
      <UiButton
        type="submit"
        variant="primary"
        :loading="saving"
        loading-label="Enregistrement…"
      >
        {{ criteria ? 'Enregistrer' : 'Créer le critère' }}
      </UiButton>
    </div>
  </form>
</template>
