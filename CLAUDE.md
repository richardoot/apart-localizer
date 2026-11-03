# apart-localizer : règles de travail

Outil de suivi d'annonces d'achat d'appartement assisté par IA. La documentation produit dans
`docs/product/` est la spécification ; les décisions d'architecture sont dans `docs/decisions/`.

## Tests obligatoires

Après chaque fonctionnalité (endpoint, module, composant, composable, fonction de calcul,
script), tu dois :

1. écrire les tests correspondants ;
2. les exécuter et les faire passer ;
3. ne passer à la suite qu'une fois les tests verts.

Emplacements : `*.spec.ts` à côté du code (API, web), `test/` pour les paquets et le harnais
e2e (`apps/api/test/*.e2e-spec.ts`). Le paquet `domain` vise une couverture proche de 100 %.

## Où vit quoi

| Quoi                                                                                | Où                                                    | Règle                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formules et calculs (coût, rendement, verdict, louabilité, prix cible, sensibilité) | `packages/domain`                                     | Fonctions pures, aucune E/S. Aucun calcul ailleurs : l'API, le MCP et le web appellent `domain`.                                                                                                                                                                                                                                                                                                                                                                          |
| Schémas Zod, types, énumérations, GeoJSON, filtres                                  | `packages/contracts`                                  | Un schéma = DTO d'API (`createZodDto`), entrée MCP, sortie IA, validation de formulaire. Descriptions en français avec unité.                                                                                                                                                                                                                                                                                                                                             |
| SQL géographique (PostGIS)                                                          | `apps/api/src/geo`                                    | Le seul endroit où `ST_*`, `geography` et les colonnes `geom`/`perimeter` apparaissent. Résultats validés par Zod.                                                                                                                                                                                                                                                                                                                                                        |
| Modèle de données                                                                   | `apps/api/prisma/schema.prisma` + `prisma/migrations` | Schéma Postgres `app`. Les colonnes géo sont `Unsupported` avec latitude/longitude à côté.                                                                                                                                                                                                                                                                                                                                                                                |
| Modules Nest (un par contexte)                                                      | `apps/api/src/<module>`                               | Contrôleur mince, service, DTO `createZodDto(schema de contracts)`. Journal d'activité sur chaque écriture. Modules : `workspace`, `assumptions`, `listings` (dont doublons et extraction), `opinions`, `tasks`, `activity`, `geo`, `auth`, `health`, `ai`, `opendata`, `mcp`.                                                                                                                                                                                            |
| Connecteur MCP                                                                      | `apps/api/src/mcp`                                    | Orchestre les services, aucune logique métier. Entrées = schémas de `contracts/src/mcp.ts`, refus rendus en réponse, données encadrées, journal canal `mcp`, portées `listings:read` / `listings:write`, aucun outil de suppression. Voir `docs/mcp.md`.                                                                                                                                                                                                                  |
| IA (extraction)                                                                     | `apps/api/src/ai`                                     | Seul endroit qui appelle `@anthropic-ai/sdk` ; la clé `ANTHROPIC_API_KEY` n'est lue qu'ici. Sortie structurée par `AiListingExtractionSchema` (`contracts/src/ai.ts`), réflexion adaptative, invite mise en cache. Client injecté (`ANTHROPIC_CLIENT`) : nul sans clé, factice dans les tests. Mappage pur dans `extraction.mapper.ts` ; orchestration (géocodage, doublons, champs manquants, journal du coût) dans `listings/extraction.service.ts`. Voir `docs/ia.md`. |
| Données ouvertes                                                                    | `apps/api/src/opendata`                               | Un connecteur par source, `fetch` injectable, cache en base (`ReferenceData`). `geoplateforme.ts` est le client IGN sans état, partagé avec `scripts/lib/geocode.ts` ; `GeocodingService` ajoute le cache et `locate` (adresse puis commune). Aucun appel réseau dans les tests.                                                                                                                                                                                          |
| Interface                                                                           | `apps/web`                                            | Vue 3.5 `<script setup>`, Tailwind 4 avec les jetons de `src/style.css`, TanStack Query pour l'état serveur, Pinia pour l'état d'interface (filtres ⇄ URL). Pas de bloc `<style>`. Aperçu en direct par `packages/domain` (`composables/useLivePreview.ts`). Carte MapLibre dans `components/listings/ListingsMap.vue`, mockée dans les tests (`src/test/setup.ts`).                                                                                                      |
| Scripts d'exploitation                                                              | `scripts/`                                            | Import de l'artefact, imports open data. Testés hors ligne.                                                                                                                                                                                                                                                                                                                                                                                                               |
| Données privées                                                                     | `data/private/`                                       | Ignoré par git. Le dépôt est public : rien de ce dossier ne doit être commité ni copié ailleurs.                                                                                                                                                                                                                                                                                                                                                                          |

Identifiants de code en anglais ; textes d'interface, messages d'erreur métier et descriptions
Zod en français.

## Interdits

- Pas de scraping serveur des portails d'annonces : Claude lit la page dans le navigateur de
  l'utilisateur et appelle le MCP ; la saisie manuelle reste possible.
- Aucun secret dans le dépôt : `.env` ignorés, `.env.example` sans valeur sensible.
- Aucun appel réseau ni clé API dans les tests.
- Pas de suppression par le MCP ; les écritures sont journalisées.

## Commandes

```bash
pnpm install                 # Node 24, pnpm 12.5.1 (volta ou corepack)
pnpm db:test:up              # Postgres + PostGIS local (podman ou docker), port 54329
pnpm dev                     # api (3000) + web (5173) + paquets en watch
pnpm lint                    # ESLint 10 + Prettier
pnpm format:check            # Prettier seul (docs comprises, sauf docs/product)
pnpm type-check              # construit les paquets puis tsc / vue-tsc partout
pnpm test                    # unitaires + e2e (TEST_DATABASE_URL requis pour les e2e)
pnpm --filter @apart/api test:e2e   # REST, géo, collaboration, extraction IA (client factice), MCP (JSON-RPC réel) sur PostGIS
pnpm --filter @apart/web test       # Vitest + Vue Test Utils, MapLibre et Supabase mockés
pnpm build
pnpm import:artifact -- --no-geocode   # import des données de l'artefact (voir README)
```

Les paquets `contracts` et `domain` sont consommés par leur `dist` : lancer `pnpm build:packages`
après les avoir modifiés (les scripts racine le font).

## Documentation

Si l'implémentation s'écarte de `docs/product/`, mets la documentation à jour dans le même
changement et ajoute un ADR court dans `docs/decisions/` (même format que les existants).
`docs/mcp.md` décrit les outils du connecteur, `docs/ia.md` l'extraction par IA (schéma, coût,
variables), `docs/deploiement.md` les étapes Supabase cloud, Vercel, claude.ai et Sentry : à
tenir à jour avec le code.
