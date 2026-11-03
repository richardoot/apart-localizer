# 0016. Environnement local en une commande : orchestrateur TypeScript, mot de passe en local seulement, jeu de démonstration fictif

Statut : acceptée, 3 novembre 2026.

## Contexte

Tester en local avant de pousser demandait cinq ou six gestes : `supabase start` avec un
`DOCKER_HOST` pointé à la main vers le socket podman, les clés recopiées dans `apps/api/.env` et
`apps/web/.env`, les migrations, les imports, puis `pnpm dev`. La connexion passait seulement par
Google, donc impossible sans identifiants OAuth ; aucun jeu de données fictif n'existait (les
seules annonces locales sont les vraies, privées) ; le serveur OAuth 2.1 de GoTrue était éteint,
donc le MCP ne se testait pas de bout en bout. `bankin-analyzer` résout le même problème avec des
scripts bash et une pile entièrement conteneurisée.

## Options

1. **Scripts bash** (comme `bankin-analyzer`) : courts, mais non testables par Vitest, fragiles
   sur la fusion des `.env` et le cas « socket podman ».
2. **Tout conteneuriser** (API et web compris) : pas de rechargement à chaud, une image à
   reconstruire à chaque changement, et un écart de plus avec Vercel.
3. **Un orchestrateur TypeScript** dans `scripts/` (tsx), au-dessus de la CLI Supabase, l'API et
   le web restant sous `pnpm dev`.

## Décision

Option 3.

- `pnpm stack:up | stack:down | stack:status | stack:reset` (`scripts/stack.ts`,
  `scripts/lib/stack/`). Toute la logique est pure ou injectée (lanceur de commandes, base,
  horloge) : options, fusion des `.env`, choix du `DOCKER_HOST` (un socket qui ne répond pas est
  remplacé par celui de la machine podman), prérequis, plan des imports open data et garde-fous
  sont testés sans conteneur, l'orchestrateur avec un faux lanceur.
- **Fusion, jamais d'écrasement** des `.env` : seules les clés de la pile locale sont réécrites
  (URL, clés de la CLI, `VITE_AUTH_PASSWORD`) ; les valeurs de l'utilisateur restent ; les clés
  VAPID ne sont générées que si elles manquent ; un fichier existant est copié en `.env.backup`
  avant la première écriture.
- **Idempotence** : Supabase n'est redémarré (données conservées) que si `supabase/config.toml`
  ou `supabase/.env` ont changé depuis le dernier démarrage (empreinte dans `supabase/.temp/`) ;
  une pile à moitié démarrée est arrêtée puis relancée une fois.
- **Connexion par e-mail et mot de passe en local seulement** : le formulaire n'apparaît que si
  `VITE_AUTH_PASSWORD=1`, que `stack:up` écrit dans `apps/web/.env` ; la variable est absente de
  `.env.example`. Google reste la seule connexion en production ; il est activé en local par
  `SUPABASE_AUTH_GOOGLE_ENABLED` (écrit par `stack:up` selon que `supabase/.env` donne ou non les
  identifiants).
- **Jeu de démonstration fictif** (`--dataset demo`, `scripts/lib/demo/`) : un espace « Démo »
  à deux comptes GoTrue locaux (`demo@apart.local`, `demo2@apart.local`, mot de passe public
  documenté), créés par l'API d'administration de GoTrue. Construction pure et déterministe
  (identifiants UUID v5 stables, dates relatives au jour du seed), validée par les schémas de
  `contracts`, indicateurs par `domain`. L'écriture se fait en une transaction : seul l'espace à
  l'identifiant fixe est supprimé puis recréé, les autres espaces sont photographiés avant et
  après, et tout est annulé s'ils ont bougé. Le SQL géographique (points, polygone, entrées dans
  les critères) passe par `GeoService` ; les notifications par `notificationsForActivity`.
  Un seed dans `scripts/` plutôt que `apps/api/prisma/seed.ts` : il partage avec l'import de
  l'artefact le client Prisma, `GeoService` et les tests hors ligne, et n'entre pas dans le
  paquet déployé sur Vercel.
- **Raccordement des identités** (`scripts/link-local-identities.ts`, ADR 0004) : un membre sans
  identité, ou dont l'identité n'existe pas dans `auth.users`, est rattaché au compte local du
  même e-mail ; jamais un membre déjà relié ; un conflit est signalé, pas forcé.
- **Garde-fous** : seed, raccordement, comptes GoTrue et remise à zéro refusent tout hôte qui
  n'est pas `localhost`, `127.0.0.1` ou `::1` ; `stack:reset` exige `--yes` et montre ce qu'il va
  supprimer ; les migrations de la pile reçoivent `DIRECT_URL` vide pour ne jamais partir ailleurs.
- **Vérifier avant de pousser** : `pnpm verify` lit `.github/workflows/ci.yml` et en rejoue les
  étapes avec ses variables ; `--quick` saute les e2e et le build. Le hook `pre-push` lance
  `pnpm verify --quick` (désactivable par `APART_SKIP_VERIFY=1`) : 65 s mesurées (contre 88 s
  pour `pnpm verify`), acceptable à chaque push puisque le `pre-commit` reste `lint-staged` ;
  les e2e et le build restent à la CI ou à `pnpm verify`.

## Conséquences

- Trois commandes depuis un clone frais : `pnpm install`, `pnpm stack:up --dataset demo`,
  `pnpm dev`. `docs/developpement-local.md` décrit chaque étape et le dépannage.
- `supabase start` lancé seul exige `supabase/.env` (la CLI refuse `env(...)` non défini pour un
  booléen) : `stack:up` l'écrit, `supabase/.env.example` en donne le modèle.
- Le jeu de démo vit avec le code : un changement de schéma qui le casse fait échouer ses tests
  (`scripts/test/demo-dataset.spec.ts`, et `demo-seed.e2e-spec.ts` sur PostGIS, désormais lancé
  par l'étape e2e de la CI, `pnpm -r test:e2e`).
- Un compte local créé avec l'e-mail d'un membre importé le rattache à ses annonces : c'est le
  moyen de travailler en local sur les vraies annonces sans Google.
