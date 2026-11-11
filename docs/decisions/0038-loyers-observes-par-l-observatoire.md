# 0038. Loyers observés hors de Bordeaux : les médianes de l'observatoire local des loyers, un indicateur qui n'entre dans aucun calcul

Statut : acceptée, 11 novembre 2026. Complète 0011 (données ouvertes : encadrement, DVF, DPE,
TBM) : l'encadrement ne dit rien hors de la commune de Bordeaux.

## Contexte

Le plafond d'encadrement (lot 4) ne vaut que pour la commune de Bordeaux, seule commune encadrée
de la métropole : il n'existe pas de « loyer de référence » pour Talence, Mérignac ou Pessac. Hors
de Bordeaux, la fiche n'avait donc aucun repère de loyer tant que le membre n'avait pas saisi
cinq annonces de location comparables (lot 5).

Deux sources ouvertes donnent un loyer par territoire :

- la **Carte des loyers** (ANIL, à partir des annonces SeLoger et leboncoin) : un chiffre par
  commune, charges comprises, location vide ; l'application raisonne hors charges, et une seule
  valeur pour tout Mérignac ou tout Pessac est trop grossière ;
- les **résultats de l'Observatoire local des loyers** (OLL) de l'agglomération de Bordeaux :
  médiane et quartiles hors charges, par zone de calcul (cinq zones qui couvrent les 28 communes,
  IRIS par IRIS dans les communes partagées) et par nombre de pièces. C'est l'observatoire dont
  sont tirés les loyers de référence de l'encadrement.

## Décision

1. **La source est l'observatoire local des loyers**, enquête la plus récente importée (2025 :
   loyers au 1er janvier 2025). La Carte des loyers n'est pas importée.
2. **Un indicateur, jamais un plafond.** Le loyer observé n'entre dans aucun calcul : ni le loyer
   retenu, ni les rendements, ni le prix cible, ni la louabilité, ni la conformité. Il n'est pas
   écrit sur l'annonce (ni `rentalPlan`, ni l'instantané `open_data_context`), il n'a pas de
   provenance : il est calculé à la lecture, dans le bloc « Contexte » (`ListingContext`,
   `rentObservatory`), `POST /market-context` et `get_market_context`. Le loyer de marché de la
   phase 2 reste celui que le membre retient de ses comparables.
3. **La zone** vient de la commune quand elle est entière dans une zone, sinon de l'IRIS qui
   contient le repère (contours du lot 11, aucune géométrie nouvelle). Une adresse à la rue est
   marquée « ≈ » ; un repère au quartier ou au centre de la commune rend la valeur « à vérifier » ;
   un repère en limite de deux zones, ou une annonce sans repère dans une commune partagée, ne rend
   aucune valeur. Hors du périmètre : « sans objet ». Sans import : « indisponible ».
4. **La ligne** est celle des appartements du même nombre de pièces (1, 2, 3, « 4 et plus »),
   sinon toutes tailles, dit en note. Le loyer mensuel est la médiane au m² × la surface ; le loyer
   visé est placé par rapport aux quartiles, et un loyer visé au-dessus du 3e quartile est signalé
   (une pastille dans la fiche, une note dans le connecteur), sans changer aucun verdict.
5. **Rangement** : `reference_data`, sorte `rent_observatory`, clé `bordeaux:<année>` ; aucune
   migration. `pnpm import:rent-observatory` lit l'archive de l'observatoire (base et zonage),
   refuse un zonage dont une zone n'a aucun loyer publié, et n'écrit rien d'autre.
6. **Ce que la donnée ne dit pas est écrit avec elle** : loyers de tous les locataires en place
   (pas des seules mises en location : la médiane des locataires arrivés depuis moins d'un an est
   donnée à côté, toutes tailles), parc privé sans distinction entre location vide et meublée dans
   le fichier, enquête datée.

## Conséquences

- Une annonce hors de Bordeaux a un repère de loyer dès qu'elle a un repère géographique.
- Les verdicts, le prix cible et les exports ne changent pas ; aucune donnée d'annonce n'est
  réécrite, aucun rattrapage n'est nécessaire après l'import.
- Une nouvelle enquête s'importe chaque année (`--year`), la plus récente est lue ; si le
  découpage des IRIS change, les contours du lot 11 doivent être de la même édition que le zonage
  (vérifié le 11 novembre 2026 : les 178 IRIS du zonage 2025 des communes partagées sont ceux des
  contours 2026 de la métropole).
- Écarté : pré-remplir le loyer de marché de la phase 2 avec la médiane de l'observatoire (elle
  ferait passer une statistique de zone pour un relevé du membre et pèserait sur la louabilité).
