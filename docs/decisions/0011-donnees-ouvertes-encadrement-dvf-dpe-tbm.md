# 0011. Données ouvertes : arrêté officiel contrôlé par un référentiel tiers, zonage en table PostGIS, instantané d'enrichissement sur l'annonce, règles DVF, DPE et TBM, Géorisques reporté

Statut : acceptée, 3 novembre 2026.

## Contexte

Le lot 4 branche l'encadrement des loyers de Bordeaux, l'observatoire DPE de l'ADEME, les arrêts
TBM et les ventes DVF (besoins D2 à D5, L2, L3, N4). Les sources sont hétérogènes (GML d'un WFS,
classeur de préfecture, CSV tiers, API data-fair, exports Opendatasoft, CSV Etalab) ; plusieurs
points ne sont pas tranchés par l'étude : où ranger le zonage, d'où tirer les dates
d'application d'un arrêté (le classeur ne les porte pas), comment rendre le critère « marché » du
prix cible identique dans la liste et la fiche, quand appliquer un DPE trouvé, comment rattacher
un arrêt à ses lignes. La feuille de route liste « D1 à D7 » pour ce lot, alors que les choix
techniques (§ 2.8) placent Géorisques « plus tard ».

## Décision

1. **Encadrement.** Source de vérité : le classeur de la préfecture (feuille « Appartements »),
   lu sans dépendance (`scripts/lib/xlsx.ts`), libellés contrôlés (zone, pièces, époque,
   minoré < référence < majoré). Contrôle croisé obligatoire avec le référentiel national
   « loyers-reference.csv » (Loyer Conforme, ODbL) : mêmes valeurs à 0,01 € près, sinon refus ;
   les **dates d'application** viennent de ce référentiel, ou de `--valid-from`/`--valid-until`.
   Le zonage va dans une **table dédiée** `rent_control_zones` (MultiPolygon, GiST), la zone se
   lit dans le module geo (`rentControlZonesNear`, 10 m de tolérance : deux zones = « en limite »).
   L'arrêté va dans `ReferenceData` (sorte `rent_reference`), dans la même transaction que le
   zonage. Arrêté expiré : « à vérifier » (cas attendu après le 24 novembre 2026 si la
   prolongation n'est pas importée). La zone doit **contenir** le point, et l'adresse être
   localisée **au numéro** : le point BAN d'une rue est son milieu, une rue peut traverser deux
   zones ; une adresse à la rue donne la zone probable et une valeur indicative, « à vérifier ».
   Une décennie à cheval sur deux tranches (« années 70 ») est ambiguë ; une année de travaux
   n'est pas une date de construction.
2. **Instantané sur l'annonce** (`listings.open_data_context`, JSON validé par
   `ListingOpenDataContextSchema`) : arrêt de tram, médiane DVF et nombre de ventes, état du
   plafond, dernière recherche DPE. Recalculé à la création, au changement d'adresse ou de point
   (avec recherche DPE), de surface, pièces, étage, époque ou phase 2 (sans), et sur
   `POST /listings/:id/geocode`. Le **critère « marché »** lit la médiane de cet instantané
   (`financialsFromListing`), donc le même chiffre partout ; le contexte de la fiche est, lui,
   recalculé à la lecture.
3. **Plafond appliqué** à la phase 2 existante (`referenceRentPerM2`, provenance `open_data`,
   extrait citant l'arrêté et la ligne ; jamais de phase 2 créée d'office) seulement si l'état
   est « calculé », et tant que la valeur n'a pas été saisie par le membre (provenance `user` dès
   qu'il la change). Un plafond posé d'office qui ne vaut plus (adresse, phase 2, arrêté) est
   **retiré** à l'enrichissement suivant, et il ne compte plus dans le calcul après la fin
   d'application de son arrêté (`referenceRentInForce` : `financialsFromListing` reçoit la date
   de l'évaluation, l'instantané garde `validUntil`), sans attendre une écriture. L'écriture de
   l'enrichissement relit l'annonce dans sa transaction : une modification faite pendant les
   appels réseau n'est pas écrasée.
4. **DPE** : jeu `dpe03existant`, recherche par BAN puis par commune et surface ; appliqué d'office
   seulement s'il est seul, très ressemblant (surface et étage connus et égaux : un étage inconnu
   plafonne la ressemblance à 0,8, sous le seuil de 0,85) et cohérent avec la classe déclarée, et
   jamais pour une recherche par commune ; sinon proposé. Un DPE retenu ou appliqué relance les
   critères (alertes), puisque le filtre « DPE au plus » le lit. La validité du DPE et l'audit énergétique sont
   rendus par `dpeValidity`, **hors** `rentalChecks` : ajouter un contrôle aurait changé le nombre
   d'inconnues et donc les verdicts de louabilité du jeu golden.
5. **DVF** : une vente par mutation ne portant qu'un appartement et aucun autre local (maison,
   local commercial : le prix serait global), ventes et VEFA importées, seules les ventes servent
   de comparables ; bornes de plausibilité 9 m², 500 à 20 000 €/m² ; rayon 500 m élargi à 1 000
   puis 2 000 m, surface ±25 %, trois ans, cinq ventes au moins. L'identifiant de mutation
   d'Etalab n'étant pas stable d'une publication à l'autre, l'import **remplace en entier** les
   années du fichier, dans une transaction ; la source porte l'année.
6. **TBM** : arrêts actifs de la métropole hors fictifs ; lignes par terminus des chemins et
   proximité au tracé (25 m tram, 20 m bus), le jeu « chemins » ne nommant que les terminus, en
   ne lisant que les chemins **principaux** quand l'arrêt en a un (les parcours techniques de
   dépôt faisaient passer des lignes absentes) ; colonne `mode` (tram, bus, bateau) et clé
   d'import (réseau, identifiant). Les lignes restent indicatives (le GTFS serait exact).
7. **Aucune valeur inventée** : toute donnée absente, ambiguë ou périmée rend `to_verify`,
   `unavailable` ou `not_applicable` avec ses raisons ; les fixtures de test sont fictives.
8. **Géorisques reporté** au lot 5 (checklist réglementaire datée, L5), conformément aux choix
   techniques ; la feuille de route est précisée.

## Conséquences

- Migration `20261103180000_lot4_criteria_opendata` : `rent_control_zones` (GiST),
  `transit_stops.mode` + `imported_at` + unicité (réseau, identifiant), `dvf_sales.external_id`
  (unique) + nature, commune, code postal, source, date d'import, `listings.dpe_number` et
  `listings.open_data_context`. SQL de `prisma migrate diff`, relu : suppressions d'index GiST
  écartées, index GiST de la nouvelle géométrie ajouté.
- Les imports réels sont manuels (scripts, `docs/open-data.md`) ; leur rafraîchissement aussi.
- Une annonce garde son instantané jusqu'à sa prochaine écriture : après un import DVF, la
  médiane du critère « marché » d'une annonce non modifiée est celle de son dernier
  enrichissement (le contexte de la fiche montre, lui, les ventes du moment).
- Le référentiel tiers est sous ODbL : il ne sert qu'au contrôle et aux dates, la table importée
  est celle de la préfecture.
- `ListingOpenDataContextSchema.rentControl.validUntil` (défaut null) s'ajoute à l'instantané ;
  `financialsFromListing(listing, communes, at)` prend une date facultative (sans date, rien ne
  change : jeu golden identique).
