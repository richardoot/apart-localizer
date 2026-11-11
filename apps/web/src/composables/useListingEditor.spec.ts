import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import type { Listing } from '@apart/contracts'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import { fakeListing } from '@/test/fixtures'
import { createListingEditor } from './useListingEditor'
import { useLivePreview } from './useLivePreview'

function editorFor(
  listing = fakeListing(),
  submit = vi.fn().mockResolvedValue(undefined)
) {
  const current = ref<Listing | null>(listing)
  const focus = vi.fn()
  const editor = createListingEditor({
    listing: current,
    changedFields: computed(() => ['surface']),
    preview: draft => useLivePreview(draft, ref(DEFAULT_ASSUMPTIONS)),
    submit,
    focus,
  })
  return { editor, current, submit, focus }
}

describe('édition par section (lot 19)', () => {
  it('une seule section à la fois, sur un brouillon de la fiche ; l’aperçu suit le brouillon', () => {
    const { editor, focus } = editorFor()
    expect(editor.editing.value).toBeNull()
    expect(editor.draft.value.surface).toBe('45')
    editor.start('works')
    expect(editor.editing.value).toBe('works')
    expect(editor.dirty.value).toBe(false)
    const before = editor.preview.value.evaluation?.metrics.totalCost ?? 0
    editor.draft.value.renovation.items.push({
      key: 'k-new',
      label: 'Cuisine',
      amount: '6000',
    })
    expect(editor.dirty.value).toBe(true)
    expect(editor.preview.value.evaluation?.metrics.totalCost).toBe(
      before + 6000
    )
    // Une autre section : la modification attend la confirmation.
    editor.start('features')
    expect(editor.editing.value).toBe('works')
    expect(editor.pending.value?.section).toBe('works')
    editor.stay()
    expect(editor.pending.value).toBeNull()
    expect(editor.draft.value.renovation.items).toHaveLength(3)
    editor.start('features')
    editor.confirmLeave()
    expect(editor.editing.value).toBe('features')
    expect(editor.draft.value.renovation.items).toHaveLength(2)
    // Rouvrir la section en cours mène seulement au champ.
    editor.start('features', 'f-surface')
    expect(focus).toHaveBeenCalledWith('f-surface')
    editor.start('listing', 'f-address')
    expect(editor.editing.value).toBe('listing')
    expect(focus).toHaveBeenLastCalledWith('f-address')
    expect(editor.titleOf('listing')).toBe('L’annonce et son adresse')
    expect(editor.changedFields.value).toEqual(['surface'])
    expect(editor.fieldSources.value).toEqual({})
  })

  it('enregistre la mise à jour de la section seule ; un échec garde l’édition', async () => {
    const { editor, submit } = editorFor()
    editor.start('energy')
    editor.draft.value.gesClass = 'C'
    expect(await editor.save('energy')).toBe(true)
    expect(submit).toHaveBeenCalledWith('energy', {
      dpeClass: 'D',
      gesClass: 'C',
      dpeDate: null,
    })
    expect(editor.editing.value).toBeNull()
    submit.mockRejectedValueOnce(new Error('409'))
    editor.start('notes')
    editor.draft.value.notes = 'Vu'
    expect(await editor.save('notes')).toBe(false)
    expect(editor.editing.value).toBe('notes')
    expect(editor.saving.value).toBe(false)
  })

  it('une saisie invalide n’envoie rien et dit l’erreur ; une autre partie invalide est signalée', async () => {
    const { editor, submit } = editorFor()
    editor.start('energy')
    editor.draft.value.dpeDate = '15/03/2024'
    expect(await editor.save('energy')).toBe(false)
    expect(submit).not.toHaveBeenCalled()
    expect(editor.errors.value.dpeDate).toMatch(/AAAA-MM-JJ/)
    expect(editor.errors.value._section).toBeUndefined()
    expect(await editor.save('notes')).toBe(false)
    expect(editor.errors.value._section).toMatch(
      /La section « Énergie » a une erreur \(La date du DPE doit être au format AAAA-MM-JJ\.\)/
    )
  })

  it('guard : exécute tout de suite sans modification, attend sinon ; la fiche relue recale le brouillon', () => {
    const { editor, current } = editorFor()
    const run = vi.fn()
    editor.guard(run)
    expect(run).toHaveBeenCalledTimes(1)
    editor.start('copro')
    editor.draft.value.syndic = 'Syndic [Exemple]'
    editor.guard(run)
    expect(run).toHaveBeenCalledTimes(1)
    editor.confirmLeave()
    expect(run).toHaveBeenCalledTimes(2)
    expect(editor.editing.value).toBeNull()
    current.value = fakeListing({ surface: 50 })
    return Promise.resolve().then(() => {
      expect(editor.draft.value.surface).toBe('50')
    })
  })

  it('lot 20 : une section externe (« Mon avis ») passe par la même garde', () => {
    const { editor } = editorFor()
    let dirty = false
    const reset = vi.fn(() => {
      dirty = false
    })
    // Sans enregistrement : « Mon avis » s'ouvre, sans modification ni titre propre.
    editor.start('opinion')
    expect(editor.editing.value).toBe('opinion')
    expect(editor.dirty.value).toBe(false)
    expect(editor.titleOf('opinion')).toBe('Mon avis')
    editor.cancel()

    const unregister = editor.registerSection('opinion', {
      title: 'Mon avis',
      isDirty: () => dirty,
      reset,
    })
    editor.start('opinion')
    dirty = true
    expect(editor.dirty.value).toBe(true)
    // Ouvrir une section de la fiche : confirmation d'abord.
    editor.start('works')
    expect(editor.editing.value).toBe('opinion')
    expect(editor.pending.value?.section).toBe('opinion')
    editor.confirmLeave()
    expect(reset).toHaveBeenCalled()
    expect(editor.editing.value).toBe('works')
    // Une section de la fiche modifiée garde « Mon avis » fermé.
    editor.draft.value.renovation.items.push({
      key: 'k-lot20',
      label: 'Cuisine',
      amount: '6000',
    })
    editor.start('opinion')
    expect(editor.editing.value).toBe('works')
    expect(editor.pending.value?.section).toBe('works')
    editor.confirmLeave()
    expect(editor.editing.value).toBe('opinion')
    // Enregistré par elle-même : `finish` referme sans confirmation.
    editor.finish('works' as never)
    expect(editor.editing.value).toBe('opinion')
    editor.finish('opinion')
    expect(editor.editing.value).toBeNull()
    // Démontée en cours d'édition : la garde l'oublie.
    editor.start('opinion')
    unregister()
    expect(editor.editing.value).toBeNull()
    expect(editor.titleOf('opinion')).toBe('Mon avis')
    // Un retrait périmé ne retire pas la section suivante.
    const again = editor.registerSection('opinion', {
      title: 'Mon avis (bis)',
      isDirty: () => false,
      reset: vi.fn(),
    })
    unregister()
    expect(editor.titleOf('opinion')).toBe('Mon avis (bis)')
    again()
  })
})
