<script setup lang="ts">
  import { computed, ref, toRef, watch } from 'vue'
  import type { Assumptions, AssumptionsImpact } from '@apart/contracts'
  import { useActiveSection } from '@/composables/useActiveSection'
  import {
    provideAssumptionsDraft,
    useAssumptionsDraft,
  } from '@/composables/useAssumptionsDraft'
  import { DESKTOP_QUERY, useMediaQuery } from '@/composables/useMediaQuery'
  import { ASSUMPTIONS_SECTIONS, fieldLabel } from '@/lib/assumptions-form'
  import type { SectionId } from '@/lib/assumptions-form'
  import AssumptionsNav from './AssumptionsNav.vue'
  import AssumptionsSection from './AssumptionsSection.vue'
  import CalendarFields from './CalendarFields.vue'
  import CriteriaFields from './CriteriaFields.vue'
  import FinancingFields from './FinancingFields.vue'
  import NotaryFields from './NotaryFields.vue'
  import SaveBar from './SaveBar.vue'
  import TaxationFields from './TaxationFields.vue'

  /**
   * La page Hypothèses (lot 13) : cinq sections en questions, un sommaire
   * (colonne d'ancres sur ordinateur, accordéons sur mobile), les
   * modifications marquées champ par champ et une barre d'enregistrement
   * collée en bas. Présentation seulement : les hypothèses émises pour une
   * saisie donnée sont celles du formulaire d'avant (`valuesFromForm`).
   */
  const props = defineProps<{
    values: Assumptions
    saving?: boolean
    /** Impact des valeurs saisies sur les annonces actives, rendu par la page après « Voir l'impact ». */
    impact?: AssumptionsImpact | null
    previewing?: boolean
    /** Message du dernier enregistrement. */
    message?: string | null
    /** Échec de l'enregistrement ou de l'aperçu, rendu par la page. */
    failure?: string | null
  }>()
  const emit = defineEmits<{
    save: [update: { label: string | undefined; values: Assumptions }]
    preview: [values: Assumptions]
    discard: []
  }>()

  const desktop = useMediaQuery(DESKTOP_QUERY)
  const draft = useAssumptionsDraft(toRef(props, 'values'), desktop)
  provideAssumptionsDraft(draft)
  const {
    form,
    changes,
    errors,
    summaries,
    openSections,
    openPanels,
    changedIn,
    rebased,
  } = draft

  const SECTION = Object.fromEntries(
    ASSUMPTIONS_SECTIONS.map(s => [s.id, s])
  ) as Record<SectionId, (typeof ASSUMPTIONS_SECTIONS)[number]>

  const navItems = computed(() =>
    ASSUMPTIONS_SECTIONS.map(section => ({
      id: section.id,
      index: section.index,
      title: section.shortTitle,
      summary: summaries.value[section.id],
      changed: changedIn(section.id),
    }))
  )
  const active = useActiveSection(
    [...ASSUMPTIONS_SECTIONS.map(s => s.id), 'historique'],
    desktop
  )

  const errorList = computed(() =>
    Object.entries(errors.value).map(([key, message]) => ({
      key,
      label: fieldLabel(key, form.value.scale.bands.length),
      message,
    }))
  )

  const impactVisible = ref(false)
  const impactStale = ref(false)
  watch(
    form,
    () => {
      if (impactVisible.value && props.impact) impactStale.value = true
    },
    { deep: true }
  )
  watch(
    () => props.impact,
    () => {
      impactStale.value = false
    }
  )
  watch(
    () => changes.value.length === 0,
    none => {
      if (none) impactVisible.value = false
    }
  )

  function submit(): void {
    // Rien de modifié : pas de version identique (Entrée dans un champ).
    if (changes.value.length === 0) return
    const values = draft.validate()
    if (!values) return
    emit('save', { label: form.value.label.trim() || undefined, values })
  }

  function preview(): void {
    const values = draft.validate()
    if (!values) return
    impactVisible.value = true
    impactStale.value = false
    emit('preview', values)
  }

  function cancel(): void {
    draft.reset()
    impactVisible.value = false
    emit('discard')
  }

  function go(id: string): void {
    const target = document.getElementById(id)
    if (!target) return
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView?.({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'start',
    })
    document.getElementById(`${id}-title`)?.focus({ preventScroll: true })
    active.value = id
  }

  const toolButton =
    'min-h-11 shrink-0 rounded-lg border border-muted/70 bg-surface px-3.5 text-sm font-medium hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
</script>

<template>
  <form class="grid" novalidate @submit.prevent="submit">
    <div
      class="mx-auto grid w-full max-w-6xl gap-3 px-4 pb-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6"
    >
      <AssumptionsNav
        v-if="desktop"
        :items="navItems"
        :active="active"
        @go="go"
      />
      <div class="grid min-w-0 content-start gap-3 lg:gap-4">
        <AssumptionsSection
          v-model:open="openSections.financement"
          :section="SECTION.financement"
          :summary="summaries.financement"
          :changed="changedIn('financement')"
          :desktop="desktop"
        >
          <FinancingFields />
        </AssumptionsSection>
        <AssumptionsSection
          v-model:open="openSections.criteres"
          :section="SECTION.criteres"
          :summary="summaries.criteres"
          :changed="changedIn('criteres')"
          :desktop="desktop"
        >
          <CriteriaFields />
        </AssumptionsSection>
        <AssumptionsSection
          v-model:open="openSections.calendrier"
          :section="SECTION.calendrier"
          :summary="summaries.calendrier"
          :changed="changedIn('calendrier')"
          :desktop="desktop"
        >
          <CalendarFields />
        </AssumptionsSection>
        <AssumptionsSection
          v-model:open="openSections.notaire"
          :section="SECTION.notaire"
          :summary="summaries.notaire"
          :changed="changedIn('notaire')"
          :desktop="desktop"
        >
          <NotaryFields />
        </AssumptionsSection>
        <AssumptionsSection
          v-model:open="openSections.fiscalite"
          :section="SECTION.fiscalite"
          :summary="summaries.fiscalite"
          :changed="changedIn('fiscalite')"
          :desktop="desktop"
        >
          <template #actions>
            <button
              type="button"
              :class="toolButton"
              :aria-expanded="openPanels.taxation"
              aria-controls="taxation-panel"
              data-testid="toggle-taxation"
              @click="openPanels.taxation = !openPanels.taxation"
            >
              {{ openPanels.taxation ? 'Replier' : 'Modifier' }}
            </button>
          </template>
          <TaxationFields />
        </AssumptionsSection>
        <slot name="after" />
      </div>
    </div>
    <SaveBar
      v-model:label="form.label"
      :changes="changes"
      :errors="errorList"
      :saving="saving"
      :previewing="previewing"
      :message="message ?? null"
      :failure="failure ?? null"
      :rebased="rebased"
      :impact="impact ?? null"
      :impact-visible="impactVisible"
      :impact-stale="impactStale"
      @cancel="cancel"
      @preview="preview"
      @hide-impact="impactVisible = false"
      @reveal="draft.reveal"
    />
  </form>
</template>
