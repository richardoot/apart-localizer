# Choix techniques

Point de départ : la structure de `bankin-analyzer` (monorepo pnpm, Vue 3 + Vite, NestJS,
Prisma, Supabase, MCP dans le backend, Vercel, Sentry, standards dans `agent-os/`). Ce document
dit ce qui est repris, ce qui change et pourquoi.

Décisions arrêtées le 3 novembre 2026 après discussion : **NestJS** conservé plutôt que Hono,
**Prisma 7** conservé plutôt que Drizzle, **PostGIS** activé dès le départ pour les critères de
recherche géographiques, **MapLibre GL** pour la carte. Les raisons sont consignées dans
[docs/decisions](../decisions/).

## 1. Vue d'ensemble

| Brique | bankin-analyzer | apart-localizer | Pourquoi |
| --- | --- | --- | --- |
| Monorepo | pnpm, `frontend/` et `backend/`, `packages/shared` quasi vide | pnpm, `apps/web`, `apps/api`, `packages/domain`, `packages/contracts` | La logique de calcul et les schémas sont partagés et testés une seule fois |
| Langage | TypeScript 6 strict, Node 24, pnpm 12 | Identique, `tsconfig.base.json` repris | Déjà en place et à jour |
| API | NestJS 11, class-validator, Swagger | **NestJS 11** conservé ; validation par **nestjs-zod** à partir des schémas de `contracts` ; OpenAPI généré par `@nestjs/swagger` depuis ces mêmes schémas | Modules, injection, guards et intercepteurs : des conventions qui tiennent quand l'équipe et les cas d'usage grandissent ; un seul schéma par entité au lieu de DTO en doublon |
| MCP | `@modelcontextprotocol/sdk` dans un contrôleur Nest | Identique ; outils déclarés avec les schémas Zod de `contracts` ; garde, découverte OAuth et journal portés depuis bankin-analyzer ; portées `listings:read` et `listings:write` | Transport HTTP « streamable » sans session éprouvé ; la limite « tout jeton peut écrire » est corrigée |
| Accès aux données | Prisma 7 + `@prisma/adapter-pg` | **Prisma 7 + `@prisma/adapter-pg`** conservé ; **PostGIS** activé ; colonnes géographiques en `Unsupported`, requêtes géo en TypedSQL ou `$queryRaw` validé par Zod dans un module `geo` | Réemploi de `PrismaService`, du mapping d'erreurs, du harnais e2e et du pipeline Vercel ; la géo tient en quelques requêtes SQL isolées |
| Base | Postgres (Supabase) | Postgres (Supabase) + extension PostGIS | Filtres par rayon, polygone et isochrone ; arrêt de tram le plus proche ; comparables DVF |
| Auth | Supabase Auth (Google), GoTrue en serveur OAuth 2.1 pour le MCP | Identique, plus les portées lecture et écriture | Le flux MCP vers claude.ai est éprouvé |
| Local | `podman-compose.yml` maison (db, gotrue, kong, meta, studio, api, web) | **Supabase CLI** (`supabase start`, PostGIS inclus) + `pnpm dev` | Moins de fichiers à maintenir, parité avec le cloud |
| Frontend | Vue 3, Pinia, Vue Router, Tailwind 4, ApexCharts | Vue 3.5, Vue Router, Tailwind 4, **TanStack Query** (état serveur), **TanStack Table** (tableau comparatif), **reka-ui** (primitives accessibles), **MapLibre GL JS** + **terra-draw** (carte et dessin de périmètre), Pinia limité à l'état d'interface, `vite-plugin-pwa` | Cache et rafraîchissement des données sans stores manuels ; tri, filtres et colonnes figées ; carte vectorielle performante sur mobile ; hors ligne |
| Validation | Décorateurs class-validator | Schémas Zod dans `packages/contracts`, appliqués par `nestjs-zod` côté API | Un schéma = DTO d'API, entrée d'outil MCP, sortie structurée de l'IA, validation de formulaire |
| IA | LangChain + `@langchain/anthropic` | `@anthropic-ai/sdk` directement, sorties structurées (`client.messages.parse()` avec le schéma Zod), images pour les captures | Une couche de moins ; le schéma d'annonce est la sortie attendue |
| Tests | Vitest (unitaires), Vitest + supertest (e2e) | Identique : `domain` (unitaires et propriétés avec `fast-check`), `api` (e2e Nest + supertest sur un Postgres de test avec PostGIS), `web` (Vue Test Utils + happy-dom) ; Playwright en fumée plus tard | Harnais e2e de bankin-analyzer repris |
| Qualité | ESLint 10 flat, Prettier, husky, lint-staged | Identique, configuration reprise | Standards existants |
| CI | Aucune dans le dépôt | GitHub Actions : lint, type-check, test, build | Filet de sécurité |
| Déploiement | Vercel (front et back), Sentry | Vercel (web statique, api en fonctions Node) + Supabase cloud, Sentry | Exploitation connue, coût nul au départ |
| Documentation | `agent-os/product`, `agent-os/standards`, `docs/mcp.md` | `docs/product`, `docs/decisions` (ADR courts), `CLAUDE.md` à la racine | Plus simple, même esprit |

