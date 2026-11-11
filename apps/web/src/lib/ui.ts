/**
 * Lot 22 (ADR 0032) : les recettes de classes des composants partagés
 * (`components/ui`). Une seule façon de faire un bouton principal, un champ,
 * une pastille ou une carte ; les vues n'écrivent plus leurs propres
 * constantes `buttonClass` / `inputClass`. Pur, testé.
 *
 * Tactile (iPhone visé) : toute cible fait au moins 44 px au téléphone
 * (`min-h-11`) et sur un écran tactile (`pointer-coarse`), un peu moins
 * à la souris sur grand écran ; les champs sont à 16 px (`text-base`) pour
 * qu'iOS ne zoome pas à la saisie.
 */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'danger'
  | 'danger-soft'
  | 'ghost'
  | 'link'
export type ButtonSize = 'md' | 'sm' | 'icon' | 'inline'

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent font-semibold text-accent-fg hover:opacity-90',
  secondary: 'border border-line bg-surface text-fg hover:bg-surface-2',
  outline:
    'border border-accent bg-surface font-semibold text-accent hover:bg-accent-soft',
  danger: 'bg-bad font-semibold text-bad-fg hover:opacity-90',
  'danger-soft': 'border border-line bg-surface text-bad hover:bg-bad-soft',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  link: 'text-accent underline underline-offset-2 hover:text-fg',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  md: 'min-h-11 rounded-lg px-4 text-sm sm:min-h-10 sm:pointer-coarse:min-h-11',
  sm: 'min-h-11 rounded-lg px-3 text-sm sm:min-h-8 sm:px-2.5 sm:pointer-coarse:min-h-11',
  icon: 'size-11 rounded-lg text-base sm:size-10 sm:pointer-coarse:size-11',
  inline: 'rounded-sm',
}

export interface ButtonRecipe {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Pleine largeur. */
  block?: boolean
}

/** Les classes d'un bouton (ou d'un lien qui en a l'air). */
export function buttonClasses({
  variant = 'secondary',
  size = 'md',
  block = false,
}: ButtonRecipe = {}): string {
  const link = variant === 'link'
  return [
    'inline-flex items-center justify-center gap-1.5 text-center leading-tight transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60',
    FOCUS,
    BUTTON_VARIANTS[variant],
    link && size !== 'inline'
      ? 'min-h-11 rounded-sm px-0.5 text-sm sm:min-h-8 sm:pointer-coarse:min-h-11'
      : BUTTON_SIZES[size],
    block ? 'w-full' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** La case d'un champ : bordure, focus, erreur, modification. */
export function controlBoxClasses(state: {
  invalid?: boolean
  changed?: boolean
  disabled?: boolean
}): string {
  return [
    'rounded-lg bg-surface text-base text-fg',
    state.changed
      ? 'border border-accent ring-1 ring-accent'
      : state.invalid
        ? 'border border-bad ring-1 ring-bad'
        : 'border border-muted/70',
    state.disabled ? 'opacity-60' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Lot 23 : le focus d'une case. Un seul trait de couleur autour d'un champ
 * en erreur : le contour du focus prend la couleur de l'erreur (plus de vert
 * par-dessus le rouge), collé à la bordure.
 */
export function controlFocusClasses(
  invalid: boolean,
  on: 'within' | 'visible' = 'within'
): string {
  // Des classes écrites en entier : Tailwind ne lit pas un nom composé.
  if (on === 'within') {
    return invalid
      ? 'focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-bad'
      : 'focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent'
  }
  return invalid
    ? 'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-bad'
    : 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'
}

export type Tone =
  'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'info' | 'ai' | 'opinion'
export type BadgeVariant = 'soft' | 'solid' | 'outline'

const SOFT: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  accent: 'bg-accent-soft text-accent',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  ai: 'bg-ai-soft text-ai',
  opinion: 'bg-opinion-soft text-opinion',
}
const SOLID: Record<Tone, string> = {
  neutral: 'bg-muted text-surface',
  accent: 'bg-accent text-accent-fg',
  good: 'bg-good text-good-fg',
  warn: 'bg-warn text-warn-fg',
  bad: 'bg-bad text-bad-fg',
  info: 'bg-info text-surface',
  ai: 'bg-ai text-surface',
  opinion: 'bg-opinion text-surface',
}
const OUTLINE: Record<Tone, string> = {
  neutral: 'border border-line text-muted',
  accent: 'border border-accent text-accent',
  good: 'border border-good text-good',
  warn: 'border border-warn text-warn',
  bad: 'border border-bad text-bad',
  info: 'border border-info text-info',
  ai: 'border border-ai text-ai',
  opinion: 'border border-opinion text-opinion',
}

/** Les classes d'une pastille. */
export function badgeClasses(
  tone: Tone = 'neutral',
  variant: BadgeVariant = 'soft'
): string {
  const colors =
    variant === 'solid'
      ? SOLID[tone]
      : variant === 'outline'
        ? OUTLINE[tone]
        : SOFT[tone]
  return `inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${colors}`
}

/** Le fond et l'encre d'un message (alerte, retour, état). */
export function alertClasses(tone: Tone): string {
  return `rounded-lg px-3 py-2 text-sm ${SOFT[tone].replace('text-muted', 'text-fg')}`
}

export type CardTone = 'default' | 'accent' | 'warn' | 'bad' | 'muted'

const CARD_TONES: Record<CardTone, string> = {
  default: 'border border-line bg-surface',
  accent: 'border-[1.5px] border-accent bg-surface',
  warn: 'border border-warn bg-warn-soft',
  bad: 'border border-bad bg-bad-soft',
  muted: 'border border-line bg-surface-2',
}

/** Les classes d'une carte de section (une seule recette : `rounded-2xl p-4`). */
export function cardClasses(
  tone: CardTone = 'default',
  padding: 'md' | 'sm' | 'none' = 'md'
): string {
  const pad = padding === 'none' ? '' : padding === 'sm' ? 'p-3' : 'p-4 sm:px-5'
  return ['rounded-2xl', CARD_TONES[tone], pad].filter(Boolean).join(' ')
}

/** Les classes d'une puce (filtre, choix rapide), sélectionnée ou non. */
export function chipClasses(selected: boolean): string {
  return [
    'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm sm:min-h-8 sm:pointer-coarse:min-h-11',
    FOCUS,
    selected
      ? 'border-accent bg-accent-soft font-semibold text-fg'
      : 'border-line bg-surface text-muted hover:bg-surface-2 hover:text-fg',
  ].join(' ')
}
