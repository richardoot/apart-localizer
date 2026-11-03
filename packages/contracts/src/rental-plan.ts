import { z } from 'zod'
import {
  LeaseTypeSchema,
  RentControlSchema,
  RentalDemandSchema,
  TriStateSchema,
} from './enums.js'

/**
 * Phase 2 : mise en location. Les annonces de location comparables (loyer de
 * marché, besoin L4) sont des lignes à part depuis le lot 5
 * (`RentComparable`, `/listings/:id/rent-comparables`).
 */
export const RentalPlanInputSchema = z.object({
  year: z
    .number()
    .int()
    .min(2000)
    .max(2100)
    .nullable()
    .default(null)
    .describe(
      'Année de mise en location ; null = année par défaut des hypothèses'
    ),
  leaseType: LeaseTypeSchema.default('unfurnished'),
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
