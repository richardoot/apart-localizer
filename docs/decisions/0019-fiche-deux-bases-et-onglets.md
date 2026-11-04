# 0019. Fiche annonce : deux bases de calcul, onglets dans l'URL, évaluation au prix cible dans `domain`

Statut : acceptée, 4 novembre 2026.

## Contexte

La fiche d'une annonce empilait tout dans un panneau de 640 px : aperçu des indicateurs, prix
cible, sensibilité, louabilité, étude, contexte, saisie, avis, tâches, historique. On ne voyait
pas quelles valeurs se comparent au prix affiché (prix cible, décote, offre) et lesquelles
portent sur le coût tout compris (rendements, effort, mensualité). « Coût total » côtoyait
« Prix cible » ; dans la sensibilité, les lignes étaient des prix affichés mais les cases étaient
calculées sur le coût, qui n'apparaissait qu'au survol (`title`, invisible au toucher). La
maquette validée (synthèse, onglet « Négocier », mobile) répond par deux pastilles, des onglets et
un encart « Et au prix cible ? ».

## Décision

- **Deux bases, un vocabulaire.** « Coût total » devient « Coût tout compris » dans le web, le
  glossaire, les libellés et descriptions de `contracts`, les scénarios et le texte du MCP. Une
  pastille réutilisable (`CostBasisBadge`) marque chaque valeur : « sur le prix » (bordée,
  étiquette) ou « tout compris » (pleine, +), en version compacte dans les tableaux. La colonne
  CSV `Coût total (€)` garde son nom : c'est un format d'échange que des tableurs lisent
  (`docs/export.md`).
- **Onglets dans l'URL.** Synthèse, Négocier, Financer et louer, Quartier, Suivi (`ListingTabs`,
  vrai motif d'onglets). L'onglet actif est le paramètre `?onglet=` (absent pour la synthèse),
  lié par `v-model:tab` dans la page des annonces, mis de côté par la synchronisation des
  filtres et oublié quand une autre fiche s'ouvre ou que la fiche se ferme ; `replace`, pas
  `push`, comme les filtres. Les onglets non ouverts ne chargent rien (sensibilité, contexte,
  visites, journal).
- **Un panneau élargi plutôt qu'une page.** La fiche reste le panneau latéral au-dessus de la
  liste (fermeture, retour et partage inchangés), élargi à 760 px puis 1 160 px sur grand écran
  (`SidePanel wide`). Les trois blocs passent en trois colonnes par requête de conteneur
  (`@4xl`), empilés sinon, comme la maquette mobile.
- **Tout calcul dans `domain`, exposé par l'évaluation existante.** `targetPrice` rend, pour
  chaque critère, `maxTotalCost` (coût tout compris à son prix maximal) et, pour l'annonce,
  `atTarget` (`outcomeAtPrice` au prix cible : coût, emprunt, mensualité, rendements, effort,
  verdict). L'API, le MCP et l'aperçu en direct les reçoivent donc sans nouvel appel.
  `sensitivityGrid` porte le coût tout compris de chaque pas de prix et, sur demande
  (`includeTargetPrice`, faux par défaut pour ne pas changer la grille des appels existants),
  insère ou repère la ligne du prix cible (`isTarget`). `compute` rend aussi `furnitureValue`,
  pour que la décomposition prix + notaire + travaux + mobilier se lise sans soustraction. La
  lecture de la fiche (`listing-reading.ts` : `profitabilityChecks`, `monthlyPaymentSplit`,
  `priceGauge`) est appelée par le web (`useListingReading`) : aucun composant ne compare ni ne
  divise. Champs ajoutés avec des valeurs par défaut, aucun renommé.
- **Tolérance d'arrondi du verdict.** Au prix cible, le critère liant est exactement à son
  seuil ; l'erreur des flottants (brut 0,05499999999999999) le faisait passer « de peu » et
  affichait « à creuser » au prix cible. Le verdict compte désormais un seuil atteint à 10⁻⁹
  près pour un rendement et à un millionième d'euro près pour l'effort (`VERDICT_TOLERANCE`) ;
  propriété testée : au prix cible, brut et effort calculables ne sont ni en échec ni « de peu ».
- **Définitions partagées.** Le bouton « ? » (`DefinitionButton`, popover reka-ui : bouton,
  `aria-expanded`, Échap) lit le glossaire de `contracts` (`INDICATOR_GLOSSARY`, déjà servi par
  `apart://glossaire`), enrichi d'une phrase courte `short` par indicateur et d'une entrée
  `cost_basis`.

## Conséquences

- À la première lecture d'une fiche, chaque valeur dit sa base ; la sensibilité se lit sans
  survol (symboles ✓ ~ ✗, coût sous chaque prix, détail de la case choisie sous la grille).
- La réponse de `GET /listings/:id/target-price`, l'évaluation des listes et les sorties MCP
  `evaluate_listing` et `get_target_price` grossissent de quelques champs, compatibles.
- Un lien vers une fiche peut viser un onglet (`/annonces/:id?onglet=negocier`).
- Le panneau élargi couvre presque toute la liste sur un écran de portable : c'est un dialogue,
  la liste reste derrière et revient à la fermeture.
