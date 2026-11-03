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
   mode transaction (port 6543, pour `DATABASE_URL` de l'API serverless) et la connexion
   **directe** (port 5432, pour `DIRECT_URL`, utilisée par `prisma migrate deploy`).
5. **Google OAuth** : dans Google Cloud Console, créer un identifiant OAuth 2.0 de type
   application web avec, en URI de redirection autorisée, l'URL de rappel que Supabase affiche
   dans « Authentication → Providers → Google » (`https://<ref>.supabase.co/auth/v1/callback`).
   Reporter l'identifiant client et le secret dans ce même écran Supabase.
6. **URL de redirection** : dans « Authentication → URL Configuration », mettre le `Site URL` à
   l'URL du web (`https://<web>.vercel.app`) et ajouter aux `Redirect URLs` cette URL et
   `https://<web>.vercel.app/**`, plus `http://localhost:5173/**` pour le développement.
7. **Serveur OAuth 2.1 (MCP)** : dans « Authentication → OAuth Server » (ou l'écran équivalent
   du tableau de bord), activer le serveur OAuth. Deux points à vérifier dans l'interface, car ils
   conditionnent la déclaration du connecteur :
   - l'**enregistrement dynamique des clients** (claude.ai s'enregistre ainsi) ou, à défaut, la
     création manuelle d'un client avec l'URL de rappel que claude.ai indique au moment d'ajouter
     le connecteur ;
   - la possibilité de déclarer des **portées personnalisées** `listings:read` et
     `listings:write`. Si le tableau de bord ne le permet pas, les jetons ne portent pas de
     revendication `scope` et le garde accorde lecture et écriture (ADR 0005) ; le connecteur
     fonctionne, sans la restriction lecture seule.
8. Vérifier que `https://<ref>.supabase.co/auth/v1/.well-known/oauth-authorization-server`
   répond : c'est ce que l'API relaie sur `/.well-known/oauth-authorization-server`. En local,
   le serveur OAuth du Supabase CLI est désactivé (`[auth.oauth_server] enabled = false` dans
   `supabase/config.toml`) et ce relais répond 503 ; passer `enabled = true` puis redémarrer la
   pile pour tester le flux complet hors cloud.

## 2. Migration Prisma en production

Les migrations s'appliquent avec la connexion directe, jamais le pooler.

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

## 3. Projet Vercel : API

Nouveau projet depuis le dépôt GitHub, **Root Directory** `apps/api`, framework « Other ». Le
`vercel.json` fixe la région (`cdg1`), les commandes d'installation et de build (`build:vercel`)
et le dossier de sortie (`dist`). Variables d'environnement (Production, et Preview si besoin) :

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

Après le premier déploiement : `GET https://<api>.vercel.app/health` doit répondre `200` avec
`checks.postgis.status: "ok"`, et `GET /.well-known/oauth-protected-resource` doit annoncer
`resource: "https://<api>.vercel.app/mcp"` et le serveur d'autorisation Supabase.

## 4. Projet Vercel : web

Second projet, **Root Directory** `apps/web`, framework Vite (le `vercel.json` fixe la réécriture
SPA et les en-têtes de sécurité, dont une CSP qui autorise les tuiles et polices en `https:`).
Variables :

| Variable                 | Valeur                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | `https://<ref>.supabase.co`                                                              |
| `VITE_SUPABASE_ANON_KEY` | clé `anon`                                                                               |
| `VITE_API_URL`           | `https://<api>.vercel.app`                                                               |
| `VITE_MAP_STYLE_URL`     | facultatif ; défaut OpenFreeMap `https://tiles.openfreemap.org/styles/liberty`, sans clé |
| `VITE_SENTRY_DSN`        | DSN du projet Sentry « web » (vide = inactif)                                            |

Les variables `VITE_VERCEL_ENV` et `VITE_VERCEL_GIT_COMMIT_SHA` viennent des variables système
de Vercel si l'option « Automatically expose System Environment Variables » est cochée ; elles
servent à Sentry (environnement, version).

Vérifier ensuite la connexion Google depuis le web déployé, puis que la liste des annonces et la
carte s'affichent (la carte charge les tuiles OpenFreeMap sans clé).

## 5. Connecteur MCP dans claude.ai

1. Dans claude.ai, « Paramètres → Connecteurs → Ajouter un connecteur personnalisé » : URL
   `https://<api>.vercel.app/mcp`. claude.ai lit `/.well-known/oauth-protected-resource`, trouve
   le serveur d'autorisation Supabase, s'y enregistre (enregistrement dynamique) ou utilise le
   client déclaré à la main, puis ouvre la page de consentement Supabase : se connecter avec le
   compte Google de l'espace.
2. Portées à accorder : `listings:read` et `listings:write` (si le serveur les propose ; sinon le
   jeton vaut les deux, ADR 0005).
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

## 7. Liste de contrôle

- [ ] Projet Supabase créé, PostGIS actif, Google configuré, URL de redirection du web ajoutées.
- [ ] Serveur OAuth 2.1 activé ; enregistrement dynamique ou client manuel ; portées déclarées si
      possible.
- [ ] Migrations appliquées (`prisma:deploy` avec la connexion directe), import de l'artefact
      fait avec les bons e-mails.
- [ ] Projet Vercel API déployé, `/health` et `/.well-known/oauth-protected-resource` vérifiés.
- [ ] Projet Vercel web déployé, connexion Google et carte vérifiées.
- [ ] Connecteur déclaré dans claude.ai, `list_listings` puis `create_listing` testés.
- [ ] `ANTHROPIC_API_KEY` posée sur le projet Vercel API, puis « Coller une annonce » testé
      depuis le web (coût affiché) et `extract_listing` depuis claude.ai.
- [ ] Sentry : DSN posés si souhaité.
