# Données ouvertes

Lots 4 et 5 de la [feuille de route](product/roadmap.md) (besoins D1 à D7, L2, L3, N4) : chaque
annonce localisée reçoit l'arrêt de tram le plus proche, le plafond de loyer de l'encadrement
(commune de Bordeaux), un DPE vérifié auprès de l'ADEME et l'ancrage marché des ventes DVF
comparables ; les critères de recherche se dessinent sur la carte ou se calculent en isochrone ;
au lot 5, la checklist réglementaire lit les risques Géorisques à l'adresse ; au lot 10, les
cartes proposent le plan et la photo aérienne de l'IGN en plus du plan OpenStreetMap ; au lot 11,
chaque annonce reçoit son quartier, la piste d'athlétisme, les supermarchés avec drive et la salle
Fitness Park les plus proches, et les cartes en montrent les couches ; au lot 12, une annonce sans
adresse au numéro est placée au centre du quartier reconnu dans son texte (contours importés,
lieux-dits OpenStreetMap), et chaque calcul fait depuis un repère approché le dit (« ≈ »).
Rien n'est inventé : une donnée ambiguë, périmée ou absente rend l'état « à vérifier » avec sa
raison.

Code : `apps/api/src/opendata/` (un connecteur par source, `fetch` injectable, cache en base
`ReferenceData`), `apps/api/src/geo/` (tout le SQL PostGIS : zones, arrêts, ventes, périmètres),
`packages/domain/src/` (`rent-reference.ts`, `market.ts`, `dpe.ts`, `criteria.ts` : les calculs),
`apps/api/src/listings/enrichment.service.ts` (orchestration), `scripts/` (imports). Décisions :
ADR [0010](decisions/0010-criteres-alertes-et-isochrones.md),
[0011](decisions/0011-donnees-ouvertes-encadrement-dvf-dpe-tbm.md) et, pour le lot 11,
[0021](decisions/0021-equipements-et-quartiers.md).

## Sources

Consultées et téléchargées le 3 novembre 2026. Les fichiers locaux vivent dans
`data/opendata/` (ignoré par git, jamais commité) ; leur empreinte SHA-256 a été comparée à un
nouveau téléchargement des URL ci-dessous le même jour : identiques, sauf mention contraire.

