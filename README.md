# apart-localizer

Suivi d'annonces d'achat d'appartement assisté par IA : normalisation des critères, pipeline
partagé (interface web et MCP), carte et critères géographiques, évaluation de la rentabilité et
du prix cible, puis l'étude dans le temps : coût d'occupation en phase 1, scénarios « et si »,
fiscalité estimée, projection jusqu'à la revente avec TRI, loyer de marché par comparables et
checklist réglementaire datée avec les risques Géorisques ; et le confort du quotidien à deux :
visites avec photos privées, journal d'activité, « ce qui a changé depuis ma dernière visite »,
notifications (cloche, web push, e-mail en option), partage d'une annonce depuis le téléphone,
alertes e-mail transférées en brouillons à valider, export CSV et JSON. Les lots 0 à 6 de la
feuille de route sont livrés.

Documentation :

- [Étude du besoin](docs/product/etude-du-besoin.md)
- [Modèle de calcul](docs/product/modele-de-calcul.md)
- [Choix techniques](docs/product/tech-stack.md)
- [Feuille de route](docs/product/roadmap.md)
- [Connecteur MCP](docs/mcp.md)
- [Extraction par IA](docs/ia.md)
- [Données ouvertes](docs/open-data.md)
- [Export des données](docs/export.md)
- [Confidentialité et données personnelles](docs/confidentialite.md)
- [Déploiement](docs/deploiement.md)
- [Décisions d'architecture](docs/decisions/README.md)
- [Règles de travail](CLAUDE.md)

## Arborescence

```
apps/
  api/          NestJS 11, Prisma 7 + PostGIS, nestjs-zod, OpenAPI (/api/docs hors production),
                MCP (/mcp, découverte OAuth), extraction IA (@anthropic-ai/sdk), géocodage et
                isochrones IGN, DPE ADEME, encadrement, arrêts TBM, DVF, Géorisques, critères de
                recherche, doublons, scénarios, comparables de loyer, projection et conformité
                (module study), visites et photos (Supabase Storage), journal lisible, « ce qui
                a changé », notifications (web-push), alertes e-mail entrantes, export CSV et
                JSON, throttler, Sentry en option
  web/          Vue 3.5 + Vite, Tailwind 4, TanStack Query et Table, MapLibre GL + terra-draw,
                reka-ui, Supabase Auth, PWA (share target, web push), Sentry en option
packages/
  contracts/    schémas Zod partagés (annonces, hypothèses et barème notaire, paramètres fiscaux
                datés, offres, GeoJSON, filtres, sorties calculées, prix cible, négociation,
                comparaison, scénarios, projection, comparables, règles réglementaires datées,
                glossaire)
  domain/       calculs purs (coût, rendement, verdict, louabilité, frais de notaire par taux ou
                barème, prix cible et critère « marché », sensibilité, brief de négociation,
                rangs, plafond d'encadrement, statistiques DVF, validité du DPE, filtres des
                critères, coût d'occupation, tableau d'amortissement, fiscalité locative,
                plus-value, TRI et VAN, projection, scénarios, loyer de marché, checklist)
scripts/        import de l'artefact Claude ; imports open data (encadrement, arrêts TBM, DVF) ;
                géocodage des annonces manquantes
supabase/       configuration du Supabase CLI
docker/         Postgres + PostGIS pour les tests e2e (repli au Supabase CLI)
docs/           produit et décisions
data/private/   exports et caches personnels, jamais commités
data/opendata/  fichiers open data téléchargés (DVF, TBM, encadrement), jamais commités
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

Migrations : `20261103000000_init` (schéma complet, PostGIS, index GiST),
`20261103120000_lot3_offers` (canal, date de réponse, auteur et dates des offres), puis
`20261103180000_lot4_criteria_opendata` (entrées des annonces dans les critères, zonage de
l'encadrement, clés d'import des arrêts et des ventes DVF, numéro de DPE et instantané open data
des annonces), puis `20261103210000_lot5_scenarios_rent_comparables` (scénarios « et si »
enregistrés, annonces de location comparables), puis `20261103230000_lot6_visits_notifications`
(visites et photos, notifications et abonnements push, brouillons reçus par e-mail, horodatage
de visite et préférences des membres). Une base créée avant un lot doit rejouer `prisma:deploy`.

Supabase Storage est actif dans `supabase/config.toml`, qui déclare le bucket privé
`visit-photos` : après une mise à jour du dépôt, `supabase stop && supabase start` (les données de
la base restent), puis `supabase seed buckets` pour créer le bucket.

## Démarrage

```bash
pnpm dev                  # api sur http://localhost:3000, web sur http://localhost:5173, paquets en watch
```

OpenAPI : http://localhost:3000/api/docs. Santé : http://localhost:3000/health. MCP :
`POST http://localhost:3000/mcp` (jeton Supabase en `Authorization: Bearer`), découverte sur
`/.well-known/oauth-protected-resource` et `/.well-known/oauth-authorization-server` ; outils
et garde-fous dans [docs/mcp.md](docs/mcp.md).

### Écrans du web

- **Synthèse** (`/`) : bandeau **« Depuis votre dernière visite »** (nouvelles annonces,
  changements de prix et de statut, avis et tâches de l'autre membre, entrées dans un critère,
  détail et liens, « Tout marquer comme vu »), annonces **reçues par e-mail à valider** (valider
  ouvre la fiche pré-remplie, écarter), compteurs (nouvelles, suivies, dans la cible, meilleur brut, prix moyen au
  m², à visiter), répartition par statut, tâches ouvertes et en retard, critères de recherche
  actifs avec leurs annonces et leurs nouveautés pour moi, nouvelles annonces, meilleures
  annonces.
- **Annonces** (`/annonces`) : filtres partagés (statut, commune, critère enregistré, verdict,
  DPE, prix, recherche, « nouvelles pour moi », point et rayon) synchronisés avec l'URL, trois
  vues : tableau comparatif (TanStack Table, tri par colonne), cartes (mobile), carte MapLibre
  (marqueurs colorés par verdict ou statut, popup vers la fiche, clic = point du filtre, curseur
  de rayon, couches activables : périmètres des critères, arrêts de tram et de bus, ventes DVF
  des trois dernières années, zones d'encadrement avec leur légende ; un clic sur un arrêt ou une
  vente en montre le détail). Les annonces entrées dans un critère portent son badge ◎.
- **Critères** (`/criteres`) : critères de recherche partagés avec leurs compteurs (annonces,
  nouveautés pour moi, sous réserve), création et modification (filtres, périmètre dessiné en
  polygone ou en cercle avec terra-draw, polygone retouchable sommet par sommet, point et rayon
  par clic, isochrone par adresse ou clic,
  à pied, à vélo ou en voiture, aperçu du nombre d'annonces), archivage, suppression,
  « Voir les annonces ». Une annonce créée qui entre dans un critère l'annonce à l'ouverture de
  sa fiche.
- **Partager** (`/partager`, cible de partage de la PWA) : sur Android, « Partager » depuis
  l'application Leboncoin, SeLoger ou le navigateur ouvre « Nouvelle annonce » avec le lien et le
  texte transmis et lance l'extraction ; sans IA, la saisie manuelle reprend le lien. Rien n'est
  téléchargé depuis le portail.
- **Nouvelle annonce** (`/annonces/nouvelle`) : onglet « Coller une annonce » (texte de la page,
  lien, captures d'écran, bouton Analyser avec coût affiché) qui pré-remplit la fiche avec une
  pastille de provenance et de confiance par champ, les champs indispensables à compléter et le
  bandeau des doublons probables (« ouvrir l'existante » / « créer quand même ») ; onglet
  « Saisie manuelle » inchangé. Demande `ANTHROPIC_API_KEY` côté API ([docs/ia.md](docs/ia.md)) ;
  sans clé, l'analyse répond 503 et la saisie manuelle reste.
- **Fiche** (`/annonces/:id`) : panneau latéral (plein écran sur mobile) avec aperçu en direct des
  indicateurs calculé dans le navigateur par `packages/domain`, section **« À partir de quel
  prix ? »** (prix maximal par critère avec le critère liant, décote nécessaire et sa classe
  colorée, rang parmi les annonces actives, offre suggérée au millier inférieur avec sa marge,
  arguments de négociation, détail des frais de notaire), **tableau de sensibilité** à deux axes
  au choix (prix, loyer, taux, apport, durée) coloré par verdict avec la cellule courante
  repérée, contrôles de louabilité, formulaire complet (bien, charges, travaux avec postes,
  phase 2, hypothèses surchargées), changement de statut avec garde-fou, avis des deux membres,
  tâches (dont « IA · champ manquant »), bloc **« Contexte »** (arrêt de tram le plus proche,
  DPE vérifié auprès de l'ADEME avec les candidats à retenir et la validité, plafond
  d'encadrement et son état, ventes DVF comparables datées avec la médiane au m², carte
  miniature, relance du géocodage), **frise des prix et des offres** (nouveau prix
  constaté, nouvelle offre avec canal et date, réponse du vendeur et contre-proposition, statut
  proposé après une réponse, jamais appliqué d'office), pastilles de provenance par champ.
  L'ouverture marque l'annonce « vue » pour le membre ; le badge « nouvelle » s'éteint pour lui
  seul. Le bloc **« Étude »** (lot 5) a cinq onglets : **Phase 1** (coût d'occupation contre le
  loyer actuel, part de capital remboursé, coût réel, date de bascule), **Scénarios** (éditeur
  « et si » recalculé en direct par `domain`, base et scénario côte à côte, enregistrement pour
  l'annonce ou l'espace, réapplication), **Projection** (TRI et VAN avant et après impôt,
  enrichissement net, graphique SVG des cash-flows et de la position, comparaison des régimes,
  tableau annuel, revente ; horizon, régime et TMI de l'aperçu ; « estimation, pas un conseil
  fiscal »), **Loyer de marché** (comparables saisis, médiane et quartiles au m², position du
  loyer visé et du plafond, « Retenir » écrit le loyer de marché de la phase 2) et
  **Conformité** (checklist datée et sourcée, risques Géorisques à l'adresse). Trois onglets en
  tête de fiche (lot 6) : **Fiche** (tout ce qui précède, avec l'encadré « Depuis votre dernière
  ouverture » et les champs modifiés par l'autre membre ou par Claude mis en évidence),
  **Visites** (faites ou planifiées, participants, compte rendu, points positifs et négatifs,
  note, tâche « Préparer la visite », statut « Visité » proposé sans être forcé, photos réduites
  sur l'appareil, envoyées dans un stockage privé, vignettes par URL signées, supprimables par
  leur auteur) et **Journal** (qui, quoi, quand, par quel canal, champs avant et après).
- **Comparer** (`/comparer?ids=…`) : depuis le tableau, cocher deux à six annonces puis
  « Comparer » : indicateurs, prix cibles, décotes et verdicts côte à côte, la meilleure par
  indicateur marquée ★. Le tableau comparatif porte aussi les colonnes triables « Prix cible »,
  « Décote » et « Classement ».
- **Activité** (`/activite`) : journal de l'espace, filtres par membre, canal (web, MCP,
  import, système) et type d'événement, paginé.
- **Notifications** (`/notifications` et la cloche de l'en-tête) : notifications lues et non
  lues (nouvelle annonce de l'autre membre ou de Claude, statut, tâche assignée, entrée dans un
  critère, réponse à une offre, annonces reçues par e-mail), préférences par type et par canal
  (application, push, e-mail), abonnement web push de l'appareil, adresse du webhook d'alertes
  e-mail.
- **Export** : bouton « Exporter » de la liste, CSV (« ; », UTF-8, colonnes en français) ou JSON
  complet versionné, de la sélection affichée ou de tout l'espace ([docs/export.md](docs/export.md)).
- **Hypothèses** (`/hypotheses`) : hypothèses de l'espace, versionnées : financement, frais de
  notaire par taux forfaitaire ou par barème (droit départemental, taxe communale, frais
  d'assiette, tranches d'émoluments, CSI, débours ; défauts Gironde datés, voir le modèle de
  calcul § 2), seuils de brut et de net, effort maximal, critères retenus pour le prix cible,
  seuils de décote « négociable » et « tendu », phase 1, fiscalité et horizon (loyer actuel,
  entretien, dates d'achat et de mise en location, TMI, régime visé, nature du meublé, horizon,
  revalorisation, IRL, frais de revente, taux d'actualisation ; paramètres fiscaux datés
  affichés), avec « Voir l'impact » (annonces dont le verdict changerait) avant d'enregistrer ;
  garde-fou sur la version en vigueur.

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

Les e2e (REST, géo, collaboration, prix cible et négociation, extraction IA, phase 1,
scénarios, projection, comparables et conformité, visites et photos, journal, nouveautés,
notifications, alertes e-mail signées, export, MCP par appels JSON-RPC réels) demandent
`TEST_DATABASE_URL` (voie 2 ci-dessus, ou le Postgres du Supabase CLI sur 54322). Le client
Anthropic, le géocodeur et les isochrones IGN, la recherche DPE de l'ADEME, le rapport
Géorisques, Supabase Storage, l'envoi web push et l'envoi d'e-mails sont remplacés par des
factices dans le harnais ; les tests du web
mockent MapLibre, terra-draw et Supabase : aucun réseau, aucune clé. La CI GitHub Actions (`.github/workflows/ci.yml`) rejoue lint,
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
phase 2, avis, tâches et « vu par ». Les adresses sont géocodées par la Géoplateforme IGN (même
client que l'API, `apps/api/src/opendata/geoplateforme.ts`) avec un cache dans
`data/private/geocode-cache.json` ; une annonce sans adresse exacte reçoit le
centroïde de sa commune (précision `commune`) et une tâche « demander l'adresse exacte ».
Relancer l'import est sans effet sur les annonces déjà présentes.

## Données ouvertes

Les fichiers se téléchargent dans `data/opendata/` (sources, licences et URL dans
[docs/open-data.md](docs/open-data.md)), puis :

```bash
pnpm import:rent-control                 # zonage et arrêté de l'encadrement (Bordeaux), contrôle croisé
pnpm import:transit-stops                # arrêts TBM et leurs lignes
pnpm import:dvf -- --year 2024           # ventes d'appartements de Bordeaux Métropole
pnpm geocode:missing -- --dry-run        # annonces à géocoder (sans point, ou au centroïde)
```

Chaque script accepte `--help`, `--dry-run` et `--database-url`. Le DPE (ADEME), le géocodage,
les isochrones (Géoplateforme) et le rapport de risques Géorisques sont appelés à la demande par
l'API, avec un cache en base ; `ISOCHRONE_URL`, `ADEME_DPE_URL` et `GEORISQUES_URL` changent
leur adresse.

## Déploiement

Vercel pour `apps/web` (statique) et `apps/api` (fonctions Node, `build:vercel`), Supabase
cloud pour la base et l'authentification (Google, serveur OAuth 2.1 pour le MCP), Sentry en
option. Étapes concrètes, variables et déclaration du connecteur dans claude.ai :
[docs/deploiement.md](docs/deploiement.md).
