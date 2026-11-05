# 0022. Placement des annonces : adresse, puis quartier reconnu dans le texte, puis lieu-dit, puis commune ; repère au point intérieur du quartier, zone gardée, réserves « ≈ »

Statut : acceptée, 5 novembre 2026.

## Contexte

En production, 25 annonces sur 29 n'avaient pour repère que le centre de leur commune (quinze au
centre de Bordeaux, sept au Bouscat, trois à Mérignac ou Bruges) : les annonces cachent souvent
l'adresse. Leur champ « quartier » (`district`, rempli par l'extraction IA ou le MCP) est presque
toujours renseigné, mais le géocodage ne le lisait pas (adresse, puis commune). Toutes les
distances (tram, équipements), le quartier, la zone d'encadrement, les comparables DVF et les
critères à périmètre partaient donc du même point, sans que rien ne le dise. Richard demande de
placer le repère au quartier quand il est connu, à l'adresse quand elle l'est, de faire tous les
calculs depuis le repère le plus précis, et de distinguer les annonces exactement localisées des
génériques. Le texte du champ est libre : secteur de vie (« Stéhélin »), quartier qui regroupe
des secteurs (« Caudéran »), quartier officiel, nom d'IRIS, lieu-dit, mentions de tram, de bus,
de résidence ou de parc, « près de », « nord », plusieurs noms séparés par « , » ou « / ».

## Décision

1. **Hiérarchie** (`GeocodingService.locate`, règles dans `domain/placement.ts`) : adresse
   géocodée au numéro (`exact`) ou à la rue (`street`), inchangé ; sinon le quartier reconnu dans
   le champ « quartier », cherché parmi les contours importés **de la commune de l'annonce**
   (lot 11), repère au point intérieur du contour (`ST_PointOnSurface`, toujours dans le contour,
   contrairement au centroïde), précision `district`, méthode `neighbourhood_match` ; sinon un
   lieu-dit OpenStreetMap de la commune (méthode `osm_place`, repère sur le lieu-dit) ; sinon le
   centre de la commune (`commune`, géocodeur). Sans réseau pour le quartier et le lieu-dit : une
   panne du géocodeur n'empêche pas le placement au quartier.
2. **Lecture du texte** (`districtFragments`) : parenthèses retirées ; découpe aux virgules,
   barres, points-virgules, tirets espacés et « et » ; mentions de transport (« tram B », « trams
   A et B », « bus 9 »), de distance (« à 300 m ») et de résidence écartées ; « près de »,
   « face au », « proche », « à côté de » repérés ; le nom de la commune seul ignoré ; accents,
   ligatures, articles neutralisés.
3. **Reconnaissance** (`candidateAreasOf`, `matchDistrict`) : chaque secteur de vie et quartier
   officiel (nom entier et chacun de ses éléments : « Stéhélin, Monséjour » répond à
   « Stéhélin » et à « Monséjour »), chaque quartier qui regroupe des secteurs (« Caudéran » =
   l'union de ses trois secteurs), chaque nom d'IRIS (les IRIS numérotés d'un même nom réunis).
   Un morceau et un nom se rapprochent s'ils sont identiques, si le nom est dans le morceau
   (« jardin Galin » pour « Cœur de Bastide, Galin ») ou le morceau dans le nom (« Les
   Echoppes » dans « Le Vallon-Les Echoppes ») ; les deux derniers demandent un mot distinctif
   (ni « parc », « centre », « gare », « nord »…, ni le nom de la commune). Un morceau ne garde que ses meilleurs
   rapprochements (« Caudéran » exact n'est pas aussi l'IRIS « Villa Primerose Parc
   Bordelais-Caudéran »).
4. **Choix du plus précis cohérent** (`chooseDistrictArea`, surfaces et recouvrements calculés
   par PostGIS) : d'abord une zone confirmée par un autre morceau (un secteur dans le quartier
   cité), un « près de » ne comptant que s'il est confirmé ; puis la plus fine (secteur ou
   quartier, IRIS, quartier qui regroupe des secteurs) ; puis le rapprochement le plus net ; puis
   la plus petite. « À vérifier » si la zone ne vient que d'un « près de », si un autre morceau
   désigne une zone distincte (moins de 5 % en commun), ou si le même morceau désigne des zones
   distinctes. Les noms non reconnus sont gardés dans les raisons. Jamais de quartier inventé :
   rien de reconnu, c'est la commune.
5. **Lieux-dits** : table `places` (OpenStreetMap, `place=neighbourhood|quarter|suburb` nommés,
   ODbL), chacun rattaché par PostGIS à la commune dont un contour le contient, importée par
   `pnpm import:places` ; repli quand aucun contour ne porte le nom cité (commune sans quartiers
   officiels, aux IRIS peu nommés). Seuls un nom identique ou contenu dans un morceau comptent (pas un morceau contenu dans un nom de
   lieu-dit, trop hasardeux). Le géocodeur IGN en mode « lieu » (index `poi`) est écarté : il
   mêle commerces, arrêts et lieux-dits, et ses réponses ne se vérifient pas hors ligne.
