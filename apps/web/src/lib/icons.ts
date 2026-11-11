/**
 * Lot 22 (ADR 0032) : le seul jeu d'icônes de l'application. Des tracés au
 * trait sur une grille de 24, dessinés pour l'application (aucune
 * dépendance, aucun glyphe « ✕ ✓ ▾ → » dans les boutons). `UiIcon` les
 * dessine à la couleur du texte ; une icône est décorative (`aria-hidden`),
 * le libellé du bouton ou son `aria-label` dit l'action.
 */
export const ICONS = {
  close: ['M6 6l12 12', 'M18 6L6 18'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  cross: ['M7 7l10 10', 'M17 7L7 17'],
  'chevron-down': ['M6 9l6 6 6-6'],
  'chevron-up': ['M6 15l6-6 6 6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  'chevron-left': ['M15 6l-6 6 6 6'],
  'arrow-right': ['M5 12h14', 'M13 6l6 6-6 6'],
  'arrow-left': ['M19 12H5', 'M11 6l-6 6 6 6'],
  external: [
    'M14 4h6v6',
    'M20 4l-9 9',
    'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  ],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  trash: [
    'M4 7h16',
    'M10 11v6',
    'M14 11v6',
    'M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12',
    'M9 7V4h6v3',
  ],
  edit: ['M4 20h4L19 9l-4-4L4 16v4', 'M14 6l4 4'],
  bell: [
    'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9',
    'M10.3 21a1.94 1.94 0 0 0 3.4 0',
  ],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  alert: ['M12 3l10 18H2L12 3z', 'M12 10v4', 'M12 17.5h.01'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5', 'M12 7.5h.01'],
  refresh: [
    'M20 11a8 8 0 0 0-14.6-4.5L4 8',
    'M4 4v4h4',
    'M4 13a8 8 0 0 0 14.6 4.5L20 16',
    'M20 20v-4h-4',
  ],
  undo: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'],
  download: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-4-4'],
  filter: ['M4 5h16', 'M7 12h10', 'M10 19h4'],
  spinner: ['M12 3a9 9 0 1 0 9 9'],
} as const

export type IconName = keyof typeof ICONS
