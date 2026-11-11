import { onBeforeUnmount, ref } from 'vue'

/** Combien de temps « Copié » reste affiché. */
export const COPIED_MS = 2000

/**
 * Lot 26 : copier un texte (adresse du connecteur, demande à Claude) :
 * `copied` dit lequel vient d'être copié, puis redevient null au bout de deux
 * secondes ; un refus du presse-papiers se dit (`failure`), le texte reste à
 * sélectionner à la main.
 */
export function useCopy() {
  const copied = ref<string | null>(null)
  const failure = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  async function copy(key: string, text: string): Promise<boolean> {
    failure.value = null
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      copied.value = null
      failure.value = 'Copie impossible : sélectionne le texte à la main.'
      return false
    }
    copied.value = key
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      copied.value = null
      timer = null
    }, COPIED_MS)
    return true
  }

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })

  return { copied, failure, copy }
}
