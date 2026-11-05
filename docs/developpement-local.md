# Développement local

Tester en local, avant de pousser, tout ce que fait l'application : l'interface, l'API, la
collaboration à deux, les notifications, le MCP et son flux OAuth. L'infrastructure est celle du
Supabase CLI (Postgres + PostGIS, Auth, Storage, Studio, Mailpit) plus une base de test ; l'API
et le web tournent avec `pnpm dev`, en rechargement à chaud, jamais en conteneur. Choix et
garde-fous : [ADR 0016](decisions/0016-environnement-local-en-une-commande.md).

## En trois commandes

```bash
pnpm install
pnpm stack:up --dataset demo
pnpm dev
```

Puis http://localhost:5173, « Connexion locale » : `demo@apart.local` / `demo-apart-local`
(ou `demo2@apart.local`, même mot de passe, pour jouer l'autre membre dans une fenêtre privée).

`pnpm stack:up --dev` enchaîne les deux dernières : il lance `pnpm dev` après le récapitulatif.

## Prérequis

| Outil         | Version                                              | Remarque                                                                                                                                                              |
| ------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node          | 24.x (`engines`)                                     | volta lit `package.json` ; sinon nvm                                                                                                                                  |
| pnpm          | 12.5.1 (`packageManager`)                            | `corepack enable`, ou volta                                                                                                                                           |
| Supabase CLI  | 3.0 au moins                                         | [installation](https://supabase.com/docs/guides/local-development/cli/getting-started) : binaire des releases GitHub, `npm i -g supabase`, ou gestionnaire de paquets |
| podman/docker | podman 5 ou plus avec une machine (macOS), ou Docker | `podman machine init` une fois ; `stack:up` démarre la machine si elle est arrêtée et trouve son socket                                                               |

`stack:up` vérifie ces versions et s'arrête avec un message qui dit quoi faire.

## Les commandes

### `pnpm stack:up`

Options : `--dataset none|demo|artifact` (défaut `none`), `--opendata`, `--dev`,
`--richard-email E`, `--chloe-email E` (avec `--dataset artifact`), `--help`.

Dans l'ordre :

1. **Prérequis** : Node, pnpm, Supabase CLI, podman ou docker ; la machine podman est démarrée
   si besoin.
2. **`DOCKER_HOST`** : la CLI Supabase parle à l'API Docker. Avec podman, elle doit viser le
   socket de la machine (`podman machine inspect`). Un `DOCKER_HOST` hérité dont le socket ne
   répond plus (ancien Docker Desktop) est remplacé, et c'est écrit dans le journal.
3. **`supabase/.env`** : `SUPABASE_AUTH_GOOGLE_ENABLED=true` seulement si
   `SUPABASE_AUTH_GOOGLE_CLIENT_ID` et `SUPABASE_AUTH_GOOGLE_SECRET` y sont renseignés.
4. **`supabase start`** : rien n'est redémarré si la pile tourne déjà avec la même configuration ;
   si `supabase/config.toml` ou `supabase/.env` ont changé depuis, `supabase stop` puis `start`
   (les données restent). Un démarrage qui échoue (pile à moitié démarrée) est retenté une fois
   après `supabase stop`.
5. **`apps/api/.env` et `apps/web/.env`**, d'après `supabase status -o env` (voir plus bas).
6. **Code** : `pnpm build:packages` et `prisma:generate` seulement si `dist` ou le client Prisma
   manquent ou datent.
7. **Migrations** : `prisma:deploy` sur la base locale (`DIRECT_URL` forcée vide).
8. **Stockage** : `supabase seed buckets --yes` crée ou remet le bucket privé `visit-photos`.
9. **Base de test** : `docker/test-db.yml` (port 54329), attendue jusqu'à ce qu'elle réponde.
10. **Jeu de données** choisi, imports open data avec `--opendata`, puis **raccordement des
    identités** (`link-local-identities.ts`).
11. **Récapitulatif** : adresses, comptes de démo, jeu chargé, commandes utiles.

Relancé sur une pile démarrée, il ne casse rien et ne duplique rien : 8 s mesurées ici (MacBook,
podman), contre 21 s à froid (pile arrêtée, images déjà téléchargées). Le tout premier `stack:up`
télécharge en plus les images Supabase, ce qui peut prendre plusieurs minutes (non mesuré).

### `pnpm stack:down`

`supabase stop` (sans `--no-backup` : les volumes restent) et `compose stop` de la base de test
(le conteneur est gardé). `pnpm stack:up` retrouve tout.

### `pnpm stack:status`

État de Supabase et ses adresses, nombre d'annonces et de membres par espace, base de test, API
et web (répondent-ils ?), jeu chargé au dernier `stack:up`, et un avertissement si la
configuration a changé depuis le démarrage.

### `pnpm stack:reset --yes`

**Destructif.** Vide le schéma `app` local (tables, types, données) et `public._prisma_migrations`,
rejoue les migrations puis le jeu demandé (`--dataset`, `--opendata`). Sans `--yes`, il montre ce
qu'il supprimerait (espaces, annonces, membres) et s'arrête. Il refuse tout hôte non local.
Conservés : les comptes de connexion (`auth.users`), les fichiers du stockage (les photos des
visites supprimées deviennent orphelines), la base de test. `--database-url` vise une autre base
locale, par exemple une base jetable sur le serveur de test :

```bash
podman exec apart-test-db psql -U postgres -c 'CREATE DATABASE essai'
pnpm stack:reset --yes --dataset demo --database-url postgresql://postgres:postgres@127.0.0.1:54329/essai
```

Tout effacer, comptes compris : `supabase stop --no-backup` supprime les volumes de la pile.

### Autres commandes

```bash
pnpm seed:demo                    # recrée seulement l'espace Démo (--dry-run : liste et verdicts)
pnpm link:identities -- --dry-run # rattachements qui seraient faits
pnpm verify                       # les étapes de la CI (voir plus bas)
```

## Les fichiers `.env`

Fusion, jamais d'écrasement : seules les clés de la pile sont réécrites ; tout le reste
(`ANTHROPIC_API_KEY`, `SENTRY_*`, Google, vos propres valeurs) est conservé, commentaires et ordre
compris. Un fichier qui existait est copié en `.env.backup` avant la première écriture (la copie
n'est jamais remplacée). Tous ces fichiers sont ignorés par git.

| Fichier         | Réécrites à chaque `stack:up`                                                                                         | Écrites seulement si absentes ou vides                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/api/.env` | `DATABASE_URL` (54322), `DIRECT_URL` (vide), `TEST_DATABASE_URL` (54329), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `FRONTEND_URL`, `PORT`, `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` (paire générée), `VAPID_SUBJECT` |
| `apps/web/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_PASSWORD=1`                                                 | `VITE_API_URL`                                                                                     |
| `supabase/.env` | `SUPABASE_AUTH_GOOGLE_ENABLED`                                                                                        | `SUPABASE_AUTH_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_GOOGLE_SECRET` (vides)                            |

Les clés de la CLI Supabase locale sont des clés de démonstration publiques, mais elles restent
hors du dépôt. Un nouveau fichier part du `.env.example` correspondant.

## Les jeux de données

- **`none`** (défaut) : rien n'est chargé ni supprimé.
- **`demo`** : l'espace « Démo », **entièrement fictif** (adresses marquées « adresse fictive »,
  liens `exemple.invalid`), recréé à l'identique à chaque fois, sans jamais toucher aux autres
  espaces (ils sont comptés avant et après ; tout est annulé s'ils ont bougé). Quinze annonces
  dans Bordeaux Métropole, des statuts « à étudier » à « vendue », des verdicts cible, à creuser et
  hors cible ; deux versions d'hypothèses ; travaux et phase 2 ; avis des deux membres ; tâches
  (dont assignées) ; offres avec réponses et contre-propositions ; historique de prix ; visites
  faites et planifiées (sans photo) ; deux critères (un polygone sur le centre et un rayon de
  1,5 km autour du tram B à Talence) avec leurs entrées ; comparables de loyer ; deux scénarios ;
  une alerte e-mail à valider ; des vérifications sur le portail (lot 15 : prix trouvé,
  inchangée, plus en ligne, republiée, page inaccessible) et une republication rattachée (le T3
  de Cenon et sa première annonce) ; le journal et les notifications qu'il fait naître. Les dates sont
  relatives au jour du seed : il y a toujours des « nouvelles » et une visite à venir.
- **`artifact`** : l'import de `data/private/artifact-export/` (vos annonces). Sans ce dossier,
  `stack:up` le dit et s'arrête. Les e-mails des membres viennent de `--richard-email` et
  `--chloe-email`, ou de `data/private/import.env` (ignoré par git) :

  ```bash
  IMPORT_RICHARD_EMAIL=richard@exemple.fr
  IMPORT_CHLOE_EMAIL=chloe@exemple.fr
  ```

- **`--opendata`** : lance l'import de l'encadrement, des arrêts TBM et des ventes DVF dont les
  fichiers sont dans `data/opendata/` ([open-data.md](open-data.md)) ; une source absente est
  sautée. Lot 11 : aussi les quartiers (`quartiers/`, `iris/`), les pistes et Fitness Park
  (`res/`, `osm/`) et les drives (`osm/supermarkets.json`), puis le rattrapage du quartier et des
  équipements des annonces (`refresh:surroundings`). Lot 12 : après les quartiers, les lieux-dits
  OpenStreetMap (`osm/quartiers-places.json`, `import:places`), puis le rattrapage du repère des
  annonces au centre de la commune, au quartier ou sans repère (`relocate:listings`, avant
  `refresh:surroundings`). Sans ces fichiers, l'onglet Quartier affiche « non disponible » ;
  `--download` sur chaque import les lit en ligne à la place. Le plan des imports est testé ; les imports eux-mêmes n'ont pas été relancés pour ce lot
  (les données ouvertes étaient déjà en base).

## Se connecter en local

- **Comptes de démo** (jeu `demo`) : `demo@apart.local` (Camille, propriétaire de l'espace) et
  `demo2@apart.local` (Sacha), mot de passe `demo-apart-local`. Ils n'existent que dans le GoTrue
  local ; le seed refuse tout autre hôte. Deux fenêtres (une privée) pour voir l'autre membre
  écrire : badge « nouvelle », avis, notifications, « ce qui a changé ».
- **Votre propre compte local** : « Créer un compte local » sur la page de connexion (e-mail
  confirmé d'office en local, Mailpit montre les e-mails que GoTrue enverrait).
- **Google** (facultatif) : un identifiant OAuth « application web » dans Google Cloud, URI de
  redirection `http://127.0.0.1:54321/auth/v1/callback`, puis l'identifiant et le secret dans
  `supabase/.env` et `pnpm stack:up` (qui redémarre la pile et active Google).

Le formulaire e-mail n'apparaît que si `VITE_AUTH_PASSWORD=1` : jamais en production, où Google
reste le seul moyen ([déploiement](deploiement.md)).

### Tester les invitations en local (lot 8)

1. Connecté en `demo@apart.local` (propriétaire), page « Espace » : inviter une adresse fictive,
   par exemple `invitee@apart.local`. Sans `EMAIL_HTTP_URL`, la page affiche le lien à
   transmettre (`http://localhost:5173/login`).
2. Dans une fenêtre privée, « Créer un compte local » avec cette adresse : le compte est
   confirmé d'office en local, donc tenu pour vérifié (ADR 0018), et arrive dans l'espace Démo à
   sa première requête.
3. Personne déjà inscrite : inviter `demo2@apart.local` depuis un autre espace (un compte local
   à vous, propriétaire de son « Mon espace ») ; Sacha voit le bandeau « Rejoindre / Refuser ».
4. Retrait : depuis Camille, « Retirer » Sacha ; sa requête suivante tombe dans un nouvel espace
   vide, ses avis restent à son nom dans l'espace Démo. `pnpm seed:demo` remet l'espace Démo
   d'aplomb.

`link:identities` ne rattache que les membres actifs : une invitation passe toujours par la
connexion, un ancien membre ne retrouve jamais l'accès par ce script.

### Vos vraies annonces en local

Les membres importés (Richard et Chloé) sont rattachés à un compte par leur e-mail (ADR 0004).

1. `pnpm stack:up --dataset artifact --richard-email <votre e-mail> --chloe-email <celui de Chloé>`
   (relancer l'import ne duplique rien, il renseigne l'e-mail des membres) ;
2. connectez-vous avec cet e-mail : par Google si `supabase/.env` est configuré, sinon
   « Créer un compte local » avec le **même e-mail** et un mot de passe de votre choix ;
3. le compte est relié au membre à la première requête (ou d'avance par `link:identities`, que
   `stack:up` lance). Si vous vous étiez connecté avec cet e-mail **avant** l'import, un espace
   « Mon espace » vous a été créé : `link:identities` signale le conflit et donne la requête qui
   le lève.

## Tester le MCP en local

`supabase/config.toml` active le serveur OAuth 2.1 de GoTrue avec l'enregistrement dynamique et la
page de consentement du web (`http://localhost:5173/oauth/consent`). Découverte :

```bash
curl http://localhost:3000/.well-known/oauth-protected-resource      # ressource, serveur, portées
curl http://localhost:3000/.well-known/oauth-authorization-server    # relayé depuis GoTrue
```

**Avec Claude Code** (syntaxe vérifiée sur Claude Code 2.1.303, `claude mcp add --help`) :

```bash
claude mcp add --transport http apart-local http://localhost:3000/mcp
```

Puis `/mcp` dans Claude Code, « apart-local », « Authenticate » : le navigateur doit ouvrir la page
de consentement (connexion locale si besoin), « Autoriser », et Claude Code reçoit son jeton. Ce
parcours interactif n'a pas été rejoué ici ; le même flux OAuth l'a été par HTTP (enregistrement
dynamique, autorisation avec la portée annoncée, consentement, échange du code, `tools/list` et
une écriture avec le jeton obtenu). Sans OAuth, un jeton de session suffit (valable une heure) :

```bash
TOKEN=$(curl -s 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' \
  -H "apikey: $(grep ^VITE_SUPABASE_ANON_KEY= apps/web/.env | cut -d= -f2-)" \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@apart.local","password":"demo-apart-local"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')
claude mcp add --transport http apart-local-jeton http://localhost:3000/mcp --header "Authorization: Bearer $TOKEN"
```

**Avec l'inspecteur MCP** :

```bash
npx @modelcontextprotocol/inspector@2.13.0
```

Transport « Streamable HTTP », URL `http://localhost:3000/mcp`, puis le flux OAuth de
l'inspecteur (il s'enregistre seul) ou l'en-tête `Authorization: Bearer $TOKEN` (non rejoué ici :
l'inspecteur se sert du SDK MCP, qui demande les `scopes_supported` de la ressource, `email`).

**claude.ai** ne peut pas joindre `localhost` : ses serveurs appellent l'URL du connecteur depuis
Internet. Il faut une URL publique en https pour l'API **et** pour Supabase (un tunnel, avec
`MCP_PUBLIC_URL`, `SUPABASE_EXTERNAL_URL` et `jwt_issuer` de `[auth]` alignés sur le tunnel),
ou plus simplement le déploiement ([déploiement](deploiement.md), § 5).

Portées : GoTrue ne délivre que des portées OpenID ; la découverte annonce `email` et un jeton
OAuth vaut lecture et écriture, sans suppression possible ([mcp.md](mcp.md), ADR 0017).

## Tester le partage et le push

- **Partage** (cible de partage de la PWA, requête GET, route couverte par les tests du
  routeur) : sans téléphone, ouvrez
  `http://localhost:5173/partager?title=T2%20exemple&text=Prix%20150%20000%20€&url=https://exemple.invalid/a`
  : « Nouvelle annonce » s'ouvre pré-remplie.
- **Web push** : le service worker n'existe que dans le build (`devOptions` désactivé en
  `pnpm dev`). `localhost` est un contexte sûr, le push y fonctionne sans https :

  ```bash
  pnpm --filter @apart/web build && pnpm --filter @apart/web preview   # http://localhost:4173
  ```

  Ajoutez `http://localhost:4173` à `FRONTEND_URL` dans `apps/api/.env` (origines CORS séparées
  par des virgules) et relancez l'API. Les clés VAPID locales sont générées par `stack:up`.
  « Notifications → Activer sur cet appareil », puis une écriture de l'autre compte de démo
  (parcours non rejoué dans ce lot).

