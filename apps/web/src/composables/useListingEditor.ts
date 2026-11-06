import { computed, inject, provide, ref, watch } from 'vue'
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { FieldProvenanceMap, Listing } from '@apart/contracts'
import { emptyForm, formFromListing } from '@/lib/listing-form'
import type { ListingForm } from '@/lib/listing-form'
import {
  LISTING_SECTIONS,
  isSectionDirty,
  sectionOfErrorKey,
  validateSection,
} from '@/lib/listing-sections'
import type { ListingSectionId } from '@/lib/listing-sections'
import type { LivePreview } from './useLivePreview'

/**
 * Lot 19 (ADR 0029) : l'édition de la fiche section par section. Une seule
 * section s'édite à la fois, sur un brouillon du formulaire de l'annonce
 * (`ListingForm`) ; l'aperçu en direct en est calculé (`useLivePreview`).
 * Quitter une section modifiée (autre section, autre onglet, fermeture de la
 * fiche) passe par `guard` : l'action attend la confirmation du membre
 * (`pending`), sans `window.confirm`.
 */
export interface ListingEditor {
  /** Le brouillon du formulaire, lié aux champs de la section en édition. */
  draft: Ref<ListingForm>
  /** La section en édition, ou null. */
  editing: Ref<ListingSectionId | null>
  /** Erreurs de la dernière tentative d'enregistrement, par champ. */
  errors: Ref<Record<string, string>>
  /** La section en édition a des modifications non enregistrées. */
  dirty: ComputedRef<boolean>
  /** L'action qui attend la confirmation (« Abandonner les modifications ? »). */
  pending: Ref<{ section: ListingSectionId; run: () => void } | null>
  /** Enregistrement en cours. */
  saving: Ref<boolean>
  /** L'aperçu en direct du brouillon. */
  preview: ComputedRef<LivePreview>
  /** La provenance des champs (pastille « IA »). */
  fieldSources: ComputedRef<FieldProvenanceMap | null>
  /** Champs modifiés depuis la dernière ouverture (journal). */
  changedFields: ComputedRef<readonly string[]>
  start: (section: ListingSectionId, focusId?: string) => void
  cancel: () => void
  save: (section: ListingSectionId) => Promise<boolean>
  /** Exécute l'action, ou la met en attente si la section en édition est modifiée. */
  guard: (run: () => void) => void
  /** Abandonne les modifications et exécute l'action en attente. */
  confirmLeave: () => void
  /** Garde les modifications : l'action en attente est oubliée. */
  stay: () => void
  /** Le titre d'une section (pour les messages). */
  titleOf: (section: ListingSectionId) => string
}

export const LISTING_EDITOR: InjectionKey<ListingEditor> =
  Symbol('listing-editor')

export interface ListingEditorOptions {
  listing: Ref<Listing | null>
  preview: (draft: Ref<ListingForm>) => ComputedRef<LivePreview>
  changedFields: ComputedRef<readonly string[]>
  /** Envoie la mise à jour de la section ; lance en cas d'échec. */
  submit: (
    section: ListingSectionId,
    patch: NonNullable<ReturnType<typeof validateSection>['patch']>
  ) => Promise<void>
  /** Après l'ouverture d'une section : le champ à atteindre. */
  focus?: (id: string) => void
}

export function createListingEditor(
  options: ListingEditorOptions
): ListingEditor {
  const draft = ref<ListingForm>(emptyForm())
  const pristine = ref<ListingForm>(emptyForm())
  const editing = ref<ListingSectionId | null>(null)
  const errors = ref<Record<string, string>>({})
  const pending = ref<{ section: ListingSectionId; run: () => void } | null>(
    null
  )
  const saving = ref(false)

  function reset(): void {
    const listing = options.listing.value
    draft.value = listing ? formFromListing(listing) : emptyForm()
    pristine.value = listing ? formFromListing(listing) : emptyForm()
    errors.value = {}
  }

  // La fiche relue (enregistrement, autre membre) : le brouillon s'y cale
  // tant que rien n'est en édition.
  watch(
    () => options.listing.value,
    () => {
      if (editing.value === null) reset()
    },
    { immediate: true }
  )

  const dirty = computed(
    () =>
      editing.value !== null &&
      isSectionDirty(editing.value, pristine.value, draft.value)
  )

  function guard(run: () => void): void {
    if (dirty.value && editing.value !== null) {
      pending.value = { section: editing.value, run }
      return
    }
    run()
  }

  function cancel(): void {
    editing.value = null
    pending.value = null
    reset()
  }

  function start(section: ListingSectionId, focusId?: string): void {
    if (editing.value === section) {
      if (focusId) options.focus?.(focusId)
      return
    }
    guard(() => {
      cancel()
      editing.value = section
      if (focusId) options.focus?.(focusId)
    })
  }

  async function save(section: ListingSectionId): Promise<boolean> {
    const { patch, errors: issues } = validateSection(section, draft.value)
    errors.value = issues
    if (!patch) {
      const elsewhere = Object.keys(issues).some(
        key => sectionOfErrorKey(key) !== section
      )
      if (elsewhere) {
        errors.value = {
          ...issues,
          _section:
            'Une autre partie de la fiche est invalide : rouvrez-la pour la corriger.',
        }
      }
      return false
    }
    saving.value = true
    try {
      await options.submit(section, patch)
      editing.value = null
      pending.value = null
      // La fiche relue arrive par le cache ; le brouillon s'y recale.
      reset()
      return true
    } catch {
      return false
    } finally {
      saving.value = false
    }
  }

  function confirmLeave(): void {
    const action = pending.value
    cancel()
    action?.run()
  }

  function stay(): void {
    pending.value = null
  }

  return {
    draft,
    editing,
    errors,
    dirty,
    pending,
    saving,
    preview: options.preview(draft),
    fieldSources: computed(() => options.listing.value?.fieldSources ?? null),
    changedFields: options.changedFields,
    start,
    cancel,
    save,
    guard,
    confirmLeave,
    stay,
    titleOf: section => LISTING_SECTIONS[section].title,
  }
}

/** Fournit l'éditeur aux sections de la fiche. */
export function provideListingEditor(editor: ListingEditor): void {
  provide(LISTING_EDITOR, editor)
}

/** L'éditeur de la fiche ouverte (les sections l'injectent). */
export function useListingEditor(): ListingEditor {
  const editor = inject(LISTING_EDITOR, null)
  if (!editor) {
    throw new Error('useListingEditor : à utiliser dans la fiche annonce')
  }
  return editor
}
