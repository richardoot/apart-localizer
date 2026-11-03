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
  {
    key: 'occupancy_cost',
    term: 'Coût d’occupation (phase 1)',
    definition:
      'Pendant que le foyer habite le bien : mensualité + assurance + toutes les charges de copropriété + taxe foncière + entretien, comparé au loyer actuel. Coût réel = coût d’occupation − capital remboursé chaque mois (la part qui construit un patrimoine). La bascule en phase 2 est la date de mise en location.',
  },
  {
    key: 'scenario',
    term: 'Scénario « et si »',
    definition:
      'Un jeu de surcharges (prix, loyer, travaux, bail, taux, apport, durée, vacance, date de mise en location, TMI, régime…) appliqué à une annonce et comparé à la base, indicateur par indicateur. Enregistrable, mais une évaluation n’écrit rien.',
  },
  {
    key: 'tax_regimes',
    term: 'Régimes fiscaux',
    definition:
      'Location vide : micro-foncier (abattement de 30 % si les loyers bruts du foyer ne dépassent pas 15 000 €) ou réel foncier (charges, intérêts, taxe foncière déduits ; déficit hors intérêts imputable sur le revenu global jusqu’à 10 700 € par an, le reste reporté dix ans). Location meublée : micro-BIC (abattement de 50 % en meublé de longue durée, plafonds selon le classement) ou LMNP réel (charges et amortissements, qui ne peuvent pas créer de déficit). Impôt = revenu imposable × TMI + prélèvements sociaux. Paramètres datés dans les hypothèses ; une estimation, pas un conseil fiscal.',
  },
  {
    key: 'cash_flow_after_tax',
    term: 'Cash-flow net d’impôt',
    definition:
      'Par année de détention : loyers encaissés (ou loyer actuel évité en phase 1) − mensualités − charges − taxe foncière − frais − impôt sur les loyers. Négatif = somme à sortir.',
  },
  {
    key: 'irr',
    term: 'TRI (taux de rendement interne)',
    definition:
      'Le taux annuel qui annule la valeur actuelle des flux du foyer : mise de départ (apport), cash-flows de chaque année, produit net de la revente au terme (prix − frais − capital restant dû − impôt sur la plus-value). Avant impôt : sans impôt sur les loyers ni sur la plus-value. Le loyer actuel évité en phase 1 compte : le TRI compare l’achat au fait de rester locataire.',
  },
  {
    key: 'npv',
    term: 'VAN (valeur actuelle nette)',
    definition:
      'Somme des flux actualisés au taux d’actualisation des hypothèses (par défaut le taux du crédit). Positive : le projet rapporte plus que ce taux.',
  },
  {
    key: 'net_wealth',
    term: 'Enrichissement net',
    definition:
      'Somme des flux sur l’horizon, mise de départ déduite : ce que le projet laisse au foyer à la revente, comparé au fait de rester locataire.',
  },
  {
    key: 'capital_gains',
    term: 'Plus-value immobilière',
    definition:
      'Prix de vente − frais de cession − (prix d’achat + frais d’acquisition réels ou forfait 7,5 % + travaux réels ou forfait 15 % après cinq ans − amortissements LMNP déduits). Abattements pour durée de détention : exonération d’impôt sur le revenu (19 %) après 22 ans et de prélèvements sociaux après 30 ans ; surtaxe au-delà de 50 000 €. Exonérée si le bien est la résidence principale au jour de la vente, ce qui n’est plus le cas une fois loué.',
  },
  {
    key: 'market_rent',
    term: 'Loyer de marché (comparables)',
    definition:
      'Médiane des loyers au m² de 5 à 10 annonces de location comparables saisies (même type, vide ou meublé) × surface de l’annonce. Le loyer visé est jugé exposé à la vacance s’il dépasse le marché de plus de 8 %.',
  },
  {
    key: 'compliance',
    term: 'Checklist réglementaire',
    definition:
      'Règles datées et sourcées (interdictions de location selon le DPE, encadrement et sa date de fin, permis de louer, diagnostics du bail, décence, meublé) évaluées à la date de mise en location prévue, et risques Géorisques à l’adresse : ok, attention, bloquant ou à vérifier.',
  },
]
