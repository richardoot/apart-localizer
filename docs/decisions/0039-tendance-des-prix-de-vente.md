# 0039. Tendance des prix de vente : douze ans de ventes DVF, les années d'avant 2021 par le Cerema, un indicateur année par année

Statut : acceptée, 11 novembre 2026. Complète 0011 (données ouvertes : encadrement, DVF, DPE,
TBM) : les ventes DVF ne servaient qu'aux comparables des trois dernières années.

## Contexte

La fiche disait le prix médian des ventes comparables (trois ans, surface à ±25 %), pas le sens du
marché : un secteur à 4 200 €/m² ne se négocie pas de la même façon selon qu'il monte ou qu'il a
perdu 12 % depuis son pic. Il fallait des ventes plus anciennes, « depuis au moins 2015 ».

Les fichiers « DVF géolocalisées » d'Etalab ne gardent que cinq ans : la livraison d'octobre 2026
va de juillet 2021 à juin 2026, celle d'avril 2026 (archive `files.data.gouv.fr/geo-dvf/latest`,
supprimée fin novembre 2026) de janvier 2021 à décembre 2025. Les années antérieures ne sont plus
publiées par la DGFiP. Le Cerema les conserve dans « DVF+ open-data » (les mêmes données de la
DGFiP, une ligne par mutation, géolocalisée à la parcelle, depuis 2014, Licence Ouverte 2.0), servi
par une API ouverte et par des archives à télécharger à la main.

## Décision

1. **Deux sources, une seule table.** Les années 2021 et suivantes restent celles d'Etalab ; les
   années 2014 à 2020 viennent de l'API « DVF+ open-data » du Cerema (`import:dvf --cerema`). Les
   deux écrivent dans `dvf_sales` par le même chemin (`GeoService.upsertDvfSales`, une année
   remplacée en entier) ; la colonne `source` dit la lignée (`dvfplus-open-data-cerema:<année>`).
   Aucune migration.
2. **Les mêmes règles de tri.** Une vente retenue est une mutation d'un seul appartement sans autre
   local (typologie DVF+ `121`, « UN APPARTEMENT », l'équivalent du filtre appliqué aux fichiers
   d'Etalab), vente ou VEFA, dans une seule commune de la métropole, géolocalisée, surface ≥ 9 m²,
   500 à 20 000 €/m². Vérifié sur l'année 2021, présente dans les deux sources : 7 741 ventes et une
   médiane de 3 939 €/m² par le Cerema, 7 570 ventes et 3 950 €/m² par Etalab (0,3 % d'écart) ; les
   repères des ventes appariées sont à 5 m l'un de l'autre en médiane, 25 m au 9e décile.
3. **Ce que le Cerema ne donne pas reste vide.** Ni adresse ni nombre de pièces dans l'API : ces
   ventes n'ont que leur date, leur prix, leur surface et le centre de leur parcelle. Elles ne sont
   jamais des comparables (la fenêtre de trois ans ne les atteint pas) ; elles servent à la tendance.
4. **La tendance** est la médiane au m² de chaque année en base, sur toutes les ventes
   d'appartements du rayon (ventes classiques, toutes surfaces : filtrer par surface laisse trop
   peu de ventes par an). Une année de moins de dix ventes n'a pas de médiane ; une année dont les
   ventes s'arrêtent avant décembre est dite incomplète et ne porte aucun écart. Les écarts sont
   calculés jusqu'à la dernière année complète retenue, sur un, cinq et dix ans (avec le rythme
   annuel composé), avec l'année du pic et l'écart depuis. Rien n'est extrapolé : un écart dont une
   borne manque n'est pas rendu.
5. **Son rayon est le sien** : 500 m, élargi à 1 000 puis 2 000 m tant que la dernière année
   complète n'a pas dix ventes (ou le rayon imposé à `get_market_context`). Il ne suit pas celui
   des comparables, qui dépend aussi de la surface de l'annonce.
6. **Un indicateur.** La tendance n'entre dans aucun calcul (ni le critère « marché », ni le prix
   cible, ni la projection : l'hypothèse de revalorisation reste celle de l'espace) ; elle n'est pas
   écrite sur l'annonce ni dans l'instantané. Elle est calculée à la lecture, dans
   `MarketContext.trend` : contexte de la fiche (bloc « Tendance des prix » de l'onglet Négocier),
   `POST /market-context`, `get_market_context` et `get_listing`. Les médianes sont en euros
   courants, et cela est écrit avec elles.
7. **Les calculs sont dans `domain`** (`marketTrend`) ; le module geo ne rend que les prix au m²
   par année dans le rayon.

## Conséquences

- Claude et la fiche disent le sens des prix d'un secteur et son ampleur, sourcés et datés.
- La base passe de 16 302 à 97 099 ventes (de 2014 au 1er semestre 2026) ; l'index GiST existant
  suffit (contexte d'un point du centre de Bordeaux, tendance comprise : moins de 300 ms en local).
- L'API du Cerema n'a pas de fichier figé : l'import ne peut pas être rejoué à l'identique (pas
  d'empreinte), il relit une page après une erreur passagère et refuse une lecture tronquée. Les
  années 2014 à 2020 ne changent plus : elles s'importent une fois.
- Quand Etalab retirera 2021 de ses fichiers (livraison d'avril 2027), l'année restera en base ;
  la réimporter demandera `--cerema`.
- Écarté : un indice à qualité constante (prix hédonique, ventes répétées) ; la médiane brute est
  sensible à ce qui se vend chaque année (taille, neuf), ce qui est dit avec elle. Écarté aussi :
  déduire l'inflation, et nourrir l'hypothèse de revalorisation de la projection avec la tendance.
