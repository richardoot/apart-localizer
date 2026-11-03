import { z } from 'zod'

/**
 * Énumérations partagées. Les identifiants sont en anglais (code), les
 * libellés en français (interface, MCP). Chaque schéma porte une description
 * lue par l'IA lors de l'extraction et par l'agent qui appelle le MCP.
 */

export const ListingSourceSchema = z
  .enum(['seloger', 'leboncoin', 'pap', 'bienici', 'agence', 'autre'])
  .describe("Portail ou canal d'où vient l'annonce")
export type ListingSource = z.infer<typeof ListingSourceSchema>

export const ListingStatusSchema = z
  .enum([
    'to_study',
    'to_visit',
    'visited',
    'offer_made',
    'offer_accepted',
    'offer_refused',
    'discarded',
    'sold_or_withdrawn',
  ])
  .describe(
    'Étape du suivi : à étudier, à visiter, visité, offre faite, offre acceptée, offre refusée, écarté, vendu ou retiré'
  )
export type ListingStatus = z.infer<typeof ListingStatusSchema>

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  to_study: 'À étudier',
  to_visit: 'À visiter',
  visited: 'Visité',
  offer_made: 'Offre faite',
  offer_accepted: 'Offre acceptée',
  offer_refused: 'Offre refusée',
  discarded: 'Écarté',
  sold_or_withdrawn: 'Vendu ou retiré',
}

/** Statuts « actifs » : ceux affichés par défaut dans le tableau comparatif. */
export const ACTIVE_LISTING_STATUSES: readonly ListingStatus[] = [
  'to_study',
  'to_visit',
  'visited',
  'offer_made',
  'offer_accepted',
]

