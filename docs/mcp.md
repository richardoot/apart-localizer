# Connecteur MCP

L'API expose un serveur MCP sur `POST /mcp` (plus `GET` et `DELETE`, qui répondent 405 : il
n'y a pas de session), en HTTP « streamable » sans état : chaque appel d'outil est une requête
HTTP complète, authentifiée par `McpAuthGuard` (jeton Supabase du membre), servie par un serveur
et un transport construits pour elle, avec une réponse JSON (pas de flux SSE). Rien n'est gardé
entre deux appels, rien n'est perdu quand une fonction serverless redémarre.

Code : `apps/api/src/mcp/`. Les vingt-neuf outils, le prompt et les deux ressources sont déclarés dans `mcp-tools.ts`, le garde
dans `mcp-auth.guard.ts`, la découverte OAuth dans `discovery.ts` et `well-known.controller.ts`,
la forme des réponses dans `tool-results.ts`. Les schémas d'entrée viennent de
`packages/contracts/src/mcp.ts` ; les calculs de `packages/domain` à travers les services ; le
module n'a aucune logique métier propre.

## Authentification et découverte

| Chemin                                          | Rôle                                                                                                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /mcp`                                     | L'endpoint MCP. Sans jeton : 401 avec `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"` (RFC 9728), pour que le client trouve le serveur OAuth. |
| `GET /.well-known/oauth-protected-resource`     | Métadonnées de ressource protégée : `resource` (l'URL de `/mcp`), `authorization_servers` (GoTrue, `SUPABASE_EXTERNAL_URL/auth/v1`), `scopes_supported` (`email`, voir Portées).    |
| `GET /.well-known/oauth-protected-resource/mcp` | La même, à l'emplacement propre à la ressource.                                                                                                                                     |
| `GET /.well-known/oauth-authorization-server`   | Les métadonnées du serveur d'autorisation (RFC 8414) relayées depuis GoTrue et mises en cache cinq minutes, pour un client qui ne lit que l'origine de l'API.                       |

Le jeton est validé par Supabase (`auth.getUser`), puis le membre de l'espace est résolu comme
pour le REST (rattachement par e-mail à la première connexion, ADR 0004).

Le client s'enregistre auprès de GoTrue (enregistrement dynamique), puis GoTrue envoie la
personne sur la page de consentement du web, `/oauth/consent?authorization_id=…`
(`site_url` + chemin d'autorisation) : connexion si besoin, client, compte, hôte de retour,
portées en phrases, « Autoriser » ou « Refuser ». Le client échange ensuite le code (PKCE) contre
un jeton d'accès.

### Portées

Deux portées d'application, `listings:read` et `listings:write` (`MCP_SCOPES` dans `contracts`).
Le garde lit la revendication `scope` du jeton et n'y retient que les portées `listings:…`
(ADR 0005, précisé par l'ADR 0017) :

- un jeton qui déclare des portées de l'application n'a que celles-là : sans `listings:write`,
  chaque outil d'écriture répond un refus lisible (« le jeton ne porte pas la portée
  listings:write ») et n'écrit rien ;
- un jeton qui n'en déclare aucune vaut toutes les portées : une session de première main, et
  tout jeton du serveur OAuth de GoTrue, qui n'inscrit que des portées OpenID (`email` par
  défaut).

GoTrue refuse toute portée hors OpenID (« unsupported scope ») : la découverte annonce donc
`scopes_supported: ["email"]`, ce qu'un client MCP demande tel quel. Annoncer `listings:read`
ferait échouer l'autorisation avant le consentement.

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
l'avant et l'après ; elle prévient l'autre membre selon ses préférences (cloche, push), et le
membre lui-même pour une annonce que Claude ajoute (ADR 0015). Le journal se lit dans
l'application (onglet « Journal » de la fiche, page « Activité »).

## Outils

Les montants sont en euros, les surfaces en m², les taux en fractions (0,0365 = 3,65 %), les
identifiants des annonces et des tâches sont des UUID rendus par `list_listings` et
`get_listing`.

### Lecture

| Outil                  | Entrée                                                                                                                                                                                                                                                                                                                                                              | Réponse                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_listings`        | `ListingFilters` : `status[]`, `commune[]`, `dpe[]`, `verdict[]`, `priceMin`, `priceMax`, `surfaceMin`, `surfaceMax`, `roomsMin`, `newForMe`, `search`, `near` (`longitude`, `latitude`, `radiusMeters` 1 à 50 000), `criteriaId` (critère enregistré : périmètre et filtres, comme dans l'application), `sort`, `order`, `page` (dès 1), `limit` (50, 200 au plus) | `{ items, total, page, limit, pageCount }` ; chaque `item` : `listing`, `evaluation` (métriques, louabilité, prix cible), `isNewForMe`, `distanceMeters`, `opinions`, `tasks`, `priceEvents`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `get_listing`          | `listingId`                                                                                                                                                                                                                                                                                                                                                         | Le même `item` (avec `criteriaMatches`, les critères dans lesquels l'annonce est entrée) et `context` : arrêt de tram le plus proche (distance, lignes), plafond d'encadrement (Bordeaux : zone, majoré, plafond mensuel, état « calculé » ou « à vérifier » avec raisons), DPE vérifié auprès de l'ADEME et sa validité, comparables DVF datés ; détail des contrôles de louabilité dans le texte                                                                                                                                                                                                                                                                             |
| `get_assumptions`      | aucune                                                                                                                                                                                                                                                                                                                                                              | La version d'hypothèses en vigueur (`values` : apport, taux, durée, assurance, notaire, vacance, frais fixes, seuils, marges, année de location)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `evaluate_listing`     | `listingId` + `overrides` (champs à remplacer), **ou** `listing` (annonce hypothétique : prix, surface, loyer visé dans `rentalPlan.targetRent`, DPE, commune, travaux…), + `assumptions` (scénario : `interestRate`, `downPayment`, `durationYears`…)                                                                                                              | `{ listing, assumptions, evaluation, persisted: false }` ; rien n'est enregistré                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `extract_listing`      | `ExtractionRequest` : `text` (texte de la page lu dans le navigateur ou collé, 50 000 caractères au plus) et/ou `images[]` (`{ mediaType, data }` base64, jpeg/png/gif/webp, 5 Mo chacune, `AI_MAX_IMAGES` au plus), `url`, `quality` (`precise` par défaut, `fast` = modèle économique)                                                                            | `ExtractionResult` : `listing` (fiche `ListingInput` pré-remplie, `fieldSources` avec provenance `ai`, confiance et extrait par champ, adresse géocodée en `open_data`), `missingFields`, `duplicates`, `warnings`, `geocoded`, `usage` (modèle, jetons, coût estimé), `persisted: false`. Refus lisible si l'IA n'est pas configurée (503), refuse (422) ou tronque (502). Voir [ia.md](ia.md).                                                                                                                                                                                                                                                                               |
| `find_duplicates`      | `DuplicateProbe` : `listingId` (annonce enregistrée, exclue des résultats), `url`, `address`, `point` (GeoJSON, 50 m), ou le trio `commune` + `price` + `surface` ; au moins un                                                                                                                                                                                     | `{ duplicates }` : pour chaque candidat, `listingId`, `title`, `status`, `price`, `surface`, `commune`, `url`, `score` (0 à 1) et `reasons[]` (`same_url`, `same_address`, `same_commune_price_surface`, `nearby_similar`), toutes les étapes comprises (y compris écartées)                                                                                                                                                                                                                                                                                                                                                                                                   |
| `get_target_price`     | `listingId` (annonce enregistrée) **ou** `listing` (hypothétique) ; `assumptions` (scénario, le rang est alors omis) ; `sensitivity` (`rowAxis`, `colAxis` parmi `price`, `rent`, `rate`, `downPayment`, `duration`, `rowSteps`, `colSteps`, `assumptions`, `includeTargetPrice` : ajoute la ligne du prix cible)                                                   | `TargetPriceReport` : `price`, `targetPrice` (prix affiché maximal, coût tout compris maximal `maxTotalCost` et décote par critère, `bindingCriterion`, `discount`, `discountClass`, `atTarget` : coût, mensualité, rendements, effort et verdict au prix cible), `rank` (`position`, `total` parmi les annonces actives, par décote), `negotiation` (offre suggérée au millier inférieur, marge, durée en ligne, baisses, dernière offre, arguments), `notaryFees` (détail en mode barème), `assumptions`, `sensitivity` (grille, si demandée ; sur l'axe du prix, `totalCost` et `isTarget` par pas)                                                                         |
| `compare_listings`     | `listingIds` (2 à 6 identifiants)                                                                                                                                                                                                                                                                                                                                   | `CompareResult` : `items` dans l'ordre demandé (chacun une annonce vue plus `ranks` : score, brut, net, effort, prix au m², décote, 1 = meilleure) et `best` (identifiant de la meilleure par indicateur)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `list_search_criteria` | `includeArchived` (faux par défaut)                                                                                                                                                                                                                                                                                                                                 | `{ criteria }` : nom, filtres (prix, surface, pièces, DPE maximal, verdicts, statuts, communes, distance maximale au tram), périmètre (point et rayon, polygone, isochrone et ses paramètres), `listingCount`, `newCount` (non ouvertes par le membre), `approximateCount` (localisation imprécise, incluses sous réserve), `updatedAt` (garde-fou de la mise à jour)                                                                                                                                                                                                                                                                                                          |
| `get_market_context`   | `listingId`, **ou** `address` (géocodée), **ou** `point` ; `surface`, `rooms`, `constructionYear`, `furnished`, `radiusMeters` (100 à 5 000)                                                                                                                                                                                                                        | `MarketContextReport` : `location`, `market` (ventes DVF d'appartements, 500 m élargis à 1 000 puis 2 000 m, surface ±25 %, trois ans : médiane, quartiles, dispersion, comparables datés, prix de marché estimé, écart au prix affiché), `rentControl` (plafond de l'arrêté en vigueur, Bordeaux seulement), `transit` (tram et arrêt le plus proches). Voir [open-data.md](open-data.md)                                                                                                                                                                                                                                                                                     |
| `get_projection`       | `listingId`, `horizonYears` (1 à 40 ; absent = hypothèses), `regime` (`micro_foncier`, `reel_foncier`, `micro_bic`, `lmnp_reel` ; absent = hypothèses ou selon le bail), `assumptions` (scénario pour ce calcul : `marginalTaxRate`, `appreciationRate`, `rentalStartDate`…)                                                                                        | `ProjectionReport` : `parameters` (dates, horizon, bail, TMI, revalorisation, IRL, frais de revente, taux d'actualisation, paramètres fiscaux datés), `rows` (une ligne par année de détention : loyer évité, loyers, mensualités, intérêts, capital, charges, taxe, impôt du régime avec reports, cash-flow avant et après impôt, capital restant dû, valeur), `sale` (prix, frais, plus-value et son impôt, exonération si résidence principale), `summary` (TRI et VAN avant et après impôt, enrichissement net, 1re année louée), `regimes` (comparaison), `bestRegime`, `warnings`, `disclaimer`. Sans TMI, l'impôt sur le revenu et tout l'« après impôt » valent `null` |
| `get_compliance`       | `listingId`                                                                                                                                                                                                                                                                                                                                                         | `ComplianceReport` : `rentalStartDate`, `items` (clé, catégorie, niveau `ok`/`warn`/`bad`/`unknown`, titre, message, date, source avec URL et date de consultation, provenance `reference`, `open_data` ou `listing`), `counts`, `verdict`, `georisques` (aléas à l'adresse et dans la commune, lien vers le rapport, date de relevé, ou `unavailable`/`not_applicable`), `rules` (version et date de la table)                                                                                                                                                                                                                                                                |
| `evaluate_scenario`    | `listingId` ; `overrides` (`price`, `targetRent`, `renovationTotal`, `furnitureValue`, `propertyTax`, `annualCharges`, `leaseType`, `assumptions`) **ou** `scenarioId` (enregistré, complété champ par champ par `overrides`) ; `saveAs` (`name`, `scope` : `listing` ou `workspace`, `notes`) pour enregistrer (portée écriture)                                   | `ScenarioComparison` : `base` et `result` (coût, mensualité, rendements, effort, verdicts, prix cible, coût d'occupation, TRI, VAN, enrichissement), `deltas` (valeur de base, du scénario, écart, `better`), `verdictChanged`, `rentalVerdictChanged`, `persisted: false`, `savedScenarioId`. Sans `saveAs`, rien n'est enregistré ; un jeton en lecture évalue mais n'enregistre pas                                                                                                                                                                                                                                                                                         |
| `list_visits`          | `listingId`                                                                                                                                                                                                                                                                                                                                                         | `{ visits }` : date, état (faite, planifiée), participants, compte rendu, points positifs et négatifs, note, nombre de photos (les photos restent privées dans l'application)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `whats_new`            | `since` (ISO 8601, facultatif ; absent = dernière visite de l'application), `limit` (50, 200 au plus)                                                                                                                                                                                                                                                               | `WhatsNewReport` : `since`, `sinceSource`, `counts` par sorte (nouvelles annonces, prix, statuts, avis, tâches, entrées dans un critère), `items` du plus récent au plus ancien, `listings` concernées. Même calcul que le bandeau de la synthèse ; rien n'est marqué vu                                                                                                                                                                                                                                                                                                                                                                                                       |
| `list_members`         | aucune                                                                                                                                                                                                                                                                                                                                                              | Les membres actifs de l'espace : nom, identifiant court (`handle`, pour `assigneeHandle` d'`add_task` et `participantHandles` d'`add_visit`), rôle (propriétaire ou membre), connecté ou non, `you` pour le membre du jeton ; les anciens membres (historique gardé à leur nom) et le nombre d'invitations en attente. Aucune adresse e-mail. Lecture seule : inviter, annuler, changer un rôle et retirer ne se font que dans l'application (page Espace, ADR 0018)                                                                                                                                                                                                           |

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
| `add_rent_comparable`    | `listingId`, `rent` (hors charges, €/mois), `surface` (m²), `furnished`, `rooms`, `observedAt` (date de l'annonce), `source`, `sourceLabel`, `url`, `address`, `note`                                                                                                                                                                                                                                                  | Ajoute une annonce de location comparable lue par le membre (aucune collecte sur les portails) ; 30 au plus par annonce. La réponse porte le comparable et `market` (médiane et quartiles au m², loyer estimé, écart du loyer visé et du plafond, niveau). Journalisé (`rent_comparable.created`, canal `mcp`) ; la modification et la suppression restent dans l'application web.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `add_visit`              | `listingId`, `visitedAt` (ISO 8601), `status` (`done` par défaut, `planned`), `participantHandles` (« richard », « chloe »), `report`, `pros`, `cons`, `rating` (0 à 5), `createPrepTask` (visite planifiée : tâche « Préparer la visite »)                                                                                                                                                                            | `VisitWriteResult` : la visite, la tâche créée, le statut actuel et le statut proposé (« visité » après une visite faite, « à visiter » pour une visite planifiée), jamais appliqué. Sans photo ; aucune suppression                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Ressources

| URI                      | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apart://schema/listing` | Schéma JSON (`application/schema+json`) de la fiche acceptée par `create_listing` : champs, unités, énumérations et descriptions en français, produit par `z.toJSONSchema` depuis `ListingCreateSchema`.                                                                                                                                                                                                                                                                                    |
| `apart://glossaire`      | Glossaire des indicateurs en Markdown (`INDICATOR_GLOSSARY` dans `contracts`, la même source que le bouton « ? » de la fiche) : deux bases de calcul, coût tout compris, frais de notaire, mensualité, rendements, effort, repère 220 × loyer, verdict, prix cible, critère liant, décote, offre suggérée, louabilité, provenance, coût d'occupation, scénario, régimes fiscaux, cash-flow net d'impôt, TRI, VAN, enrichissement net, plus-value, loyer de marché, checklist réglementaire. |

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

**« Et si on négociait à 150 000 € avec un taux à 3,2 % ? »** `evaluate_scenario` (`listingId`,
`overrides: { price: 150000, assumptions: { interestRate: 0.032 } }`) : base et scénario côte à
côte, écarts (coût, mensualité, effort, coût d'occupation, TRI…), verdicts. Pour le garder :
même appel avec `saveAs: { name: "Prix négocié" }` (portée écriture), puis `scenarioId` pour le
réappliquer.

**« Combien ça nous rapporte en quinze ans, en meublé ou en vide ? »** `get_projection`
(`listingId`, `horizonYears: 15`) : TRI et VAN avant et après impôt, enrichissement net, revente,
comparaison des régimes du bail ; `regime: "lmnp_reel"` pour projeter un régime, `assumptions:
{ marginalTaxRate: 0.3 }` si la TMI n'est pas dans les hypothèses. Toujours présenter le
résultat comme une estimation, pas un conseil fiscal.

**« Est-ce qu'on pourra le louer en 2028 ? »** `get_compliance` (`listingId`) : checklist datée et
sourcée à la date de mise en location (DPE, encadrement et sa fin, permis de louer, diagnostics,
décence, meublé) et risques Géorisques à l'adresse.

**« Ajoute ce T2 loué 680 € pour 40 m² comme comparable. »** `add_rent_comparable`
(`listingId`, `rent: 680`, `surface: 40`, `observedAt`, `source: "leboncoin"`, `url`) : la
réponse donne la médiane au m² à jour et l'écart du loyer visé.

**« Marque-la à visiter et note que Chloé doit appeler l'agence. »** `set_listing_status`
(`status: "to_visit"`, `expectedStatus: "to_study"`), puis `add_task`
(`label: "Appeler l'agence"`, `assigneeHandle: "chloe"`).

**« On a visité le T2 de Talence hier soir avec Chloé, très lumineux mais bruyant, 4 sur 5. »**
`add_visit` (`listingId`, `visitedAt`, `participantHandles: ["richard", "chloe"]`, `pros:
"Très lumineux"`, `cons: "Bruit de la rue"`, `rating: 4`) : la réponse propose « Visité » ;
demander au membre, puis `set_listing_status`. Pour une visite à venir : `status: "planned"`,
`createPrepTask: true`.

**« Quoi de neuf depuis hier ? »** `whats_new` : nouvelles annonces (y compris celles que Claude
a ajoutées), baisses de prix, changements de statut, avis et tâches de l'autre membre, entrées
dans un critère. `whats_new` avec `since` relit une période précise.

## Garde-fous, en résumé

- **Optimistes** : l'agent dit ce qu'il croit voir (`expectedUpdatedAt`, `expectedPrice`,
  `expectedStatus`) ; si la base dit autre chose, rien n'est écrit et la réponse l'explique.
  Relire (`get_listing`) avant de réécrire.
- **Refus en réponse**, jamais en exception ; message en français avec le champ ou la valeur en
  cause.
- **Journal** : chaque écriture dans `ActivityLog`, canal `mcp`.
- **Données encadrées** dans `<apart_listing_data>`.
- **Membres en lecture seule** : `list_members` lit, aucun outil n'invite, n'annule, ne change de
  rôle ni ne retire (lot 8, REST et application seulement). Un membre retiré perd l'accès au
  connecteur dès l'appel suivant, même avec un jeton encore valide : le membre est résolu à
  chaque requête.
- **Aucune suppression**, **aucun calcul hors de `packages/domain`**, **aucun scraping** : le
  MCP reçoit ce que Claude a lu dans le navigateur de l'utilisateur ; `extract_listing` passe ce
  texte au modèle côté serveur sans jamais télécharger la page.
- **Confirmation avant écriture** : le prompt `analyze_listing` demande l'accord du membre avant
  `create_listing` ; `extract_listing` n'écrit rien (portée lecture).
- **Débit** : `@nestjs/throttler` sur toutes les routes (300 requêtes par minute et par adresse
  par défaut, `THROTTLE_LIMIT` et `THROTTLE_TTL_MS`).

## Limites connues

- Les portées ne restreignent l'écriture que si le serveur d'autorisation inscrit `listings:…`
  dans la revendication `scope` du jeton, ce que GoTrue ne fait pas aujourd'hui (ADR 0017) : un
  client autorisé lit et écrit, sans suppression possible.
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
- `get_projection` et `evaluate_scenario` sont des estimations simplifiées (un seul bien, pas
  d'autres revenus fonciers ou BIC du foyer, paramètres fiscaux datés du 3 novembre 2026, voir le
  modèle de calcul § 7) ; sans TMI renseignée, rien n'est calculé « après impôt ».
- `get_compliance` appelle Géorisques (cache trente jours) : en panne, les risques sont « à
  vérifier » ; le permis de louer et le plan d'exposition au bruit ne se déduisent pas de
  l'adresse.
- Les scénarios et les comparables ne se suppriment pas par le MCP (application web seulement).
- `add_visit` n'envoie pas de photo et ne supprime rien : photos et suppressions se font dans
  l'application (une photo par son auteur seulement, ADR 0014). `list_visits` donne le nombre de
  photos, jamais leurs URL.
- `whats_new` lit pour le membre du jeton : ce qu'il a fait lui-même dans l'application n'y
  figure pas, ce que Claude a fait pour lui au MCP si (ADR 0014). Il ne marque rien comme vu ; le
  point de départ avance avec les visites de l'application web.

## Tester en local

La pile locale active le serveur OAuth 2.1 de GoTrue :
`claude mcp add --transport http apart-local http://localhost:3000/mcp` dans Claude Code, ou
`npx @modelcontextprotocol/inspector@2.13.0`. claude.ai ne joint pas `localhost`. Détails, jeton
de session et comptes de démo : [developpement-local.md](developpement-local.md#tester-le-mcp-en-local).