## 2. Décisions détaillées

### 2.1 NestJS conservé

Hono avait été proposé pour sa légèreté et sa validation Zod native. Le choix s'est porté sur Nest
parce que l'application est appelée à grandir en cas d'usage et, à terme, en utilisateurs : les
conventions de Nest (modules par contexte, injection, guards, intercepteurs, tâches planifiées,
files) évitent d'avoir à les réinventer et facilitent l'arrivée d'un second développeur.

Ce qui change par rapport à bankin-analyzer :

- **nestjs-zod** remplace class-validator : chaque DTO est `createZodDto(schema)` à partir de
  `contracts`, et la spécification OpenAPI est produite par `@nestjs/swagger` depuis ces schémas.
  Il n'y a plus deux descriptions d'une même entrée.
- **Modules** : `workspace`, `listings`, `assumptions`, `rental`, `renovation`, `opinions`,
  `tasks`, `search-criteria`, `geo`, `opendata`, `ai`, `mcp`, `auth`, `health`, et `study` au
  lot 5 (phase 1, scénarios, projection, comparables de loyer, conformité) ; au lot 6
  `visits` (photos dans Supabase Storage), `notifications` (web push par `web-push`, e-mail
  en option), `whats-new`, `inbound` (alertes e-mail signées) et `export`, et `activity` lit
  le journal. Chaque module expose ses services ; le module `mcp` ne fait qu'orchestrer.
  En pratique, travaux et phase 2 vivent dans `listings`.
- Repris tels quels : le garde MCP, `/.well-known/oauth-protected-resource`, le journal de
  requêtes avec identifiant, les en-têtes de sécurité, le filtre d'exceptions et le mapping des
  erreurs Prisma, `/health`, le `build:vercel`.

### 2.2 Prisma 7 conservé, PostGIS activé

Drizzle aurait apporté un type `geometry` natif et des requêtes SQL typées. Prisma est conservé
parce que tout le socle existe déjà (service, erreurs, e2e, pipeline de déploiement), que Prisma 7
sans moteur Rust tourne bien en serverless, et que les besoins géographiques tiennent en une
poignée de requêtes.

Mise en œuvre :

- `CREATE EXTENSION IF NOT EXISTS postgis` et les index GiST dans les fichiers SQL de migration
  Prisma ;
- colonnes `geography(Point, 4326)` déclarées `Unsupported` dans le schéma, avec `latitude` et
  `longitude` en colonnes classiques à côté pour les lectures ordinaires ; périmètres des
  critères en `geography(Polygon, 4326)` plus le GeoJSON d'origine en `Json` ;
- requêtes géo dans un **module `geo`** et nulle part ailleurs : dans un rayon (`ST_DWithin`),
  dans un périmètre (`ST_Intersects`), arrêt le plus proche (opérateur `<->`), comparables DVF
  (rayon et période), avec TypedSQL (`prisma/sql/*.sql`, fonctions générées typées) ou
  `$queryRaw` dont le résultat passe par un schéma Zod ;
- écriture des points par `$executeRaw` dans le service `geo`, appelé par les services métier
  après la création ou la mise à jour d'une adresse.

Si la géo devenait centrale (cartes de chaleur, polygones de quartier, isochrones en masse), ce
module passerait à un accès SQL dédié ou à Drizzle ; les deux cohabitent sur la même base et le
reste de l'application ne le verrait pas.

### 2.3 Un paquet `domain` pur

`packages/domain` ne dépend d'aucun framework ni de la base : entrées typées, sorties typées,
aucune E/S. Il contient `compute`, `rentalChecks`, `targetPrice`, `sensitivity`, `verdict`, le
barème des frais de notaire, et les jeux de tests tirés de l'artefact (voir
[modele-de-calcul.md](modele-de-calcul.md) § 8). L'interface l'importe pour l'aperçu en direct
dans le formulaire, l'API et le MCP l'importent pour répondre : un seul chiffre possible pour une
même annonce.

