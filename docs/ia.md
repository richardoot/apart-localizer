# Extraction assistée par IA

Lot 2 de la [feuille de route](product/roadmap.md) : une annonce collée (texte d'une page de
portail, mail d'agence) ou photographiée (captures d'écran) devient une fiche normalisée
pré-remplie, avec la provenance et la confiance de chaque champ, la liste des champs
indispensables manquants, les doublons probables déjà suivis et l'adresse géocodée. Rien n'est
enregistré tant qu'un membre n'a pas validé la fiche.

Code : `apps/api/src/ai/` (appel du modèle), `apps/api/src/listings/extraction.service.ts`
(orchestration), `apps/api/src/listings/duplicates.*` (doublons), `apps/api/src/opendata/`
(géocodage), `packages/contracts/src/ai.ts` (schémas), `apps/web/src/components/listings/ExtractionPane.vue`
et `ListingCreatePanel.vue` (interface). Les outils MCP sont décrits dans [mcp.md](mcp.md).

## Ce que l'API ne fait pas

- **Aucun scraping serveur.** L'API ne télécharge jamais une page d'annonce : le texte vient du
  presse-papiers du membre (onglet « Coller une annonce »), ou de Claude qui lit la page dans
  le navigateur et appelle le MCP (`extract_listing`). L'URL n'est transmise au modèle que
  comme information.
- **La clé Anthropic ne quitte pas le serveur.** Le web appelle `POST /listings/extract` avec
  le jeton Supabase du membre ; l'API appelle Anthropic. Sans `ANTHROPIC_API_KEY`, l'endpoint
  répond `503 IA non configurée` et tout le reste fonctionne (saisie manuelle, MCP de lecture
  et d'écriture, géocodage).
- **Aucune donnée personnelle dans l'invite** au-delà du texte de l'annonce et des captures que
  le membre a lui-même fournis.

## Fonctionnement

```
texte collé / captures ──► POST /listings/extract ──► AiService (Anthropic, sortie structurée)
                                                          │
                                                          ▼
                                            extractionToListing (contrat, validation champ par champ)
                                                          │
                                        ┌─────────────────┼──────────────────┐
                                        ▼                 ▼                  ▼
                                GeocodingService    DuplicatesService   missingListingFields
                                (IGN, cache en base) (lien, adresse,     (champs indispensables
                                                      prix+surface, 50 m)  absents ou douteux)
                                                          │
                                                          ▼
                                   ExtractionResult { listing, missingFields, duplicates, warnings, usage }
                                                          │  (ActivityLog `ai.extraction` : modèle, jetons, coût)
                                                          ▼
                              le membre corrige dans le formulaire ──► POST /listings { ..., fieldSources, ignoreDuplicates }
```

1. **Appel du modèle** (`AiService.extractListing`). `client.messages.parse()` du SDK
   `@anthropic-ai/sdk` avec `output_config.format = zodOutputFormat(AiListingExtractionSchema)` :
   la réponse est validée par le schéma Zod de `contracts` avant d'être lue. Réflexion
   adaptative (`thinking: { type: 'adaptive' }`), effort `AI_EFFORT` (défaut `medium`), invite
   système stable avec `cache_control: ephemeral` (cache de prompt), captures en blocs `image`
   base64, texte encadré dans `<annonce_source>` pour que le modèle le lise comme une donnée.
2. **Sortie structurée** (`AiListingExtractionSchema`) : un objet par champ, `{ value, confidence,
evidence }`. `value` est `null` quand l'annonce ne dit rien ; `confidence` va de 0 à 1 (1 =
   écrit noir sur blanc, 0,5 = déduit, 0,2 = supposé) ; `evidence` est l'extrait exact qui
   justifie la valeur. Les champs : titre, URL lue, portail, vendeur (lot 18 : agence,
   mandataire ou particulier), agence ou réseau, référence de l'annonce chez l'agence,
   identifiant de l'annonce sur le portail, prix,
   honoraires (inclus ou non, montant, pourcentage en fraction, à charge de qui), surfaces,
   pièces, chambres, étage et nombre d'étages, libellé d'étage, ascenseur, année ou époque de
   construction, DPE (classe, consommation, GES, date), chauffage, extérieur, stationnement,
   cave, orientation, état, charges annuelles (un montant mensuel est converti), charges non
   récupérables, lots, procédures, travaux votés, syndic, taxe foncière, adresse, code postal,
   commune, quartier, travaux évoqués (vrai/faux, ampleur, note), description condensée, dates
   de publication et de mise à jour, et une liste `remarks` d'ambiguïtés. Le schéma ne porte
   pas de bornes (la sortie structurée ne les supporte pas toutes) : elles s'appliquent à
   l'étape suivante.
