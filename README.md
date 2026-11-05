# apart-localizer

Suivi d'annonces d'achat d'appartement assisté par IA : normalisation des critères, pipeline
partagé (interface web et MCP), carte et critères géographiques, évaluation de la rentabilité et
du prix cible, puis l'étude dans le temps : coût d'occupation en phase 1, scénarios « et si »,
fiscalité estimée, projection jusqu'à la revente avec TRI, loyer de marché par comparables et
checklist réglementaire datée avec les risques Géorisques ; et le confort du quotidien à deux :
visites avec photos privées, journal d'activité, « ce qui a changé depuis ma dernière visite »,
notifications (cloche, web push, e-mail en option), partage d'une annonce depuis le téléphone,
alertes e-mail transférées en brouillons à valider, export CSV et JSON ; et l'ouverture de
l'espace à d'autres personnes, invitées par e-mail, avec rôles et retrait. Les lots 0 à 6 de la
feuille de route sont livrés, le lot 7 rend l'environnement local démarrable en une commande, le
lot 8 ajoute les invitations et le lot 9 rend la fiche lisible : deux bases de calcul (« sur le
prix », « tout compris »), onglets, synthèse en trois questions.

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
- [Développement local](docs/developpement-local.md)
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
scripts/        pile locale (stack:up, down, status, reset), jeu de démonstration, raccordement
                des identités, verify ; import de l'artefact Claude ; imports open data
                (encadrement, arrêts TBM, DVF) ; géocodage des annonces manquantes
