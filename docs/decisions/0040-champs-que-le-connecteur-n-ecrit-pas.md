# 0040. Champs que le connecteur n'écrit pas : plafond d'encadrement, loyer de marché retenu, sorties du géocodeur, estimations

Statut : acceptée, 11 novembre 2026. Complète 0011 (données ouvertes : plafond posé d'office), 0012
(loyers comparables) et 0022 (placement du repère).

## Contexte

Une revue de ce que `create_listing` reçoit et de ce que l'application calcule a confirmé que les
indicateurs ne sont jamais écrits par Claude : coût tout compris, mensualité, rendements, verdict,
louabilité et prix cible sont recalculés par `domain` à chaque lecture, et aucun champ ne les
stocke. Trois saisies acceptées par le connecteur doublaient pourtant une valeur que le serveur
pose lui-même, ou qu'un membre retient dans l'application :

- **`rentalPlan.referenceRentPerM2`** : le plafond est posé d'office d'après l'arrêté « tant que
  le membre n'a rien saisi ». Une valeur envoyée par le connecteur comptait comme une saisie, et
  bloquait le plafond de l'arrêté.
- **`rentalPlan.marketRent`** : le loyer de marché est la médiane des loyers comparables, qu'un
  membre retient par « Retenir » dans la fiche. Le connecteur pouvait l'écrire sans aucun
  comparable : la louabilité lisait alors un « marché constaté » qui n'avait été constaté par
  personne.
- **`propertyTax` et `nonRecoverableChargesMonthly`** : absents, ils sont estimés par `compute`
  (un mois de loyer ; 25 % des charges annuelles / 12) et la fiche le dit. Une estimation faite
  dans la conversation et envoyée comme valeur passait pour un montant réel.
- **`location.addressNormalized`, `banId`, `inseeCode`** : ce sont des sorties du géocodeur. Avec un
  point fourni, rien n'est géocodé, et ces clés restaient celles de la conversation ; or l'identifiant
  BAN guide la recherche du DPE à l'ADEME.

## Décision

1. **Sur le canal du connecteur, ces clés sont acceptées et ignorées**, comme les clés retirées au
   lot 19. À la création, elles sont vides : l'enrichissement pose le plafond, le géocodage les
   sorties du géocodeur. Seule exception : une fiche rendue par `extract_listing` garde ce que le
   géocodeur du serveur a rendu (le point et la clé sont tous deux de provenance `open_data`). À la
   modification, un sous-objet fourni (phase 2, localisation) remplace l'existant mais garde ces
   valeurs de la fiche, avec leur provenance.
2. **La règle est pure, dans `domain`** (`connector-fields.ts` : `connectorListingCreate`,
   `connectorListingUpdate`, `restoreKeptProvenance`). Elle est appliquée par `ListingsService`
   quand l'appelant passe `connector: true`, ce que seuls `create_listing` et `update_listing` font.
3. **Le REST ne change pas** : un membre peut toujours saisir un plafond à la main (il l'emporte sur
   l'arrêté) et retenir ou saisir un loyer de marché.
4. **Le loyer de marché n'est pas dérivé d'office des comparables** : le retenir reste un choix du
   membre, et le dériver demanderait de lire les comparables à chaque évaluation, liste comprise.
   Pour Claude, la voie est `add_rent_comparable`, puis « Retenir » dans l'application.

5. **Montants estimables** (`CONNECTOR_ESTIMATED_KEYS` : taxe foncière, part non récupérable des
   charges) : par le connecteur, une valeur de provenance `ai` n'est gardée qu'avec son extrait
   (`fieldSources.<champ>.evidence`, que `extract_listing` joint à une valeur lue quand le modèle la cite) ; dictée par le membre
   (`user`), elle est gardée. Sinon elle est ignorée : vide à la création (l'application l'estime et
   le dit), inchangée à la modification ; la réponse le dit (`describeUnsupportedEstimates`), et une
   modification qui ne contenait que cela est refusée avec cette phrase.
6. **Point saisi** (tous les canaux) : il prime toujours et le repère ne bouge pas, mais l'adresse
   de l'annonce est quand même géocodée pour ce que seul le géocodeur rend
   (`addressFieldsForManualPoint`, `manual-point.ts`) : le code INSEE, et l'identifiant BAN et
   l'adresse normalisée si l'adresse trouvée, au numéro ou à la rue, est à moins de
   `MANUAL_POINT_ADDRESS_TOLERANCE_METERS` (150 m) du point ; loin du point, ils restent vides (ils
   décriraient un autre endroit). À la création, et à la modification quand l'adresse ou la commune
   change avec un nouveau point (le BAN de l'ancienne adresse n'est plus gardé).

## Conséquences

- Une annonce créée par Claude dans une commune encadrée reçoit le plafond de l'arrêté, même si la
  conversation en a proposé un autre.
- `update_listing` ne peut plus effacer, par un `rentalPlan` incomplet, un plafond saisi ni un loyer
  de marché retenu : la fiche garde les siens.
- Les descriptions des outils et du schéma `apart://schema/listing` disent que ces clés sont
  ignorées.
- Écarté : refuser l'appel (422) quand ces clés sont envoyées. La fiche rendue par `extract_listing`
  et les anciennes conversations les portent ; les ignorer suit le précédent du lot 19.
- Une annonce placée par un point lu sur une carte retrouve la recherche du DPE par identifiant BAN
  et la recherche par commune et surface.
- Écarté : détecter une estimation par sa valeur (égale à la formule) ; un arrondi la masque.
- Gardé tel quel, au choix du membre : le loyer visé (`targetRent`) peut être proposé par Claude
  (provenance `ai`, affichée), bien qu'il pèse sur le verdict et le prix cible.
