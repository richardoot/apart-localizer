/**
 * Glossaire des indicateurs, servi par la ressource MCP `apart://glossaire`
 * et réutilisable par l'interface. Les définitions suivent le modèle de
 * calcul (docs/product/modele-de-calcul.md).
 */
export interface GlossaryEntry {
  key: string
  term: string
  definition: string
}

export const INDICATOR_GLOSSARY: readonly GlossaryEntry[] = [
  {
    key: 'total_cost',
    term: 'Coût total',
    definition:
      'Prix affiché + frais de notaire + travaux + mobilier. Base de tous les rendements.',
  },
  {
    key: 'notary_fees',
    term: 'Frais de notaire',
    definition:
      'Mode « taux » : taux forfaitaire (7,5 % par défaut) appliqué au net vendeur (prix moins honoraires acquéreur). Mode « barème » : droits de mutation (droit départemental, taxe communale, frais d’assiette) + émoluments proportionnels par tranches avec TVA + contribution de sécurité immobilière + débours estimés.',
  },
  {
    key: 'monthly_payment',
    term: 'Mensualité',
    definition:
      'Capital emprunté (coût total − apport) × facteur mensuel k (crédit + assurance). k = r / (1 − (1 + r)^−N) + a / 12.',
  },
  {
    key: 'gross_yield',
    term: 'Rendement brut',
    definition:
      '12 × loyer retenu / coût total. Le loyer retenu est le loyer visé, borné par le plafond d’encadrement quand la commune est encadrée.',
  },
  {
    key: 'net_yield',
    term: 'Rendement net',
    definition:
      'Résultat net d’exploitation / coût total. Le résultat net = loyers encaissés après vacance − taxe foncière − charges non récupérables − frais fixes annuels. Une taxe foncière absente est estimée à un mois de loyer (≈).',
  },
  {
    key: 'effort',
    term: 'Effort mensuel',
    definition:
      'Résultat net d’exploitation / 12 − mensualité. Négatif = somme à sortir chaque mois une fois le bien loué.',
  },
  {
    key: 'rule_220',
    term: 'Repère 220 × loyer',
    definition:
      'Coût total au-delà duquel le rendement brut passe sous environ 5,45 %. Repère rapide, pas un critère de verdict par défaut.',
  },
  {
    key: 'verdict',
    term: 'Verdict',
    definition:
      'Cible : brut ≥ seuil, effort ≤ maximum, DPE A à D. À creuser : un critère manque de peu (marges paramétrables : 0,7 point de brut, 80 €/mois d’effort) ou DPE inconnu. Hors cible : un critère en échec ou DPE E, F ou G.',
  },
  {
    key: 'target_price',
    term: 'Prix cible',
    definition:
      'Prix maximal pour que le bien satisfasse chaque critère actif (rendement brut, rendement net, effort, repère 220 × loyer), puis le minimum de ces prix. À ce prix, le critère liant est tout juste satisfait : rdtBrut(P_b) = s_b.',
  },
  {
    key: 'binding_criterion',
    term: 'Critère liant',
    definition:
      'Le critère qui donne le prix cible, c’est-à-dire le plus contraignant. C’est lui qu’il faudra négocier.',
  },
  {
    key: 'discount',
    term: 'Décote nécessaire',
    definition:
      '(prix affiché − prix cible) / prix affiché. Classes : ≤ 0 dans la cible au prix affiché ; ≤ 5 % négociable ; ≤ 10 % tendu ; au-delà hors de portée (seuils paramétrables dans les hypothèses).',
  },
  {
    key: 'suggested_offer',
    term: 'Offre suggérée',
    definition:
      'Prix cible arrondi au millier inférieur, jamais au-dessus du prix affiché. La marge entre l’offre et le prix cible est la place laissée à la négociation.',
  },
  {
    key: 'rental_verdict',
    term: 'Compatibilité location (phase 2)',
    definition:
      'Contrôles de louabilité pour l’année de mise en location : calendrier d’interdiction selon le DPE, encadrement, loyer de marché, règlement de copropriété, décence, permis de louer, demande, effort. Incompatible dès un bloquant ; sous conditions dès un point d’attention ou trois inconnus.',
  },
  {
    key: 'provenance',
    term: 'Provenance et « ≈ »',
    definition:
      'Chaque champ sait d’où il vient : annonce, membre, IA (avec confiance et extrait), données ouvertes, ou estimé. Une valeur estimée faute de saisie s’affiche avec « ≈ ».',
  },
]
