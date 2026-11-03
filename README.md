# apart-localizer

Suivi d'annonces d'achat d'appartement assisté par IA : normalisation des critères, pipeline
partagé (interface web et MCP), carte et critères géographiques, évaluation de la rentabilité et
du prix cible.

Documentation :

- [Étude du besoin](docs/product/etude-du-besoin.md)
- [Modèle de calcul](docs/product/modele-de-calcul.md)
- [Choix techniques](docs/product/tech-stack.md)
- [Feuille de route](docs/product/roadmap.md)
- [Connecteur MCP](docs/mcp.md)
- [Déploiement](docs/deploiement.md)
- [Décisions d'architecture](docs/decisions/README.md)
- [Règles de travail](CLAUDE.md)

## Arborescence

```
apps/
  api/          NestJS 11, Prisma 7 + PostGIS, nestjs-zod, OpenAPI (/api/docs hors production),
                MCP (/mcp, découverte OAuth), throttler, Sentry en option
  web/          Vue 3.5 + Vite, Tailwind 4, TanStack Query et Table, MapLibre GL, reka-ui,
                Supabase Auth, PWA, Sentry en option
packages/
  contracts/    schémas Zod partagés (annonces, hypothèses, GeoJSON, filtres, sorties calculées)
  domain/       calculs purs (coût, rendement, verdict, louabilité, prix cible, sensibilité)
scripts/        import de l'artefact Claude (annonces, réglages, géocodage)
supabase/       configuration du Supabase CLI
docker/         Postgres + PostGIS pour les tests e2e (repli au Supabase CLI)
docs/           produit et décisions
data/private/   exports et caches personnels, jamais commités
```

## Prérequis

- Node 24 et pnpm 12.5.1 (`volta` lit `package.json` ; sinon `corepack enable`).
- Pour la base locale : le [Supabase CLI](https://supabase.com/docs/guides/local-development)
  (`brew install supabase/tap/supabase`) avec Docker ou podman, ou à défaut podman/docker seul
  pour `docker/test-db.yml`.

## Installation

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### Base de données : deux voies

**Voie 1, Supabase CLI** (Auth Google, Studio, PostGIS inclus) :

```bash
supabase start            # affiche l'URL de l'API (54321), la base (54322), les clés anon et service_role
```

Avec podman plutôt que Docker Desktop, pointez la CLI vers le socket de la machine podman :
`export DOCKER_HOST=unix://$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')`.
`supabase stop` arrête la pile.

Reportez `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` dans `apps/api/.env` et `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` dans `apps/web/.env`. `DATABASE_URL` vaut
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Pour la connexion Google, renseignez
`SUPABASE_AUTH_GOOGLE_CLIENT_ID` et `SUPABASE_AUTH_GOOGLE_SECRET` dans `supabase/.env` (ignoré
par git) avant `supabase start`.

**Voie 2, conteneur PostGIS seul** (tests e2e, développement sans authentification réelle) :

```bash
pnpm db:test:up           # podman compose (ou docker compose) sur docker/test-db.yml, port 54329
```

`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/apart` pour le développement,
`TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/postgres` pour les e2e (le
harnais crée une base par fichier de test et la supprime). Sur Mac Apple Silicon l'image
`imresamu/postgis` est utilisée car l'image officielle n'existe qu'en amd64 (ADR 0003).

### Migrations

```bash
pnpm --filter @apart/api prisma:deploy     # applique prisma/migrations (PostGIS activé par la première)
pnpm --filter @apart/api prisma:migrate    # crée une migration après un changement de schéma (dev)
```

## Démarrage

```bash
pnpm dev                  # api sur http://localhost:3000, web sur http://localhost:5173, paquets en watch
```

OpenAPI : http://localhost:3000/api/docs. Santé : http://localhost:3000/health. MCP :
`POST http://localhost:3000/mcp` (jeton Supabase en `Authorization: Bearer`), découverte sur
`/.well-known/oauth-protected-resource` et `/.well-known/oauth-authorization-server` ; outils
et garde-fous dans [docs/mcp.md](docs/mcp.md).

### Écrans du web

- **Synthèse** (`/`) : compteurs (nouvelles, suivies, dans la cible, meilleur brut, prix moyen au
  m², à visiter), répartition par statut, tâches ouvertes et en retard, nouvelles annonces,
  meilleures annonces.
- **Annonces** (`/annonces`) : filtres partagés (statut, commune, verdict, DPE, prix, recherche,
  « nouvelles pour moi », point et rayon) synchronisés avec l'URL, trois vues : tableau
  comparatif (TanStack Table, tri par colonne), cartes (mobile), carte MapLibre (marqueurs colorés
  par verdict ou statut, popup vers la fiche, clic = point du filtre, curseur de rayon).
- **Fiche** (`/annonces/:id`) : panneau latéral (plein écran sur mobile) avec aperçu en direct des
  indicateurs calculé dans le navigateur par `packages/domain`, contrôles de louabilité,
  formulaire complet (bien, charges, travaux avec postes, phase 2, hypothèses surchargées),
  changement de statut avec garde-fou, avis des deux membres, tâches, historique des prix.
  L'ouverture marque l'annonce « vue » pour le membre ; le badge « nouvelle » s'éteint pour lui
  seul.
- **Hypothèses** (`/hypotheses`) : hypothèses de l'espace, versionnées.

Fond de carte : `VITE_MAP_STYLE_URL` dans `apps/web/.env`, par défaut le style libre et sans clé
d'OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`).

## Qualité et tests

```bash
pnpm lint
pnpm format:check
pnpm type-check
pnpm test                 # unitaires (contracts, domain, api, web, scripts) puis e2e de l'API
pnpm --filter @apart/domain test:cov
pnpm build
```

Les e2e (REST, géo, collaboration, MCP par appels JSON-RPC réels) demandent `TEST_DATABASE_URL`
(voie 2 ci-dessus, ou le Postgres du Supabase CLI sur 54322). Les tests du web mockent MapLibre
et Supabase : aucun réseau. La CI GitHub Actions (`.github/workflows/ci.yml`) rejoue lint,
format, type-check, unitaires, e2e sur un service PostGIS, puis le build.

## Import des données de l'artefact

Placez l'export dans `data/private/artifact-export/` (`annonces/*.json`,
`reglages/financement.json`), puis :

```bash
pnpm import:artifact -- --richard-email richard@exemple.fr --chloe-email chloe@exemple.fr
pnpm import:artifact -- --no-geocode      # hors ligne : cache de géocodage seul
pnpm import:artifact -- --dry-run         # affiche la correspondance sans écrire
```

L'import crée l'espace « Richard et Chloé » et ses deux membres (rattachés à leur compte Google à
la première connexion grâce à l'e-mail, ADR 0004), les hypothèses, les annonces avec travaux,
phase 2, avis, tâches et « vu par ». Les adresses sont géocodées par la Géoplateforme IGN avec
un cache dans `data/private/geocode-cache.json` ; une annonce sans adresse exacte reçoit le
centroïde de sa commune (précision `commune`) et une tâche « demander l'adresse exacte ».
Relancer l'import est sans effet sur les annonces déjà présentes.

## Déploiement

Vercel pour `apps/web` (statique) et `apps/api` (fonctions Node, `build:vercel`), Supabase
cloud pour la base et l'authentification (Google, serveur OAuth 2.1 pour le MCP), Sentry en
option. Étapes concrètes, variables et déclaration du connecteur dans claude.ai :
[docs/deploiement.md](docs/deploiement.md).
