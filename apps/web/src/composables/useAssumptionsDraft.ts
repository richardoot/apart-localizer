import { computed, inject, nextTick, provide, ref, watch } from 'vue'
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import { DEFAULT_NOTARY_SCALE, NotaryScaleSchema } from '@apart/contracts'
import type { Assumptions, TargetCriterion } from '@apart/contracts'
import {
  discountScale,
  notaryEffectiveRate,
  referenceMonthlyPayment,
} from '@apart/domain'
import type { DiscountScale } from '@apart/domain'
import {
  draftFromForm,
  fieldInputId,
  fieldLocation,
  formChanges,
  formFromValues,
  isDefaultScale,
  rebaseForm,
  scaleFormOf,
  toggleCriterion,
  valuesFromForm,
} from '@/lib/assumptions-form'
import type {
  AssumptionsDraft,
  AssumptionsFormModel,
  FieldChange,
  FieldErrors,
  PanelId,
  SectionId,
} from '@/lib/assumptions-form'
import { sectionSummaries, taxationPills } from '@/lib/assumptions-summary'

/** Les repères calculés par `@apart/domain` pendant la saisie. */
export interface AssumptionsReadings {
  /** Mensualité pour 100 000 € empruntés, assurance comprise ; null si la saisie est incomplète. */
  referencePayment: number | null
  /** Taux effectif du barème saisi sur le prix d'exemple ; null s'il est incomplet. */
  scaleRate: number | null
  /** Échelle de la marge de négociation ; null si les décotes sont incohérentes. */
  discountScale: DiscountScale | null
  /** Le barème saisi est celui par défaut. */
  scaleIsDefault: boolean
}

export interface AssumptionsDraftContext {
  /** Vrai sur ordinateur (deux colonnes), faux sur mobile (accordéons). */
  desktop: Ref<boolean>
  /** Les hypothèses en vigueur, auxquelles la saisie se compare. */
  values: Ref<Assumptions>
  form: Ref<AssumptionsFormModel>
  draft: ComputedRef<AssumptionsDraft>
  changes: ComputedRef<FieldChange[]>
  changeOf: (key: string) => FieldChange | null
  changedIn: (section: SectionId) => number
  errors: ComputedRef<FieldErrors>
  errorOf: (key: string) => string | null
  readings: ComputedRef<AssumptionsReadings>
  summaries: ComputedRef<Record<SectionId, string>>
  pills: ComputedRef<string[]>
  /** Sections ouvertes en accordéon (mobile). */
  openSections: Ref<Record<SectionId, boolean>>
  /** Parties repliées dans une section : marge, détail du barème, fiscalité, année par défaut. */
  openPanels: Ref<Record<PanelId, boolean>>
  /** Une nouvelle version est arrivée pendant la saisie, modifications gardées. */
  rebased: Ref<boolean>
  setCriterion: (criterion: TargetCriterion, checked: boolean) => void
  restoreDefaultScale: () => void
  /** Ouvre la section et la partie d'un champ, puis y porte le focus. */
  reveal: (key: string) => Promise<void>
  /** Valide la saisie : les hypothèses à enregistrer, ou null et les erreurs affichées. */
  validate: () => Assumptions | null
  /** Revient aux valeurs en vigueur. */
  reset: () => void
}

const KEY: InjectionKey<AssumptionsDraftContext> = Symbol('assumptions-draft')

/**
 * La saisie de la page Hypothèses (lot 13) : le formulaire, ses
 * modifications par rapport aux hypothèses en vigueur, ses erreurs (après
 * une première tentative d'enregistrement, puis en direct), les repères de
 * `domain` et les résumés. Partagée par les sections (`provide`).
 */
