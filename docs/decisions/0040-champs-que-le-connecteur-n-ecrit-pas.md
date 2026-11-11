# 0040. Champs que le connecteur n'écrit pas : plafond d'encadrement, loyer de marché retenu, sorties du géocodeur

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

## Conséquences

- Une annonce créée par Claude dans une commune encadrée reçoit le plafond de l'arrêté, même si la
  conversation en a proposé un autre.
- `update_listing` ne peut plus effacer, par un `rentalPlan` incomplet, un plafond saisi ni un loyer
  de marché retenu : la fiche garde les siens.
- Les descriptions des outils et du schéma `apart://schema/listing` disent que ces clés sont
  ignorées.
- Écarté : refuser l'appel (422) quand ces clés sont envoyées. La fiche rendue par `extract_listing`
  et les anciennes conversations les portent ; les ignorer suit le précédent du lot 19.
- Reste ouvert : le loyer visé (`targetRent`) peut encore être choisi par Claude ; c'est une
  décision du membre, qui pèse sur le verdict et le prix cible.