6. **Stockage** (migration additive `20261105180000_lot12_listing_placement`) :
   `listings.location_placement` (méthode, précision, zone retenue avec ses codes de contours,
   texte reconnu, « à vérifier », raisons ; JSON validé par `ListingPlacementSchema`, exposé en
   `listing.location.placement`) et `listings.location_area` (MultiPolygon : le contour retenu,
   ou la commune entière pour un repère au centre de la commune, écrit par le module geo).
7. **Tous les calculs partent du repère** (inchangé : desserte, quartier, équipements, DVF,
   encadrement, critères, comparaison, carte), avec la réserve d'un repère approché, une seule
   source de textes dans `domain` (`locationApproximation`, `approximationReason`) : distances
   « ≈ » depuis le centre du quartier, du lieu-dit ou de la commune (champ `approximate` des
   équipements et de la desserte, corrigeant le manque du lot 11) ; quartier indicatif ; zone
   d'encadrement probable si tout le contour tient dans une zone, « à vérifier » s'il en
   chevauche plusieurs (jamais « calculé » : le quartier vient du texte) ; comparables DVF
   « indicatifs » au quartier, « à vérifier » au centre de la commune ; critère à périmètre
   « sous réserve » seulement si le contour n'y est pas entier (`ST_CoveredBy`) — une annonce
   dont le repère est hors du périmètre n'y entre pas, même si une partie de son quartier y est
   (limite assumée, documentée).
8. **Ce qui prime** : un point saisi (carte, formulaire, MCP) reste, placement `manual` ; le
   quartier changé ne touche jamais un repère à l'adresse (numéro ou rue) ; le point renvoyé tel
   quel par le formulaire ne compte pas comme une saisie (sinon changer l'adresse ne replaçait
   rien). Le rattrapage ne remplace jamais un repère à l'adresse ni un point saisi, ni par une
   précision moindre (`placementImproves`).
9. **Interface** : pastille « Adresse exacte », « À la rue », « Au quartier (X) », « Commune
   seulement » (liste, cartes, fiche, comparaison, export CSV) avec l'explication en infobulle et
   en clair dans l'onglet Quartier (zone retenue, texte reconnu, raisons, « Préciser
   l'adresse ») ; sur la carte, repère plein à l'adresse, creux au quartier, pâle et pointillé à
   la commune, légende, contour du quartier au survol et tant que la fenêtre est ouverte
   (`GET /listings/areas`, couche marquée pour suivre les changements de fond, ADR 0020) et sur
   la carte du quartier de la fiche ; filtre « Repère » de la liste (Pinia ⇄ URL `precision`).
10. **MCP** : `list_listings` (filtre `precision`) et `get_listing` exposent précision, placement
    et réserve ; les descriptions de `create_listing` et `update_listing` demandent l'adresse la
    plus précise et le quartier cité, du plus large au plus fin.
11. **Rattrapage** : `pnpm relocate:listings` (`--dry-run`, `--workspace`, `--database-url`),
    mêmes règles, sans réseau, instantané de contexte recalculé, journal `listing.relocated`
    (canal `system`), idempotent. `stack:up --opendata` l'enchaîne après les imports.
12. **PWA** (correctif demandé à part) : enregistrement par `virtual:pwa-register`
    (`immediate: true`, `injectRegister: false`) ; la page se recharge une fois quand la nouvelle
    version prend la main (`onNeedReload`), jamais deux fois en trente secondes (garde en
    stockage de session), et cherche une mise à jour toutes les heures.

## Conséquences

- Sur les 19 formes de quartier relevées en production (évaluation locale, non versionnée), 16
  donnent un quartier (dont 3 « à vérifier » : deux « près de », une citant deux IRIS distincts),
  1 un lieu-dit, 2 restent à la commune (noms absents des jeux ouverts importés, ou quartier
  non précisé) ; rien n'a été inventé.
- À déployer : la migration, `import:places`, puis `relocate:listings` en simulation et en vrai
  (docs/deploiement.md § 2).
- Un quartier reconnu n'est pas une adresse : le plafond d'encadrement n'est jamais posé d'office
  depuis un repère au quartier, les distances restent « ≈ ». Un mauvais quartier vient d'un texte
  trompeur de l'annonce ; il se corrige en précisant l'adresse ou le quartier.
- Les noms d'IRIS de Bordeaux sont ceux de grands ensembles (« Lestonnat-Monséjour », 4,8 km²),
  plus larges qu'un secteur de vie : un IRIS reconnu y place le repère moins finement qu'un
  secteur.
- Hors périmètre, noté « plus tard » : inclure « sous réserve » une annonce dont le repère est
  hors d'un périmètre que son quartier recoupe ; d'autres sources de noms de quartiers (certains
  noms d'usage ne sont dans aucun jeu ouvert importé).
