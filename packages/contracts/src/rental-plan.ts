import { z } from 'zod'
import {
  RentControlSchema,
  RentalDemandSchema,
  TriStateSchema,
} from './enums.js'

/**
 * Phase 2 : mise en location. Les annonces de location comparables (loyer de
 * marché, besoin L4) sont des lignes à part depuis le lot 5
 * (`RentComparable`, `/listings/:id/rent-comparables`).
 *
 * Lot 19 (ADR 0029) : l'année et le type de location se règlent pour tout
 * l'espace (`rentalYear` et `leaseType` des hypothèses). Une entrée qui les
 * envoie encore ici (`year`, `leaseType`) est acceptée et ces clés sont
 * ignorées ; les colonnes `rental_plans.year` et `lease_type` restent en base
 * sans être lues.
 */
export const RentalPlanInputSchema = z.object({
  rentControl: RentControlSchema.default('auto'),
  referenceRentPerM2: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe(
      'Loyer de référence majoré en euros par m² et par mois (encadrement) ; plafond = ce loyer × surface'
    ),
  targetRent: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe('Loyer visé hors charges en euros par mois'),
  marketRent: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe(
      'Loyer de marché constaté hors charges en euros par mois (médiane des comparables)'
    ),
  demand: RentalDemandSchema.nullable().default(null),
  coOwnershipAllowsRental: TriStateSchema.default('unknown').describe(
    'Le règlement de copropriété autorise la location visée'
  ),
  decencyCompliant: TriStateSchema.default('unknown').describe(
    'Critères de décence respectés (surface, hauteur, équipements)'
  ),
  rentalPermitRequired: TriStateSchema.default('unknown').describe(
    'Permis de louer exigé dans le secteur'
  ),
  notes: z.string().max(5000).nullable().default(null),
})
export type RentalPlanInput = z.infer<typeof RentalPlanInputSchema>

export const RentalPlanSchema = RentalPlanInputSchema
export type RentalPlan = z.infer<typeof RentalPlanSchema>
