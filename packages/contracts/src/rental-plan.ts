import { z } from 'zod'
import {
  LeaseTypeSchema,
  RentControlSchema,
  RentalDemandSchema,
  TriStateSchema,
} from './enums.js'

/** Une annonce de location comparable, pour établir le loyer de marché. */
export const RentComparableSchema = z.object({
  rent: z.number().min(0).describe('Loyer hors charges en euros par mois'),
  surface: z
    .number()
    .positive()
    .nullable()
    .default(null)
    .describe('Surface en m²'),
  url: z.string().url().nullable().default(null),
  note: z.string().max(500).nullable().default(null),
})
export type RentComparable = z.infer<typeof RentComparableSchema>

/** Phase 2 : mise en location. */
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
  comparables: z.array(RentComparableSchema).default([]),
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
