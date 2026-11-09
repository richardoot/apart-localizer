import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { Opinion, OpinionInputRaw } from '@apart/contracts'
import {
  draftAverage,
  isOpinionDraftDirty,
  opinionDraft,
  opinionPayload,
} from '@/lib/opinions'
import type { OpinionDraft } from '@/lib/opinions'

/**
 * Lot 20 : le brouillon de « Mon avis » (note globale, phrase, notes et mots
 * par critère affiché), relu depuis mon avis enregistré à chaque ouverture.
 * Il dit s'il a changé (garde des modifications non enregistrées de la fiche)
 * et ce qui part : seulement les critères modifiés, avec la date lue pour le
 * garde-fou.
 */
export interface OpinionDraftState {
  draft: Ref<OpinionDraft>
  dirty: ComputedRef<boolean>
  average: ComputedRef<ReturnType<typeof draftAverage>>
  load: () => void
  setScore: (key: string, score: number | null) => void
  setWord: (key: string, word: string) => void
  setRating: (rating: number) => void
  setText: (text: string) => void
  payload: () => OpinionInputRaw
}

export function useOpinionDraft(
  source: () => { opinion: Opinion | null; keys: readonly string[] }
): OpinionDraftState {
  const initial = source()
  const draft = ref<OpinionDraft>(opinionDraft(initial.opinion, initial.keys))
  const pristine = ref<OpinionDraft>(
    opinionDraft(initial.opinion, initial.keys)
  )
  const loadedAt = ref<string | null>(initial.opinion?.updatedAt ?? null)

  function load(): void {
    const { opinion, keys } = source()
    draft.value = opinionDraft(opinion, keys)
    pristine.value = opinionDraft(opinion, keys)
    loadedAt.value = opinion?.updatedAt ?? null
  }

  function entry(key: string) {
    const current = draft.value.scores[key] ?? { score: null, word: '' }
    draft.value.scores[key] = current
    return current
  }

  return {
    draft,
    dirty: computed(() => isOpinionDraftDirty(draft.value, pristine.value)),
    average: computed(() => draftAverage(draft.value)),
    load,
    setScore: (key, score) => {
      entry(key).score = score
    },
    setWord: (key, word) => {
      entry(key).word = word
    },
    setRating: rating => {
      draft.value.rating = rating
    },
    setText: text => {
      draft.value.text = text
    },
    payload: () => opinionPayload(draft.value, pristine.value, loadedAt.value),
  }
}
