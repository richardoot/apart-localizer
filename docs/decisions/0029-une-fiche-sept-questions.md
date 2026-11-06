# 0029. Une fiche, sept questions : onglets par question, édition par section, réglages de location dans l'espace

Statut : acceptée, 6 novembre 2026. Précise 0019 (onglets de la fiche) et 0023 (page Hypothèses).

## Contexte

Après les lots 9 à 18, la fiche d'une annonce avait six onglets et beaucoup de sections. Les
critiques de Richard : « Correspond-elle à ce qu'on cherche ? » prenait trop de place en tête de
la Synthèse ; les travaux étaient cachés dans « Fiche et saisie » (onglet Financer et louer), un
grand formulaire fouillis qui portait aussi des réglages de l'espace (hypothèses surchargées par
annonce, année et type de location) ; Quartier était très verbeux ; Suivi mêlait historique,
notation et tâches ; Échanges était séparé des tâches. Une maquette (sept onglets, en-tête allégé,
mobile 390 px, correspondance de chaque section actuelle) a été validée.

## Décision

- **Sept onglets, une question chacun.** Synthèse (« Faut-il y aller ? »), Le bien (« Qu'est-ce
  qu'on achète ? »), Budget (« Peut-on se le permettre, et après ? »), Négocier (« Combien
  proposer ? »), Quartier (« Comment on y vit ? »), À faire (« Qu'est-ce qu'il reste à faire ? »),
  Historique (« Que s'est-il passé ? »). Identifiants d'URL `synthese` (rien dans l'URL), `bien`,
  `budget`, `negocier`, `quartier`, `a-faire`, `historique`. Les anciens `financer`, `suivi`,
  `echanges` restent lus et mènent à `budget`, `a-faire`, `a-faire` ; l'URL se réécrit
  (`legacyTabRedirect`). Les notifications pointent désormais `historique` (vérification) et
  `a-faire` (réponse de l'annonceur). La pastille de « À faire » compte ce qui est à traiter :
  tâches ouvertes, plus messages à valider, plus relances dues (`todoPendingCount`).
- **En-tête allégé.** Retour, statut, titre, prix et prix au m², surface, pièces, étage, lieu,
  pastilles (verdict, adéquation, DPE), portails, fraîcheur de la vérification. Les dates et les
  champs lus par l'IA vont en pied d'Historique, le lien de l'annonce dans Le bien. Le bouton
  « Modifier la fiche » disparaît. La barre d'onglets reste collée en haut au défilement et défile
  horizontalement sur mobile.
- **Ce que la Synthèse met en avant vient de `domain`.** `listingHighlights` choisit trois points
  au plus pour « Ce qui plaît » et « À surveiller » dans les données existantes (verdict, écart
  aux ventes DVF du quartier, tram et drive proches, contrôles de louabilité, travaux, travaux
  votés et procédures saisis, décote nécessaire, plafond d'encadrement, taxe foncière et charges
  manquantes et demandées à l'annonceur, repère approché), chacun avec l'onglet qui le détaille ;
  un texte saisi qui dit « rien » (« Aucune », « Néant ») n'est pas mis en avant ; rien quand rien.
  `nextSteps` donne les trois prochaines étapes (visite planifiée, messages à valider, relances
  dues, tâches ouvertes). Les quatre chiffres (prix et écart DVF, coût tout compris, mensualité,
  prix cible) ouvrent leur onglet ; l'adéquation tient en une ligne, son détail se déplie, son
  historique est dans Historique. « Prix cible » garde son sens (le prix maximal pour rester
  « Cible ») : la maquette montrait deux nombres, la fiche en montre un, et l'offre suggérée sur la
  jauge de Négocier (`priceRangeGauge`).
- **Une liste « À faire », une chronologie « Historique ».** `todoItems` fusionne tâches,
  questions à l'annonceur (avec l'état de leur demande : à valider, validée, demandée, relance
  due, réponse reçue, sans réponse) et visites, le fait en bas ; filtres Tout, Nous, Agence,
  Visites. Une question pour l'annonceur reste une tâche « Demander … » (règle du lot 17) : la
  case « À demander à l'agence » préfixe le libellé. Les règles du lot 17 ne changent pas : aucun
  envoi sortant, un message part après la validation d'un membre. L'Historique fusionne le journal,
  les vérifications, les prix et offres, l'historique de l'adéquation et les échanges, sans
  doublon (une fonction pure du web, `listing-timeline.ts`), avec « Vérifier sur les portails »
  qui ouvre les constats du lot 15. L'ancienne section « Mises à jour » de Suivi y devient le
  filtre « Vérifications » ; les textes qui la citaient (raison du tri d'une exploration,
  descriptions des outils MCP) disent « l'Historique ».
- **Édition par section, même mise à jour.** Le grand formulaire de la fiche est remplacé par des
  sections modifiables sur place (travaux, caractéristiques, énergie, copropriété et charges,
  annonce et adresse, description et notes, phase 2 dans Budget), une à la fois
  (`useListingEditor`) ; quitter une section modifiée demande confirmation dans la fiche, jamais
  par `window.confirm`. L'enregistrement envoie, pour les champs de la section, la même charge
  utile qu'avant (`formToPatch`, même DTO, `expectedUpdatedAt`, même journal), restreinte à la
  section (`sectionPatch`) ; les sous-objets (travaux, phase 2, localisation) partent entiers comme
  avant. Effet de bord voulu : les champs des autres sections ne partent plus, ils gardent leur
  provenance (« IA ») au lieu de passer « vous » à chaque enregistrement. Non-régression testée sur
  une charge utile relevée avec le code d'avant (`legacy-listing-save.fixture.ts`). La création
  (`ListingCreatePanel`) garde son formulaire. L'aperçu en direct suit le brouillon de la section.
- **Réglages de l'espace hors de la fiche.** Les hypothèses surchargées par annonce
  (`assumptionsOverride`) sont retirées de l'interface, des entrées REST et MCP et des calculs :
  toutes les annonces se calculent avec les hypothèses de l'espace. L'année et le type de location
  de la phase 2 se règlent pour tout l'espace : `rentalYear` existait, `leaseType` (vide par
  défaut) rejoint les hypothèses, avec son champ dans la page Hypothèses (calendrier, phase 2) et
  son résumé ; une version enregistrée avant le lot 19 se lit « vide » (défaut du schéma, pas de
  nouvelle version). `RentalPlanInputSchema` perd `year` et `leaseType`, `ListingInputSchema`
  perd `assumptionsOverride` : Zod enlève ces clés d'une entrée qui les envoie encore (REST, MCP,
  brouillons, import de l'artefact), testé de bout en bout. Les colonnes `listings.assumptions_override`,
  `rental_plans.year` et `rental_plans.lease_type` restent en base, documentées « plus lues »,
  comme `rental_plans.comparables` au lot 5 : aucune migration. Quand l'année ou le type de
  l'espace change, le plafond d'encadrement posé d'office de chaque annonce qui a une phase 2 est
  recalculé (enrichissement sans réseau, via un jeton pour éviter l'import circulaire entre
  hypothèses et annonces). En production, aucune des 29 annonces n'avait de surcharge, et toutes
  les phases 2 avaient 2028 et « vide », les valeurs de l'espace : aucun résultat ne change.

## Conséquences

- Les liens, notifications et e-mails déjà envoyés vers `?onglet=suivi`, `financer` ou
  `echanges` ouvrent le nouvel onglet.
- Le JSON d'export garde la version 1 : il perd `listing.assumptionsOverride`,
  `rentalPlan.year` et `rentalPlan.leaseType` (plus lus) et gagne `leaseType` dans les
  hypothèses ; un ancien export se relit (les clés en trop sont ignorées), un nouveau aussi par
  l'ancien schéma (valeurs par défaut).
- `studyInputFromListing` et `complianceInputFromListing` prennent les hypothèses ; un scénario
  peut toujours changer l'année (`rentalStartDate`, `rentalYear`) ou le type (`leaseType`, ou
  celui de ses hypothèses).
- Plusieurs composants de l'ancienne fiche (contexte, suivi des vérifications, échanges, étude en
  onglets) sont découpés en blocs placés dans l'onglet de leur question ; rien ne se perd, hormis
  la surcharge d'hypothèses par annonce.