- **Téléphone** : la PWA installée et le push exigent https, et le téléphone ne voit pas
  `localhost`. Il faut un tunnel https vers le web (et vers l'API et Supabase, ou des URL
  publiques), puis `VITE_API_URL`, `FRONTEND_URL` et `site_url` alignés. Non vérifié dans ce lot ;
  le déploiement Vercel reste le chemin sûr pour l'essai sur téléphone.

## Vérifier avant de pousser

```bash
pnpm verify          # les étapes de .github/workflows/ci.yml, lues dans le fichier, avec ses variables
pnpm verify --quick  # sans les e2e ni le build
```

Installation figée, paquets, lint, format, types, unitaires, e2e (API et seed de démo, sur la
base de test, démarrée si elle ne répond pas), build. S'arrête à la première étape en échec,
comme la CI, et le résumé final la nomme avec sa commande et son code. Les tests du web ne lisent
pas `apps/web/.env` (`envDir: false`) : le résultat local est celui de la CI. Seule différence :
`CI=true` n'est pas posé.

| Commande              | Durée mesurée (MacBook Apple Silicon, caches chauds)               |
| --------------------- | ------------------------------------------------------------------ |
| `pnpm verify`         | 88 s (lint 32 s, types 11 s, unitaires 11 s, e2e 13 s, build 12 s) |
| `pnpm verify --quick` | 65 s                                                               |