export function useAssumptionsDraft(
  values: Ref<Assumptions>,
  desktop: Ref<boolean>
): AssumptionsDraftContext {
  const initial = computed(() => formFromValues(values.value))
  const form = ref<AssumptionsFormModel>(formFromValues(values.value))
  const attempted = ref(false)
  const rebased = ref(false)
  const openSections = ref<Record<SectionId, boolean>>({
    financement: true,
    criteres: true,
    calendrier: false,
    notaire: false,
    fiscalite: false,
  })
  const openPanels = ref<Record<PanelId, boolean>>({
    negotiation: false,
    scaleDetail: false,
    taxation: false,
    rentalYear: false,
  })

  const draft = computed(() => draftFromForm(form.value))
  const changes = computed(() => formChanges(initial.value, form.value))
  const errors = computed<FieldErrors>(() =>
    attempted.value
      ? (valuesFromForm(form.value, values.value).errors ?? {})
      : {}
  )

  const readings = computed<AssumptionsReadings>(() => {
    const d = draft.value
    const scale = NotaryScaleSchema.safeParse(d.notaryScale)
    return {
      referencePayment: referenceMonthlyPayment(d),
      scaleRate: scale.success
        ? notaryEffectiveRate({
            notaryMode: 'scale',
            notaryRate: d.notaryRate ?? 0,
            notaryScale: scale.data,
          })
        : null,
      discountScale: discountScale(d.negotiableDiscount, d.tightDiscount),
      scaleIsDefault: isDefaultScale(form.value.scale),
    }
  })
  const summaries = computed(() =>
    sectionSummaries(draft.value, {
      notaryRate: readings.value.scaleRate,
      scaleIsDefault: readings.value.scaleIsDefault,
    })
  )
  const pills = computed(() => taxationPills(draft.value))

  // Une nouvelle version (enregistrée ici ou ailleurs) : la saisie est
  // reportée dessus ; sans modification restante, le formulaire repart à neuf.
  watch(values, (next, previous) => {
    const fresh = formFromValues(next)
    const merged = rebaseForm(formFromValues(previous), form.value, fresh)
    if (formChanges(fresh, merged).length === 0) {
      form.value = fresh
      attempted.value = false
      rebased.value = false
    } else {
      form.value = merged
      rebased.value = true
    }
  })

  async function reveal(key: string): Promise<void> {
    const { section, panel } = fieldLocation(key, form.value.scale.bands.length)
    openSections.value[section] = true
    if (panel) openPanels.value[panel] = true
    await nextTick()
    const element = document.getElementById(fieldInputId(key))
    element?.focus()
  }

  return {
    desktop,
    values,
    form,
    draft,
    changes,
    changeOf: key => changes.value.find(c => c.key === key) ?? null,
    changedIn: section =>
      changes.value.filter(c => c.section === section).length,
    errors,
    errorOf: key => errors.value[key] ?? null,
    readings,
    summaries,
    pills,
    openSections,
    openPanels,
    rebased,
    setCriterion(criterion, checked) {
      form.value.targetCriteria = toggleCriterion(
        form.value.targetCriteria,
        criterion,
        checked
      )
    },
    restoreDefaultScale() {
      form.value.scale = scaleFormOf(DEFAULT_NOTARY_SCALE)
    },
    reveal,
    validate() {
      attempted.value = true
      const result = valuesFromForm(form.value, values.value)
      if (result.errors) {
        const [first] = Object.keys(result.errors)
        if (first) void reveal(first)
        return null
      }
      return result.values
    },
    reset() {
      form.value = formFromValues(values.value)
      attempted.value = false
      rebased.value = false
    },
  }
}

export function provideAssumptionsDraft(
  context: AssumptionsDraftContext
): void {
  provide(KEY, context)
}

/** La saisie partagée par `AssumptionsForm` ; à n'appeler que sous lui. */
export function useAssumptionsDraftContext(): AssumptionsDraftContext {
  const context = inject(KEY, null)
  if (!context) {
    throw new Error('useAssumptionsDraftContext : hors de AssumptionsForm')
  }
  return context
}