3. **Vers le contrat** (`extractionToListing`, pur, testé). Chaque valeur passe par le schéma
   de son champ dans `ListingInputSchema` ; une valeur hors contrat est écartée avec une
   remarque (`warnings`) plutôt que de faire échouer l'extraction. Chaque champ retenu reçoit
   dans `fieldSources` la provenance `ai`, sa confiance et son extrait ; l'URL fournie par
   l'appelant prime sur celle lue (provenance `listing`) et donne le portail ; « honoraires
   inclus » devient `feesPayer: buyer` ; des travaux évoqués deviennent une section travaux
   active sans poste chiffré ; un pourcentage d'honoraires lu « 5 » devient 0,05. Sans titre,
   un titre de repli (« T2 Talence ») ; sans prix, 0 et une remarque. Le texte collé est gardé
   dans `sourceText` pour vérification (en base, non renvoyé par la fiche). Lot 18 (ADR 0028) :
   `sellerType` est gardé tel que lu (`agency`, `mandatary`, `private`), sinon le vendeur reste
   inconnu, jamais deviné ; `agencyName` devient `sellerName` (il remplissait `sourceLabel`
   jusqu'au lot 17), `agencyReference` devient `sellerReference`, nettoyée de son préfixe
   (« Réf. », « Mandat n° ») ; `externalId` est l'identifiant de l'annonce sur le portail, jamais
   la référence de l'agence ; un particulier perd agence et référence, avec une remarque.
4. **Géocodage** (`GeocodingService.locate`) : adresse exacte d'abord, sinon centroïde de la
   commune ; point, précision (`exact`, `street`, `district`, `commune`), adresse normalisée,
   identifiant BAN et code INSEE reçoivent la provenance `open_data`. Voir plus bas.
5. **Doublons** (`DuplicatesService`) : voir plus bas.
6. **Champs manquants** (`missingListingFields`, dans `contracts`) : parmi
   `REQUIRED_LISTING_FIELDS` (adresse exacte, surface Carrez, charges annuelles, taxe foncière,
   DPE, étage, année de construction, loyer visé), ceux qui sont absents, ou lus par l'IA avec
   une confiance sous `AI_DOUBTFUL_CONFIDENCE` (0,6). Le web les met en évidence ; à la
   création d'une fiche issue de l'IA, chaque champ encore manquant devient une tâche d'origine
   `missing_field` (libellé dans `REQUIRED_LISTING_FIELDS`), sans doublonner la checklist par
   défaut ni une tâche existante au même libellé.
7. **Journal du coût** : une ligne `ActivityLog` par analyse (action `ai.extraction`, canal `web`
   ou `mcp`, membre, modèle, jetons en entrée et en sortie, cache lu et écrit, coût estimé,
   durée, taille du texte, nombre de captures, qualité demandée). Pas de table dédiée : deux
   membres et quelques analyses par jour ne justifient pas une migration ; une agrégation
   mensuelle se fait en SQL sur `activity_logs` (ADR 0007).

### Création après validation

`POST /listings` accepte la fiche telle que l'extraction l'a rendue (`fieldSources` compris) plus
`ignoreDuplicates`. Le serveur :

- conserve la provenance `ai` (confiance, extrait) des champs que le membre n'a pas touchés ; le
  web retire des `fieldSources` les champs modifiés, qui reçoivent alors `user` (daté) ;
- géocode l'adresse si aucun point n'est donné ;
- cherche les doublons probables et les renvoie dans `duplicates` ; ADR 0041 : un doublon probable
  à partir de 0,7, sans fait contraire, bloque la création (409) comme la même référence ;
  `ignoreDuplicates: true` (le membre a vu l'alerte et confirme) est journalisé dans
  `listing.created` ; lot 30 (ADR 0043) : par le connecteur (`create_listing`), ce doublon ne
  bloque pas, l'annonce est créée et l'application demande au membre, sur les deux fiches, si
  c'est le même bien ; lot 18 : un lien déjà celui d'une autre annonce est refusé (409, avec son
  nom), même avec `ignoreDuplicates`, et une annonce de même agence et même référence aussi, sauf
  `ignoreDuplicates` : c'est la même annonce sur un autre portail, son lien s'ajoute à la fiche
  existante (« C'est la même : ajouter ce lien à la fiche », `add_listing_link`) ;
- crée le lien d'origine de l'annonce (lot 18) ;
- pose la checklist par défaut puis les tâches des champs manquants (`createdTasks`).

La réponse est `ListingCreateResult` : l'annonce évaluée, `duplicates`, `createdTasks`.

## Modèles et coût

| Variable        | Défaut             | Rôle                                                                                                       |
| --------------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `AI_MODEL`      | `claude-opus-5-5`  | Extraction par défaut (`quality: precise`)                                                                 |
| `AI_MODEL_BULK` | `claude-haiku-5-5` | Relecture rapide (`quality: fast`) et repli après un refus du modèle par défaut                            |
| `AI_EFFORT`     | `medium`           | Profondeur de réflexion (`low`, `medium`, `high`) ; l'extraction est cadrée par un schéma, `medium` suffit |
| `AI_MAX_TOKENS` | `16000`            | Plafond de sortie, réflexion comprise ; une réponse tronquée est une erreur 502                            |

Coût estimé par analyse (grille `apps/api/src/ai/pricing.ts`, dollars par million de jetons :
Opus 5.5 à 4 $ en entrée, 20 $ en sortie, 0,20 $ en lecture de cache ; Haiku 5.5 à 0,10 $ /
0,50 $) :

- une annonce de portail (3 000 à 5 000 jetons en entrée avec l'invite, 1 000 à 2 000 en
  sortie, réflexion comprise) : **3 à 6 centimes** avec Opus 5.5, moins d'un centime avec
  Haiku 5.5 ;
- une capture d'écran ajoute environ 1 500 jetons par image (après réduction à 1 568 px de
  grand côté par le web) ;
- l'invite système (environ 900 jetons) est servie par le cache de prompt d'un appel au suivant.

Le coût réel de chaque appel est dans `ActivityLog.after.estimatedCostUsd` (null si le modèle
n'est pas dans la grille) et affiché dans l'interface après l'analyse. La grille est à tenir à
jour avec les tarifs d'Anthropic.

### Erreurs

| Situation                                                | Réponse                                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` absente                              | `503` « IA non configurée : renseignez ANTHROPIC_API_KEY côté serveur »           |
| Clé refusée, limite de débit, Anthropic injoignable, 5xx | `503` « Le service IA est indisponible : … » (cause précisée)                     |
| `stop_reason: refusal`                                   | relecture une fois par `AI_MODEL_BULK` ; si refus encore, `422` avec la catégorie |
| `stop_reason: max_tokens`                                | `502` « réponse tronquée » : réduire le texte ou les captures                     |
| Réponse hors schéma                                      | `502` « réponse inexploitable »                                                   |
| Trop de captures ou capture trop lourde                  | `400` (`AI_MAX_IMAGES`, `AI_MAX_IMAGE_MB`)                                        |

Le repli après refus est fait côté client (une seconde requête vers un autre modèle) plutôt que
par le paramètre serveur `fallbacks` : celui-ci vit sur l'espace de noms bêta du SDK, où la
sortie structurée `parse()` n'est pas documentée. Un refus sur une annonce immobilière reste
improbable ; voir ADR 0007.

## Captures d'écran

- Types acceptés : `image/jpeg`, `image/png`, `image/gif`, `image/webp` ; base64 sans préfixe
  `data:`.
- Plafonds : `AI_MAX_IMAGES` captures par analyse (défaut 4, 8 au plus), `AI_MAX_IMAGE_MB` par
  capture (défaut 5, limite de l'API Claude). Le corps JSON de l'API accepte 25 Mo ; **Vercel
  plafonne le corps d'une requête à 4,5 Mo**, d'où la réduction côté web : chaque capture est
  redessinée à 1 568 px de grand côté en JPEG (`apps/web/src/lib/images.ts`) avant l'envoi,
  sauf les GIF.

## Géocodage serveur

`apps/api/src/opendata/geoplateforme.ts` est le client du géocodeur de la Géoplateforme IGN
(`https://data.geopf.fr/geocodage/search/`, successeur de l'API Adresse), sans état : `fetch`
injecté, un appel, un résultat (`point`, `precision`, `label`, `city`, `citycode`, `banId`,
`score`), `null` sous un score de 0,4. Deux enveloppes l'utilisent :

- `GeocodingService` (API) : cache en base dans `ReferenceData` (sorte `geocode`, clé
  `address:…` ou `municipality:…`), y compris les absences de résultat ; délai de 5 s ; `locate`
  ne lance jamais (un géocodeur en panne laisse l'annonce sans point). Appelé à l'extraction, à
  la création sans point, et à la mise à jour quand l'adresse ou la commune change sans point
  fourni. `GEOCODING_URL` permet de changer l'adresse du service.
- `scripts/lib/geocode.ts` (import de l'artefact) : le même client avec un cache sur disque
  (`data/private/geocode-cache.json`) et le mode `--no-geocode`.

Aucun appel réseau dans les tests : `fetch` est remplacé (unitaires), et le harnais e2e pose un
géocodeur qui répond « aucun résultat » par défaut (`ctx.geocoding.fetchImpl`).

## Doublons

`DuplicatesService.find` compare une sonde (lien, adresse, commune, prix, surface, point, ou une
annonce enregistrée qui est alors exclue) à toutes les annonces de l'espace, quel que soit leur
statut (une annonce écartée est un doublon utile à connaître). Motifs, du plus fort au plus
faible (`DUPLICATE_TOLERANCES` dans `contracts`) :

| Motif                         | Règle                                                                                                                                                                                                                         | Score |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `same_url`                    | Même URL normalisée (https, hôte sans `www.`, chemin sans barre finale, paramètres de suivi retirés), comparée à tous les liens de chaque annonce (lot 18) ; les deux formes d'une page Bien'ici sont le même lien (ADR 0041) | 1     |
| `same_reference`              | Lot 18 : même agence (mots génériques retirés, deux mots d'écart au plus) et même référence (espaces, tirets et points ignorés) ; jamais pour un particulier                                                                  | 1     |
| `same_reference_other_agency` | Lot 18 : même référence, autre agence, agence inconnue d'un côté ou autre type de vendeur ; quatre caractères au moins (ADR 0041)                                                                                             | 0,85  |
| `same_address`                | Même adresse normalisée (accents, ponctuation, abréviations, mots vides, code postal et commune retirés), communes compatibles, avec un numéro (ADR 0041)                                                                     | 0,9   |
| `same_commune_price_surface`  | Même commune, surface à ±3 %, prix à ±5 % ; 0,8 aux mêmes valeurs, 0,6 au bord des tolérances (ADR 0041)                                                                                                                      | 0,8   |
| `nearby_similar`              | À moins de 50 m (PostGIS, module `geo`), surface à ±5 %, deux repères à l'adresse (ADR 0041)                                                                                                                                  | 0,7   |

ADR 0041 : un fait contraire connu des deux côtés (autre nombre de pièces, autre étage, surface à
plus de 5 %, DPE à deux classes ou plus, construction à plus de trois ans, même agence avec une
autre référence, deux lieux à plus de 500 m : adresse ou rue par leur point, quartier ou commune par
leur contour, mesurés par PostGIS) écarte un doublon probable ; un DPE à une classe ou un prix à plus de 5 % retirent
0,15 au score ; sous 0,5, rien n'est rendu. `differences` dit ce qui diffère encore.

Chaque candidat porte tous ses motifs et le meilleur score ; lot 18 : `certain` (même lien, ou
même agence et même référence), le vendeur, la référence et le nombre de liens, les certains
d'abord. `POST /listings/duplicates` et l'outil MCP `find_duplicates` exposent la même recherche ;
les règles vivent dans `packages/domain` (`same-listing.ts`, déplacé de l'API au lot 18).

## Interface

Onglet « Coller une annonce » du panneau « Nouvelle annonce » : lien, texte, dépôt ou collage de
captures (réduites avant envoi), bouton « Analyser » avec état d'attente et coût affiché. Le
résultat bascule sur la fiche pré-remplie : pastille de provenance par champ (`IA 95 %` colorée
par la confiance, `annonce`, `vous`, `open data`, `estimé`), extrait justificatif au survol,
champs indispensables manquants mis en évidence (« à compléter »), bandeau des doublons
probables avec lien vers l'annonce existante (« C'est un doublon, ouvrir l'existante » /
« Créer quand même »). Un champ modifié à la main perd sa pastille IA et sera enregistré avec la
provenance `user`. La fiche d'une annonce existante montre les mêmes pastilles et marque les
tâches « IA · champ manquant ».

## Partage mobile et alertes e-mail (lot 6)

- **Partage depuis le téléphone** : la cible de partage de la PWA (`/partager`) remplit
  « Coller une annonce » avec le titre, le texte et le lien que la feuille de partage transmet,
  et lance la même extraction (`POST /listings/extract`, qualité `precise`). Sans clé (503), la
  saisie manuelle reprend le lien, le titre et le texte. Rien n'est téléchargé.
- **Alertes e-mail transférées** (`POST /inbound/email/:workspaceId`, ADR 0015) : chaque
  annonce repérée dans l'e-mail (dix au plus) est extraite séparément, avec son extrait et son
  lien, par le **modèle économique** (`quality: "fast"`, `AI_MODEL_BULK`), au canal `system` ;
  le coût de chaque appel est journalisé comme une extraction ordinaire (`ai.extraction`). Les
  fiches deviennent des brouillons à valider. Sans clé, ou si un appel échoue, l'analyseur
  simple de `contracts/share.ts` prend le lien, le prix, la surface, les pièces et la commune
  quand le texte les dit (provenance « annonce », confiance 0,6) : aucune valeur n'est devinée.
- **Lot 18** : une annonce d'alerte lue avec la même agence et la même référence qu'une annonce
  suivie est rattachée d'office à sa fiche (son lien s'ajoute, origine « reçu dans une alerte
  e-mail », canal `system`) au lieu de devenir un brouillon ; un membre peut la détacher dans
  « À valider ». Un lien déjà en brouillon, à valider ou reconnu, ne revient pas. L'analyseur
  simple ne lit ni le vendeur ni la référence : sans IA, rien n'est rattaché d'office. Au partage
  depuis le téléphone, un doublon certain propose d'ajouter le lien à la fiche existante.

## Vendeur et référence (lot 18)

L'invite système a une règle « Vendeur » : `sellerType` vaut `agency` pour une agence,
`mandatary` pour un mandataire (conseiller indépendant d'un réseau, « agent commercial
immobilier »), `private` pour un particulier (« de particulier à particulier », « sans frais
d'agence »), `null` si l'annonce ne le dit pas ; `agencyName` est le nom de l'agence, ou du réseau
pour un mandataire, jamais celui d'une personne ; `agencyReference` la référence sans son préfixe,
`null` pour un particulier ; `externalId` le numéro de l'annonce sur le portail. Le nom d'un
conseiller ou d'un interlocuteur n'est pas lu ici : il reste dans le contact de l'annonceur
(lot 17), saisi par un membre ou complété par Claude.

## Vérification d'une annonce (lot 15)

`check_listing` (MCP) et `POST /listings/:id/checks/preview` acceptent, à la place des valeurs
lues par Claude (`observed`), le texte de la page (`pageText`, et des captures) : la même
extraction le lit, par le **modèle économique** par défaut (`quality: "fast"`), et son coût est
journalisé (`ai.extraction`) et rendu dans la réponse. Les valeurs lues par Claude priment sur
celles extraites ; la description extraite n'est pas comparée (le modèle la condense). Rien
n'est enregistré : `apply_listing_check` écrit, avec les valeurs que Claude lui passe.

## Variables d'environnement (API)

```
ANTHROPIC_API_KEY=   # vide = IA désactivée (503 sur /listings/extract), le reste fonctionne
AI_MODEL=            # défaut claude-opus-5-5
AI_MODEL_BULK=       # défaut claude-haiku-5-5
AI_EFFORT=           # low | medium (défaut) | high
AI_MAX_TOKENS=       # défaut 16000
AI_MAX_IMAGES=       # défaut 4, 8 au plus
AI_MAX_IMAGE_MB=     # défaut 5
GEOCODING_URL=       # défaut https://data.geopf.fr/geocodage/search/
```

## Limites et suite

- Pas de lecture de PDF ni de pièces jointes de mail : texte et images seulement.
- Le loyer visé n'est jamais extrait (une annonce de vente ne le donne pas) : il reste un champ
  à saisir, transformé en tâche.
- L'extraction ne relit pas une annonce déjà enregistrée (mise à jour d'un prix, retrait) : lot 3
  (`record_price_change`).
- Les ressources MCP (schéma d'annonce, glossaire) annoncées dans l'étude ne sont pas encore
  servies.
- Critère « fini quand » de la feuille de route (dix annonces Leboncoin en moins d'une minute,
  moins de trois corrections) : à mesurer avec une vraie clé, sur des annonces réelles, hors de
  ce dépôt.