Le hook git `pre-push` (`.husky/pre-push`) lance `pnpm verify --quick` : une minute environ, à
chaque push seulement (le `pre-commit` reste `lint-staged`). Pour le sauter une fois :
`APART_SKIP_VERIFY=1 git push` (ou `git push --no-verify`) ; `HUSKY=0` coupe tous les hooks.
Le build de `pnpm verify` vide puis réécrit `apps/api/dist` (`deleteOutDir`), le dossier que
`nest start --watch` de `pnpm dev` exécute : mieux vaut arrêter `pnpm dev` avant un
`pnpm verify` complet (non mesuré : par prudence, ici `pnpm dev` était arrêté).

## Dépannage

| Symptôme                                                                                           | Cause et remède                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Cannot connect to the Docker daemon at unix:///…/docker.sock`                                     | `DOCKER_HOST` vise un socket mort. `stack:*` le corrige seul ; à la main : `export DOCKER_HOST=unix://$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')`.                                                         |
| `podman est installé mais aucune machine n'existe`                                                 | `podman machine init`, puis `pnpm stack:up` (qui la démarre).                                                                                                                                                                              |
| `port is already allocated` ou `address already in use`                                            | Ports de la pile : 54321 à 54324 (Supabase), 54329 (base de test), 3000 (API), 5173 (web). `lsof -nP -iTCP:54321 -sTCP:LISTEN` ; une autre pile Supabase : `supabase stop --project-id <autre>`.                                           |
| `supabase start` échoue à moitié, conteneurs en `Exited`                                           | `stack:up` arrête et relance une fois ; sinon `supabase stop` (données gardées) puis `pnpm stack:up`.                                                                                                                                      |
| `Invalid auth.external.google.enabled … is not true or false`                                      | `supabase/.env` manque : `pnpm stack:up` l'écrit (ou copiez `supabase/.env.example`).                                                                                                                                                      |
| Une modification de `supabase/config.toml` n'est pas prise en compte                               | `pnpm stack:up` redémarre la pile quand la configuration a changé ; à la main : `supabase stop && supabase start`.                                                                                                                         |
| `Le compte demo@apart.local est déjà relié au membre … de l'espace …`                              | Une connexion avant le seed a créé « Mon espace » pour ce compte ; le seed ne touche pas aux autres espaces. Supprimez cet espace (Studio, ou la requête affichée) puis relancez.                                                          |
| Tests Vitest : `Cannot read properties of undefined (reading 'config')` au chargement d'un fichier | Cache de transformation partagé de Vitest 5 (`node_modules/.vitest-cache`) écrit par une autre instance, par exemple `vitest --root` lancé depuis la racine : supprimez ce dossier. Lancez les tests depuis le paquet (`pnpm --filter …`). |
| L'envoi d'une photo échoue                                                                         | Bucket absent : `supabase seed buckets --yes` (fait par `stack:up`).                                                                                                                                                                       |
