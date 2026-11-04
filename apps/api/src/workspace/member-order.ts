/**
 * L'ordre des membres : par arrivée, le propriétaire d'abord quand deux
 * membres sont créés ensemble (même horodatage), puis par identifiant court.
 * Dans un fichier sans dépendance : le journal et les notifications le lisent
 * sans importer `WorkspaceService` (qui dépend du journal).
 */
export const MEMBER_ORDER = [
  { createdAt: 'asc' as const },
  { role: 'asc' as const },
  { handle: 'asc' as const },
]
