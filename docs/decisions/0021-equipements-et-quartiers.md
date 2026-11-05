# 0021. Équipements et quartiers : recensement des équipements sportifs et OpenStreetMap, quartiers officiels puis IRIS pour toute la métropole, drive jamais supposé, distances à vol d'oiseau

Statut : acceptée, 5 novembre 2026.

## Contexte

Richard veut voir, en plus des arrêts de tram et de bus, les pistes d'athlétisme, les
supermarchés avec drive (de préférence Carrefour, Auchan, Intermarché), les salles Fitness Park
et les contours de tous les quartiers de Bordeaux Métropole, sur la carte et dans l'onglet
Quartier de chaque annonce (besoins D8 à D11, G9). Aucune source ne couvre tout : le
recensement des équipements sportifs (Data ES) décrit les pistes mais aucun Fitness Park en
Gironde ; aucun jeu ouvert ne dit quel magasin a un drive ; il n'existe pas de découpage en
quartiers unique pour les 28 communes (le jeu « Quartier des communes » de Bordeaux Métropole
n'en couvre que huit). Les sites des enseignes ne peuvent pas être lus (règle du projet : pas de
scraping).

## Décision

1. **Pistes** : le recensement (`data-es`, ministère des Sports, Licence Ouverte 2.0), types
   « Stade d’athlétisme » (1001), « Piste d'athlétisme isolée » (1004) et « Piste d'athlétisme
   2 à 4 couloirs » (1005) ; les aires de saut et de lancer ne sont pas des pistes. Nature,
   couverture, longueur (de l'anneau pour un stade), revêtement et publics viennent du jeu ;
   l'accès est « accès libre » seulement si le jeu le dit, sinon les publics déclarés (souvent
   scolaires seuls). En complément, les pistes OpenStreetMap (`leisure=track` + `sport=athletics`,
   ODbL) qu'aucune fiche ne décrit : ni référence `ref:FR:sport_equip` vers un équipement
   d'athlétisme du recensement, ni piste du recensement à moins de 200 m. La date de mise à jour
   d'une fiche n'est gardée qu'à partir du 1er avril 2025 (la fiche du jeu demande d'ignorer les
   dates antérieures).
2. **Drive, jamais supposé** (`driveSignalOfTags`, domain) : commerces alimentaires
   OpenStreetMap seulement (`shop=supermarket`, `convenience`, `outpost`, `department_store`).
   Drive **signalé** : `drive_through=only` (point de retrait sans magasin, recommandation de la
   Name Suggestion Index pour « Auchan Drive », « E.Leclerc Drive », « Intermarché Drive ») ou
   « drive » dans le nom, l'enseigne, le nom officiel ou court (« Carrefour Drive »,
   « Chronodrive »). Drive **à vérifier** : `drive_through=yes` (le wiki français l'emploie pour
   un drive, l'anglais pour tout service au volant), `click_and_collect`, `branch=Drive` sans
   « drive » dans le nom, un `shop=outpost` sans autre signal, ou un supermarché à moins de 400 m
   d'une voie de service `service=drive-through` qui porte le nom de son enseigne. Tout autre
   magasin n'est pas importé, quelle que soit sa taille : l'absence d'étiquette ne prouve pas
   l'absence de drive, mais un drive n'est jamais affirmé sans la donnée. Les enseignes
   préférées se reconnaissent par le nom ou l'enseigne (Carrefour, Auchan, Intermarché, toutes
   déclinaisons) ; pour chacune, le drive le plus proche est un drive signalé, ou « à vérifier »
   faute de drive signalé dans le rayon.
3. **Fitness Park** : OpenStreetMap, chaque club vérifié (`isFitnessPark`, domain) :
   identifiant Wikidata de la marque Q102351191, sinon « Fitness Park » dans l'enseigne, le nom
   ou l'exploitant ; un identifiant Wikidata d'une autre marque écarte l'objet.
4. **Quartiers pour toute la métropole** : quartiers officiels de Bordeaux Métropole
   (`se_quart_s`) là où la commune en publie ; pour Bordeaux, les 30 secteurs de vie de la Ville
   (`se_quartvie_s`), plus fins que ses huit quartiers, avec leur quartier en parent ; ailleurs
   les IRIS de l'INSEE (Contours IRIS de l'IGN, édition 2026), nommés « IRIS <nom> », et la
   commune entière pour une commune non découpée (IRIS de type Z). Les IRIS sont aussi importés
   dans les communes à quartiers : ils ne servent qu'à défaut (un point hors des quartiers
   officiels, dans un interstice), et la carte n'en dessine que la part hors de ces quartiers qui
   garde au moins 1 ha une fois rognée de 25 m (Martignas-sur-Jalle nord, Talence
   Médoquine-Haut-Brion ; pas les liserés dus aux écarts de tracé). Chaque contour porte sa
   provenance (`source`), affichée sous le quartier. Le quartier d'une annonce est le contour qui
   contient son point (quartier, puis IRIS, puis commune) ; « à vérifier » pour une localisation
   au centre de la commune ou au quartier du géocodeur, deux contours de même nature, ou une
   adresse à la rue à moins de 30 m d'un autre contour de même nature.
5. **Distances à vol d'oiseau**, calculées par PostGIS (`ST_Distance` sur la sphère) dans le
   module `geo`, dans un rayon de 20 km, et présentées comme telles ; aucun temps de trajet :
   l'isochrone de l'application ne donne qu'un contour, et un temps par équipement demanderait un
   appel au calcul d'itinéraire de la Géoplateforme par annonce et par équipement (réseau, cache,
   limite de débit), pour un vélo de toute façon approché (ADR 0010).
6. **Instantané et lecture** : le résultat (`Surroundings`) entre dans
   `listings.open_data_context.surroundings` à la création, au changement d'adresse et au
   « Relancer le géocodage », et le bloc Contexte de la fiche (et `get_listing` du MCP) le
   recalcule à la lecture. `pnpm refresh:surroundings` rattrape les annonces existantes après un
   import (même service que l'API, sans réseau, une ligne de journal par annonce réécrite). Une
   source non importée rend « non disponible », jamais une valeur inventée.
7. **Tables** `amenities` (genre, source, identifiant, enseigne, drive, attributs en JSON validé
   par `AmenityDetailsSchema`) et `neighbourhoods` (nature, code, parent, provenance, géométrie
   et part dessinée), écrites par le module `geo` ; chaque import remplace sa source en entier
   dans une transaction (idempotent, un fichier vide ne vide rien).

## Conséquences

- Migration additive `20261105120000_lot11_amenities_neighbourhoods` ; trois imports et le
  rattrapage à lancer après le déploiement (docs/deploiement.md § 2).
- Les drives des hypermarchés sont sous-représentés : OpenStreetMap ne signale que 25 drives
  dans la métropole (dont 4 « à vérifier »), et seulement 3 Carrefour, 4 Auchan et 2 Intermarché.
  La fiche le dit (« aucun drive à moins de 20 km » n'est pas « aucun drive ») ; un drive manquant
  se corrige dans OpenStreetMap, puis par un nouvel import.
- La donnée OpenStreetMap est sous ODbL : attribution « © OpenStreetMap » sur les couches et dans
  les fenêtres ; la table importée n'est pas redistribuée (usage interne de l'espace).
- Quartiers de Bordeaux : les secteurs de vie ont été recréés en septembre 2026 ; un nouveau
  découpage se reprend par un nouvel import.
- Hors périmètre, noté « plus tard » : ces équipements comme filtres des critères de recherche
  ou dans le verdict, des temps de trajet, d'autres équipements.
