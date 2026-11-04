# 0020. Fonds de carte : plan OSM, plan IGN et photo aérienne, choix par appareil, couches recopiées au changement de style

Statut : acceptée, 4 novembre 2026.

## Contexte

Les trois cartes (annonces, périmètre d'un critère, quartier de la fiche) n'avaient qu'un fond :
le style « Liberty » d'OpenFreeMap. À l'échelle de la métropole il ne montre que les grands
axes ; rues fines et bâtiments n'apparaissent qu'en zoomant beaucoup, ce qui gêne surtout pour
dessiner un périmètre (« il faudrait que la carte montre les rues et bâtiments pour mieux
voir »). Le besoin G1 ne prévoyait que « fond OpenStreetMap ou IGN ». MapLibre 6 change de fond
par `map.setStyle()`, qui remplace sources et couches : les couches de contexte, le rayon, le
périmètre et le dessin terra-draw disparaîtraient.

## Décision

- **Trois fonds, sans clé** (`apps/web/src/lib/base-maps.ts`, URL vérifiées sur la
  Géoplateforme, docs/open-data.md) : « Plan OSM » (Liberty, toujours remplacé par
  `VITE_MAP_STYLE_URL`), « Plan IGN » (style vectoriel `PLAN.IGN/standard.json` : noms de rues,
  bâtiments) et « Photo aérienne » (WMTS `ORTHOIMAGERY.ORTHOPHOTOS`, grille `PM_0_19`, glissée
  sous le style `PLAN.IGN/toponymes.json` qui garde voies et noms de rues : un fond hybride).
  L'attribution « © IGN » est posée par l'application sur les sources IGN, qui n'en portent pas ;
  celle d'OpenFreeMap vient de son TileJSON. La CSP ne change pas (tout est en `https:`).
- **Un sélecteur sur chaque carte, un choix commun** : `BaseMapSwitcher` (groupe radio,
  `aria-checked`, flèches, Début, Fin, cibles de 44 px sur mobile), lié au store Pinia
  `baseMap`. Le choix est retenu dans `localStorage`, sous une clé suffixée de l'identifiant de
  la personne connectée (`apart-localizer-base-map:<uuid>`), lecture et écriture protégées : une
  préférence d'affichage par personne et par appareil (le téléphone peut préférer le plan, plus
  léger que la photo), comme le thème, pas une donnée de l'espace ; aucune préférence serveur
  n'existait pour l'affichage, et en créer une aurait demandé une migration pour peu.
- **Changer de fond sans rien redessiner** : `map.setStyle(url, { transformStyle })`. Le
  `transformStyle` de chaque fond adapte son style (attribution, photo dessous), puis recopie
  au-dessus les couches de l'application lues dans le style précédent, données comprises : les
  couches posées par `upsertGeoJsonLayer` portent `metadata: { "apart:overlay": true }`, celles
  de terra-draw le préfixe `apart-draw` (option `prefixId` de l'adaptateur). Sans état, il donne
  le même résultat si MapLibre l'appelle deux fois (diff impossible, reconstruction complète).
  En pratique MapLibre applique un diff : l'ancien style reste affiché jusqu'à l'arrivée du
  nouveau, et les sources recopiées, identiques, ne sont pas touchées. terra-draw n'est donc ni
  arrêté ni recréé : un polygone modifiable le reste et un tracé commencé se termine sur le
  nouveau fond (vérifié dans Chromium : tracé commencé sur la photo, fini sur le plan IGN). Les
  marqueurs, en DOM, ne bougent pas. Arrêter puis relancer terra-draw a été écarté : `stop()`
  vide son magasin et abandonne le tracé en cours.
- **Lisible sur la photo** : contours de périmètre doublés d'un liseré blanc
  (`perimeterLayers`), contour des zones d'encadrement à la couleur de la zone, points cerclés de
  blanc. Le fond reste clair en thème sombre (aucun style sombre équivalent côté IGN) ; seuls les
  contrôles ajoutés suivent les jetons.
- **Mieux voir pour dessiner** : la carte du critère s'ouvre cadrée sur le périmètre existant
  (`bounds`), sur le centre de Bordeaux au niveau 15 si l'on dessine, sur la métropole sinon ;
  entrer en dessin depuis une vue plus large que le niveau 13,5 recadre (périmètre, sinon
  Bordeaux) ; une isochrone nouvellement calculée est cadrée. Une recherche d'adresse recentre la
  carte : `GET /opendata/geocode?q=` (contrôleur mince sur `GeocodingService`, cache
  `reference_data`, lecture sans journal), jamais un appel du navigateur au géocodeur.

## Conséquences

- Deux nouvelles origines de tuiles côté navigateur (`data.geopf.fr`) ; WMTS et TMS échappent à
  la limite de débit par IP de la Géoplateforme, le géocodage y est limité à 50 requêtes par
  seconde et par IP (une recherche par clic ici, réponses en cache).
- Une couche ajoutée plus tard hors de `upsertGeoJsonLayer` doit porter la même métadonnée pour
  survivre à un changement de fond ; `base-maps.spec.ts` en fixe la règle.
- Un changement de fond pendant le chargement des tuiles peut laisser dans la console quelques
  avertissements de glyphes de l'ancien style demandés au nouveau serveur de polices (404) :
  sans effet, MapLibre rend ces caractères localement et vide son cache de glyphes au changement.
- Plus tard : un fond sombre si l'IGN en publie un, le cadastre (parcelles du Plan IGN) en
  couche, l'autocomplétion d'adresse (API d'autocomplétion de la Géoplateforme, 10 requêtes par
  seconde).