| Donnée                                                                              | Fichier local                                                           | Source (URL de téléchargement)                                                                                                                                                                                                                                                                                                                                                      | Producteur, licence                                                                                                                                  | Fraîcheur relevée                                                                                                                                                     |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zonage de l'encadrement (88 secteurs IRIS, zones 1 à 4)                             | `encadrement/l_zonage_oll_bordeaux.gml`                                 | WFS geo-ide : `https://ogc.geo-ide.developpement-durable.gouv.fr/wxs?map=/opt/data/carto/geoide-catalogue/1.4/org_38008/63a6ca47-2f05-4778-8ffe-b54e24f44f94.internet.map&SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms:l_zonage_oll_bordeaux&SRSNAME=urn:ogc:def:crs:EPSG::4326` (fiche data.gouv.fr « Encadrement des loyers sur Bordeaux - Secteurs géographiques ») | DDTM de la Gironde, Licence Ouverte 2.0 (fiche data.gouv.fr)                                                                                         | fiche datée du 22 juin 2022, ressources du 15 novembre 2024 ; même découpage pour tous les arrêtés 2022 à 2026 selon le référentiel national (`zones.csv`)            |
| Loyers de référence, arrêté préfectoral du 6 juillet 2026 (appartements)            | `encadrement/Tableaux_loyers_reference_Bordeaux_Arrete_2026-07-06.xlsx` | `https://www.gironde.gouv.fr/contenu/telechargement/87475/658160/file/Tableaux_loyers_reference_Bordeaux_Arrete_2026-07-06.xlsx`                                                                                                                                                                                                                                                    | Préfecture de la Gironde ; document administratif public, conditions de réutilisation non indiquées dans le fichier (à vérifier sur gironde.gouv.fr) | classeur du 7 juillet 2026 ; 128 loyers (4 zones × 4 tranches de pièces × 4 époques × vide ou meublé)                                                                 |
| Référentiel national des loyers de référence (contrôle croisé, dates d'application) | `encadrement/loyers-reference.csv`                                      | `https://loyerconforme.com/open-data/encadrement-des-loyers/loyers-reference.csv` (jeu data.gouv.fr « Encadrement des loyers : loyers de référence de toutes les villes encadrées depuis 2019 »)                                                                                                                                                                                    | Loyer Conforme (tiers, non officiel), ODbL 1.0                                                                                                       | ressource du 3 novembre 2026 ; pour Bordeaux 2026 : application du 15 juillet au 24 novembre 2026                                                                     |
| Arrêts physiques TBM                                                                | `tbm/sv_arret_p.geojson`                                                | `https://datahub.bordeaux-metropole.fr/api/explore/v2.1/catalog/datasets/sv_arret_p/exports/geojson`                                                                                                                                                                                                                                                                                | Bordeaux Métropole (SAEIV), Licence Ouverte                                                                                                          | jeu modifié le 3 novembre 2026 ; 5 238 arrêts dont 1 106 actifs                                                                                                       |
| Lignes commerciales TBM                                                             | `tbm/sv_ligne_a.json`                                                   | `https://datahub.bordeaux-metropole.fr/api/explore/v2.1/catalog/datasets/sv_ligne_a/exports/json`                                                                                                                                                                                                                                                                                   | Bordeaux Métropole, Licence Ouverte                                                                                                                  | 151 lignes dont 68 actives (tram A à F)                                                                                                                               |
| Chemins de ligne TBM, avec tracé                                                    | `tbm/sv_chem_l.geojson`                                                 | `https://datahub.bordeaux-metropole.fr/api/explore/v2.1/catalog/datasets/sv_chem_l/exports/geojson` (téléchargé pour ce lot ; 26,5 Mo)                                                                                                                                                                                                                                              | Bordeaux Métropole, Licence Ouverte                                                                                                                  | 1 910 chemins ; `sv_chem_l.json` (sans tracé, déposé avant) n'a pas la même empreinte qu'un export JSON du jour : origine exacte non vérifiée, il ne sert qu'en repli |
| DVF géolocalisées, Gironde 2024                                                     | `dvf/33-2024.csv.gz`                                                    | `https://files.data.gouv.fr/geo-dvf/latest/csv/2024/departements/33.csv.gz`                                                                                                                                                                                                                                                                                                         | DGFiP, mise en forme et géolocalisation Etalab, Licence Ouverte 2.0                                                                                  | 82 927 lignes ; les 28 communes de Bordeaux Métropole y figurent sous leurs noms officiels                                                                            |
| DPE logements existants (depuis juillet 2021)                                       | aucun (appel à la demande)                                              | API data-fair `https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines` (identifiant du jeu et noms de champs relevés sur le schéma du jeu)                                                                                                                                                                                                                             | ADEME, Licence Ouverte 2.0                                                                                                                           | 15 893 454 DPE, données mises à jour le 28 octobre 2026                                                                                                               |
| Géocodage                                                                           | aucun                                                                   | `https://data.geopf.fr/geocodage/search/` (lot 2 ; lot 10 : recherche d'adresse des cartes, toujours par l'API)                                                                                                                                                                                                                                                                     | IGN Géoplateforme, Licence Ouverte                                                                                                                   |                                                                                                                                                                       |
| Isochrones                                                                          | aucun                                                                   | `https://data.geopf.fr/navigation/isochrone` ; capacités relues sur `https://data.geopf.fr/navigation/getcapabilities`                                                                                                                                                                                                                                                              | IGN Géoplateforme (ressource `bdtopo-valhalla`), Licence Ouverte                                                                                     | profils disponibles : `car`, `pedestrian` ; pas de vélo ni de transports en commun                                                                                    |
| Risques à l'adresse (lot 5)                                                         | aucun (appel à la demande)                                              | `https://www.georisques.gouv.fr/api/v1/resultats_rapport_risque?latlon=lon,lat` (spécification OpenAPI « Services API Géorisques V1 » 1.12.2, `https://www.georisques.gouv.fr/doc-api`)                                                                                                                                                                                             | BRGM et ministère de la Transition écologique ; « sauf mention contraire, tous les contenus de ce site sont sous licence etalab-2.0 » (pied de page) | consulté le 3 novembre 2026 ; v1 sans jeton, un appel par seconde au plus sur cet endpoint ; la v2 exige un jeton                                                     |

Le contrôle croisé de l'import de l'encadrement a trouvé les 128 valeurs du classeur de la
préfecture identiques à celles du référentiel national. Le classeur ne porte pas les dates
d'application : elles viennent du référentiel (15 juillet 2026 → 24 novembre 2026, fin de
l'expérimentation prévue par la loi 3DS). Au 3 novembre 2026, une prolongation de deux ans est
votée par le Sénat (21 octobre 2026) mais pas définitivement adoptée : l'Assemblée nationale doit
encore l'adopter conforme ([Public Sénat](https://www.publicsenat.fr/emission/100-senat/le-senat-prolonge-de-deux-ans-lexperimentation-de-lencadrement-des-loyers-e18),
[Banque des territoires](https://www.banquedesterritoires.fr/encadrement-des-loyers-le-senat-prolonge-lexperimentation-de-deux-ans-lassemblee-sous-pression),
consultés le 3 novembre 2026). À partir du 25 novembre 2026, sans nouvel arrêté importé, le
plafond passe « à vérifier » et un plafond posé d'office ne plafonne plus le loyer retenu.

### Géorisques (lot 5, besoin D6)

Client sans état `apps/api/src/opendata/georisques.ts`, service avec cache
`georisques.service.ts` (sorte `georisques`, clé = point arrondi au mètre, trente jours). Un seul
appel par annonce : le rapport « risques près de chez moi » au point de l'annonce, qui agrège les
aléas naturels (inondation, remontée de nappe, risques côtiers, séisme, mouvements de terrain,
recul du trait de côte, retrait-gonflement des argiles, avalanche, feu de forêt, volcan, vent
violent, radon) et technologiques (installations classées, nucléaire, canalisations de matières
dangereuses, pollution des sols, rupture de barrage, risques miniers), chacun avec `present`
(recensé dans la commune) et deux libellés, dans la commune et à l'adresse (« Risque Existant »,
« Risque Existant - faible | modéré | important », « Risque non Connu », « Risque Inconnu »,
« Risque Concerne », « Risque non Concerne »). Format vérifié le 3 novembre 2026 sur deux points
(Bordeaux, place Rohan ; Talence, allée Peixotto) : par exemple retrait-gonflement des argiles
« important » dans la commune et « modéré » à l'adresse dans les deux cas, radon « modéré » à
Bordeaux et « faible » à Talence, inondation recensée à Bordeaux et pas à Talence. Les endpoints
détaillés (GASPAR, `rga`, `radon`, `zonage_sismique`, `tri_zonage`) existent aussi en v1 ; le
rapport agrégé suffit à la checklist.