supabase/       configuration du Supabase CLI (Auth e-mail et Google, serveur OAuth 2.1, Storage)
docker/         Postgres + PostGIS pour les tests e2e (port 54329)
docs/           produit et décisions
data/private/   exports et caches personnels, jamais commités
data/opendata/  fichiers open data téléchargés (DVF, TBM, encadrement), jamais commités
```

## Développement local

Depuis un clone frais, trois commandes :

```bash
pnpm install
pnpm stack:up --dataset demo   # Supabase CLI, .env, migrations, base de test, espace « Démo » fictif
pnpm dev                       # api sur http://localhost:3000, web sur http://localhost:5173
```

Puis http://localhost:5173, « Connexion locale » : `demo@apart.local` / `demo-apart-local`
(ou `demo2@apart.local` pour l'autre membre). Prérequis : Node 24, pnpm 12.5.1 (`corepack
enable` ou volta), le [Supabase CLI](https://supabase.com/docs/guides/local-development) 3.0 ou
plus, podman (ou Docker). Tout est détaillé dans
[docs/developpement-local.md](docs/developpement-local.md) : ce que fait chaque commande, les
jeux de données, les comptes de démo, le test du MCP (Claude Code, inspecteur), du partage et du
push, le dépannage et la remise à zéro.

```bash
pnpm stack:up                  # démarre ou met à jour la pile sans toucher aux données (idempotent)
pnpm stack:up --dataset artifact --richard-email r@exemple.fr --chloe-email c@exemple.fr
pnpm stack:up --opendata       # imports open data dont les fichiers sont dans data/opendata/
pnpm stack:up --dev            # puis pnpm dev au premier plan
pnpm stack:status              # état, adresses, annonces et membres par espace
pnpm stack:down                # arrêt, données conservées
pnpm stack:reset --yes         # DESTRUCTIF : vide le schéma app local, rejoue migrations et jeu
pnpm verify                    # rejoue les étapes de la CI ; --quick sans e2e ni build (hook pre-push)
```

`stack:up` lance la CLI Supabase (avec le bon `DOCKER_HOST` pour podman), écrit ou complète
`apps/api/.env`, `apps/web/.env` et `supabase/.env` par fusion (vos clés `ANTHROPIC_API_KEY`,
`SENTRY_*`, Google… sont conservées, l'original est sauvegardé en `.env.backup`), génère des clés
VAPID locales, applique les migrations Prisma, crée le bucket des photos, démarre la base de test
(`docker/test-db.yml`, port 54329), charge le jeu choisi, rattache les identités, puis affiche les
adresses : web, API, Swagger, MCP, Studio (54323), Mailpit (54324). La connexion par mot de passe
n'existe qu'en local (`VITE_AUTH_PASSWORD=1`) ; en production, Google reste le seul moyen
(ADR 0016).

### Migrations

```bash
pnpm --filter @apart/api prisma:deploy     # applique prisma/migrations (stack:up le fait)
pnpm --filter @apart/api prisma:migrate    # crée une migration après un changement de schéma (dev)
```

Migrations : `20261103000000_init` (schéma complet, PostGIS, index GiST),
`20261103120000_lot3_offers` (canal, date de réponse, auteur et dates des offres), puis
`20261103180000_lot4_criteria_opendata` (entrées des annonces dans les critères, zonage de
l'encadrement, clés d'import des arrêts et des ventes DVF, numéro de DPE et instantané open data
des annonces), puis `20261103210000_lot5_scenarios_rent_comparables` (scénarios « et si »
enregistrés, annonces de location comparables), puis `20261103230000_lot6_visits_notifications`
(visites et photos, notifications et abonnements push, brouillons reçus par e-mail, horodatage
de visite et préférences des membres).

### Sans le Supabase CLI

Le conteneur PostGIS seul (`pnpm db:test:up`, port 54329) suffit aux tests e2e :
`TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/postgres` (le harnais crée une
base par fichier de test et la supprime). Sur Mac Apple Silicon l'image `imresamu/postgis` est
utilisée car l'image officielle n'existe qu'en amd64 (ADR 0003).

## Démarrage

`pnpm dev` (après `pnpm stack:up`) : api sur http://localhost:3000, web sur
http://localhost:5173, paquets en watch.

OpenAPI : http://localhost:3000/api/docs. Santé : http://localhost:3000/health. MCP :
`POST http://localhost:3000/mcp` (jeton Supabase en `Authorization: Bearer`), découverte sur
`/.well-known/oauth-protected-resource` et `/.well-known/oauth-authorization-server` ; outils
et garde-fous dans [docs/mcp.md](docs/mcp.md). Le consentement OAuth d'un client MCP passe par la
page `/oauth/consent` du web ; en local, `claude mcp add --transport http apart-local
http://localhost:3000/mcp` ([développement local](docs/developpement-local.md#tester-le-mcp-en-local)).

### Écrans du web

- **Connexion** (`/login`) : Google ; en local seulement (`VITE_AUTH_PASSWORD=1`, écrit par
  `stack:up`), e-mail et mot de passe, avec « Créer un compte local ».
- **Autorisation** (`/oauth/consent`) : la page de consentement du serveur OAuth 2.1 de Supabase
  pour un client MCP (claude.ai, Claude Code) : client, compte, hôte de retour, portées en
  phrases, ce que l'accès permet, « Autoriser » ou « Refuser ».
- **Synthèse** (`/`) : bandeau **« Depuis votre dernière visite »** (nouvelles annonces,
  changements de prix et de statut, avis et tâches de l'autre membre, entrées dans un critère,
  détail et liens, « Tout marquer comme vu »), annonces **reçues par e-mail à valider** (valider
  ouvre la fiche pré-remplie, écarter), compteurs (nouvelles, suivies, dans la cible, meilleur brut, prix moyen au
  m², à visiter), répartition par statut, tâches ouvertes et en retard, critères de recherche
  actifs avec leurs annonces et leurs nouveautés pour moi, nouvelles annonces, meilleures
  annonces.
- **Annonces** (`/annonces`) : filtres partagés (statut, commune, critère enregistré, verdict,
  DPE, prix, recherche, « nouvelles pour moi », « à revérifier », point et rayon) synchronisés
  avec l'URL ; chaque annonce dit « Vérifiée il y a 3 j » ou « À revérifier » (lot 15) ; trois
  vues : tableau comparatif (TanStack Table, tri par colonne), cartes (mobile), carte MapLibre
  (marqueurs colorés par verdict ou statut, popup vers la fiche, clic = point du filtre, curseur
  de rayon, couches activables : périmètres des critères, arrêts de tram et de bus, ventes DVF
  des trois dernières années, zones d'encadrement avec leur légende ; un clic sur un arrêt ou une
  vente en montre le détail). Lot 14 : deux onglets « Dans les critères » et « Hors critères »
  (dans l'URL), pastilles d'adéquation (dans les critères, à confirmer, à la marge, hors
  critères) avec leur raison ; une annonce hors critères avec une offre en cours ou une visite
  prévue reste dans la liste.
- **Critères** (`/criteres`) : critères de recherche partagés avec leurs compteurs (annonces
  par niveau d'adéquation, nouveautés pour moi), création et modification (filtres, marge de
  tolérance et seuils réels, aperçu par niveau avant d'enregistrer, périmètre dessiné en
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
- **Fiche** (`/annonces/:id`) : panneau latéral élargi (plein écran sur mobile), en cinq
  onglets dont l'actif est dans l'URL (`?onglet=negocier`, lot 9). Chaque valeur porte sa base de
  calcul : pastille **« sur le prix »** (se compare au prix affiché) ou **« tout compris »**
  (prix + notaire + travaux + mobilier), et un bouton « ? » donne la définition des indicateurs
  principaux (glossaire partagé avec le MCP). **Synthèse** : bandeau « Deux bases de calcul »,
  trois blocs (« Combien négocier ? » : prix affiché, prix cible et son échelle, décote et sa
  classe, critère liant, offre suggérée ; « Combien ça coûte ? » : du prix au coût tout compris,
  apport, emprunt, mensualité crédit + assurance ; « Est-ce rentable ? » : loyer retenu et
  plafond, rendement brut, effort, rendement net avec formule, seuil et ✓/✗ ou « non retenu »,
  verdict), l'encart **« Et au prix cible ? »** (coût, brut, effort et verdict au prix cible,
  calculés par `domain`), résumés louabilité, suivi et quartier, et l'encadré « Depuis votre
  dernière ouverture ». **Négocier** : « À partir de quel prix ? » (par critère : exigence, prix
  affiché maximal, coût tout compris maximal, décote ; critère liant surligné, critères non
  retenus grisés ; rang, offre suggérée au millier inférieur avec sa marge, arguments, détail des
  frais de notaire), **tableau de sensibilité** à deux axes au choix (prix affiché, loyer, taux,
  apport, durée) expliqué en une phrase, coût tout compris sous chaque prix, ligne du prix cible
  insérée, verdict par couleur et par symbole (✓ ~ ✗), détail de la case choisie sous la grille
  (coût, mensualité, rendements, effort), et la **frise des prix et des offres** (nouveau prix
  constaté, nouvelle offre avec canal et date, réponse du vendeur et contre-proposition, statut
  proposé après une réponse, jamais appliqué d'office). **Financer et louer** : contrôles de
  louabilité, le bloc **« Étude »** (lot 5) en cinq onglets — **Phase 1** (coût d'occupation
  contre le loyer actuel, part de capital remboursé, coût réel, date de bascule), **Scénarios**
  (éditeur « et si » recalculé en direct par `domain`, base et scénario côte à côte,
  enregistrement pour l'annonce ou l'espace, réapplication), **Projection** (TRI et VAN avant et
  après impôt, enrichissement net, graphique SVG des cash-flows et de la position, comparaison
  des régimes, tableau annuel, revente ; horizon, régime et TMI de l'aperçu ; « estimation, pas
  un conseil fiscal »), **Loyer de marché** (comparables saisis, médiane et quartiles au m²,
  position du loyer visé et du plafond, « Retenir » écrit le loyer de marché de la phase 2) et
  **Conformité** (checklist datée et sourcée) — puis le formulaire complet (bien, charges,
  travaux avec postes, phase 2, hypothèses surchargées, pastilles de provenance, champs modifiés
  par l'autre membre ou par Claude mis en évidence) ; « Modifier la fiche » l'ouvre, avec
  l'aperçu en direct calculé dans le navigateur par `packages/domain`, que la synthèse montre
  aussi pendant la saisie. **Quartier** : bloc **« Contexte »** (arrêt de tram le plus proche,
  DPE vérifié auprès de l'ADEME avec les candidats à retenir et la validité, plafond
  d'encadrement et son état, ventes DVF comparables datées avec la médiane au m², carte
  miniature, relance du géocodage) et risques Géorisques à l'adresse. **Suivi** (avec le nombre de
  tâches ouvertes) : **mises à jour** (lot 15 : chronologie des vérifications de l'annonce sur
  son portail, par Claude ou un membre, avec le résultat, les changements avant → après, l'extrait
  de la page et l'annonce rattachée par une republication ; « Vue en ligne aujourd'hui » et
  « Plus en ligne », dont le statut proposé n'est appliqué qu'après confirmation), avis des deux membres, tâches (dont « IA · champ manquant »), **visites**
  (faites ou planifiées, participants, compte rendu, points positifs et négatifs, note, tâche
  « Préparer la visite », statut « Visité » proposé sans être forcé, photos réduites sur
  l'appareil, envoyées dans un stockage privé, vignettes par URL signées, supprimables par leur
  auteur) et **journal** (qui, quoi, quand, par quel canal, champs avant et après). Le
  changement de statut avec garde-fou reste en tête de fiche. L'ouverture marque l'annonce
  « vue » pour le membre ; le badge « nouvelle » s'éteint pour lui seul.
- **Comparer** (`/comparer?ids=…`) : depuis le tableau, cocher deux à six annonces puis
  « Comparer » : indicateurs, prix cibles, décotes et verdicts côte à côte, la meilleure par
  indicateur marquée ★. Le tableau comparatif porte aussi les colonnes triables « Prix cible »,
  « Décote » et « Classement » ; ses en-têtes chiffrés, comme les lignes de la comparaison et les
  cartes, sont marqués de leur base de calcul (« sur le prix » ou « tout compris »).
- **Activité** (`/activite`) : journal de l'espace, filtres par membre, canal (web, MCP,
  import, système) et type d'événement, paginé.
- **Espace** (`/espace`) : nom de l'espace, membres (rôle, connecté ou non), anciens membres,
  invitations en attente, expirées ou refusées ; un propriétaire invite par e-mail (e-mail envoyé
  si l'envoi est configuré, sinon lien à transmettre), annule, renouvelle, nomme un autre
  propriétaire, retire un membre (son historique reste à son nom) ; chacun peut partir, sauf le
  dernier propriétaire. Une personne déjà inscrite qui reçoit une invitation voit en haut de
  chaque page un bandeau « Rejoindre / Refuser » (ADR 0018).
- **Notifications** (`/notifications` et la cloche de l'en-tête) : notifications lues et non
  lues (nouvelle annonce de l'autre membre ou de Claude, statut, tâche assignée, entrée dans un
  critère, réponse à une offre, annonces reçues par e-mail, arrivée d'un membre invité pour les
  propriétaires), préférences par type et par canal
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

Fonds de carte (lot 10) : plan OpenStreetMap, plan IGN et photo aérienne IGN, au choix sur
chaque carte, sans clé (docs/open-data.md). `VITE_MAP_STYLE_URL` dans `apps/web/.env` remplace
le plan OpenStreetMap, par défaut le style libre et sans clé d'OpenFreeMap
(`https://tiles.openfreemap.org/styles/liberty`).

## Qualité et tests

```bash
pnpm verify               # tout ce que fait la CI, dans le même ordre (--quick : sans e2e ni build)
pnpm lint
pnpm format:check
pnpm type-check
pnpm test                 # unitaires (contracts, domain, api, web, scripts) puis e2e (API, seed de démo)
pnpm --filter @apart/domain test:cov
pnpm build
```

Les e2e (REST, géo, collaboration, prix cible et négociation, extraction IA, phase 1,
scénarios, projection, comparables et conformité, visites et photos, journal, nouveautés,
notifications, alertes e-mail signées, export, MCP par appels JSON-RPC réels) demandent
`TEST_DATABASE_URL` (la base de test de `stack:up`, ou `pnpm db:test:up`). Le client
Anthropic, le géocodeur et les isochrones IGN, la recherche DPE de l'ADEME, le rapport
Géorisques, Supabase Storage, l'envoi web push et l'envoi d'e-mails sont remplacés par des
factices dans le harnais ; les tests du web
mockent MapLibre, terra-draw et Supabase : aucun réseau, aucune clé. La CI GitHub Actions (`.github/workflows/ci.yml`) rejoue lint,
format, type-check, unitaires, e2e sur un service PostGIS (API et seed de démo), puis le build ;
`pnpm verify` lit ce fichier et rejoue les mêmes étapes en local.

## Import des données de l'artefact

Placez l'export dans `data/private/artifact-export/` (`annonces/*.json`,
`reglages/financement.json`), puis :

```bash
pnpm stack:up --dataset artifact --richard-email richard@exemple.fr --chloe-email chloe@exemple.fr
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
Relancer l'import est sans effet sur les annonces déjà présentes. En local, sans Google : se
connecter avec « Créer un compte local » et le **même e-mail** que le membre importé
([développement local](docs/developpement-local.md#vos-vraies-annonces-en-local)).

## Données ouvertes

Les fichiers se téléchargent dans `data/opendata/` (sources, licences et URL dans
[docs/open-data.md](docs/open-data.md)), puis :

```bash
pnpm import:rent-control                 # zonage et arrêté de l'encadrement (Bordeaux), contrôle croisé
pnpm import:transit-stops                # arrêts TBM et leurs lignes
pnpm import:dvf -- --year 2024           # ventes d'appartements de Bordeaux Métropole
pnpm geocode:missing -- --dry-run        # annonces à géocoder (sans point, ou au centroïde)
pnpm import:neighbourhoods               # quartiers de la métropole (officiels, secteurs de vie, IRIS)
pnpm import:sports-facilities            # pistes d'athlétisme et salles Fitness Park
pnpm import:supermarkets                 # supermarchés avec drive (OpenStreetMap)
pnpm refresh:surroundings -- --dry-run   # quartier et équipements des annonces existantes
```

Chaque script accepte `--help`, `--dry-run` et `--database-url` ; les imports du lot 11 lisent
aussi leurs sources en ligne avec `--download` (Overpass, Data ES, datahub de Bordeaux
Métropole, Géoplateforme). Le DPE (ADEME), le géocodage,
les isochrones (Géoplateforme) et le rapport de risques Géorisques sont appelés à la demande par
l'API, avec un cache en base ; `ISOCHRONE_URL`, `ADEME_DPE_URL` et `GEORISQUES_URL` changent
leur adresse.

## Déploiement

Vercel pour `apps/web` (statique) et `apps/api` (fonctions Node, `build:vercel`), Supabase
cloud pour la base et l'authentification (Google, serveur OAuth 2.1 pour le MCP), Sentry en
option. Étapes concrètes, variables et déclaration du connecteur dans claude.ai :
[docs/deploiement.md](docs/deploiement.md).
