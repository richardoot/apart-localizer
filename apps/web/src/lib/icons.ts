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
  // Lot 23 : la navigation (barre du bas, menu du compte, « Plus »).
  home: ['M4 11l8-7 8 7', 'M6 9.5V20h12V9.5', 'M10 20v-6h4v6'],
  list: [
    'M9 6h11',
    'M9 12h11',
    'M9 18h11',
    'M4.5 6h.01',
    'M4.5 12h.01',
    'M4.5 18h.01',
  ],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  user: ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4.5 20a7.5 7.5 0 0 1 15 0'],
  users: [
    'M9 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
    'M2.5 20a6.5 6.5 0 0 1 13 0',
    'M16 4.5a3.5 3.5 0 0 1 0 6.5',
    'M18 14a6.5 6.5 0 0 1 3.5 6',
  ],
  'map-pin': [
    'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z',
    'M12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  ],
  sliders: ['M4 7h9', 'M17 7h3', 'M15 5v4', 'M4 17h3', 'M11 17h9', 'M9 15v4'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7.5V12l3 2'],
  star: [
    'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  ],
  sun: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M12 2.5v2',
    'M12 19.5v2',
    'M4.6 4.6l1.4 1.4',
    'M18 18l1.4 1.4',
    'M2.5 12h2',
    'M19.5 12h2',
    'M4.6 19.4L6 18',
    'M18 6l1.4-1.4',
  ],
  moon: ['M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z'],
  logout: ['M15 4h4v16h-4', 'M10 8l-4 4 4 4', 'M6 12h10'],
  tasks: [
    'M4 6.5l1.5 1.5L8 5.5',
    'M4 12.5l1.5 1.5L8 11.5',
    'M4 18.5l1.5 1.5L8 17.5',
    'M11 7h9',
    'M11 13h9',
    'M11 19h9',
  ],
  copy: ['M9 9h10v11H9z', 'M5 15V4h10'],
} as const

export type IconName = keyof typeof ICONS
