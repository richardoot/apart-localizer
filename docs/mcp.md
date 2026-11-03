# Connecteur MCP

L'API expose un serveur MCP sur `POST /mcp` (plus `GET` et `DELETE`, qui répondent 405 : il
n'y a pas de session), en HTTP « streamable » sans état : chaque appel d'outil est une requête
HTTP complète, authentifiée par `McpAuthGuard` (jeton Supabase du membre), servie par un serveur
et un transport construits pour elle, avec une réponse JSON (pas de flux SSE). Rien n'est gardé
entre deux appels, rien n'est perdu quand une fonction serverless redémarre.

Code : `apps/api/src/mcp/`. Les vingt et un outils, le prompt et les deux ressources sont déclarés dans `mcp-tools.ts`, le garde
dans `mcp-auth.guard.ts`, la découverte OAuth dans `discovery.ts` et `well-known.controller.ts`,
la forme des réponses dans `tool-results.ts`. Les schémas d'entrée viennent de
`packages/contracts/src/mcp.ts` ; les calculs de `packages/domain` à travers les services ; le
module n'a aucune logique métier propre.

## Authentification et découverte

| Chemin                                          | Rôle                                                                                                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /mcp`                                     | L'endpoint MCP. Sans jeton : 401 avec `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"` (RFC 9728), pour que le client trouve le serveur OAuth. |
| `GET /.well-known/oauth-protected-resource`     | Métadonnées de ressource protégée : `resource` (l'URL de `/mcp`), `authorization_servers` (GoTrue, `SUPABASE_EXTERNAL_URL/auth/v1`), `scopes_supported`.                            |
| `GET /.well-known/oauth-protected-resource/mcp` | La même, à l'emplacement propre à la ressource.                                                                                                                                     |
| `GET /.well-known/oauth-authorization-server`   | Les métadonnées du serveur d'autorisation (RFC 8414) relayées depuis GoTrue et mises en cache cinq minutes, pour un client qui ne lit que l'origine de l'API.                       |

Le jeton est validé par Supabase (`auth.getUser`), puis le membre de l'espace est résolu comme
pour le REST (rattachement par e-mail à la première connexion, ADR 0004).

### Portées

Deux portées, `listings:read` et `listings:write` (`MCP_SCOPES` dans `contracts`). Le garde lit
la revendication `scope` du jeton (ADR 0005) :

- un jeton qui déclare ses portées n'a que celles-là : sans `listings:write`, chaque outil
  d'écriture répond un refus lisible (« le jeton ne porte pas la portée listings:write ») et
  n'écrit rien ;
- un jeton qui n'en déclare aucune (session de première main) vaut toutes les portées.

Il n'y a **aucun outil de suppression** : supprimer une tâche saisie à la main reste dans
l'application web ; une annonce ne se supprime pas, elle s'écarte.

## Réponses

Chaque réponse porte une ligne lisible (titre, prix, surface, brut, effort, verdict) puis le
JSON complet encadré dans la balise `<apart_listing_data>…</apart_listing_data>`, pour que le
modèle le lise comme des données et non comme des instructions. Le même JSON est rendu en
`structuredContent`. Les `NaN` (surface ou coût nul) deviennent `null`.

Un refus est une réponse `isError: true` avec un message en français, jamais une exception :
garde-fou qui ne correspond pas (409), annonce introuvable (404), entrée invalide (400, avec le
champ fautif), portée absente. Une vraie panne (base injoignable) remonte comme erreur.

Chaque écriture est journalisée dans `ActivityLog` avec le canal `mcp`, le membre, l'action,
l'avant et l'après.

## Outils

Les montants sont en euros, les surfaces en m², les taux en fractions (0,0365 = 3,65 %), les
identifiants des annonces et des tâches sont des UUID rendus par `list_listings` et
`get_listing`.

### Lecture

| Outil                  | Entrée                                                                                                                                                                                                                                                                                                                                                              | Réponse                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_listings`        | `ListingFilters` : `status[]`, `commune[]`, `dpe[]`, `verdict[]`, `priceMin`, `priceMax`, `surfaceMin`, `surfaceMax`, `roomsMin`, `newForMe`, `search`, `near` (`longitude`, `latitude`, `radiusMeters` 1 à 50 000), `criteriaId` (critère enregistré : périmètre et filtres, comme dans l'application), `sort`, `order`, `page` (dès 1), `limit` (50, 200 au plus) | `{ items, total, page, limit, pageCount }` ; chaque `item` : `listing`, `evaluation` (métriques, louabilité, prix cible), `isNewForMe`, `distanceMeters`, `opinions`, `tasks`, `priceEvents`                                                                                                                                                                                                                      |
| `get_listing`          | `listingId`                                                                                                                                                                                                                                                                                                                                                         | Le même `item` (avec `criteriaMatches`, les critères dans lesquels l'annonce est entrée) et `context` : arrêt de tram le plus proche (distance, lignes), plafond d'encadrement (Bordeaux : zone, majoré, plafond mensuel, état « calculé » ou « à vérifier » avec raisons), DPE vérifié auprès de l'ADEME et sa validité, comparables DVF datés ; détail des contrôles de louabilité dans le texte                |
| `get_assumptions`      | aucune                                                                                                                                                                                                                                                                                                                                                              | La version d'hypothèses en vigueur (`values` : apport, taux, durée, assurance, notaire, vacance, frais fixes, seuils, marges, année de location)                                                                                                                                                                                                                                                                  |
| `evaluate_listing`     | `listingId` + `overrides` (champs à remplacer), **ou** `listing` (annonce hypothétique : prix, surface, loyer visé dans `rentalPlan.targetRent`, DPE, commune, travaux…), + `assumptions` (scénario : `interestRate`, `downPayment`, `durationYears`…)                                                                                                              | `{ listing, assumptions, evaluation, persisted: false }` ; rien n'est enregistré                                                                                                                                                                                                                                                                                                                                  |
| `extract_listing`      | `ExtractionRequest` : `text` (texte de la page lu dans le navigateur ou collé, 50 000 caractères au plus) et/ou `images[]` (`{ mediaType, data }` base64, jpeg/png/gif/webp, 5 Mo chacune, `AI_MAX_IMAGES` au plus), `url`, `quality` (`precise` par défaut, `fast` = modèle économique)                                                                            | `ExtractionResult` : `listing` (fiche `ListingInput` pré-remplie, `fieldSources` avec provenance `ai`, confiance et extrait par champ, adresse géocodée en `open_data`), `missingFields`, `duplicates`, `warnings`, `geocoded`, `usage` (modèle, jetons, coût estimé), `persisted: false`. Refus lisible si l'IA n'est pas configurée (503), refuse (422) ou tronque (502). Voir [ia.md](ia.md).                  |
| `find_duplicates`      | `DuplicateProbe` : `listingId` (annonce enregistrée, exclue des résultats), `url`, `address`, `point` (GeoJSON, 50 m), ou le trio `commune` + `price` + `surface` ; au moins un                                                                                                                                                                                     | `{ duplicates }` : pour chaque candidat, `listingId`, `title`, `status`, `price`, `surface`, `commune`, `url`, `score` (0 à 1) et `reasons[]` (`same_url`, `same_address`, `same_commune_price_surface`, `nearby_similar`), toutes les étapes comprises (y compris écartées)                                                                                                                                      |
| `get_target_price`     | `listingId` (annonce enregistrée) **ou** `listing` (hypothétique) ; `assumptions` (scénario, le rang est alors omis) ; `sensitivity` (`rowAxis`, `colAxis` parmi `price`, `rent`, `rate`, `downPayment`, `duration`, `rowSteps`, `colSteps`, `assumptions`)                                                                                                         | `TargetPriceReport` : `price`, `targetPrice` (prix maximal et décote par critère, `bindingCriterion`, `discount`, `discountClass`), `rank` (`position`, `total` parmi les annonces actives, par décote), `negotiation` (offre suggérée au millier inférieur, marge, durée en ligne, baisses, dernière offre, arguments), `notaryFees` (détail en mode barème), `assumptions`, `sensitivity` (grille, si demandée) |
| `compare_listings`     | `listingIds` (2 à 6 identifiants)                                                                                                                                                                                                                                                                                                                                   | `CompareResult` : `items` dans l'ordre demandé (chacun une annonce vue plus `ranks` : score, brut, net, effort, prix au m², décote, 1 = meilleure) et `best` (identifiant de la meilleure par indicateur)                                                                                                                                                                                                         |
| `list_search_criteria` | `includeArchived` (faux par défaut)                                                                                                                                                                                                                                                                                                                                 | `{ criteria }` : nom, filtres (prix, surface, pièces, DPE maximal, verdicts, statuts, communes, distance maximale au tram), périmètre (point et rayon, polygone, isochrone et ses paramètres), `listingCount`, `newCount` (non ouvertes par le membre), `approximateCount` (localisation imprécise, incluses sous réserve), `updatedAt` (garde-fou de la mise à jour)                                             |
| `get_market_context`   | `listingId`, **ou** `address` (géocodée), **ou** `point` ; `surface`, `rooms`, `constructionYear`, `furnished`, `radiusMeters` (100 à 5 000)                                                                                                                                                                                                                        | `MarketContextReport` : `location`, `market` (ventes DVF d'appartements, 500 m élargis à 1 000 puis 2 000 m, surface ±25 %, trois ans : médiane, quartiles, dispersion, comparables datés, prix de marché estimé, écart au prix affiché), `rentControl` (plafond de l'arrêté en vigueur, Bordeaux seulement), `transit` (tram et arrêt le plus proches). Voir [open-data.md](open-data.md)                        |

Sans filtre de statut, `list_listings` rend les annonces actives (à étudier, à visiter, visité,
offre faite, offre acceptée), ou les statuts du critère quand `criteriaId` en fixe. Le filtre géographique s'exécute dans PostGIS ; verdict, tri et
pagination s'appliquent après le calcul des indicateurs (ADR 0006).

### Écriture (portée `listings:write`)

| Outil                    | Entrée                                                                                                                                                                                                                                                                                                                                                                                                                 | Garde-fous et effets                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_listing`         | `listing` (`ListingCreate` : `title` et `price` obligatoires, le reste si l'annonce le donne, `location.point` en GeoJSON `[lng, lat]`, `fieldSources` par champ, `ignoreDuplicates`), `provenance`                                                                                                                                                                                                                    | Crée l'annonce avec la checklist par défaut et un premier événement de prix ; sans point, l'adresse est géocodée côté serveur (`open_data`) ; les champs fournis reçoivent la provenance (`ai` par défaut, `user` si le membre a dicté), sauf ceux que `fieldSources` décrit déjà. La réponse porte `duplicates` (la création n'est **pas** bloquée ; `ignoreDuplicates: true` journalisé quand le membre a vu l'alerte) et `createdTasks` (une tâche `missing_field` par champ indispensable manquant quand la fiche vient de l'IA, sans doublonner la checklist). Enrichie côté serveur (arrêt de tram, plafond d'encadrement, médiane DVF, DPE vérifié à l'ADEME quand il est sans ambiguïté) ; `criteriaChanges` liste les critères dans lesquels elle entre (« Entre dans le critère X » dans le texte, journal `criteria.matched`). Nouvelle pour les autres membres. |
| `update_listing`         | `listingId`, `patch` (`ListingUpdate` partiel), `expectedUpdatedAt`, `expectedPrice`, `provenance`                                                                                                                                                                                                                                                                                                                     | Refus si `updatedAt` ou le prix ont changé depuis la lecture ; un sous-objet fourni (travaux, phase 2, localisation) remplace l'existant ; un nouveau prix ajoute une ligne à l'historique. Une nouvelle adresse relance géocodage et enrichissements ; `criteriaChanges` dit les critères dans lesquels l'annonce entre ou dont elle sort (aussi pour `set_listing_status` et `record_price_change`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `set_listing_status`     | `listingId`, `status`, `reason`, `expectedStatus`                                                                                                                                                                                                                                                                                                                                                                      | Refus si le statut courant diffère de `expectedStatus` ; `discarded` exige une raison.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `add_opinion`            | `listingId`, `rating` (0 à 5, 0 = sans note), `text`                                                                                                                                                                                                                                                                                                                                                                   | Crée ou remplace l'avis du membre connecté ; l'avis de l'autre membre n'est pas touché.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `add_task`               | `listingId`, `label`, `assigneeHandle` (« richard », « chloe »)                                                                                                                                                                                                                                                                                                                                                        | Ajoute une tâche `manual` ; refus si l'identifiant court n'est pas un membre de l'espace (la réponse liste les membres).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `complete_task`          | `listingId`, `taskId`, `done` (vrai par défaut)                                                                                                                                                                                                                                                                                                                                                                        | Coche ou décoche ; jamais de suppression.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `record_price_change`    | `listingId`, `newPrice`, `occurredAt`, `source` (`listing` si le portail affiche le nouveau prix, `user` sinon), `expectedPrice`                                                                                                                                                                                                                                                                                       | Met le prix affiché à jour, ajoute une ligne à l'historique (nourrit le brief de négociation : baisses passées), journalise ; refus si le prix courant diffère de `expectedPrice` ou si le prix ne change pas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `record_offer`           | Nouvelle offre : `listingId`, `amount`, `madeAt`, `channel` (`email`, `phone`, `agency`, `in_person`, `letter`, `other`), `response` (défaut `pending`), `counterAmount`, `notes`. Réponse du vendeur : `listingId`, `offerId`, `response` (`accepted`, `refused`, `counter_offer` avec `counterAmount`), `notes`, `expectedResponse`                                                                                  | Crée l'offre, ou enregistre la réponse d'une offre existante (le montant ne se modifie pas : nouvelle offre). La réponse porte `currentStatus` et `suggestedStatus` (« offre faite », « offre acceptée », « offre refusée ») : le statut n'est **jamais changé d'office**, proposez-le au membre puis `set_listing_status`. Journalisé ; aucune suppression.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `set_assumptions`        | `values` (champs modifiés seulement : taux en fractions, apport, seuils, marges, `targetCriteria`, `negotiableDiscount`, `tightDiscount`, `notaryMode`, `notaryScale`…), `label`, `expectedVersion`                                                                                                                                                                                                                    | Fusionne avec la version en vigueur, revalide, enregistre une nouvelle version et journalise ; refus si `expectedVersion` (identifiant rendu par `get_assumptions`) n'est plus la version en vigueur. La réponse porte `impact` : annonces actives dont le verdict change (avant, après, prix cibles).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `create_search_criteria` | `name`, `active`, `filters` (`priceMax`, `priceMin`, `surfaceMin`, `roomsMin`, `dpeMax`, `verdicts`, `statuses`, `communes`, `maxTramDistanceMeters` 50 à 5 000), `perimeter` : `{ type: "point_radius", longitude, latitude, radiusMeters }`, `{ type: "polygon", polygon }` (GeoJSON fermé, `[lng, lat]`) ou `{ type: "isochrone", origin \| address, mode: walking \| cycling \| driving, durationMinutes 1 à 60 }` | Le polygone est validé par PostGIS (refus d'un polygone qui se recoupe) ; l'isochrone est calculée par la Géoplateforme et figée en polygone, paramètres conservés (`cycling` approché, ADR 0010) ; service indisponible = refus lisible. La réponse donne les compteurs. Journalisé (`criteria.created`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `update_search_criteria` | `criteriaId`, champs modifiés (`filters` fusionnés, `perimeter` remplacé, `null` = aucun), `active: false` pour archiver, `expectedUpdatedAt`                                                                                                                                                                                                                                                                          | Refus si le critère a changé depuis la lecture ; aucune suppression par le MCP (archivage). La table des entrées est resynchronisée sans alerte. Journalisé (`criteria.updated`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Ressources

| URI                      | Contenu                                                                                                                                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apart://schema/listing` | Schéma JSON (`application/schema+json`) de la fiche acceptée par `create_listing` : champs, unités, énumérations et descriptions en français, produit par `z.toJSONSchema` depuis `ListingCreateSchema`.                                              |
| `apart://glossaire`      | Glossaire des indicateurs en Markdown (`INDICATOR_GLOSSARY` dans `contracts`) : coût total, frais de notaire, mensualité, rendements, effort, repère 220 × loyer, verdict, prix cible, critère liant, décote, offre suggérée, louabilité, provenance. |

## Prompt « Analyser cette annonce »

`prompts/list` publie `analyze_listing` (arguments : `pageText` obligatoire, `url`, `notes`).
`prompts/get` rend un message utilisateur qui guide Claude dans l'ordre : appeler
`extract_listing` avec le texte (et les captures jointes à la conversation), présenter la fiche
au membre (valeurs, confiance et extrait par champ, champs manquants, doublons), demander si un
doublon probable est bien la même annonce, **attendre la confirmation explicite** avant d'écrire,
puis `create_listing` avec la fiche rendue (corrections marquées `user`, `ignoreDuplicates` si le
membre confirme) et rapporter indicateurs, verdict et tâches créées. Le texte de la page est
encadré dans `<annonce_source>` pour être lu comme une donnée. Les ressources (schéma d'annonce,
glossaire) suivront.

## Exemples d'usage

**« Analyse cette annonce. »** Depuis une page d'annonce dans le navigateur, Claude utilise le
prompt `analyze_listing` (ou appelle directement `extract_listing` avec le texte de la page et
son URL). La réponse donne la fiche pré-remplie avec, par champ, la provenance `ai`, la confiance
et l'extrait ; les champs manquants (« Loyer visé ») ; les doublons probables. Claude la montre au
membre, applique ses corrections (provenance `user`), attend son accord, puis appelle
`create_listing` avec `listing` tel que rendu et `provenance: "ai"`. La réponse donne
l'identifiant, les indicateurs, le verdict, les doublons et les tâches créées ; l'annonce
apparaît « nouvelle » sur le mobile de Chloé.

**« Est-ce qu'on suit déjà cette annonce ? »** `find_duplicates` avec `url`, ou `address`, ou
`commune` + `price` + `surface` : la réponse liste les annonces proches avec leurs motifs et
leur score, écartées comprises.

**« Quelles annonces à moins de 800 m de ce point ? »** `list_listings` avec
`near: { longitude: -0.5955, latitude: 44.8077, radiusMeters: 800 }` : chaque annonce rendue
porte `distanceMeters`, de la plus proche à la plus lointaine si `sort` n'est pas donné autrement.

**« À quel prix le T2 de Talence passe dans la cible ? »** `get_target_price` avec `listingId` :
prix maximal par critère, critère liant, décote nécessaire et sa classe, rang parmi les annonces
actives, offre suggérée (au millier inférieur) avec la marge, arguments factuels (ancienneté,
baisses, DPE, travaux, charges, offre précédente), détail des frais de notaire. Avec
`sensitivity: { rowAxis: "rate", colAxis: "rent" }`, la grille de sensibilité est jointe. Pour un
scénario : `assumptions: { interestRate: 0.032 }` (le rang est alors omis), ou `evaluate_listing`
avec `overrides: { price: 175000 }`.

**« Compare les trois visitées. »** `compare_listings` avec leurs identifiants : une ligne par
annonce avec ses rangs par indicateur, puis la meilleure par indicateur.

**« Le prix a baissé à 190 000 €. »** `record_price_change` (`newPrice: 190000`,
`expectedPrice: 200000`, `source: "listing"`) : l'historique garde l'ancien prix et le brief de
négociation compte la baisse.

**« On a fait une offre à 150 000 € par l'agence. »** `record_offer` (`amount: 150000`,
`channel: "agency"`) ; la réponse propose « offre faite » : demander au membre, puis
`set_listing_status` (`status: "offer_made"`, `expectedStatus` = le statut courant). Quand le
vendeur répond : `record_offer` avec `offerId`, `response: "counter_offer"` et
`counterAmount: 165000`.

**« Suis-moi les T2 à 10 minutes à pied de la gare Saint-Jean, sous 220 000 €. »**
`create_search_criteria` (`name`, `filters: { priceMax: 220000, roomsMin: 2 }`, `perimeter:
{ type: "isochrone", address: "Gare Saint-Jean, Bordeaux", mode: "walking", durationMinutes: 10 }`) :
la réponse donne le nombre d'annonces qui le satisfont ; `list_listings` avec son `criteriaId`
les liste ; chaque annonce créée ensuite qui y entre est signalée dans la réponse de
`create_listing`.

**« Combien se vendent les T2 autour de cette adresse ? »** `get_market_context` avec `address`
et `surface` : médiane DVF au m², quartiles, ventes datées, plafond d'encadrement et tram le plus
proche.

**« Passe le seuil de brut à 5 %. »** `get_assumptions` (pour l'identifiant de version), puis
`set_assumptions` (`values: { grossYieldThreshold: 0.05 }`, `expectedVersion`) : la réponse dit
combien d'annonces changent de verdict et lesquelles.

**« Marque-la à visiter et note que Chloé doit appeler l'agence. »** `set_listing_status`
(`status: "to_visit"`, `expectedStatus: "to_study"`), puis `add_task`
(`label: "Appeler l'agence"`, `assigneeHandle: "chloe"`).

## Garde-fous, en résumé

- **Optimistes** : l'agent dit ce qu'il croit voir (`expectedUpdatedAt`, `expectedPrice`,
  `expectedStatus`) ; si la base dit autre chose, rien n'est écrit et la réponse l'explique.
  Relire (`get_listing`) avant de réécrire.
- **Refus en réponse**, jamais en exception ; message en français avec le champ ou la valeur en
  cause.
- **Journal** : chaque écriture dans `ActivityLog`, canal `mcp`.
- **Données encadrées** dans `<apart_listing_data>`.
- **Aucune suppression**, **aucun calcul hors de `packages/domain`**, **aucun scraping** : le
  MCP reçoit ce que Claude a lu dans le navigateur de l'utilisateur ; `extract_listing` passe ce
  texte au modèle côté serveur sans jamais télécharger la page.
- **Confirmation avant écriture** : le prompt `analyze_listing` demande l'accord du membre avant
  `create_listing` ; `extract_listing` n'écrit rien (portée lecture).
- **Débit** : `@nestjs/throttler` sur toutes les routes (300 requêtes par minute et par adresse
  par défaut, `THROTTLE_LIMIT` et `THROTTLE_TTL_MS`).

## Limites connues

- Les portées ne restreignent l'écriture que si le serveur d'autorisation inscrit la
  revendication `scope` dans le jeton (ADR 0005).
- `extract_listing` coûte quelques centimes par appel (modèle côté serveur, [ia.md](ia.md)) et
  n'est pas limité par portée : un jeton en lecture peut l'appeler.
- Le critère « marché (DVF) » du prix cible lit la médiane enregistrée lors du dernier
  enrichissement de l'annonce (ADR 0011) ; il est inactif par défaut (`targetCriteria`).
- Une isochrone « à vélo » est approchée (réseau piéton à 15 km/h) ; « en transport » n'existe
  pas (ADR 0010). Les comptes d'un critère sont recalculés à la lecture ; le badge « dans le
  critère » suit les écritures d'annonces et de critères.
- Le DPE trouvé à l'ADEME n'est appliqué d'office que s'il est sans ambiguïté ; sinon les
  candidats sont dans `context.dpe.search` et la validation se fait dans l'application.
- Le rang par décote compare l'annonce aux annonces actives de l'espace sous les hypothèses en
  vigueur ; un scénario d'hypothèses dans `get_target_price` l'omet.
- Les offres se créent et se répondent, elles ne se suppriment pas (ni par le MCP, ni par le
  REST) : une offre saisie par erreur se corrige par son commentaire.
