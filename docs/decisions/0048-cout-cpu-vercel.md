# 0048. Coût CPU sur Vercel : moins de démarrages à froid, des démarrages plus légers

Statut : acceptée, 17 novembre 2026. Touche au déploiement (`deploiement.md`, projet web) et aux
durées de relecture du web ; aucun comportement métier ne change.

## Contexte

Le compte Vercel (offre Hobby) donne 4 heures de CPU actif par mois pour toutes ses fonctions ;
1 h 50 étaient consommées au bout de douze jours. Les journaux de l'API (16 novembre 2026)
montrent d'où vient l'essentiel :

- **Des démarrages à froid en rafale.** Une ouverture de l'application envoie une douzaine de
  requêtes simultanées. Vers une API froide, Vercel (Fluid) démarre une instance par requête :
  treize démarrages en 600 ms, alors qu'une instance chaude venait d'en servir huit à la fois.
  Chaque démarrage coûte de l'ordre d'une seconde de CPU (mesuré en local : 1,25 s, 2 360 modules
  chargés), une requête servie par une instance chaude de 20 à 50 ms.
- **Des pré-vols CORS.** Le web et l'API sont sur deux domaines ; l'en-tête `Authorization`
  impose un `OPTIONS` avant chaque requête. C'était 45 % des appels à la fonction, et huit des
  treize démarrages à froid.
- **Des paquets chargés pour rien.** Sentry (sans DSN en production), le SDK Anthropic (utile à
  la seule extraction) et le SDK MCP (utile à `/mcp`) étaient chargés à chaque démarrage, et Nest
  écrivait 230 lignes de journal par démarrage.
- **Des relectures.** Tout ce qui est affiché était relu au retour sur l'onglet au bout de 30 s ;
  la cloche chaque minute ; `GET /decisions/overview` refaisait la lecture complète des brouillons
  (fiche, chiffres) pour n'en garder que l'adéquation et la proposition.
- **Un aller-retour vers Supabase Auth par requête** (`GET /auth/v1/user`).

## Décision

1. **Même origine** : le web appelle `/api/…` sur son propre domaine, réécrit vers l'API par
   `apps/web/vercel.json` (et par le serveur de Vite en local). Le navigateur ne fait plus de
   pré-vol. `VITE_API_PROXY_PATH=/api` l'active (`lib/api-base.ts`) ; `VITE_API_URL` reste
   l'adresse publique de l'API pour ce qui la joint directement (connecteur MCP, webhook des
   alertes e-mail, Sentry). L'API garde la réponse au pré-vol deux heures (`maxAge` de
   `enableCors`) pour ce qui l'appelle encore d'une autre origine.
2. **Un portier des requêtes** (`lib/request-gate.ts`, dans `apiFetch` et `apiDownload`) : après
   deux minutes sans requête, et à la première requête de la page, la première requête part
   seule et les autres attendent sa réponse (au plus 5 s) ; jamais plus de quatre requêtes en
   cours. Une ouverture de l'application réveille une instance au lieu d'une douzaine.
3. **Des démarrages plus légers** : Sentry n'est chargé (ni son module Nest) qu'avec un DSN
   (`common/sentry-runtime.ts`) ; le SDK Anthropic au premier appel d'extraction
   (`ai/anthropic-sdk.ts`) ; le SDK MCP à la première requête `/mcp` (`mcp/mcp-sdk.ts`) ; le tout
   par `common/lazy-module.ts`. En production, les lignes de démarrage de Nest par module, par
   contrôleur et par route ne sont plus écrites (`QuietBootLogger`, sauf `LOG_LEVEL=debug`) ;
   les deux lignes `NestFactory` et `NestApplication`, qui marquent un démarrage, restent.
   Mesuré en local : 1 363 modules au lieu de 2 360, environ 20 % de CPU en moins par démarrage.
4. **Moins de relectures** (`lib/query.ts`) : une lecture vaut une minute (au lieu de 30 s) ;
   le retour sur l'onglet ne relit plus que la cloche et les étapes, ce qu'un autre membre a pu
   changer ; la cloche se relit toutes les cinq minutes (le web push prévient sans attendre) ;
   les critères, comme les hypothèses et l'espace, valent cinq minutes. Une écriture invalide
   toujours ce qu'elle change. `GET /decisions/overview` lit les brouillons par
   `DraftsService.pendingSummaries` : même adéquation, même proposition, sans la fiche ni les
   chiffres.
5. **Jetons validés gardés une minute** (`auth/token-cache.ts`) : un jeton accepté par Supabase
   est gardé par instance sous son empreinte SHA-256, au plus 60 s et jamais au-delà de son
   expiration, 200 entrées au plus. Le membre est toujours relu à chaque requête.

## Options écartées

- **Garder l'API chaude par une tâche planifiée** : l'offre Hobby ne permet qu'une tâche par
  jour, et chaque réveil coûte lui-même du CPU.
- **Un seul point d'entrée qui rendrait toute la coquille** : moins de requêtes, mais un
  remaniement de toutes les lectures de TanStack Query ; le portier obtient l'essentiel sans
  toucher aux lectures.
- **Vérifier le jeton sur place (JWKS)** : seulement possible avec des clés de signature
  asymétriques côté Supabase ; le cache vaut quelle que soit la clé.
- **Regrouper l'API en un seul fichier (esbuild)** : gain probable sur le chargement des modules,
  mais à éprouver avec le client Prisma 7 et le lanceur NestJS de Vercel ; reporté.

## Conséquences

- Une session révoquée (déconnexion) reste acceptée au plus une minute sur une instance qui a
  déjà vu son jeton. Un membre retiré de l'espace perd l'accès à la requête suivante, comme avant.
- Après deux minutes d'inactivité, les requêtes d'une page attendent la première : le
  démarrage à froid qu'elles auraient payé chacune, une seule le paie.
- Une donnée changée par un autre membre s'affiche à l'ouverture suivante de la page (au plus
  une minute) ou par la cloche, plus au simple retour sur l'onglet.
- La réécriture `/api` est servie par le réseau de Vercel : le corps d'une requête reste plafonné
  à 4,5 Mo et une réponse doit arriver en moins de 120 s (l'extraction par IA en prend moins).
  L'adresse de l'API est écrite dans `apps/web/vercel.json`.
- Sans `VITE_API_PROXY_PATH`, rien ne change pour le web : les requêtes vont à `VITE_API_URL`.
- Code : `apps/web/src/lib/api-base.ts`, `request-gate.ts`, `query.ts`, `api.ts`, `sentry.ts`,
  `composables/useNotifications.ts`, `useWorkflow.ts`, `useSearchCriteria.ts`,
  `views/NotificationsPage.vue`, `apps/web/vercel.json`, `vite.config.ts` ;
  `apps/api/src/common/lazy-module.ts`, `sentry-runtime.ts`, `logging.ts`, `instrument.ts`,
  `app.module.ts`, `main.ts`, `common/filters/all-exceptions.filter.ts`, `ai/anthropic-sdk.ts`,
  `ai/ai-client.ts`, `ai/ai.service.ts`, `mcp/mcp-sdk.ts`, `mcp/mcp.controller.ts`,
  `auth/token-cache.ts`, `auth/supabase.service.ts`, `inbound/drafts.service.ts`
  (`pendingSummaries`), `decisions/decisions.service.ts`.