### 2.4 Un paquet `contracts` Zod

Schémas `Listing`, `ListingInput`, `Assumptions`, `RentalPlan`, `Renovation`, `Opinion`, `Task`,
`SearchCriteria`, réponses d'API, filtres de liste. Chaque champ numérique porte unité et sens
dans sa description (« surface Carrez en m² », « charges de copropriété annuelles en euros, total
avant répartition »), car cette description est lue par le modèle lors de l'extraction et par
l'agent qui appelle le MCP. La provenance par champ est un type générique `Sourced<T>` (`value`,
`source`, `confidence`, `evidence`). Les géométries sont des schémas GeoJSON (`Point`,
`Polygon`) stricts.

### 2.5 IA : Claude par le SDK officiel

- Modèle par défaut `claude-opus-5-5`, réflexion adaptative, effort `low` ou `medium` pour
  l'extraction (tâche cadrée par un schéma). Coût indicatif d'une extraction : quelques milliers
  de jetons d'entrée et un millier de sortie, soit quelques centimes. Un modèle moins cher
  (`claude-haiku-5-5`) est possible pour l'extraction de masse ; ce choix te revient.
- Sorties structurées avec le schéma Zod de `contracts` (`client.messages.parse()`), captures
  d'écran en blocs image, texte source dans une balise de données.
- Invite système et schéma en préfixe stable pour le cache de prompt ; traitement du
  `stop_reason` `refusal` avec repli serveur activé.
- Clé API côté serveur uniquement ; aucune donnée personnelle dans l'invite au-delà de
  l'annonce.

### 2.6 MCP

- Transport HTTP « streamable » sans session (chaque appel est complet), dans un contrôleur Nest
  comme aujourd'hui.
- Authentification : jeton Supabase vérifié par le garde ; découverte OAuth servie par l'API ;
  portées lecture et écriture.
- Outils déclarés à partir des schémas de `contracts`, calculs par `domain`, filtres
  géographiques par le module `geo`, garde-fous optimistes (`expectedPrice`, `expectedStatus`),
  journal des écritures, aucune suppression.
- Ressources : schéma d'annonce, glossaire ; prompt « analyser cette annonce ».

### 2.7 Frontend

- Vue 3.5 `<script setup>`, TypeScript, standards Vue de bankin-analyzer repris.
- TanStack Query pour les données serveur (liste, fiche, hypothèses, critères) ; Pinia uniquement
  pour les filtres, le thème et l'état des panneaux.
- TanStack Table pour le comparateur : tri multi-colonnes, colonnes figées, visibilité des
  colonnes, cartes sur mobile par le même modèle de lignes.
- **Carte** : MapLibre GL JS, tuiles OpenStreetMap ou IGN Géoplateforme, marqueurs colorés par
  verdict et regroupés en grappes, couches optionnelles (arrêts, DVF, encadrement). terra-draw
  pour dessiner et modifier un polygone ; le périmètre part en GeoJSON vers l'API. Point et rayon
  par clic ou par adresse géocodée.
- reka-ui pour panneau latéral, boîtes de dialogue, combobox, popover ; Tailwind 4 avec les
  jetons de couleur de l'artefact (accent sarcelle, échelle DPE, polices Bricolage Grotesque et
  IBM Plex) en clair et en sombre.
- Formulaires validés par les schémas Zod de `contracts`, aperçu en direct par `domain`.
- PWA installable, coquille en cache hors ligne ; au lot 6, `share_target` en GET vers
  `/partager` (lien et texte partagés, extraction lancée) et web push (service worker de
  `vite-plugin-pwa` avec `public/push-handler.js`, ADR 0015). La lecture hors ligne des
  données n'est pas faite.
- Graphiques limités au tableau de sensibilité et, au lot 5, au graphique de la projection : un
  SVG écrit à la main (barres et une ligne) a suffi, sans bibliothèque (ADR 0012).

### 2.8 Données ouvertes

Chaque source est un connecteur isolé dans le module `opendata` avec cache en base
(`ReferenceData`) et date de récupération :

- géocodage : IGN Géoplateforme (`data.geopf.fr/geocodage`), successeur de l'API Adresse ;
- isochrones : service d'itinéraire et d'isochrones de la Géoplateforme, résultat figé en
  polygone à l'enregistrement du critère ;
