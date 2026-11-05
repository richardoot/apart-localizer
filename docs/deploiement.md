# Déploiement

Cible : Vercel pour l'API (`apps/api`, fonctions Node) et le web (`apps/web`, statique),
Supabase cloud pour Postgres + PostGIS et l'authentification (Google, et serveur OAuth 2.1 pour
le connecteur MCP), Sentry en option. Aucune valeur n'est donnée ici : chaque clé se lit dans le
tableau de bord du service concerné et ne va que dans les variables d'environnement, jamais dans
le dépôt.

## 1. Projet Supabase cloud

1. Créer un projet (région Europe de l'Ouest, par exemple Paris ou Francfort).
2. **PostGIS** : la première migration Prisma fait `CREATE EXTENSION IF NOT EXISTS postgis` ; sur
   Supabase l'extension est disponible et s'active aussi depuis « Database → Extensions ». Vérifier
   après la migration que `SELECT PostGIS_Lib_Version()` répond (c'est ce que `/health` teste).
3. Relever dans « Project Settings → API » : l'URL du projet (`https://<ref>.supabase.co`), la
   clé `anon` (web) et la clé `service_role` (API seulement).
4. Relever dans « Project Settings → Database » les deux chaînes de connexion : le **pooler** en
   mode transaction (port 6543, pour `DATABASE_URL` de l'API serverless) et le **pooler en mode
   session** (même hôte `aws-0-<région>.pooler.supabase.com`, utilisateur `postgres.<ref>`, port
   5432), pour `DIRECT_URL`, utilisée par `prisma migrate deploy`. La connexion directe
   `db.<ref>.supabase.co` n'a qu'une adresse IPv6 sans l'option IPv4 payante : ni le build Vercel
   ni un poste en IPv4 ne la joignent, alors que le mode session accepte DDL et verrous
   consultatifs. Un mot de passe avec des caractères spéciaux s'écrit encodé (`@` → `%40`).
5. **Google OAuth** : dans Google Cloud Console, créer un identifiant OAuth 2.0 de type
   application web avec, en URI de redirection autorisée, l'URL de rappel que Supabase affiche
   dans « Authentication → Providers → Google » (`https://<ref>.supabase.co/auth/v1/callback`).
   Reporter l'identifiant client et le secret dans ce même écran Supabase.
6. **URL de redirection** : dans « Authentication → URL Configuration », mettre le `Site URL` à
   l'URL du web (`https://<web>.vercel.app`) et ajouter aux `Redirect URLs` cette URL et
   `https://<web>.vercel.app/**`, plus `http://localhost:5173/**` pour le développement.
7. **Serveur OAuth 2.1 (MCP)** : dans « Authentication → OAuth Server » (ou l'écran équivalent
   du tableau de bord), activer le serveur OAuth, puis :
   - **chemin d'autorisation** `/oauth/consent` : GoTrue envoie la personne sur `Site URL` +
     ce chemin, la page de consentement du web (`https://<web>.vercel.app/oauth/consent`) ; sans
     ce réglage, l'autorisation du connecteur n'aboutit pas ;
   - l'**enregistrement dynamique des clients** (claude.ai s'enregistre ainsi) ou, à défaut, la
     création manuelle d'un client avec l'URL de rappel que claude.ai indique au moment d'ajouter
     le connecteur ;
   - **portées** : GoTrue ne délivre que des portées OpenID ; la découverte de l'API annonce
     `email` et un jeton OAuth vaut lecture et écriture, sans suppression (ADR 0017). Les jetons
     sont signés par une clé asymétrique si le projet en a une (recommandé, obligatoire pour la
     portée `openid`).
8. Vérifier que `https://<ref>.supabase.co/auth/v1/.well-known/oauth-authorization-server`
   répond : c'est ce que l'API relaie sur `/.well-known/oauth-authorization-server`. En local,
   `supabase/config.toml` active le serveur OAuth avec les mêmes réglages
   ([développement local](developpement-local.md#tester-le-mcp-en-local)).

   **Connexion par e-mail** : désactiver le fournisseur « Email » (« Authentication →
   Providers ») pour que Google reste le seul moyen de se connecter, comme dans l'interface (le
   formulaire e-mail n'existe qu'en local, `VITE_AUTH_PASSWORD`, ADR 0016). Ne jamais poser
   `VITE_AUTH_PASSWORD` sur le projet Vercel du web.

   **Adresses vérifiées (lot 8)** : une invitation (ou un membre importé) ne se rattache qu'à un
   compte dont l'adresse est vérifiée : `email_confirmed_at` renseigné par GoTrue, et Google ne
   disant pas `email_verified: false` (ADR 0018). Si le fournisseur « Email » devait un jour être
   ouvert, garder « Confirm email » activé : sans confirmation, GoTrue tiendrait pour vérifiée
   n'importe quelle adresse saisie, et quiconque l'écrirait prendrait l'invitation.

### Stockage des photos de visite (lot 6)

9. **Storage** : dans « Storage → New bucket », créer le bucket `visit-photos` (ou le nom donné à
   `STORAGE_BUCKET_VISIT_PHOTOS`) **privé** (« Public bucket » décoché), taille maximale
   `10 MB`, types autorisés `image/jpeg, image/png, image/webp`. Équivalent SQL (éditeur SQL du
   tableau de bord) :

   ```sql
   insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
   values ('visit-photos', 'visit-photos', false, 10485760,
           array['image/jpeg', 'image/png', 'image/webp']);
   ```

10. **Politiques** : n'en ajouter **aucune** sur `storage.objects` pour ce bucket. L'API passe
    par la clé `service_role` (qui contourne la RLS) et ne donne au navigateur que des URL
    signées : une URL d'envoi à usage unique (valable deux heures, durée fixée par Supabase) et
    des URL de lecture de 600 s (`STORAGE_SIGNED_URL_TTL_SECONDS`). Une politique pour `anon` ou
    `authenticated` ouvrirait les photos hors de l'API. Les objets sont rangés
    `<espace>/<annonce>/<visite>/<photo>.jpg` (ADR 0014).
11. Vérifier après le déploiement : ajouter une visite et une photo depuis le web, puis
    « Storage → visit-photos » montre le dossier de l'espace ; ouvrir l'URL publique de l'objet
    (`…/storage/v1/object/public/visit-photos/…`) doit échouer.

En local, `supabase/config.toml` active Storage et déclare ce bucket : après la mise à jour,
`supabase stop && supabase start` (les données de la base sont conservées), puis
`supabase seed buckets` le crée avec ses réglages (privé, 10 Mio, jpeg/png/webp).

## 2. Migration Prisma en production

Les migrations s'appliquent par `DIRECT_URL` (pooler en mode session, § 1), jamais par le pooler en mode transaction.

```bash
cd apps/api
DIRECT_URL='<connexion directe>' DATABASE_URL='<connexion directe>' pnpm prisma:deploy
```

`build:vercel` (`apps/api/package.json`) enchaîne `prisma generate`, `prisma migrate deploy` et
`nest build` : avec `DIRECT_URL` renseignée dans les variables Vercel, chaque déploiement
applique les migrations en attente avant de servir. Pour une migration lourde, la lancer à la main
avant de déployer. Ne jamais lancer `prisma migrate dev` contre la production.

Import des annonces de l'artefact dans le cloud (une fois) :

```bash
pnpm import:artifact -- --database-url '<connexion directe>' --richard-email <e-mail Google de Richard> --chloe-email <e-mail Google de Chloé>
```

Les e-mails doivent être ceux des comptes Google : le rattachement se fait à la première connexion
(ADR 0004).

Lot 8 (`20261104120000_lot8_invitations`) : migration purement additive (statut des membres,
dates d'invitation, d'arrivée et de retrait, notification `member_joined`) ; les membres existants
deviennent `active` sans changer de rôle (Richard propriétaire, Chloé membre). Une troisième
personne s'invite ensuite depuis la page « Espace » du web (ADR 0018).

### Données ouvertes (lot 4)

Les tables de référence (zonage et arrêté de l'encadrement, arrêts TBM, ventes DVF) ne sont pas
dans les migrations : elles se chargent depuis les fichiers téléchargés dans `data/opendata/`
(sources, URL, licences et dates dans [open-data.md](open-data.md)), depuis un poste, avec la
connexion directe. Commencer par `--dry-run` pour lire les comptes sans rien écrire :

```bash
pnpm import:rent-control -- --database-url '<connexion directe>'
pnpm import:transit-stops -- --database-url '<connexion directe>'
pnpm import:dvf -- --year 2024 --database-url '<connexion directe>'
pnpm geocode:missing -- --dry-run --database-url '<connexion directe>'
```

Les imports sont idempotents (relancer ne crée pas de doublon) et se rafraîchissent au rythme
décrit dans [open-data.md](open-data.md) (arrêté de l'encadrement chaque année, DVF à chaque
nouvelle année publiée). Sans ces imports, l'API répond quand même : la desserte, le plafond et
les comparables passent « à vérifier » ou « indisponible ». Le DPE (ADEME), le géocodage et les
isochrones (Géoplateforme) sont appelés à la demande, sans clé, avec un cache dans
`reference_data`.

### Équipements et quartiers (lot 11)

Migration `20261105120000_lot11_amenities_neighbourhoods` : purement additive (tables
`amenities` et `neighbourhoods`, trois types énumérés, index GiST), aucune table existante
touchée ; appliquée par `prisma:deploy` comme les autres (ou par `build:vercel`). Ensuite, depuis
un poste, avec la connexion directe et dans cet ordre (chaque commande d'abord en `--dry-run`
pour lire les comptes) :

```bash
# 1. Contours des quartiers (datahub de Bordeaux Métropole + WFS IRIS de la Géoplateforme)
pnpm import:neighbourhoods -- --download --database-url '<connexion directe>'
# 2. Pistes d'athlétisme (Data ES + Overpass) et salles Fitness Park (Overpass)
pnpm import:sports-facilities -- --download --database-url '<connexion directe>'
# 3. Supermarchés avec drive (Overpass)
pnpm import:supermarkets -- --download --database-url '<connexion directe>'
# 4. Rattrapage du contexte des annonces existantes (quartier et équipements proches)
pnpm refresh:surroundings -- --dry-run --database-url '<connexion directe>'
pnpm refresh:surroundings -- --database-url '<connexion directe>'
```

`--download` lit les sources en ligne (URL et requêtes dans [open-data.md](open-data.md)) ; sans
lui, les scripts lisent les fichiers de `data/opendata/` (`quartiers/`, `iris/`, `res/`,
`osm/`). Overpass est un service public partagé : en cas de refus (429, 504), attendre quelques
minutes et relancer, ou télécharger la réponse une fois (`--print-query` pour la requête des
supermarchés) et passer `--file`. Les imports sont idempotents (chaque source remplace ses
lignes) ; le rattrapage ne réécrit que la clé `surroundings` de l'instantané des annonces dont
le résultat change, avec une ligne de journal `listing.enriched` (canal `system`), et ne touche
plus rien à la deuxième passe. Une annonce créée ou dont l'adresse change ensuite reçoit son
quartier et ses équipements à l'enregistrement. Sans ces imports, la fiche affiche « non
disponible ».

### Placement des annonces (lot 12)

Migration `20261105180000_lot12_listing_placement` : purement additive (colonnes facultatives
`listings.location_placement` et `listings.location_area`, NULL pour les annonces existantes ;
table `places` des lieux-dits OpenStreetMap et son index GiST), aucune donnée réécrite ;
appliquée par `prisma:deploy` (ou `build:vercel`) comme les autres. Les quartiers du lot 11
doivent être importés avant. Ensuite, depuis un poste, avec la connexion directe et dans cet
ordre :

```bash
# 1. Migration (si build:vercel ne l'a pas déjà appliquée)
cd apps/api && DIRECT_URL='<connexion directe>' DATABASE_URL='<connexion directe>' pnpm prisma:deploy && cd ../..
# 2. Lieux-dits OpenStreetMap (fichier data/opendata/osm/quartiers-places.json, ou --download)
pnpm import:places -- --dry-run
pnpm import:places -- --database-url '<connexion directe>'
# 3. Rattrapage du repère des annonces au centre de la commune, au quartier ou sans repère :
#    d'abord la simulation (« annonce : avant → après (quartier) »), relue, puis en vrai
pnpm relocate:listings -- --dry-run --database-url '<connexion directe>'
pnpm relocate:listings -- --database-url '<connexion directe>'
```

Le rattrapage ne touche jamais une annonce à l'adresse (numéro ou rue) ni un point saisi, ne
redescend jamais une précision, recalcule l'instantané de contexte (desserte, marché,
encadrement, quartier et équipements) de chaque annonce replacée et l'écrit au journal
(`listing.relocated`, canal `system`) ; une deuxième passe ne change rien. Il n'appelle aucun
service en ligne. Une annonce sans repère dont seule la commune est connue reçoit le point
intérieur de sa commune (contours importés) ; une annonce sans commune reste à géocoder
(`geocode:missing`). Sans `import:places`, seuls les contours servent (aucune erreur). Après
le déploiement du web, la première visite recharge la page une fois pour passer à la nouvelle
version (service worker, ADR 0022).

### Suivi des mises à jour des annonces (lot 15)

Migration `20261106110000_lot15_listing_checks` : purement additive (colonnes facultatives
`listings.last_checked_at`, `listings.last_seen_online_at` et `listings.republished_from_id`,
NULL pour les annonces existantes, qui sont donc « jamais vérifiées » ; table `listing_checks` ;
énumération `ListingCheckOutcome` ; valeur `listing_checked` de `NotificationType`), aucune
donnée réécrite ; appliquée par `prisma:deploy` (ou `build:vercel`) comme les autres. Ni
variable, ni import, ni rattrapage. Après le déploiement, la liste montre « À revérifier » pour
les annonces actives ajoutées il y a plus de sept jours ; le connecteur claude.ai découvre les
deux outils et le prompt nouveaux à sa prochaine lecture de `tools/list` (nouvelle conversation ;
le reconnecter s'ils n'apparaissent pas).

### Adéquation aux critères (lot 14)

Migration `20261106100000_lot14_criteria_fit` : purement additive (énumération
`CriteriaFitLevel` ; `search_criteria.tolerance`, JSON vide par défaut = marge par défaut ;
`criteria_matches` gagne le niveau, les raisons, le détail et la date du changement, les lignes
existantes valant « dans les critères » ; `listings.criteria_fit_level`, `criteria_fit_changed_at`
et `criteria_fit_origin`, NULL pour les annonces existantes ; deux index), aucune donnée réécrite ;
appliquée par `prisma:deploy` (ou `build:vercel`) comme les autres. Ensuite, depuis un poste, avec
la connexion directe :

```bash
# 1. Migration (si build:vercel ne l'a pas déjà appliquée)
cd apps/api && DIRECT_URL='<connexion directe>' DATABASE_URL='<connexion directe>' pnpm prisma:deploy && cd ../..
# 2. Rattrapage de l'adéquation : d'abord la simulation (« annonce : avant → après (critère :
#    raisons) »), relue, puis en vrai
pnpm refresh:criteria-fit -- --dry-run --database-url '<connexion directe>'
pnpm refresh:criteria-fit -- --database-url '<connexion directe>'
```

Le rattrapage compare chaque annonce aux critères actifs de son espace avec les règles de l'API
(mesures PostGIS, décision de `domain`), écrit le niveau de chaque critère et le meilleur sur
l'annonce, journalise chaque changement (`criteria.matched`, `criteria.unmatched`,
`criteria.fit_changed`, canal `system`, cause « rattrapage ») sans notification ni « ce qui a
changé », et ne change rien à la deuxième passe. Il n'appelle aucun service en ligne et ne touche
pas à la date de modification des annonces. Tant qu'aucun critère n'existe (cas de la production
au déploiement), il ne fait qu'écrire « dans les critères » sur les annonces : le premier critère
créé dans l'application compare ensuite toutes les annonces, sans alerte. À relancer après un
import d'arrêts TBM ou de contours (les mesures changent sans écriture d'annonce) ;
`relocate:listings` recalcule lui-même l'adéquation des annonces qu'il replace, et
`stack:up --opendata` enchaîne le rattrapage en local.

## 3. Projet Vercel : API

Projet `apart-localizer-backend` relié au dépôt GitHub, **Root Directory** `apps/api`, framework
NestJS (avec « Other », Vercel servirait `dist` comme des fichiers statiques), Node 24.x. Le
`vercel.json` fixe la région (`dub1`, Dublin, à côté de la base Supabase en `eu-west-1`), les
commandes d'installation et de build et le dossier de sortie (`dist`). Le build compile d'abord
les paquets partagés (`pnpm -w build:packages`), puis lance `build:vercel`, qui applique les
migrations et vérifie que l'application se charge sans `require(esm)`, comme dans le runtime
Vercel : `contracts` et `domain` sont publiés en ESM et en CommonJS (`dist/index.cjs`) pour
cela. Sur le plan Hobby, Vercel bloque le déploiement d'un dépôt **privé** quand l'adresse de l'auteur
du commit n'est liée à aucun compte GitHub (« couldn't find a Git account for the commit
author ») : le dépôt est public, sinon il faut committer avec une adresse liée au compte GitHub.
Un déploiement bloqué ne se relance pas, il faut un nouveau commit. Variables d'environnement (Production, et Preview si besoin) :

