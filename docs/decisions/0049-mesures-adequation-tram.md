# 0049. Mesures de l'adéquation : distances au tram par l'index, et seulement quand un critère les lit

Statut : acceptée, 17 novembre 2026. Suite de l'ADR 0048 ; touche à la requête des mesures de
l'adéquation (ADR 0024), sans changer aucun niveau ni aucune raison.

## Contexte

Après l'ADR 0048, `GET /search-criteria` restait la route la plus lente de l'application : 2,3 à
2,6 s par lecture en production, instance chaude comprise, alors qu'elle répond en 50 ms en
local. Mesuré le 17 novembre 2026 sur la base de production (lecture seule, 51 annonces, deux
critères à polygone, 279 arrêts de tram), la requête des mesures de l'adéquation prenait à elle
seule 1,2 à 1,9 s. Le plan montrait pourquoi :

- les distances au tram (`lt`) étaient recalculées pour chaque critère : Postgres insère dans la
  requête un `WITH` lu une seule fois, et la jointure avec les critères le rejouait ;
- chaque calcul joignait chaque annonce aux 279 arrêts (14 229 lignes), puis triait ces lignes
  avec le contour de l'annonce pour en garder le minimum : 29 Mo triés sur disque ;
- et ces distances ne servent à rien sans critère qui filtre sur le tram (`maxTramDistanceMeters`),
  ce qui est le cas des deux critères de l'espace : le domaine ne les lit que pour ce filtre.

La base de Supabase est une petite instance : ce qui prend 165 ms sur un poste y prend dix fois
plus. Ce temps d'attente ne compte pas dans le CPU actif de Vercel, mais il tient l'instance
occupée (mémoire facturée, instances supplémentaires démarrées pendant qu'elle attend) et retarde
l'ouverture de l'application.

## Décision

1. **Rien sans filtre tram.** `needsTram(rules)` (`criteria-match.service.ts`) dit si une règle
   filtre sur le tram ; sinon les trois requêtes de mesures (`criteriaFitMeasures`,
   `criteriaFitMeasuresDraft`, `criteriaFitMeasuresForPoints`, option `tram`) rendent des
   distances nulles sans les calculer. Avec l'option omise, elles les calculent, comme avant.
2. **Une fois par annonce.** Le `WITH lt` est `MATERIALIZED` : calculé une fois, quel que soit le
   nombre de critères.
3. **Par l'index.** Pour le repère et pour le contour, les dix arrêts de tram les plus proches
   sont pris par l'index GiST (`ORDER BY geom <-> …`, distance sur la sphère), et la distance
   gardée est la plus courte sur l'ellipsoïde (`ST_Distance`), comme avant. Les deux distances
   diffèrent de moins de 0,5 % : l'arrêt le plus proche est parmi les dix premiers.

Vérifié sur la base de production en lecture seule : les 88 distances (repère et contour) sont
identiques au calcul sur tous les arrêts. La requête passe de 1,2–1,9 s à 360 ms avec un filtre
tram, à 80 ms sans (dont 35 ms d'aller-retour depuis le poste qui mesurait).

## Options écartées

- **Garder les distances au tram sur l'annonce** (colonnes recalculées à chaque déplacement du
  repère et à chaque import des arrêts) : plus rapide encore, mais une donnée dérivée de plus à
  tenir à jour par les imports et les rattrapages, pour un gain qui ne se voit plus.
- **Mettre en cache les compteurs des critères** : ils changent à chaque écriture d'une annonce,
  d'un critère ou des hypothèses ; l'invalidation coûterait plus que la requête devenue courte.

## Conséquences

- Les niveaux et les raisons de l'adéquation ne changent pas : le domaine ne lit les distances au
  tram que pour un critère qui filtre dessus, et elles sont alors les mêmes.
- Un test e2e (`placement.e2e-spec.ts`) compare les distances à celles du calcul sur tous les
  arrêts, et vérifie qu'elles sont nulles sans filtre tram.