- DPE : observatoire ADEME, jeu « logements existants depuis juillet 2021 », API data-fair ;
- encadrement des loyers de Bordeaux : table chargée depuis l'arrêté préfectoral annuel
  (données Bordeaux Métropole), par zone, pièces, époque, meublé ;
- arrêts TBM : import des données Bordeaux Métropole dans `TransitStop` ;
- DVF : import des fichiers ouverts DGFiP pour la Gironde dans `DvfSale` (PostGIS), plutôt
  qu'une API tierce ;
- Géorisques (lot 5) : rapport « risques près de chez moi » de l'API v1, sans jeton, au point de
  l'annonce, mis en cache trente jours, intégré à la checklist réglementaire (ADR 0013) ;
- équipements et quartiers (lot 11) : imports dans `Amenity` (pistes d'athlétisme du
  recensement des équipements sportifs et d'OpenStreetMap, supermarchés avec drive et salles
  Fitness Park d'OpenStreetMap) et `Neighbourhood` (quartiers de Bordeaux Métropole, secteurs de
  vie de Bordeaux, Contours IRIS de l'IGN) ; plus proches et quartier calculés en PostGIS
  (ADR 0021).

Mise en œuvre au lot 4 : [docs/open-data.md](../open-data.md) (sources, licences, dates, imports
et règles) et ADR 0010, 0011 (isochrone à vélo approchée, zonage de l'encadrement dans une table
PostGIS dédiée, instantané d'enrichissement sur l'annonce).

## 3. Arborescence proposée

```
apart-localizer/
├─ apps/
│  ├─ web/                 Vue 3 + Vite, PWA, MapLibre
│  └─ api/                 NestJS : REST, MCP, extraction IA, géo, connecteurs open data
│     └─ prisma/           schema.prisma, migrations (SQL PostGIS inclus), sql/ (TypedSQL)
├─ packages/
│  ├─ domain/              calculs purs, 100 % testés
│  └─ contracts/           schémas Zod, types, GeoJSON
├─ supabase/               configuration CLI, seed
├─ scripts/                import-artifact.ts, import-dvf.ts, import-tbm.ts, sauvegardes
├─ docs/
│  ├─ product/             étude, modèle de calcul, feuille de route, MCP
│  └─ decisions/           ADR courts (un fichier par décision)
├─ .github/workflows/      ci.yml
├─ CLAUDE.md               règles de travail (tests obligatoires, où vit quoi)
├─ package.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.js, .prettierrc.json
```

## 4. Alternatives écartées

| Option | Raison du rejet |
| --- | --- |
| Hono + Drizzle | Proposé puis écarté : les conventions de Nest valent leur boilerplate pour une application qui grandit ; la géo tient en quelques requêtes SQL avec Prisma. Voir ADR 0001 et 0002 |
| Nuxt (SSR) | Pas de besoin de rendu serveur ni de SEO ; le MCP impose de toute façon une API séparée |
| Supabase seul (PostgREST, RLS, edge functions) sans API | La logique de calcul et le MCP ont besoin d'un serveur ; la disperser entre RLS et fonctions complique les tests |
| SQLite / Turso | Supabase Auth apporte déjà Postgres ; PostGIS nécessaire pour la géo |
| Leaflet | Convient aussi ; MapLibre retenu pour les tuiles vectorielles, les performances sur mobile et le dessin avec terra-draw |
| React / Next | Vue est maîtrisé et documenté dans les standards existants |
| Scraping serveur des portails | Conditions d'utilisation et anti-bot ; Claude lit la page dans le navigateur de l'utilisateur |
| LangChain | Couche inutile pour des appels structurés au SDK officiel |

## 5. Décisions prises

Tranché le 3 novembre 2026 : NestJS + nestjs-zod, Prisma 7 + PostGIS, MapLibre + terra-draw.

Validé par Richard le 3 novembre 2026 :

1. **Deux phases** : achat en résidence principale puis location, année de bascule paramétrable
   (2028 par défaut).
2. **Périmètre géographique** : Bordeaux Métropole ; l'encadrement des loyers ne concerne que la
   commune de Bordeaux ; imports TBM et DVF limités à la Gironde.
3. **Hébergement** : Vercel + Supabase cloud, comme bankin-analyzer.
4. **Import des annonces actuelles** de l'artefact dès le lot 0. L'export vit dans
   `data/private/` (ignoré par git : le dépôt est public).
5. **Fiscalité** reportée au lot 5, champs prévus dès le schéma.