| Variable                                                         | Valeur                                                                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                   | chaîne du pooler Supabase (transaction, 6543), avec `?pgbouncer=true` si Prisma le demande                             |
| `DIRECT_URL`                                                     | connexion directe (5432), pour les migrations au build                                                                 |
| `SUPABASE_URL`                                                   | `https://<ref>.supabase.co`                                                                                            |
| `SUPABASE_SERVICE_ROLE_KEY`                                      | clé `service_role`                                                                                                     |
| `SUPABASE_EXTERNAL_URL`                                          | identique à `SUPABASE_URL` en cloud (peut rester vide)                                                                 |
| `MCP_PUBLIC_URL`                                                 | `https://<api>.vercel.app/mcp` (recommandé : l'URL exacte annoncée au connecteur)                                      |
| `FRONTEND_URL`                                                   | `https://<web>.vercel.app` (plusieurs origines séparées par des virgules)                                              |
| `NODE_ENV`                                                       | `production`                                                                                                           |
| `SENTRY_DSN`                                                     | DSN du projet Sentry « api » (vide = Sentry inactif)                                                                   |
| `THROTTLE_LIMIT`, `THROTTLE_TTL_MS`                              | facultatif, défauts 300 requêtes par 60 000 ms et par adresse                                                          |
| `ANTHROPIC_API_KEY`                                              | clé Anthropic (console.anthropic.com), côté API seulement ; vide = extraction IA désactivée (503), le reste fonctionne |
| `AI_MODEL`, `AI_MODEL_BULK`                                      | facultatif, défauts `claude-opus-5-5` et `claude-haiku-5-5` ([ia.md](ia.md))                                           |
| `AI_EFFORT`, `AI_MAX_TOKENS`, `AI_MAX_IMAGES`, `AI_MAX_IMAGE_MB` | facultatif ; Vercel plafonne le corps d'une requête à 4,5 Mo, le web réduit les captures avant envoi                   |
| `GEOCODING_URL`                                                  | facultatif, défaut Géoplateforme IGN                                                                                   |
| `ISOCHRONE_URL`                                                  | facultatif, défaut Géoplateforme IGN (`https://data.geopf.fr/navigation/isochrone`)                                    |
| `ADEME_DPE_URL`                                                  | facultatif, défaut API data-fair de l'ADEME (jeu `dpe03existant`)                                                      |
| `GEORISQUES_URL`                                                 | facultatif, défaut rapport de risques Géorisques v1 (`https://www.georisques.gouv.fr/api/v1/resultats_rapport_risque`) |
| `STORAGE_BUCKET_VISIT_PHOTOS`                                    | facultatif, défaut `visit-photos` (bucket privé, § 1)                                                                  |
| `STORAGE_SIGNED_URL_TTL_SECONDS`                                 | facultatif, défaut 600 (30 à 3 600) : validité des URL de lecture des photos                                           |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`         | web push (§ 7) ; vides = push désactivé, la cloche reste                                                               |
| `EMAIL_HTTP_URL`, `EMAIL_FROM`, `EMAIL_HTTP_TOKEN`               | facultatif, e-mail de notification (§ 8) ; vides = inerte                                                              |
| `INBOUND_EMAIL_SECRET`                                           | secret HMAC du webhook d'alertes e-mail (§ 9), 32 caractères au moins ; vide = webhook désactivé (503)                 |
| `INVITATION_TTL_DAYS`                                            | facultatif, défaut 14 (1 à 90) : durée de validité d'une invitation à rejoindre l'espace (lot 8)                       |

Après le premier déploiement : `GET https://<api>.vercel.app/health` doit répondre `200` avec
`checks.postgis.status: "ok"`, et `GET /.well-known/oauth-protected-resource` doit annoncer
`resource: "https://<api>.vercel.app/mcp"` et le serveur d'autorisation Supabase.

## 4. Projet Vercel : web

Projet `apart-localizer-frontend`, **Root Directory** `apps/web`, framework Vite, Node 24.x (le `vercel.json` fixe la réécriture
SPA et les en-têtes de sécurité, dont une CSP qui autorise les tuiles et polices en `https:`).
Variables :

| Variable                 | Valeur                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | `https://<ref>.supabase.co`                                                                                                                                 |
| `VITE_SUPABASE_ANON_KEY` | clé `anon`                                                                                                                                                  |
| `VITE_API_URL`           | `https://<api>.vercel.app`                                                                                                                                  |
| `VITE_MAP_STYLE_URL`     | facultatif ; remplace le fond « Plan OSM » (défaut OpenFreeMap `https://tiles.openfreemap.org/styles/liberty`, sans clé) ; les fonds IGN n'en dépendent pas |
| `VITE_SENTRY_DSN`        | DSN du projet Sentry « web » (vide = inactif)                                                                                                               |

Les variables `VITE_VERCEL_ENV` et `VITE_VERCEL_GIT_COMMIT_SHA` viennent des variables système
de Vercel si l'option « Automatically expose System Environment Variables » est cochée ; elles
servent à Sentry (environnement, version).

Vérifier ensuite la connexion Google depuis le web déployé, puis que la liste des annonces et la
carte s'affichent (la carte charge les tuiles OpenFreeMap sans clé), puis les fonds « Plan IGN » et
« Photo aérienne » (tuiles `data.geopf.fr`, sans clé, autorisées par la CSP en `https:`).

## 5. Connecteur MCP dans claude.ai

1. Dans claude.ai, « Paramètres → Connecteurs → Ajouter un connecteur personnalisé » : URL
   `https://<api>.vercel.app/mcp`. claude.ai lit `/.well-known/oauth-protected-resource`, trouve
   le serveur d'autorisation Supabase, s'y enregistre (enregistrement dynamique) ou utilise le
   client déclaré à la main, puis ouvre la page de consentement du web (`/oauth/consent`) : se
   connecter avec le compte Google de l'espace, puis « Autoriser ».
2. Portées : la page de consentement montre celles que claude.ai demande (`email`) ; le jeton
   vaut lecture et écriture, sans suppression (ADR 0017).
3. Tester dans une conversation : « Liste mes annonces à visiter » (`list_listings`), puis depuis
   une page d'annonce avec Claude in Chrome : le prompt « Analyser cette annonce »
   (`extract_listing`, confirmation, `create_listing`). L'annonce doit apparaître « nouvelle »
   dans le web pour l'autre membre, avec ses pastilles de provenance.

Les outils, paramètres et garde-fous sont décrits dans [mcp.md](mcp.md).

## 6. Sentry (facultatif)

Deux projets (plateforme Node pour l'API, Vue pour le web). Coller chaque DSN dans la variable
du projet Vercel correspondant ; sans DSN, le SDK n'est pas initialisé. Les options ne collectent
ni corps de requête, ni chaîne de requête, ni cookies ; le membre est un identifiant opaque, les
URL des fils d'Ariane sont anonymisées (`apps/api/src/common/sentry.ts`, `apps/web/src/lib/sentry.ts`).

## 7. Web push (lot 6)

1. Générer une paire de clés VAPID, **une fois**, sur un poste :

   ```bash
   pnpm --filter @apart/api exec web-push generate-vapid-keys
   ```

   Garder la clé privée hors du dépôt (gestionnaire de mots de passe) ; la perdre oblige les
   appareils à se réabonner.

2. Sur le projet Vercel API : `VAPID_PUBLIC_KEY` (clé publique), `VAPID_PRIVATE_KEY` (clé
   privée), `VAPID_SUBJECT` (`mailto:` suivi d'une adresse de contact, ou `https://` et l'URL du
   web). Redéployer.
3. Sur chaque téléphone : ouvrir le web déployé (https), l'installer (« Ajouter à l'écran
   d'accueil » ; obligatoire sur iPhone pour le push), puis « Notifications → Activer sur cet
   appareil ». Le service worker de la PWA (build seulement, pas `pnpm dev`) reçoit les messages
   (`public/push-handler.js`).
4. Vérifier : l'autre membre ajoute une annonce ; une notification arrive sur l'appareil et
   ouvre la fiche. Un abonnement expiré (404 ou 410) est retiré tout seul.

## 8. E-mail de notification (facultatif)

Sans configuration, la colonne « E-mail » des préférences n'envoie rien (ADR 0015). Pour
l'activer, renseigner `EMAIL_HTTP_URL` (un point d'envoi HTTP qui accepte un POST JSON
`{ from, to: [adresse], subject, text, html }`), `EMAIL_FROM` (expéditeur autorisé chez le
fournisseur) et, s'il en faut un, `EMAIL_HTTP_TOKEN` (envoyé en `Authorization: Bearer`). Ce
corps convient tel quel à certaines API d'envoi transactionnel ; sinon, un petit relais le
traduit. Aucun fournisseur n'est imposé ; choisir et ajouter un SDK serait un nouvel ADR.

Le même envoi porte les **e-mails d'invitation** (lot 8) : sujet « Richard vous invite dans
« … » (apart-localizer) », lien vers `<FRONTEND_URL>/login` (première origine de
`FRONTEND_URL`), adresse invitée et échéance. Sans envoi configuré, ou s'il échoue, la page
« Espace » affiche ce lien pour que le propriétaire le transmette lui-même.

## 9. Alertes e-mail entrantes (lot 6)

Les alertes des portails (SeLoger, Leboncoin, PAP, Bien'ici…) transférées à une adresse dédiée
deviennent des annonces « à valider » sur la synthèse. L'API ne reçoit pas d'e-mail elle-même :
un **service d'e-mails entrants** (au choix : une route d'e-mails entrants d'un fournisseur
transactionnel, un « Email Worker », un script sur une boîte IMAP…) reçoit le message et appelle
le webhook. Rien n'est imposé ; l'adaptateur doit :

1. Produire le corps JSON générique, UTF-8 :
   `{ "from": "…", "to": "…", "subject": "…", "text": "…", "html": "…", "receivedAt": "ISO 8601" }`
   (`text` ou `html` au moins ; tailles bornées par `InboundEmailSchema`).
2. Le signer avec `INBOUND_EMAIL_SECRET` (générer par exemple avec `openssl rand -hex 32`, le
   poser sur Vercel et dans l'adaptateur, jamais dans le dépôt) :

   ```js
   import { createHmac } from 'node:crypto'
   const body = JSON.stringify(email)
   const timestamp = Math.floor(Date.now() / 1000)
   const signature =
     'sha256=' +
     createHmac('sha256', process.env.INBOUND_EMAIL_SECRET)
       .update(`${timestamp}.${body}`)
       .digest('hex')
   await fetch(`https://<api>.vercel.app/inbound/email/${workspaceId}`, {
     method: 'POST',
     headers: {
       'content-type': 'application/json',
       'x-apart-timestamp': String(timestamp),
       'x-apart-signature': signature,
     },
     body,
   })
   ```

   L'horodatage doit être à moins de cinq minutes de l'heure du serveur.

3. Appeler `POST /inbound/email/<identifiant de l'espace>` ; l'identifiant et le chemin exact
   s'affichent dans « Notifications → Transfert d'alertes e-mail ». Réponse `202` :
   `{ candidates, created, skipped, draftIds, extractedBy }`.

