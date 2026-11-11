/**
 * Glossaire des indicateurs, une seule source pour la ressource MCP
 * `apart://glossaire` et pour l'interface (bouton « ? » de la fiche, lot 9, et
 * de la page Hypothèses, lot 13).
 * Les définitions suivent le modèle de calcul (docs/product/modele-de-calcul.md).
 */
export interface GlossaryEntry {
  key: string
  term: string
  definition: string
  /** La définition en une phrase, montrée par le bouton « ? » de l'interface ; à défaut, `definition`. */
  short?: string
}

export const INDICATOR_GLOSSARY: readonly GlossaryEntry[] = [
  {
    key: 'cost_basis',
    term: 'Deux bases de calcul',
    definition:
      'Une valeur « sur le prix » se compare au prix affiché (prix cible, décote, offre suggérée, prix maximal par critère). Une valeur « tout compris » porte sur le coût tout compris : prix affiché + frais de notaire + travaux + mobilier (rendements, effort, mensualité, coût maximal par critère).',
    short:
      '« Sur le prix » se compare au prix affiché ; « tout compris » porte sur le prix affiché + notaire + travaux + mobilier.',
  },
  {
    key: 'total_cost',
    term: 'Coût tout compris',
    definition:
      'Prix affiché + frais de notaire + travaux + mobilier. Base de tous les rendements, de l’effort et du capital emprunté.',
    short:
      'Ce que coûte vraiment l’achat : prix affiché + frais de notaire + travaux + mobilier.',
  },
  {
    key: 'notary_fees',
    term: 'Frais de notaire',
    short:
      'Droits et frais payés au notaire à l’achat, estimés par un taux forfaitaire ou par le barème détaillé.',
    definition:
      'Mode « taux » : taux forfaitaire (7,5 % par défaut) appliqué au net vendeur (prix moins honoraires acquéreur). Mode « barème » : droits de mutation (droit départemental, taxe communale, frais d’assiette) + émoluments proportionnels par tranches avec TVA + contribution de sécurité immobilière + débours estimés.',
  },
  {
    key: 'monthly_payment',
    term: 'Mensualité',
    definition:
      'Capital emprunté (coût tout compris − apport) × facteur mensuel k (crédit + assurance). k = r / (1 − (1 + r)^−N) + a / 12.',
    short:
      'Ce que la banque prélève chaque mois, crédit et assurance compris, sur le capital emprunté (coût tout compris − apport).',
  },
  {
    key: 'loan_insurance',
    term: 'Assurance emprunteur',
    definition:
      'Taux annuel appliqué au capital initial emprunté : assurance mensuelle = emprunt × taux / 12, comptée dans la mensualité (le a / 12 du facteur k), donc dans l’effort et le coût d’occupation.',
    short:
      'Le coût annuel de l’assurance du prêt, en pourcentage du capital emprunté, ajouté à chaque mensualité.',
  },
  {
    key: 'gross_yield',
    term: 'Rendement brut',
    definition:
      '12 × loyer retenu / coût tout compris. Le loyer retenu est le loyer visé, borné par le plafond d’encadrement quand la commune est encadrée.',
    short:
      'Les loyers d’une année rapportés au coût tout compris, avant toute charge.',
  },
  {
    key: 'net_yield',
    term: 'Rendement net',
    definition:
      'Résultat net d’exploitation / coût tout compris. Le résultat net = loyers encaissés après vacance − taxe foncière − charges non récupérables − frais fixes annuels. Une taxe foncière absente est estimée à un mois de loyer (≈).',
    short:
      'Ce que le bien rapporte par an après vacance, taxe foncière, charges et frais, rapporté au coût tout compris.',
  },
  {
    key: 'effort',
    term: 'Effort mensuel',
    definition:
      'Résultat net d’exploitation / 12 − mensualité. Négatif = somme à sortir chaque mois une fois le bien loué.',
    short:
      'Ce qui reste chaque mois une fois le bien loué : revenu net moins mensualité ; négatif, c’est ce qu’il faut sortir de sa poche.',
  },
  {
    key: 'vacancy',
    term: 'Vacance locative',
    definition:
      'Mois par an sans locataire (0,5 = quinze jours) : les loyers encaissés valent loyer × (12 − vacance). Elle réduit le rendement net et l’effort ; le rendement brut n’en tient pas compte.',
    short:
      'Le temps moyen sans locataire chaque année, retiré des loyers encaissés pour le rendement net et l’effort.',
  },
  {
    key: 'fixed_costs',
    term: 'Frais fixes du bailleur',
    definition:
      'Dépenses annuelles du propriétaire une fois le bien loué, hors taxe foncière et charges de copropriété (saisies dans chaque annonce) : assurance propriétaire non occupant (PNO), cotisation foncière des entreprises (CFE) en meublé, comptable LMNP, entretien. Déduites du résultat net.',
    short:
      'Ce que le propriétaire paie chaque année une fois le bien loué (assurance PNO, CFE, comptable, entretien), déduit du revenu net.',
  },
  {
    key: 'rule_220',
    term: 'Repère 220 × loyer',
    definition:
      'Coût tout compris au-delà duquel le rendement brut passe sous environ 5,45 %. Repère rapide, pas un critère de verdict par défaut.',
    short:
      'Un coût tout compris au-delà de 220 fois le loyer mensuel donne un rendement brut sous 5,45 % environ.',
  },
  {
    key: 'verdict',
    term: 'Verdict',
    definition:
      'Cible : brut ≥ seuil, effort ≤ maximum, DPE A à D. À creuser : un critère manque de peu (marges paramétrables : 0,7 point de brut, 80 €/mois d’effort) ou DPE inconnu. Hors cible : un critère en échec ou DPE E, F ou G.',
    short:
      'Cible si le rendement brut, l’effort et le DPE passent leurs seuils, à creuser si l’un manque de peu, hors cible sinon.',
  },
  {
    key: 'target_price',
    term: 'Prix cible',
    definition:
      'Prix affiché maximal pour que le bien satisfasse chaque critère actif (rendement brut, rendement net, effort, repère 220 × loyer, marché), puis le minimum de ces prix. À ce prix, le critère liant est tout juste satisfait : rdtBrut(P_b) = s_b. Les frais de notaire, les travaux et le mobilier s’y ajoutent pour donner le coût tout compris.',
    short:
      'Le prix affiché le plus haut auquel le bien satisfait tous les critères retenus.',
  },
  {
    key: 'binding_criterion',
    term: 'Critère liant',
    definition:
      'Le critère qui donne le prix cible, c’est-à-dire le plus contraignant. C’est lui qu’il faudra négocier.',
    short: 'Le critère le plus exigeant : c’est lui qui fixe le prix cible.',
  },
  {
    key: 'discount',
    term: 'Décote nécessaire',
    definition:
      '(prix affiché − prix cible) / prix affiché. Classes : ≤ 0 dans la cible au prix affiché ; ≤ 5 % négociable ; ≤ 10 % tendu ; au-delà hors de portée (seuils paramétrables dans les hypothèses).',
    short:
      'De combien il faut faire baisser le prix affiché pour atteindre le prix cible, en pourcentage du prix affiché.',
  },
  {
    key: 'suggested_offer',
    term: 'Offre suggérée',
    definition:
      'Prix cible arrondi au millier inférieur, jamais au-dessus du prix affiché. La marge entre l’offre et le prix cible est la place laissée à la négociation.',
    short:
      'Le prix cible arrondi au millier inférieur : le prix à proposer au vendeur.',
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
      'Chaque champ sait d’où il vient : annonce, membre, IA (avec confiance et extrait), données ouvertes, estimé, ou agence (réponse de l’annonceur à une question, datée, avec un extrait). Une valeur estimée faute de saisie s’affiche avec « ≈ ».',
  },
  {
    key: 'occupancy_cost',
    term: 'Coût d’occupation (phase 1)',
    definition:
      'Pendant que le foyer habite le bien : mensualité + assurance + toutes les charges de copropriété + taxe foncière + entretien, comparé au loyer actuel. Coût réel = coût d’occupation − capital remboursé chaque mois (la part qui construit un patrimoine). La bascule en phase 2 est la date de mise en location.',
    short:
      'Ce que coûte le logement chaque mois pendant que le foyer l’habite (mensualité, charges, taxe foncière, entretien), comparé au loyer actuel.',
  },
  {
    key: 'rental_phases',
    term: 'Phases 1 et 2',
    definition:
      'Phase 1 : le foyer habite le bien, de l’achat à la mise en location (coût d’occupation comparé au loyer actuel). Phase 2 : le bien est loué à partir de la date de mise en location des hypothèses, ou à défaut du 1er janvier de l’année de mise en location par défaut ; l’année de phase 2 fixée dans une annonce l’emporte.',
    short:
      'Tu habites d’abord le bien (phase 1), puis tu le loues à partir de la date de mise en location (phase 2).',
  },
  {
    key: 'scenario',
    term: 'Scénario « et si »',
    definition:
      'Un jeu de surcharges (prix, loyer, travaux, bail, taux, apport, durée, vacance, date de mise en location, TMI, régime…) appliqué à une annonce et comparé à la base, indicateur par indicateur. Enregistrable, mais une évaluation n’écrit rien.',
  },
  {
    key: 'marginal_tax_rate',
    term: 'Tranche marginale d’imposition (TMI)',
    definition:
      'Le taux d’impôt sur le revenu qui s’applique à la dernière tranche du revenu imposable du foyer (0, 11, 30, 41 ou 45 %) ; les revenus locatifs imposables y sont taxés, plus les prélèvements sociaux. Sans TMI, l’impôt sur les loyers n’est pas estimé.',
    short:
      'Le taux d’impôt de la dernière tranche de revenu du foyer, auquel les loyers imposables sont taxés.',
  },
  {
    key: 'tax_regimes',
    term: 'Régimes fiscaux',
    definition:
      'Location vide : micro-foncier (abattement de 30 % si les loyers bruts du foyer ne dépassent pas 15 000 €) ou réel foncier (charges, intérêts, taxe foncière déduits ; déficit hors intérêts imputable sur le revenu global jusqu’à 10 700 € par an, le reste reporté dix ans). Location meublée : micro-BIC (abattement de 50 % en meublé de longue durée, plafonds selon le classement) ou LMNP réel (charges et amortissements, qui ne peuvent pas créer de déficit). Impôt = revenu imposable × TMI + prélèvements sociaux. Paramètres datés dans les hypothèses ; une estimation, pas un conseil fiscal.',
    short:
      'Micro-foncier ou réel en location vide, micro-BIC ou LMNP réel en meublé : le régime fixe ce qui se déduit des loyers avant l’impôt.',
  },
  {
    key: 'cash_flow_after_tax',
    term: 'Cash-flow net d’impôt',
    definition:
      'Par année de détention : loyers encaissés (ou loyer actuel évité en phase 1) − mensualités − charges − taxe foncière − frais − impôt sur les loyers. Négatif = somme à sortir.',
    short:
      'Le flux de trésorerie de l’année : ce qui reste (ou ce qu’il faut sortir, si négatif) après mensualités, charges, taxe foncière, frais et impôt sur les loyers.',
  },
  {
    key: 'irr',
    term: 'TRI (taux de rendement interne)',
    definition:
      'Le taux annuel qui annule la valeur actuelle des flux du foyer : mise de départ (apport), cash-flows de chaque année, produit net de la revente au terme (prix − frais − capital restant dû − impôt sur la plus-value). Avant impôt : sans impôt sur les loyers ni sur la plus-value. Le loyer actuel évité en phase 1 compte : le TRI compare l’achat au fait de rester locataire.',
    short:
      'Le rendement annuel de tout le projet : apport, cash-flows de chaque année et revente au terme ; il le compare au fait de rester locataire.',
  },
  {
    key: 'npv',
    term: 'VAN (valeur actuelle nette)',
    definition:
      'Somme des flux actualisés au taux d’actualisation des hypothèses (par défaut le taux du crédit). Positive : le projet rapporte plus que ce taux.',
    short:
      'La somme des flux du projet ramenés à aujourd’hui au taux d’actualisation (par défaut celui du crédit) ; positive, le projet rapporte plus que ce taux.',
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
    key: 'rent_indexation',
    term: 'Indexation des loyers (IRL)',
    definition:
      'Hausse annuelle des loyers, des charges et de la taxe foncière dans la projection. Par défaut, la variation sur un an de l’indice de référence des loyers (IRL) du 3e trimestre 2026 publiée par l’INSEE (+1,57 %).',
    short:
      'La hausse annuelle des loyers et des charges dans la projection, par défaut celle de l’indice de référence des loyers.',
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
  {
    key: 'criteria_fit',
    term: 'Adéquation aux critères',
    short:
      'Dans les critères, à confirmer, à la marge ou hors critères : le meilleur niveau parmi les critères actifs, avec la raison chiffrée.',
    definition:
      'Pour chaque critère actif : « dans les critères » (adresse exacte ou à la rue dans le périmètre, ou quartier entièrement dedans, et tous les filtres respectés) ; « à confirmer » (adresse au quartier ou à la commune dont le contour touche le périmètre ou sa marge, ou donnée manquante : surface, pièces, DPE ; jamais « hors critères » pour une donnée manquante) ; « à la marge » (dépassement dans la marge de tolérance, par exemple prix +3,6 %) ; « hors critères » (au-delà de la marge). Le niveau de l’annonce est le meilleur parmi les critères actifs ; sans critère actif, tout est « dans les critères ». Le statut n’en fait pas partie ; le verdict, si le critère le filtre, oui.',
  },
  {
    key: 'criteria_tolerance',
    term: 'Marge de tolérance',
    short:
      'Jusqu’où une annonce peut dépasser un seuil du critère et rester visible « à la marge » ; 0 = strict.',
    definition:
      'Réglée par critère. Par défaut : 300 m autour du périmètre (adresse exacte ou à la rue ; pour une adresse imprécise, distance du contour du quartier ou de la commune), prix maximal +5 %, prix minimal −5 %, surface minimale −5 %, aucune pièce de moins, une classe DPE de plus, 100 m de plus jusqu’au tram. Au-delà, l’annonce passe « hors critères » sans être perdue.',
  },
]

/** L'entrée du glossaire d'une clé (`total_cost`, `gross_yield`…), si elle existe. */
export function glossaryEntry(key: string): GlossaryEntry | undefined {
  return INDICATOR_GLOSSARY.find(entry => entry.key === key)
}
