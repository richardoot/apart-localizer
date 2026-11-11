import { computed, inject, provide, ref, watch } from 'vue'
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { FieldProvenanceMap, Listing } from '@apart/contracts'
import { errorMessage } from '@/lib/errors'
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
 *
 * Lot 20 : une section externe (« Mon avis », id `opinion`) passe par la même
 * garde : elle s'enregistre (`registerSection`) avec son titre, son test de
 * modification et sa remise à zéro ; elle s'ouvre par `start`, se referme par
 * `cancel` ou, une fois enregistrée par elle-même, par `finish`.
 */

/** Lot 20 : une section qui n'est pas un morceau du formulaire de l'annonce. */
export type ExternalSectionId = 'opinion'
/** Ce que l'éditeur peut avoir en cours. */
export type EditorSectionId = ListingSectionId | ExternalSectionId

export interface ExternalSection {
  title: string
  /** Vrai si la section a des modifications non enregistrées. */
  isDirty: () => boolean
  /** Abandonne les modifications (fermeture de la section). */
  reset: () => void
}

export interface ListingEditor {
  /** Le brouillon du formulaire, lié aux champs de la section en édition. */
  draft: Ref<ListingForm>
  /** La section en édition, ou null. */
  editing: Ref<EditorSectionId | null>
  /**
   * Erreurs de la dernière tentative d'enregistrement, par champ ;
   * `_section` : une autre section est invalide ; `_submit` : le serveur a
   * refusé (lot 22 : dit dans la section).
   */
  errors: Ref<Record<string, string>>
  /** La section en édition a des modifications non enregistrées. */
  dirty: ComputedRef<boolean>
  /** L'action qui attend la confirmation (« Abandonner les modifications ? »). */
  pending: Ref<{ section: EditorSectionId; run: () => void } | null>
  /** Enregistrement en cours. */
  saving: Ref<boolean>
  /** L'aperçu en direct du brouillon. */
  preview: ComputedRef<LivePreview>
  /** La provenance des champs (pastille « IA »). */
  fieldSources: ComputedRef<FieldProvenanceMap | null>
  /** Champs modifiés depuis la dernière ouverture (journal). */
  changedFields: ComputedRef<readonly string[]>
  start: (section: EditorSectionId, focusId?: string) => void
  cancel: () => void
  save: (section: ListingSectionId) => Promise<boolean>
  /** Lot 20 : déclare une section externe ; rend la fonction qui la retire. */
  registerSection: (
    id: ExternalSectionId,
    section: ExternalSection
  ) => () => void
  /** Lot 20 : une section externe enregistrée se referme sans confirmation. */
  finish: (id: ExternalSectionId) => void
  /** Exécute l'action, ou la met en attente si la section en édition est modifiée. */
  guard: (run: () => void) => void
  /** Abandonne les modifications et exécute l'action en attente. */
  confirmLeave: () => void
  /** Garde les modifications : l'action en attente est oubliée. */
  stay: () => void
  /** Le titre d'une section (pour les messages). */
  titleOf: (section: EditorSectionId) => string
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
  const editing = ref<EditorSectionId | null>(null)
  const errors = ref<Record<string, string>>({})
  const pending = ref<{ section: EditorSectionId; run: () => void } | null>(
    null
  )
  const saving = ref(false)
  const externals = new Map<ExternalSectionId, ExternalSection>()
  const externalOf = (
    section: EditorSectionId | null
  ): ExternalSection | null =>
    section !== null && externals.has(section as ExternalSectionId)
      ? (externals.get(section as ExternalSectionId) ?? null)
      : null

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

  const dirty = computed(() => {
    const section = editing.value
    if (section === null) return false
    const external = externalOf(section)
    if (external) return external.isDirty()
    if (section === 'opinion') return false
    return isSectionDirty(section, pristine.value, draft.value)
  })

  function guard(run: () => void): void {
    if (dirty.value && editing.value !== null) {
      pending.value = { section: editing.value, run }
      return
    }
    run()
  }

  function cancel(): void {
    externalOf(editing.value)?.reset()
    editing.value = null
    pending.value = null
    reset()
  }

  function start(section: EditorSectionId, focusId?: string): void {
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
      // Lot 22 : une erreur dans une autre section est nommée, avec son
      // message ; celles de la section ouverte sont au champ.
      const elsewhere = Object.entries(issues).find(
        ([key]) => sectionOfErrorKey(key) !== section
      )
      if (elsewhere) {
        const [key, text] = elsewhere
        const other = sectionOfErrorKey(key)
        const where = other
          ? `La section « ${LISTING_SECTIONS[other].title} »`
          : 'Une autre partie de la fiche'
        errors.value = {
          ...issues,
          _section: `${where} a une erreur (${text}) : enregistre ou annule ici, puis ouvre-la pour la corriger.`,
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
    } catch (err) {
      // Lot 22 : le refus du serveur se dit dans la section, pas en haut.
      errors.value = {
        _submit: errorMessage(err, 'L’enregistrement a échoué.'),
      }
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

  function registerSection(
    id: ExternalSectionId,
    section: ExternalSection
  ): () => void {
    externals.set(id, section)
    return () => {
      if (externals.get(id) === section) externals.delete(id)
      if (editing.value === id) {
        editing.value = null
        pending.value = null
      }
    }
  }

  function finish(id: ExternalSectionId): void {
    if (editing.value !== id) return
    editing.value = null
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
    registerSection,
    finish,
    titleOf: section =>
      externalOf(section)?.title ??
      (section === 'opinion'
        ? 'Mon avis'
        : LISTING_SECTIONS[section as ListingSectionId].title),
  }
}

/** Fournit l'éditeur aux sections de la fiche. */
export function provideListingEditor(editor: ListingEditor): void {
  provide(LISTING_EDITOR, editor)
}

/** Lot 20 : l'éditeur s'il y en a un (« Nos avis » se monte aussi hors de la fiche). */
export function useOptionalListingEditor(): ListingEditor | null {
  return inject(LISTING_EDITOR, null)
}

/** L'éditeur de la fiche ouverte (les sections l'injectent). */
export function useListingEditor(): ListingEditor {
  const editor = inject(LISTING_EDITOR, null)
  if (!editor) {
    throw new Error('useListingEditor : à utiliser dans la fiche annonce')
  }
  return editor
}