Ensuite, dans la boîte qui reçoit les alertes, une règle de transfert vers l'adresse du service.
Avec `ANTHROPIC_API_KEY`, chaque annonce repérée est lue par le modèle économique (quelques
centimes, dix annonces au plus par e-mail) ; sans, l'analyseur simple prend lien, prix, surface,
pièces et commune. Aucune page de portail n'est téléchargée : les liens de suivi des alertes sont
gardés tels quels.

## 10. Partage depuis le téléphone (lot 6)

Une fois le web installé sur l'écran d'accueil d'un téléphone Android, « Partager » depuis
l'application Leboncoin, SeLoger ou le navigateur propose apart-localizer : « Nouvelle annonce »
s'ouvre avec le lien et le texte partagés et lance l'extraction (si `ANTHROPIC_API_KEY` est posée ;
sinon la saisie manuelle reprend le lien). Le manifeste déclare `share_target` en GET vers
`/partager`. Sur iPhone, Safari ne propose pas les applications web installées dans la feuille de
partage (à vérifier à chaque version d'iOS) : copier le lien et utiliser « Coller une annonce ».

## 11. Liste de contrôle

- [ ] Projet Supabase créé, PostGIS actif, Google configuré, URL de redirection du web ajoutées.
- [ ] Serveur OAuth 2.1 activé ; chemin d'autorisation `/oauth/consent` et `Site URL` = le web ;
      enregistrement dynamique ou client manuel ; fournisseur « Email » désactivé.
- [ ] Migrations appliquées (`prisma:deploy` avec la connexion directe), import de l'artefact
      fait avec les bons e-mails.
- [ ] Imports open data faits sur la base cloud (encadrement, arrêts TBM, DVF), puis
      `GET /opendata/status` vérifié (secteurs, arrêté en vigueur, arrêts par mode, ventes par
      année).
- [ ] Projet Vercel API déployé, `/health` et `/.well-known/oauth-protected-resource` vérifiés.
- [ ] Projet Vercel web déployé, connexion Google et carte vérifiées.
- [ ] Connecteur déclaré dans claude.ai, `list_listings` puis `create_listing` testés.
- [ ] `ANTHROPIC_API_KEY` posée sur le projet Vercel API, puis « Coller une annonce » testé
      depuis le web (coût affiché) et `extract_listing` depuis claude.ai.
- [ ] Sentry : DSN posés si souhaité.
- [ ] Migration du lot 6 appliquée (`20261103230000_lot6_visits_notifications`), `/health` vert.
- [ ] Bucket `visit-photos` créé privé (10 Mo, jpeg/png/webp), sans politique ; une visite et
      une photo testées depuis le web, l'URL publique de l'objet refusée.
- [ ] Clés VAPID générées et posées (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) ;
      PWA installée sur les deux téléphones, push activé, notification reçue.
- [ ] Partage depuis l'application Leboncoin ou SeLoger sur Android : « Nouvelle annonce »
      pré-remplie.
- [ ] Si souhaité : `INBOUND_EMAIL_SECRET` posé, service d'e-mails entrants branché et une alerte
      transférée devenue brouillon à valider.
- [ ] Si souhaité : envoi d'e-mails configuré (`EMAIL_HTTP_URL`, `EMAIL_FROM`).
- [ ] Lot 8 : migration `20261104120000_lot8_invitations` appliquée ; page « Espace » : Richard
      propriétaire, Chloé membre ; une invitation envoyée à une troisième adresse, la personne
      connectée avec Google arrive dans l'espace partagé ; une invitation annulée la laisse dans
      son propre espace ; un membre de test retiré n'accède plus à rien (web et connecteur).
- [ ] Fournisseur « Email » fermé (ou « Confirm email » activé) : seules les adresses vérifiées
      rejoignent un espace.
- [ ] Export CSV ouvert dans Excel ou LibreOffice (accents et colonnes justes), export JSON
      gardé comme sauvegarde.
- [ ] Lot 11 : migration `20261105120000_lot11_amenities_neighbourhoods` appliquée ; imports
      `import:neighbourhoods`, `import:sports-facilities`, `import:supermarkets` faits (§ 2),
      `GET /opendata/status` vérifié (équipements par genre, contours par nature) ;
      `refresh:surroundings` passé ; onglet Quartier d'une annonce : quartier, piste, drives,
      Fitness Park ; couches de la carte allumées sur les trois fonds.
- [ ] Lot 12 : migration `20261105180000_lot12_listing_placement` appliquée ; `import:places`
      fait (`GET /opendata/status` : `places`) ; `relocate:listings` relu en simulation puis
      passé ; liste : pastilles « Adresse exacte », « Au quartier (…) », « Commune seulement » ;
      carte : repères pleins, creux et pointillés, contour du quartier au survol ; onglet
      Quartier : distances « ≈ » et « Préciser l'adresse » ; filtre « Repère » ; après le
      déploiement du web, la page se recharge une seule fois.
- [ ] Lot 15 : migration `20261106110000_lot15_listing_checks` appliquée ; onglet Suivi d'une
      annonce : section « Mises à jour », « Vue en ligne aujourd'hui » et « Plus en ligne »
      (statut proposé, appliqué seulement sur accord) ; liste : « À revérifier » et le filtre ;
      dans claude.ai, prompt « Tournée de mise à jour » essayé sur deux ou trois annonces.
- [ ] Lot 14 : migration `20261106100000_lot14_criteria_fit` appliquée ; `refresh:criteria-fit`
      relu en simulation puis passé ; un premier critère créé (avec sa marge) : onglets « Dans les
      critères » et « Hors critères » de la liste, pastilles et raisons, une annonce au quartier
      « à confirmer » et son bloc « Correspond-elle à ce qu'on cherche ? » dans la fiche ;
      `list_listings` depuis claude.ai donne l'adéquation.
