import { z } from 'zod'

/**
 * Lot 17 (questions aux agences, ADR 0027) : les champs de la fiche qu'une
 * tâche peut demander à l'annonceur (agence ou vendeur). Une tâche liée à un
 * champ (`Task.field`) se coche d'elle-même quand la réponse de l'annonceur
 * donne ce champ. Fichier sans dépendance : `collaboration.ts` (tâches) et
 * `agency-requests.ts` (demandes) le partagent sans importation circulaire.
 */
export const ListingQuestionFieldSchema = z
  .enum([
    'addressRaw',
    'surface',
    'annualCharges',
    'propertyTax',
    'dpeClass',
    'floor',
    'constructionYear',
    'lotsCount',
    'votedWorks',
    'proceedings',
    'heatingType',
  ])
  .describe(
    "Champ de la fiche qu'une tâche demande à l'annonceur (lot 17) : adresse exacte, surface Carrez, charges de copropriété annuelles, taxe foncière, DPE (classe, consommation, date), étage et ascenseur, année de construction, nombre de lots, travaux votés, procédures en cours (procès-verbaux d'AG), chauffage"
  )
export type ListingQuestionField = z.infer<typeof ListingQuestionFieldSchema>

export const LISTING_QUESTION_FIELD_LABELS: Record<
  ListingQuestionField,
  string
> = {
  addressRaw: 'Adresse exacte',
  surface: 'Surface Carrez',
  annualCharges: 'Charges annuelles',
  propertyTax: 'Taxe foncière',
  dpeClass: 'DPE',
  floor: 'Étage et ascenseur',
  constructionYear: 'Année de construction',
  lotsCount: 'Lots de la copropriété',
  votedWorks: 'Travaux votés',
  proceedings: 'Procédures en cours',
  heatingType: 'Chauffage',
}