Règle d'évaluation (`georisqueLevel`, domain) : un aléa non recensé, « non concerné » ou
« faible » à l'adresse est conforme ; « non connu » ou « inconnu » à l'adresse, ou recensé dans la
commune sans libellé à l'adresse, est « à vérifier » ; tout autre risque existant ou concerné à
l'adresse est un point d'attention. Le rapport complet est lié depuis la fiche (URL rendue par
l'API, gardée seulement si elle est en `https`). Sans point : « sans objet » ; service en panne ou
réponse illisible : « indisponible », jamais mis en cache, jamais de risque inventé. `GEORISQUES_URL`
change l'adresse ; le harnais e2e remplace `fetch` (aucun appel réseau dans les tests).

### Fonds de carte (lot 10, besoin G8)

Vérifiés le 4 novembre 2026 sur les capacités et métadonnées des services (GetCapabilities WMTS,
`metadata.json` TMS, fiches CSW de la Géoplateforme) et sur l'aide de cartes.gouv.fr
(« Diffusion », « Limites d'usage »). Aucun n'exige de clé. Tuiles, styles, polices et sprites
sont chargés par le navigateur, jamais par l'API ; une requête de tuile ne porte que la position
et le niveau de zoom, aucune donnée de l'application. Code : `apps/web/src/lib/base-maps.ts`,
ADR [0020](decisions/0020-fonds-de-carte.md).

| Fond              | URL                                                                                                                                                                                                                                                                                                                                                                                                                      | Producteur, licence                                                                                                                                       | Attribution affichée                                                                    | Relevé                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan OSM (défaut) | style `https://tiles.openfreemap.org/styles/liberty`, TileJSON `https://tiles.openfreemap.org/planet` ; `VITE_MAP_STYLE_URL` remplace ce fond-là                                                                                                                                                                                                                                                                         | OpenFreeMap et OpenMapTiles ; données © contributeurs OpenStreetMap (ODbL)                                                                                | « OpenFreeMap © OpenMapTiles Data from OpenStreetMap », portée par le TileJSON          | tuiles vectorielles jusqu'au niveau 14 (surzoomées au-delà) ; bâtiments à partir du niveau 13                                                                                                                                                                          |
| Plan IGN          | style `https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json` ; tuiles TMS `https://data.geopf.fr/tms/1.0.0/PLAN.IGN/{z}/{x}/{y}.pbf` (métadonnées `https://data.geopf.fr/tms/1.0.0/PLAN.IGN/metadata.json`)                                                                                                                                                                                | IGN, « Licence Ouverte / Open License » (Etalab 2.0, `https://www.etalab.gouv.fr/wp-content/uploads/2018/11/open-licence.pdf`), fiche CSW `IGNF_PLAN-IGN` | « © IGN – Plan IGN », posée par l'application (ni le style ni le TileJSON n'en portent) | niveaux 0 à 18 ; noms de rues abrégés à partir du niveau 15, complets à partir de 17 ; bâtiments vers 14 ; « mis à jour en continu » (fiche CSW)                                                                                                                       |
| Photo aérienne    | WMTS `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM_0_19&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg` (capacités `https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities`), sous le style `https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/toponymes.json` (voies et noms) | IGN (BD ORTHO®), « Licence Ouverte / Open License » (Etalab 2.0), fiche CSW `IGNF_BD-ORTHO` ; voies et noms : Plan IGN, même licence                      | « © IGN – Photographies aériennes » et « © IGN – Plan IGN »                             | couche « Photographies aériennes », grille `PM_0_19` (niveaux 0 à 19), JPEG, CORS ouvert ; dates de prise de vue par département : `https://data.geopf.fr/annexes/ressources/fiches/photographies-aeriennes-RVB/geoportail_dates_des_prises_de_vues_aeriennes-RVB.pdf` |

Conditions : CGU de la Géoplateforme (`https://cartes.gouv.fr/cgu`, citées par les capacités
WMTS) ; la licence est celle de la fiche de chaque donnée, ici la Licence Ouverte, qui demande de
citer la source et la date de dernière mise à jour (attribution « © IGN », lien vers
cartes.gouv.fr ; dates dans le document ci-dessus). Selon l'aide « Limites d'usage » de
cartes.gouv.fr, la limite de débit par IP vise la plupart des API sauf la diffusion WMTS et son
pendant TMS ; le géocodage est limité à 50 requêtes par seconde et par IP.

La carte du critère recentre aussi sur une adresse : `GET /opendata/geocode?q=` (lot 10) passe
par le même géocodeur que les annonces (`GeocodingService`, cache `reference_data` de sorte
`geocode`) et rend `found` (point, libellé, précision, commune), `not_found` ou `unavailable` ;
rien n'est enregistré sur une annonce ni sur un critère, rien n'est écrit au journal.

### Équipements et quartiers (lot 11, besoins D8 à D11)

Consultés, téléchargés et vérifiés le 5 novembre 2026 (métadonnées des jeux lues par leur API,
fiche CSW de l'IGN, wiki OpenStreetMap, Wikidata). Fichiers locaux dans `data/opendata/` (ignoré
par git). Code : `scripts/lib/sports.ts`, `supermarkets.ts`, `neighbourhoods.ts`, `osm.ts`
(lecture des sources), `packages/domain/src/surroundings.ts` (règles),
`apps/api/src/geo/geo.service.ts` (tables `amenities` et `neighbourhoods`),
`apps/api/src/opendata/surroundings.service.ts` (lecture pour une annonce). ADR
[0021](decisions/0021-equipements-et-quartiers.md).

| Donnée                                         | Fichier local                            | Source (URL)                                                                                                                                                                                                                                                                                                            | Producteur, licence                                                                                              | Relevé le 5 novembre 2026                                                                                                                                                                               |
| ---------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Équipements d'athlétisme (Data ES)             | `res/bm-athletisme.json` (ou `.geojson`) | `https://equipements.sports.gouv.fr/api/explore/v2.1/catalog/datasets/data-es/exports/json?where=epci_code='243300316' and equip_type_famille="Equipement d'athlétisme"` (jeu `data-es`, fiche data.gouv.fr « Recensement des équipements sportifs, espaces et sites de pratiques »)                                    | Ministère des Sports, « LICENCE OUVERTE 2.0 » (métadonnées du jeu)                                               | jeu modifié le 4 novembre 2026 (mise à jour quotidienne) ; 334 287 fiches en France, 116 équipements d'athlétisme dans la métropole (24 communes)                                                       |
| Pistes d'athlétisme OpenStreetMap (complément) | `osm/athletics-tracks.json`              | Overpass `https://overpass-api.de/api/interpreter`, requête `OSM_TRACKS_QUERY` (`scripts/lib/sports.ts`) : `nwr["leisure"="track"]["sport"~"athletics"]` dans les 28 communes                                                                                                                                           | © contributeurs OpenStreetMap, ODbL                                                                              | base OSM du 5 novembre 2026 00:29 UTC ; 57 pistes `leisure=track` + `sport=athletics`                                                                                                                   |
| Supermarchés avec drive                        | `osm/supermarkets.json`                  | Overpass, requête `SUPERMARKETS_QUERY` (`pnpm import:supermarkets -- --print-query`) : `shop` ∈ supermarket, convenience, outpost, department_store, et voies `highway=service` + `service=drive-through` nommées                                                                                                       | © contributeurs OpenStreetMap, ODbL                                                                              | base OSM du 5 novembre 2026 00:30 UTC ; 457 commerces alimentaires lus                                                                                                                                  |
| Salles Fitness Park                            | `osm/fitness-park.json`                  | Overpass, requête `OSM_FITNESS_QUERY` : `leisure` fitness_centre ou sports_centre nommés « Fitness Park », `brand` « Fitness Park », `brand:wikidata=Q102351191`                                                                                                                                                        | © contributeurs OpenStreetMap, ODbL ; marque Q102351191 (« Fitness Park, chaîne de clubs de fitness », Wikidata) | 6 clubs ; le recensement des équipements sportifs n'en compte aucun en Gironde                                                                                                                          |
| Quartiers des communes                         | `quartiers/se_quart_s.geojson`           | `https://datahub.bordeaux-metropole.fr/api/explore/v2.1/catalog/datasets/se_quart_s/exports/geojson` (« Quartier des communes »)                                                                                                                                                                                        | Bordeaux Métropole, Licence Ouverte (métadonnées du jeu)                                                         | modifié le 4 novembre 2026 ; 75 quartiers, huit communes (Bordeaux 8, Bègles 10, Cenon 3, Martignas-sur-Jalle 5, Mérignac 10, Pessac 17, Le Taillan-Médoc 6, Talence 16) ; « en cours de construction » |
| Secteurs de vie de Bordeaux                    | `quartiers/se_quartvie_s.geojson`        | `https://datahub.bordeaux-metropole.fr/api/explore/v2.1/catalog/datasets/se_quartvie_s/exports/geojson` (« Secteurs de vie de la ville de Bordeaux »)                                                                                                                                                                   | Ville de Bordeaux, Licence Ouverte (métadonnées du jeu)                                                          | modifié le 4 novembre 2026 ; 30 secteurs (recréés en septembre 2026), chacun rattaché à l'un des huit quartiers                                                                                         |
| Contours IRIS                                  | `iris/bm-contours_iris-2026.geojson`     | WFS de la Géoplateforme, couche `STATISTICALUNITS.IRIS:contours_iris` : `https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=STATISTICALUNITS.IRIS:contours_iris&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&COUNT=1000&CQL_FILTER=code_insee IN ('33003',…)` (les 28 codes INSEE) | IGN et INSEE, « Licence Ouverte / Open License » (fiche CSW `IGNF_CONTOURS-IRIS`)                                | édition 2026 ; 277 IRIS dans la métropole (dont 5 « commune entière », type Z) ; identiques (codes, noms, types) au jeu `se_iri24_s` du datahub, géographie 2024                                        |

Le jeu `fv_commu_s` (limites des communes, datahub) a servi au contrôle de couverture, il n'est
pas importé.

**Règles** (ADR 0021) :

- **Pistes** : types 1001 « Stade d’athlétisme », 1004 « Piste d'athlétisme isolée », 1005
  « Piste d'athlétisme 2 à 4 couloirs » (codes `equip_type_code`) ; les aires de saut (1003) et
  de lancer (1002) ne sont pas des pistes. Champs repris : `equip_numero` (identifiant),
  `inst_nom` (nom), `equip_type_name` (nature), `equip_nature` (« Découvert », « Intérieur » :
  couverte ou non), `equip_piste_long` (longueur de l'anneau, stades) sinon `equip_long`,
  `equip_piste_nb` (couloirs, vide dans la métropole), `equip_sol`, `equip_acc_libre` (« accès
  libre ») et `equip_utilisateur_filter` (publics : 84 équipements sur 116 réservés aux
  scolaires), `inst_adresse`, `inst_cp`, `new_name`, `new_code`, `equip_coordonnees`.
  `equip_maj_date` n'est gardée qu'à partir du 1er avril 2025 (112 fiches sur 116 portent le
  31 mars 2025, date que la fiche du jeu demande d'ignorer). Complément OpenStreetMap : une piste
  est déjà décrite si `ref:FR:sport_equip` reprend le numéro d'un équipement d'athlétisme du
  recensement (20 cas) ou si une piste du recensement est à moins de 200 m (30 cas) ; les autres
  (7) sont importées, avec `lanes`, `length`, `surface`, `covered`/`indoor`, `access`.
- **Drive** (`driveSignalOfTags`) : signalé si `drive_through=only` ou « drive » dans `name`,
  `brand`, `official_name`, `short_name` ; à vérifier si `drive_through=yes`,
  `click_and_collect=yes|only`, `branch` « Drive » sans « drive » dans le nom, `shop=outpost` sans
  autre signal, ou un supermarché (pas une supérette) à moins de 400 m d'une voie
  `service=drive-through` dont le nom porte « drive » et son enseigne (pas un « McDrive ») ; sinon
  pas importé. Sur les données du 5 novembre 2026, aucun objet n'a `click_and_collect`,
  `service:drive` ou `drive`. Le wiki dit `shop=outpost` « principalement utilisé pour retirer des
  articles commandés en ligne (appelé Drive ou Click & Collect en France) »
  ([FR:Tag:shop=outpost](https://wiki.openstreetmap.org/wiki/FR:Tag:shop%3Doutpost)) et
  `drive_through` « service au volant… également nommé en français drive »
  ([FR:Key:drive_through](https://wiki.openstreetmap.org/wiki/FR:Key:drive_through)), l'anglais le
  réservant au service sans quitter son véhicule : d'où « à vérifier » pour `yes`. La Name
  Suggestion Index (version 8.0.20261101) recommande `drive_through=only` pour « Auchan Drive »,
  « E.Leclerc Drive » (`shop=outpost`) et « Intermarché Drive ». Groupe d'enseigne
  (`supermarketBrandGroup`) : « carrefour », « auchan » ou « intermarche » dans l'enseigne, sinon
  le nom (Market, City, Contact, Express, Hyper, Super, Drive… compris) ; les autres enseignes
  restent affichées, en cercle creux.
- **Fitness Park** (`isFitnessPark`) : `brand:wikidata=Q102351191`, sinon « Fitness Park » dans
  `brand`, `name` ou `operator` ; un autre identifiant Wikidata écarte l'objet. Les six clubs
  trouvés ont tous `operator=Fitness Park` et une adresse électronique `@fitnesspark.fr` ; la
  page publique des clubs de Gironde (fitnesspark.fr, consultée sans automatisation) en liste
  cinq, la page du club du Bouscat existe aussi. Les noms sont repris tels quels (« Bordeaux -
  Chartons », sic).
- **Quartiers** : secteurs de vie à Bordeaux (nom `libelle`, parent `nom`), quartiers de
  `se_quart_s` dans les sept autres communes qui en ont (fiches `valide=False` écartées ; toutes
  valides le 5 novembre 2026), IRIS ailleurs (« IRIS <nom_iris> »), commune entière pour un IRIS
  de type Z (Ambès, Bouliac, Saint-Aubin-de-Médoc, Saint-Louis-de-Montferrand,
  Saint-Vincent-de-Paul). Couverture des quartiers officiels mesurée dans PostGIS contre
  `fv_commu_s` : 100 % à Bègles, Cenon, Le Taillan-Médoc, 99,9 % à Bordeaux, Mérignac, Pessac,
  95,4 % à Talence et 67,4 % à Martignas-sur-Jalle ; les IRIS de ces communes sont donc importés
  aussi, pour le quartier d'un point hors des quartiers officiels, et la carte n'en dessine que la
  part hors des quartiers qui garde 1 ha une fois rognée de 25 m (IRIS Nord de
  Martignas-sur-Jalle, 8,6 km² ; IRIS Médoquine-Haut-Brion de Talence, 0,38 km²).
- **Annonce** : quartier qui contient le point (quartier, puis IRIS, puis commune), « à vérifier »
  pour une localisation au centre de la commune ou au quartier du géocodeur, deux contours de même
  nature, ou une adresse à la rue à moins de 30 m d'un autre contour de même nature ; piste et
  Fitness Park les plus proches, drive le plus proche de chaque enseigne préférée et toutes
  enseignes (signalé d'abord), à vol d'oiseau, 20 km au plus.

### Placement des annonces (lot 12)

Vérifié le 5 novembre 2026. Code : `packages/domain/src/placement.ts` (lecture du champ
« quartier », reconnaissance, choix, textes), `apps/api/src/opendata/placement.service.ts`
(orchestration), `apps/api/src/geo/geo.service.ts` (contours d'une commune, surfaces, points
intérieurs, recouvrements, table `places`, zone de l'annonce), `scripts/lib/places.ts` et
`scripts/lib/relocate-listings.ts`. ADR [0022](decisions/0022-placement-des-annonces.md).

| Donnée                   | Fichier local               | Source (URL)                                                                                                                                                                                          | Licence                             | Version et volume                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lieux-dits OpenStreetMap | `osm/quartiers-places.json` | Overpass `https://overpass-api.de/api/interpreter`, requête `PLACES_QUERY` (`pnpm import:places -- --print-query`) : `nwr["place"~"^(neighbourhood\|quarter\|suburb)$"]["name"]` dans les 28 communes | © contributeurs OpenStreetMap, ODbL | base OSM du 5 novembre 2026 00:36:55 UTC (`osm3s.timestamp_osm_base`) ; 266 objets lus, 230 lieux-dits retenus (92 `suburb`, 52 `quarter`, 86 `neighbourhood`), tous rattachés à une commune ; le fichier présent vient d'une requête plus large (35 limites administratives de niveau 10 sans `place`, 1 objet sans nom), écartées par l'import |
| Contours des quartiers   | (lot 11)                    | les contours importés par `import:neighbourhoods` (secteurs de vie, quartiers officiels, IRIS)                                                                                                        | (lot 11)                            | 374 contours ; candidats du placement : ceux de la commune de l'annonce                                                                                                                                                                                                                                                                          |

**Règles** (ADR 0022) :

- **Hiérarchie** : adresse au numéro (`exact`) ou à la rue (`street`) par le géocodeur ; sinon le
  quartier reconnu dans le champ « quartier » parmi les contours de la commune de l'annonce
  (code INSEE de l'annonce, du géocodeur ou de la liste des 28 communes), repère au point
  intérieur du contour (`ST_PointOnSurface`), précision `district` ; sinon un lieu-dit de la
  commune (repère sur le lieu-dit, sans contour) ; sinon le centre de la commune (géocodeur).
- **Lecture** : parenthèses, mentions de transport et de distance, résidences et nom de la
  commune seul écartés ; « près de », « face au », « proche », « à côté de » repérés ; découpe aux
  virgules, barres, points-virgules, tirets espacés et « et ».
- **Noms reconnus** : secteur de vie et quartier officiel (nom entier et chacun de ses éléments),
  quartier qui regroupe des secteurs (union de ses secteurs), nom d'IRIS (IRIS numérotés d'un
  même nom réunis) ; identique, contenu dans le morceau ou contenant le morceau, ce dernier
  avec un mot distinctif d'au moins quatre lettres (mots courants et nom de la commune exclus).
- **Choix** : confirmé par un autre morceau d'abord, puis le plus fin, le rapprochement le plus
  net, la plus petite surface ; « à vérifier » pour un « près de », deux zones distinctes
  (moins de 5 % de la plus petite en commun) ou un nom ambigu. Rien de reconnu : la commune.
- **Ce qui prime** : un point saisi ; un repère à l'adresse ne bouge jamais quand seul le
  quartier change ; le rattrapage ne redescend jamais une précision.
- **Calculs** : tous partent du repère ; au quartier ou à la commune, les distances (tram,
  équipements) se lisent « ≈ », le quartier est indicatif, les comparables DVF indicatifs (« à
  vérifier » au centre de la commune), la zone d'encadrement « probable » si tout le contour
  tient dans une zone (au moins 1 000 m² en commun pour compter une zone, 5 000 m² hors zonage
  pour en sortir), « à vérifier » s'il en chevauche plusieurs ; un critère à périmètre n'est
  « sous réserve » que si le contour n'est pas entier dans le périmètre (ou pour la distance au
  tram).

## Imports

Chaque script a `--help`, `--dry-run` (lit, filtre et contrôle sans rien écrire) et
`--database-url` (défaut : `DATABASE_URL` de `apps/api/.env`). Ils écrivent par le module `geo`
de l'API (seul endroit du SQL géographique) et sont idempotents.

```bash
pnpm import:rent-control                 # zonage GML + arrêté .xlsx (le plus récent) + contrôle croisé CSV
pnpm import:rent-control -- --decree data/opendata/encadrement/Tableaux_..._Arrete_2027-07-xx.xlsx \
     --valid-from 2027-07-15 --valid-until 2028-07-14 --no-check
pnpm import:transit-stops                # arrêts actifs, lignes par terminus et tracé des chemins
pnpm import:dvf -- --year 2024 --year 2023          # fichiers locaux data/opendata/dvf/33-<année>.csv.gz
pnpm import:dvf -- --year 2025 --download           # lu en flux depuis files.data.gouv.fr
pnpm import:dvf -- --url https://.../33.csv.gz --file autre.csv
pnpm geocode:missing -- --dry-run        # annonces sans point, ou au centroïde avec une adresse
# Lot 11, dans cet ordre (fichiers de data/opendata/, ou --download pour lire les sources en ligne)
pnpm import:neighbourhoods               # quartiers officiels, secteurs de vie, IRIS, communes entières
pnpm import:sports-facilities            # pistes (Data ES + complément OSM) et Fitness Park (OSM)
pnpm import:sports-facilities -- --only fitness --download
pnpm import:supermarkets                 # drives OSM ; --print-query affiche la requête Overpass
pnpm refresh:surroundings -- --dry-run   # rattrapage du quartier et des équipements des annonces
# Lot 12, après les quartiers
pnpm import:places                       # lieux-dits OpenStreetMap ; --download, --print-query
pnpm relocate:listings -- --dry-run      # repère des annonces à la commune, au quartier ou sans repère
```

| Import                     | Ce qui est écrit                                                                                                                                                                                                                                                                                                                                             | Volume et durée en local (3 novembre 2026, base Supabase 54322)                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `import:rent-control`      | `rent_control_zones` (MultiPolygon, index GiST), remplacement complet du territoire `bordeaux` ; `reference_data` sorte `rent_reference`, clé `bordeaux:<date d'application>` (la table de l'arrêté, sa source, son empreinte, le résultat du contrôle croisé), le tout dans une transaction. Refus si un libellé, une valeur ou une zone ne correspond pas. | 88 secteurs, 1 arrêté (128 loyers) ; 0,4 s d'écriture, 2,0 s au total                                                                                                                                                                                                                                                                                                                                  |
| `import:transit-stops`     | `transit_stops` (upsert par réseau et identifiant, arrêts disparus supprimés sauf `--no-prune`) : arrêts actifs de la métropole hors arrêts fictifs, mode tram ou bus, lignes                                                                                                                                                                                | 1 106 arrêts (279 tram, 827 bus), 1 102 avec au moins une ligne, tous les arrêts de tram en ont une ; 1,0 s d'écriture, 1,8 s au total                                                                                                                                                                                                                                                                 |
| `import:dvf`               | `dvf_sales` (les années du fichier sont remplacées en entier dans une transaction, lots de 500) : mutations d'un seul appartement sans autre local (dépendances comprises dans le prix), ventes et VEFA, géolocalisées, surface ≥ 9 m², 500 à 20 000 €/m²                                                                                                    | 2024 : 82 927 lignes lues, 13 765 mutations de la métropole, 5 837 ventes retenues (27 communes) ; écartées : 7 541 sans appartement, 261 à plusieurs appartements, 55 avec une maison ou un local, 34 non géolocalisées, 22 implausibles, 13 d'autres natures, 2 sans valeur foncière ; 0,3 s de lecture, 0,5 s d'écriture, 1,6 s au total                                                            |
| `geocode:missing`          | point, adresse normalisée, BAN, INSEE en provenance `open_data`, journal `listing.geocoded` (canal `system`)                                                                                                                                                                                                                                                 | lancé en `--dry-run --no-geocode` sur les 29 annonces réelles : aucune à corriger                                                                                                                                                                                                                                                                                                                      |
| `import:neighbourhoods`    | `neighbourhoods` (MultiPolygon, GiST) : tout le territoire `bordeaux_metropole` remplacé dans une transaction, qui calcule aussi la part dessinée (`map_geom`) ; provenance par contour                                                                                                                                                                      | 5 novembre 2026, base jetable sur le serveur de test : 374 contours (30 secteurs de vie, 67 quartiers officiels, 272 IRIS, 5 communes entières), 202 dessinés sur la carte (97 quartiers, 98 IRIS, 2 parts d'IRIS hors quartiers, 5 communes) ; 0,5 à 0,8 s ; couche entière simplifiée à 5 m : 0,22 Mo de géométrie                                                                                   |
| `import:sports-facilities` | `amenities` genre `athletics_track` (sources `res` et `osm`) et `fitness_park` (`osm`), chaque source remplacée dans une transaction                                                                                                                                                                                                                         | 77 pistes du recensement (26 stades, 50 pistes isolées, 1 piste 2 à 4 couloirs ; 39 aires écartées), 7 pistes OpenStreetMap en complément, 6 Fitness Park ; 0,14 s                                                                                                                                                                                                                                     |
| `import:supermarkets`      | `amenities` genre `supermarket_drive` (source `osm`), remplacée dans une transaction                                                                                                                                                                                                                                                                         | 25 drives sur 457 commerces alimentaires : 21 signalés (11 points E.Leclerc Drive, 4 Auchan Drive, 3 Chronodrive, 1 Carrefour Drive, 1 Intermarché Drive, 1 épicerie « Le Drive tout nu »), 4 à vérifier (deux Carrefour près d'une voie « Carrefour Drive », un Intermarché `drive_through=yes`, un Super U `branch=Drive`) ; par enseigne : Carrefour 3, Auchan 4, Intermarché 2, autres 16 ; 0,15 s |
| `refresh:surroundings`     | la clé `surroundings` de `open_data_context` des annonces dont le résultat change, journal `listing.enriched` (canal `system`)                                                                                                                                                                                                                               | idempotent : une seconde passe ne réécrit rien (vérifié en test e2e)                                                                                                                                                                                                                                                                                                                                   |
| `import:places`            | `places` (point, GiST) : la source `osm` remplacée dans une transaction, chaque lieu-dit rattaché à la commune dont un contour importé le contient                                                                                                                                                                                                           | 5 novembre 2026, base jetable : 230 lieux-dits écrits, aucun hors des contours ; 0,2 s                                                                                                                                                                                                                                                                                                                 |
| `relocate:listings`        | `location_placement`, point, précision et `location_area` des annonces au centre de la commune, au quartier ou sans repère (jamais à l'adresse ni saisies), instantané de contexte recalculé, journal `listing.relocated` (canal `system`)                                                                                                                   | idempotent : une seconde passe ne change rien (vérifié en test e2e)                                                                                                                                                                                                                                                                                                                                    |

Relancer un import ne crée pas de doublon (vérifié le 3 novembre 2026 : mêmes comptes après une
seconde exécution des trois imports). La fiche du jeu décrit `id_mutation` comme
« non stable, sert à grouper les lignes » ([data.gouv.fr](https://www.data.gouv.fr/datasets/demandes-de-valeurs-foncieres-geolocalisees/informations),
consultée le 3 novembre 2026) : une année DVF se remplace donc en entier, sans s'appuyer sur lui.
Les commandes acceptent les options avec ou sans le séparateur `--` de pnpm.

## Fréquence de rafraîchissement

| Donnée                                       | Rythme de la source                                                  | À faire                                                                                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arrêté de l'encadrement                      | annuel (juin ou juillet, application au 15 juillet)                  | télécharger le nouveau classeur, mettre à jour le référentiel CSV ou passer `--valid-from`, relancer `import:rent-control` ; surveiller la prolongation au-delà du 24 novembre 2026                |
| Zonage                                       | rare (inchangé de 2022 à 2026)                                       | relancer l'import si la DDTM publie un nouveau zonage                                                                                                                                              |
| Arrêts TBM                                   | quotidien (jeu modifié chaque nuit)                                  | trimestriel suffit, ou à chaque changement de réseau (nouvelle ligne de tram)                                                                                                                      |
| DVF                                          | semestriel (avril et octobre), décalage de six mois à un an          | importer chaque nouvelle année ; la fenêtre des comparables (trois ans) avance d'elle-même                                                                                                         |
| DPE ADEME                                    | hebdomadaire                                                         | rien : appel à la demande, cache de sept jours                                                                                                                                                     |
| Isochrones                                   | graphe routier mis à jour régulièrement                              | rien : une isochrone est figée à l'enregistrement ; la recalculer en renvoyant ses paramètres (`update_search_criteria`)                                                                           |
| Géorisques                                   | au fil des procédures (PPR, arrêtés)                                 | rien : appel à la demande, cache de trente jours                                                                                                                                                   |
| Règles réglementaires                        | lois et décrets (calendrier DPE, encadrement, diagnostics)           | mettre à jour `DEFAULT_REGULATORY_RULES` (version, date, sources) ou déposer une table en `reference_data` (sorte `regulatory_rules`, clé `current`) ; surveiller la prolongation de l'encadrement |
| Équipements sportifs (Data ES)               | quotidien                                                            | trimestriel suffit : `import:sports-facilities --download`, puis `refresh:surroundings`                                                                                                            |
| OpenStreetMap (drives, Fitness Park, pistes) | en continu                                                           | trimestriel, ou après une correction faite dans OpenStreetMap (un drive manquant) : imports `--download`, puis `refresh:surroundings`                                                              |
| Quartiers et IRIS                            | rare (secteurs de vie recréés en septembre 2026 ; IRIS chaque année) | relancer `import:neighbourhoods --download` à chaque nouveau découpage ou nouvelle édition IRIS (`--iris-edition`), puis `refresh:surroundings`                                                    |
| Lieux-dits OpenStreetMap (lot 12)            | en continu                                                           | trimestriel, avec les autres imports OpenStreetMap : `import:places --download`, puis `relocate:listings` (et après un nouvel `import:neighbourhoods`)                                             |

Après un import, les annonces gardent leur instantané (`open_data_context`) jusqu'à la prochaine
modification ; `POST /listings/:id/geocode` (bouton « Relancer le géocodage » de la fiche) le
recalcule. Le bloc « Contexte » de la fiche, `GET /listings/:id/context` et `get_market_context`
sont toujours calculés à la lecture.

## Règles appliquées

- **Plafond d'encadrement** (`lookupRentReference`, domain) : commune de Bordeaux (code INSEE
  33063, ou phase 2 « encadrement : oui ») ; adresse au numéro (une adresse « à la rue » donne la
  zone probable et une valeur indicative, « à vérifier » : le point BAN d'une rue est son milieu)
  ; point contenu dans un secteur et zone unique dans un rayon de 10 m (sinon « en limite de
  zone ») ; pièces 1, 2, 3, « 4 et plus » ; époque d'après l'année, sinon le texte de l'époque
  (« avant 1946 », « 1971-1990 », « années 60 » ; une décennie à cheval sur deux tranches,
  « années 70 », est ambiguë ; une année de travaux, « rénové en 2015 », est ignorée) ; vide ou
  meublé d'après la phase 2 (colocation : à préciser ; pas de phase 2 : vide supposé) ; arrêté en
  vigueur à la date du jour. Le loyer de référence majoré est écrit dans la phase 2 existante
  (jamais créée d'office) avec la provenance `open_data` (clé `rentalPlan.referenceRentPerM2`)
  tant que le membre n'en a pas saisi un autre ; il alimente `rentCap` et le contrôle
  d'encadrement de `rentalChecks`. Il ne compte plus après la fin d'application de son arrêté
  (`referenceRentInForce`, date de fin gardée dans l'instantané), et il est retiré au prochain
  enrichissement s'il ne vaut plus. Une mise en location prévue après la fin de l'arrêté, ou
  l'année où il prend fin, est signalée.
- **DPE vérifié** : recherche par identifiant BAN (adresse au numéro), sinon par code INSEE et
  surface à ±1 m² (jamais appliquée d'office) ; ressemblance par la surface (2 %, 5 %, 10 %) et
  l'étage (inconnu d'un côté : ressemblance × 0,8, donc jamais appliqué d'office) ; appliqué
  d'office (classe, GES, consommation, date, numéro en `open_data`) seulement s'il n'y a qu'un
  candidat à au moins 0,85 sans rival à 0,6 et sans contradiction avec la classe déclarée ; sinon proposé au membre (`POST /listings/:id/dpe/verify`). Validité : un DPE
  d'avant le 1er juillet 2021 n'est plus valable depuis le 1er janvier 2025 (2023 s'il date d'avant
  2018), dix ans sinon ; audit énergétique signalé pour E, F, G hors copropriété (`dpeValidity`).
- **Comparables DVF** : ventes d'appartements (ni VEFA ni adjudication), trois dernières années,
  surface à ±25 %, 500 m élargis à 1 000 puis 2 000 m faute de cinq ventes ; médiane, quartiles et
  dispersion (`marketStats`) ; prix de marché = médiane × surface, provenance `estimated`, retenu
  par le critère « marché » du prix cible à partir de cinq ventes (inactif par défaut).
- **Arrêt le plus proche** : à vol d'oiseau, 2 km au plus, tram d'abord ; les lignes d'un arrêt
  sont celles des chemins **principaux** (champ `principal` du jeu) dont il est terminus ou dont
  le tracé passe à moins de 25 m (tram) ou 20 m (bus) ; un arrêt qu'aucun chemin principal ne
  dessert garde les lignes de ses autres chemins (services partiels). Les parcours techniques
  (dépôt) ne comptent donc plus ; une ligne qui longe un arrêt sans s'y arrêter peut encore être
  comptée : les lignes affichées sont indicatives (le GTFS de TBM serait la source exacte).

## Limites

- Les DVF ne couvrent que les ventes publiées (2024 en base ; 2025 à importer quand le fichier
  paraîtra) ; le prix comprend les dépendances vendues avec l'appartement (cave, parking). Le
  fichier est lu en flux, mais les mutations de la métropole (environ 32 000 lignes pour la
  Gironde 2024) sont regroupées en mémoire avant le filtre : sans conséquence à cette taille.
- Le zonage compte 88 secteurs IRIS de la commune (85 d'habitat, 3 d'activité : Bacalan 1, Le
  Lac 1, Saint-Bruno-Saint-Victor 2) : un point hors des secteurs rend « à vérifier ».
- L'arrêté couvre les appartements ; la feuille « Maisons » n'est pas importée.
- Une isochrone « à vélo » est approchée (ADR 0010) ; « en transport » n'existe pas à la
  Géoplateforme.
- Le cache des recherches DPE et des isochrones vit dans `reference_data` (sortes `ademe_dpe`,
  `isochrone`) ; le géocodage garde son cache du lot 2 (sorte `geocode`).
- `geocode:missing` écrit les points sans passer par l'API : la liste filtrée et les compteurs des
  critères en tiennent compte aussitôt (calculés à la lecture), le badge ◎ et l'alerte d'entrée
  attendent la prochaine écriture de l'annonce (ou « Relancer le géocodage » dans la fiche).
- Un plafond posé d'office (provenance `open_data`) est retiré à l'enrichissement suivant s'il ne
  vaut plus : adresse en limite de zone ou hors Bordeaux, phase 2 en colocation, arrêté expiré ;
  il ne reste jamais périmé sous une provenance « données ouvertes ».
- Géorisques : le rapport porte sur le point de l'annonce (une adresse à la rue ou au centroïde
  donne les aléas de ce point-là) ; le plan d'exposition au bruit de l'aérodrome de
  Bordeaux-Mérignac n'en fait pas partie (diagnostic bruit « à vérifier » à Mérignac) ; l'état des
  risques annexé au bail reste à établir à la date du bail.
- Lot 11, drives : OpenStreetMap ne signale qu'une partie des drives (aucune étiquette sur la
  plupart des hypermarchés, qui en ont pourtant souvent un) ; « aucun drive à moins de 20 km »
  veut dire « aucun drive signalé dans la donnée ». Un drive manquant se corrige dans
  OpenStreetMap puis par un nouvel import ; aucun site d'enseigne n'est lu.
- Lot 11, pistes : l'accès du recensement décrit des publics (souvent « Scolaires,
  universités ») plus qu'une ouverture au public ; une piste de lycée peut être fermée hors
  temps scolaire. Une piste OpenStreetMap ajoutée en complément n'a souvent ni nom ni commune.
- Lot 11, quartiers : les quartiers officiels de Bordeaux Métropole sont dits « en cours de
  construction » par le producteur ; leurs tracés diffèrent un peu des IRIS (liserés de quelques
  mètres le long des limites communales). Un point dans un tel liseré reçoit l'IRIS ; une
  adresse à la rue en limite est « à vérifier ».
- Lot 11, distances : à vol d'oiseau (PostGIS, sur la sphère), pas des temps de trajet ; un
  équipement de l'autre côté de la Garonne peut être proche à vol d'oiseau et loin par la route.
- Lot 11 : après un import, les annonces gardent leur instantané jusqu'au rattrapage
  (`refresh:surroundings`) ou à leur prochaine modification d'adresse ; le bloc Contexte de la
  fiche et `get_listing` recalculent à la lecture.
- Lot 12 : le quartier d'une annonce vient du texte de l'annonce, pas d'une adresse : un texte
  trompeur (« près de » un quartier voisin, nom d'usage absent des jeux ouverts) donne un repère
  au mauvais endroit ou au centre de la commune ; il se corrige en précisant l'adresse ou le
  quartier dans la fiche. Les noms d'IRIS de Bordeaux sont ceux de grands ensembles, plus larges
  qu'un secteur de vie.
- Lot 12 : une annonce dont le repère (centre du quartier) est hors d'un périmètre n'entre pas
  dans le critère, même si une partie de son quartier y est ; elle n'y entre « sous réserve »
  que si son repère y est et son quartier pas entièrement.
- Lot 12 : le géocodeur IGN en mode « lieu » (index `poi`) n'est pas utilisé : il mêle
  commerces, arrêts et lieux-dits, et ne se vérifie pas hors ligne.
