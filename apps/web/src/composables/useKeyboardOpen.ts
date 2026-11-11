import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Ref } from 'vue'

/** Les types de champ qui n'ouvrent pas de clavier à l'écran. */
const NO_KEYBOARD = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

/**
 * Lot 23 : un élément qui ouvre le clavier à l'écran (ou, pour une liste,
 * le sélecteur d'iOS, qui monte du bas de la même façon).
 */
export function opensKeyboard(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return !el.disabled
  }
  if (el instanceof HTMLInputElement) {
    return !el.disabled && !el.readOnly && !NO_KEYBOARD.has(el.type)
  }
  return el.isContentEditable
}

/** Au-delà de cette part de la hauteur perdue, le clavier est ouvert. */
export const KEYBOARD_VIEWPORT_RATIO = 0.75

/**
 * Lot 23 (ADR 0033) : le clavier à l'écran est-il ouvert ? Safari iOS ne le
 * dit pas : un champ qui a le focus (`focusin`) suffit, et la fenêtre
 * visible (`visualViewport`) qui rétrécit le confirme ailleurs. La barre du
 * bas se retire alors, pour ne jamais couvrir le champ où l'on écrit.
 */
export function useKeyboardOpen(): Ref<boolean> {
  const open = ref(false)
  let typing = false
  let shrunk = false
  const update = () => {
    open.value = typing || shrunk
  }
  const onFocusIn = (event: FocusEvent) => {
    typing = opensKeyboard(event.target)
    update()
  }
  const onFocusOut = () => {
    // Le focus passe d'un champ au suivant : on relit après le changement.
    setTimeout(() => {
      typing = opensKeyboard(document.activeElement)
      update()
    }, 0)
  }
  const onViewport = () => {
    const vv = window.visualViewport
    // Un zoom à deux doigts rétrécit aussi la fenêtre visible : `scale` l'annule.
    shrunk = vv
      ? vv.height * (vv.scale || 1) <
        window.innerHeight * KEYBOARD_VIEWPORT_RATIO
      : false
    update()
  }
  onMounted(() => {
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    window.visualViewport?.addEventListener('resize', onViewport)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('focusout', onFocusOut)
    window.visualViewport?.removeEventListener('resize', onViewport)
  })
  return open
}

/**
 * Lot 25 : la hauteur cachée par le clavier sous la fenêtre visible (Safari
 * iOS ne rétrécit pas la fenêtre de mise en page) ; zéro sans clavier ou
 * sans `visualViewport`. Pur.
 */
export function keyboardInset(
  innerHeight: number,
  viewport: { height: number; offsetTop: number; scale?: number } | null
): number {
  if (!viewport) return 0
  // Un zoom à deux doigts n'est pas un clavier.
  if ((viewport.scale ?? 1) > 1.01) return 0
  return Math.max(
    0,
    Math.round(innerHeight - viewport.height - viewport.offsetTop)
  )
}

/**
 * Lot 25 : ce qui est collé en bas d'une section en cours de saisie
 * (« Enregistrer », « Annuler ») se pose au-dessus du clavier.
 */
export function useKeyboardInset(): Ref<number> {
  const inset = ref(0)
  const update = () => {
    inset.value = keyboardInset(
      window.innerHeight,
      window.visualViewport ?? null
    )
  }
  onMounted(() => {
    update()
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
  })
  onBeforeUnmount(() => {
    window.visualViewport?.removeEventListener('resize', update)
    window.visualViewport?.removeEventListener('scroll', update)
  })
  return inset
}