export const DpeClassSchema = z
  .enum(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
  .describe('Classe du diagnostic de performance énergétique, de A à G')
export type DpeClass = z.infer<typeof DpeClassSchema>

export const FieldSourceSchema = z
  .enum(['listing', 'user', 'ai', 'open_data', 'estimated'])
  .describe(
    "Provenance d'une valeur : lue dans l'annonce, saisie par un membre, extraite par l'IA, issue de données ouvertes, ou estimée faute de saisie"
  )
export type FieldSource = z.infer<typeof FieldSourceSchema>

export const LocationPrecisionSchema = z
  .enum(['exact', 'street', 'district', 'commune'])
  .describe(
    'Précision du point géographique : adresse exacte, rue, quartier ou centroïde de la commune'
  )
export type LocationPrecision = z.infer<typeof LocationPrecisionSchema>

export const LeaseTypeSchema = z
  .enum(['unfurnished', 'furnished', 'shared'])
  .describe('Type de bail visé en phase 2 : vide, meublé ou colocation')
export type LeaseType = z.infer<typeof LeaseTypeSchema>

export const LEASE_TYPE_LABELS: Record<LeaseType, string> = {
  unfurnished: 'Location vide',
  furnished: 'Location meublée',
  shared: 'Colocation',
}

export const RentControlSchema = z
  .enum(['auto', 'yes', 'no'])
  .describe(
    'Encadrement des loyers : « auto » déduit de la commune (Bordeaux encadrée), sinon forcé à oui ou non'
  )
export type RentControl = z.infer<typeof RentControlSchema>

export const RenovationLevelSchema = z
  .enum(['refresh', 'renovation', 'heavy', 'energy'])
  .describe(
    'Ampleur des travaux avant emménagement : rafraîchissement, rénovation, rénovation lourde, rénovation énergétique'
  )
export type RenovationLevel = z.infer<typeof RenovationLevelSchema>

export const RENOVATION_LEVEL_LABELS: Record<RenovationLevel, string> = {
  refresh: 'Rafraîchissement',
  renovation: 'Rénovation',
  heavy: 'Rénovation lourde',
  energy: 'Énergétique',
}

export const RentalDemandSchema = z
  .enum(['strong', 'medium', 'weak'])
  .describe(
    'Demande locative constatée dans le secteur : forte, moyenne, faible'
  )
export type RentalDemand = z.infer<typeof RentalDemandSchema>

export const TriStateSchema = z
  .enum(['yes', 'no', 'unknown'])
  .describe('Oui, non, ou pas encore vérifié')
export type TriState = z.infer<typeof TriStateSchema>

export const TaskOriginSchema = z
  .enum(['default', 'manual', 'missing_field', 'visit'])
  .describe(
    "Origine d'une tâche : checklist par défaut, saisie manuelle, champ manquant transformé en tâche, ou préparation d'une visite planifiée"
  )
export type TaskOrigin = z.infer<typeof TaskOriginSchema>

export const VerdictSchema = z
  .enum(['target', 'to_dig', 'off_target'])
  .describe('Verdict financier : dans la cible, à creuser, hors cible')
export type Verdict = z.infer<typeof VerdictSchema>

export const VERDICT_LABELS: Record<Verdict, string> = {
  target: 'Cible',
  to_dig: 'À creuser',
  off_target: 'Hors cible',
}

export const RentalVerdictSchema = z
  .enum(['compatible', 'conditional', 'incompatible'])
  .describe(
    'Verdict de louabilité (phase 2) : compatible, sous conditions, incompatible'
  )
export type RentalVerdict = z.infer<typeof RentalVerdictSchema>

export const RENTAL_VERDICT_LABELS: Record<RentalVerdict, string> = {
  compatible: 'Compatible',
  conditional: 'Sous conditions',
  incompatible: 'Incompatible',
}

export const CheckLevelSchema = z
  .enum(['ok', 'warn', 'bad', 'unknown'])
  .describe("Résultat d'un contrôle : ok, point d'attention, bloquant, inconnu")
export type CheckLevel = z.infer<typeof CheckLevelSchema>

export const PerimeterTypeSchema = z
  .enum(['point_radius', 'polygon', 'isochrone'])
  .describe(
    "Type de périmètre d'un critère de recherche : point et rayon, polygone dessiné, isochrone figée"
  )
export type PerimeterType = z.infer<typeof PerimeterTypeSchema>

export const MemberRoleSchema = z
  .enum(['owner', 'member'])
  .describe("Rôle dans l'espace de travail")
export type MemberRole = z.infer<typeof MemberRoleSchema>

export const FeesPayerSchema = z
  .enum(['buyer', 'seller'])
  .describe(
    "Qui paie les honoraires d'agence : l'acquéreur (prix FAI, base notaire = net vendeur) ou le vendeur"
  )
export type FeesPayer = z.infer<typeof FeesPayerSchema>

export const TargetCriterionSchema = z
  .enum(['gross_yield', 'net_yield', 'effort', 'rent_x220', 'market'])
  .describe(
    'Critère du prix cible : rendement brut, rendement net, effort mensuel, repère 220 × loyer, marché (DVF)'
  )
export type TargetCriterion = z.infer<typeof TargetCriterionSchema>

export const DiscountClassSchema = z
  .enum(['in_target', 'negotiable', 'tight', 'out_of_reach'])
  .describe(
    'Classement de la décote nécessaire : déjà dans la cible, négociable, tendu, hors de portée'
  )
export type DiscountClass = z.infer<typeof DiscountClassSchema>

export const ActivityChannelSchema = z
  .enum(['web', 'mcp', 'import', 'system'])
  .describe("Canal d'une action : interface web, MCP, import, système")
export type ActivityChannel = z.infer<typeof ActivityChannelSchema>

export const OfferResponseSchema = z
  .enum(['pending', 'accepted', 'refused', 'counter_offer'])
  .describe(
    'Réponse du vendeur à une offre : en attente, acceptée, refusée, contre-proposition'
  )
export type OfferResponse = z.infer<typeof OfferResponseSchema>

export const OFFER_RESPONSE_LABELS: Record<OfferResponse, string> = {
  pending: 'En attente',
  accepted: 'Acceptée',
  refused: 'Refusée',
  counter_offer: 'Contre-proposition',
}

export const OfferChannelSchema = z
  .enum(['email', 'phone', 'agency', 'in_person', 'letter', 'other'])
  .describe(
    "Canal par lequel l'offre a été transmise : e-mail, téléphone, agence, en personne, courrier, autre"
  )
export type OfferChannel = z.infer<typeof OfferChannelSchema>

export const OFFER_CHANNEL_LABELS: Record<OfferChannel, string> = {
  email: 'E-mail',
  phone: 'Téléphone',
  agency: 'Agence',
  in_person: 'En personne',
  letter: 'Courrier',
  other: 'Autre',
}

export const NotaryModeSchema = z
  .enum(['rate', 'scale'])
  .describe(
    'Calcul des frais de notaire : taux forfaitaire sur le net vendeur (« rate », parité avec l’artefact) ou barème détaillé (« scale » : droits de mutation, émoluments, débours, contribution de sécurité immobilière)'
  )
export type NotaryMode = z.infer<typeof NotaryModeSchema>

export const SensitivityAxisSchema = z
  .enum(['price', 'rent', 'rate', 'downPayment', 'duration'])
  .describe(
    "Axe d'un tableau de sensibilité : prix d'achat, loyer, taux du crédit, apport, durée"
  )
export type SensitivityAxis = z.infer<typeof SensitivityAxisSchema>

export const SENSITIVITY_AXIS_LABELS: Record<SensitivityAxis, string> = {
  price: "Prix d'achat",
  rent: 'Loyer',
  rate: 'Taux du crédit',
  downPayment: 'Apport',
  duration: 'Durée du crédit',
}

export const NegotiationArgumentKindSchema = z
  .enum([
    'time_on_market',
    'price_drops',
    'dpe',
    'renovation',
    'charges',
    'previous_offer',
    'in_target',
  ])
  .describe(
    'Levier de négociation factuel : durée en ligne, baisses passées, DPE, travaux, charges élevées, offre précédente, déjà dans la cible'
  )
export type NegotiationArgumentKind = z.infer<
  typeof NegotiationArgumentKindSchema
>

export const TARGET_CRITERION_LABELS: Record<TargetCriterion, string> = {
  gross_yield: 'Rendement brut',
  net_yield: 'Rendement net',
  effort: 'Effort mensuel',
  rent_x220: 'Repère 220 × loyer',
  market: 'Marché (DVF)',
}

export const DISCOUNT_CLASS_LABELS: Record<DiscountClass, string> = {
  in_target: 'Dans la cible au prix affiché',
  negotiable: 'Négociable',
  tight: 'Tendu',
  out_of_reach: 'Hors de portée',
}

export const TransitModeSchema = z
  .enum(['tram', 'bus', 'boat'])
  .describe('Mode de transport d’un arrêt TBM : tram, bus, bateau (BAT³)')
export type TransitMode = z.infer<typeof TransitModeSchema>

export const TRANSIT_MODE_LABELS: Record<TransitMode, string> = {
  tram: 'Tram',
  bus: 'Bus',
  boat: 'Bateau',
}

export const IsochroneModeSchema = z
  .enum(['walking', 'cycling', 'driving'])
  .describe(
    'Mode de déplacement d’une isochrone : à pied, à vélo (approché : distance sur le réseau piéton à 15 km/h), en voiture'
  )
export type IsochroneMode = z.infer<typeof IsochroneModeSchema>

export const ISOCHRONE_MODE_LABELS: Record<IsochroneMode, string> = {
  walking: 'À pied',
  cycling: 'À vélo',
  driving: 'En voiture',
}

export const PERIMETER_TYPE_LABELS: Record<PerimeterType, string> = {
  point_radius: 'Point et rayon',
  polygon: 'Polygone dessiné',
  isochrone: 'Isochrone',
}

export const OpenDataStatusSchema = z
  .enum(['ok', 'to_verify', 'not_applicable', 'unavailable'])
  .describe(
    'État d’un enrichissement par données ouvertes : calculé, à vérifier (donnée ambiguë ou périmée), sans objet, source indisponible'
  )
export type OpenDataStatus = z.infer<typeof OpenDataStatusSchema>

export const OPEN_DATA_STATUS_LABELS: Record<OpenDataStatus, string> = {
  ok: 'Calculé',
  to_verify: 'À vérifier',
  not_applicable: 'Sans objet',
  unavailable: 'Indisponible',
}

export const DpeSearchStatusSchema = z
  .enum(['verified', 'single', 'multiple', 'none', 'unavailable'])
  .describe(
    'Résultat d’une recherche de DPE à l’ADEME : vérifié (appliqué), un candidat, plusieurs candidats à départager, aucun, service indisponible'
  )
export type DpeSearchStatus = z.infer<typeof DpeSearchStatusSchema>
