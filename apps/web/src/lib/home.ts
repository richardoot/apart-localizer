import type { RouteLocationRaw } from 'vue-router'
import type {
  GettingStartedStepKey,
  WorkflowAgendaItem,
  WorkflowAgendaKey,
  WorkflowStage,
} from '@apart/contracts'
import { listingTabQuery } from '@/lib/listing-tabs'
import type { ListingTab } from '@/lib/listing-tabs'

/**
 * Lot 23 (ADR 0033) : où mène chaque ligne de « Ce qui t'attend » sur
 * l'accueil, et chaque étape de la mise en route. Le contenu des lignes est
 * calculé par `domain` (`workflowOverview`) ; ici, seulement l'adresse.
 */

/** L'ancre du bloc « Messages à valider » de l'accueil. */
export const MESSAGES_ANCHOR = 'messages-a-valider'

const listing = (id: string, tab: ListingTab): RouteLocationRaw => ({
  name: 'listing',
  params: { id },
  query: listingTabQuery(tab),
})
const stage = (etape: WorkflowStage | null): RouteLocationRaw => ({
  name: 'listings',
  ...(etape ? { query: { etape } } : {}),
})

/** L'onglet de la fiche qu'ouvre une ligne qui ne vise qu'une annonce. */
const TAB_OF: Partial<Record<WorkflowAgendaKey, ListingTab>> = {
  ready: 'synthese',
  upcoming_visits: 'a-faire',
  visits_to_plan: 'a-faire',
  opinions_to_give: 'synthese',
  messages_to_approve: 'a-faire',
  follow_ups_due: 'a-faire',
}

/**
 * Où mène une ligne : le tri, la confirmation, « À trancher ensemble », la
 * fiche (quand la ligne ne vise qu'une annonce), l'étape, le bloc des
 * messages ou toutes les tâches en retard.
 */
export function agendaTarget(item: WorkflowAgendaItem): RouteLocationRaw {
  switch (item.key) {
    case 'to_sort':
      return { name: 'triage', query: { etape: item.stage ?? 'a-valider' } }
    case 'to_confirm':
      return { name: 'triage', query: { mode: 'confirmer' } }
    case 'to_settle':
      return { name: 'settle' }
    case 'overdue_tasks':
      return { name: 'tasks', query: { retard: '1' } }
    case 'visit_today':
      // Lot 24 : la visite du jour ouvre le mode visite de son annonce.
      return item.listingId
        ? { name: 'visit-mode', params: { id: item.listingId } }
        : stage(item.stage)
    case 'messages_to_approve':
    case 'follow_ups_due':
      return item.listingId
        ? listing(item.listingId, 'a-faire')
        : { name: 'home', hash: `#${MESSAGES_ANCHOR}` }
    default: {
      const tab = TAB_OF[item.key]
      return item.listingId && tab
        ? listing(item.listingId, tab)
        : stage(item.stage)
    }
  }
}

/** La teinte d'une ligne : ce qui attend une décision ressort. */
export const AGENDA_TONES: Record<WorkflowAgendaKey, string> = {
  to_sort: 'bg-accent-soft text-accent',
  to_confirm: 'bg-warn-soft text-warn',
  to_settle: 'bg-ai-soft text-ai',
  ready: 'bg-info-soft text-info',
  visit_today: 'bg-good-soft text-good',
  upcoming_visits: 'bg-good-soft text-good',
  visits_to_plan: 'bg-surface-2 text-fg',
  opinions_to_give: 'bg-opinion-soft text-opinion',
  messages_to_approve: 'bg-accent-soft text-accent',
  follow_ups_due: 'bg-warn-soft text-warn',
  overdue_tasks: 'bg-warn-soft text-warn',
}

/** Où mène chaque étape de la mise en route. */
export const GETTING_STARTED_TARGETS: Record<
  GettingStartedStepKey,
  RouteLocationRaw | null
> = {
  assumptions: { name: 'assumptions' },
  criteria: { name: 'criteria' },
  listing: { name: 'listing-new' },
  // Lot 26 ajoutera une page « Claude » ; d'ici là, l'adresse du connecteur se copie sur place.
  claude: null,
}

/** Le bouton d'une étape de la mise en route. */
export const GETTING_STARTED_ACTIONS: Record<GettingStartedStepKey, string> = {
  assumptions: 'Ouvrir les hypothèses',
  criteria: 'Dessiner un critère',
  listing: 'Ajouter une annonce',
  claude: 'Copier l’adresse',
}
