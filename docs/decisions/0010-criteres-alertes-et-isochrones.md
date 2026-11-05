# 0010. Critères de recherche : un seul prédicat géographique, filtres par `domain`, table des entrées pour les alertes, compteurs à la lecture, isochrone à vélo approchée

Statut : acceptée, 3 novembre 2026 ; précisée par 0024 (adéquation aux critères, lot 14).

## Contexte

Le lot 4 ajoute les critères de recherche enregistrés (besoins G3 à G6). L'étude du besoin exige
que « la liste, la carte, le MCP et les alertes donnent le même résultat » et que le filtrage
géographique se fasse en base. Le verdict, qui fait partie des filtres d'un critère, n'est pas une
colonne : il sort de `domain` avec les hypothèses en vigueur (ADR 0006). Les alertes demandent de
savoir qu'une annonce **entre** dans un critère, donc de garder l'état précédent. Enfin, les
capacités du service d'isochrones de la Géoplateforme (relevées le 3 novembre 2026 sur
`/navigation/getcapabilities`) n'offrent que les profils `car` et `pedestrian`, alors que le lot
demande « à pied, vélo, voiture » et que l'étude évoque « en transport ».

## Décision

1. **Un seul prédicat PostGIS** (`CRITERIA_GEO_PREDICATE` dans `geo.service.ts`) pour la partie
   géographique : sans périmètre tout passe ; point et rayon par `ST_DWithin` ; polygone et
   isochrone par `ST_Intersects` avec la géométrie enregistrée ; distance au tram par l'existence
   d'un arrêt de tram à moins de N m. Il sert à la liste filtrée (`listingsInCriteria`), à
   l'aperçu d'un critère non enregistré (ligne virtuelle `WITH c AS (...)`) et aux alertes
   (`criteriaContainingListing`).
2. **Les autres filtres par `criteriaFilterMatch`** (domain), appliqués en mémoire après
   l'évaluation, comme le verdict (ADR 0006) : prix, surface, pièces, DPE maximal (un DPE inconnu
   passe, à vérifier), communes, verdicts, statuts (vide = actifs). Les filtres de la liste et
   ceux du critère se cumulent.
3. **Table `criteria_matches`** (critère, annonce, date d'entrée, localisation imprécise) : mise
   à jour à chaque écriture d'annonce (création, modification, statut, prix, relance du
   géocodage, DPE retenu ou appliqué ; REST et MCP) par `CriteriaMatchService.refreshForListing`,
   qui rend les entrées et les sorties (`criteriaChanges` dans la réponse, « Entre dans le
   critère X ») et les journalise (`criteria.matched`, `criteria.unmatched`) ; seules les lignes
   réellement insérées ou supprimées par cette écriture alertent, pour que deux écritures
   concurrentes n'alertent qu'une fois. Resynchronisée sans alerte à l'écriture d'un critère
   (précision « sous réserve » comprise). Elle porte le badge du web et `criteriaMatches` des
   annonces.
4. **Compteurs à la lecture** : `listingCount`, `newCount` (non ouvertes par le membre),
   `approximateCount` sont recalculés comme la liste, pour rester exacts après un changement
   d'hypothèses (le verdict change sans écriture d'annonce, la table n'est pas resynchronisée
   alors : le badge peut retarder jusqu'à la prochaine écriture, la liste et les compteurs non).
5. **Annonce imprécise** (quartier ou commune) : incluse « sous réserve » (`approximate`), comme
   le prévoit l'étude (§ 6).
6. **Isochrones** : à pied (`pedestrian`, durée) et en voiture (`car`, durée) tels quels ; **à
   vélo approché** par une isodistance sur le réseau piéton à 15 km/h (250 m par minute),
   l'approximation étant enregistrée avec les paramètres ; **« en transport » non proposé**
   (aucune ressource de la Géoplateforme). Le polygone est figé à l'enregistrement, les
   paramètres envoyés conservés pour un recalcul identique ; un MultiPolygon est réduit à son plus
   grand morceau (signalé). Service en panne : 503 en REST, refus lisible en MCP.
7. **Cercle dessiné** (terra-draw) enregistré en point et rayon (centre et rayon du dessin), pour
   que PostGIS mesure la distance exacte ; polygone validé par `ST_IsValid` (100 m² à 1 000 km²).
8. **Archivage** par `active: false` ; suppression par le REST seulement (journalisée), jamais
   par le MCP.
9. **Écriture atomique d'un critère** : le périmètre (isochrone, géocodage du départ) est résolu
   d'abord ; la ligne, sa géométrie et le journal s'écrivent ensuite dans une transaction, la
   mise à jour conditionnée à la version lue (`updatedAt`) : deux modifications concurrentes ne
   passent pas toutes les deux. Un géocodeur en panne pour une isochrone par adresse répond 503,
   une adresse introuvable 400.

## Conséquences

- Migration `20261103180000_lot4_criteria_opendata` : table `criteria_matches` (clé
  critère + annonce, suppression en cascade). Les filtres d'un critère restent du JSON validé par
  `CriteriaFiltersSchema`, enrichi de `statuses` et `maxTramDistanceMeters`.
- L'énumération `IsochroneMode` vaut `walking`, `cycling`, `driving` ; l'étude du besoin (G5, D7)
  est corrigée : « en transport » est reporté faute de service.
- Quatre outils MCP (21 au total) : `list_search_criteria`, `create_search_criteria`,
  `update_search_criteria` (garde `expectedUpdatedAt`), `get_market_context` ; `list_listings`
  applique `criteriaId` exactement comme `GET /listings?criteriaId=`.
- Les notifications (e-mail, push) restent au lot 6 : la table des entrées et le journal en sont
  la matière.
