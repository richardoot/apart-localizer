# 0006. Filtre par verdict, tri et pagination appliqués en mémoire après l'évaluation

Statut : acceptée, 3 novembre 2026.

## Contexte

La liste d'annonces (REST `GET /listings`, MCP `list_listings`, web) accepte un filtre par
verdict (`cible`, `à creuser`, `hors cible`), un tri par indicateur (score, rendements, effort,
prix au m², compatibilité location, avis) et une pagination. Le verdict et les indicateurs ne
sont pas des colonnes : ils sortent de `packages/domain` à partir de l'annonce **et** des
hypothèses en vigueur (seuils, marges, apport, taux), surchargées par annonce. Les matérialiser
en base imposerait de recalculer toutes les lignes à chaque changement d'hypothèses.

L'étude du besoin exige que le filtrage géographique se fasse en base (PostGIS) pour que liste,
carte et MCP coïncident ; elle ne dit rien de l'endroit où le verdict se filtre.

## Options

1. **Colonnes matérialisées** (verdict, score...) recalculées par un déclencheur ou une tâche à
   chaque écriture d'annonce ou d'hypothèses. Tri et pagination en SQL ; complexité et risque de
   désynchronisation.
2. **Tout en mémoire** : SQL pour les filtres de colonnes (statut, commune, DPE, prix, surface,
   pièces, texte) et pour la géo (rayon, périmètre) ; puis évaluation de chaque ligne retenue,
   filtre par verdict, tri, découpage de la page.

## Décision

Option 2. `ListingsService.list` réduit d'abord les lignes en SQL (le filtre géographique reste
dans le module `geo`), évalue les lignes restantes avec les hypothèses courantes, puis applique
verdict, tri et pagination. `total` et `pageCount` comptent les annonces qui passent tous les
filtres.

## Conséquences

- Une page demande d'évaluer toutes les annonces qui passent les filtres SQL, pas seulement
  celles de la page : quelques dizaines à quelques centaines d'annonces, soit des millisecondes.
  Au-delà d'un millier d'annonces actives dans un espace, revoir avec l'option 1.
- Les mêmes résultats partout : le web, le REST et le MCP passent par la même méthode.
- Le filtre `verdict` ne réduit pas la charge SQL ; les autres filtres si.
