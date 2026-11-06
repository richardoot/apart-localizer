import type { ActivityChannel } from '@apart/contracts'
import type { Member } from '../generated/prisma'

/**
 * Lot 19 : l'année et le type de location se règlent dans les hypothèses de
 * l'espace. Quand ils changent, le plafond d'encadrement de chaque annonce
 * se recalcule par l'enrichissement des annonces (module listings). Le jeton
 * évite l'import circulaire entre les deux modules : le module listings le
 * fournit (`useExisting` sur `ListingEnrichmentService`), les hypothèses le
 * lisent au moment de l'enregistrement.
 */
export const RENTAL_CONTEXT_REFRESHER = 'RENTAL_CONTEXT_REFRESHER'

export interface RentalContextRefresher {
  enrich(
    member: Member,
    id: string,
    options: { dpe: boolean; channel: ActivityChannel }
  ): Promise<unknown>
}
