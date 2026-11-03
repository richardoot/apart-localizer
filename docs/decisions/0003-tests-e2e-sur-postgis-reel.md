# 0003. Tests e2e sur un Postgres PostGIS réel, image multi-architecture

Statut : acceptée, 3 novembre 2026.

## Contexte

`bankin-analyzer` exécute ses tests e2e sur un Postgres embarqué démarré par `@prisma/dev`
dans le processus de test : rien à installer, une base par fichier de test. Ce serveur embarqué
ne fournit pas PostGIS, dont dépendent les colonnes `geography`, les index GiST et les requêtes
du module `geo` (ADR 0002).

L'image officielle `postgis/postgis` n'est publiée qu'en amd64 : elle ne tourne pas nativement
sur un Mac Apple Silicon (podman refuse de la tirer).

## Options

1. **Postgres embarqué** : pas de PostGIS, donc un schéma de test différent de la production.
2. **Supabase CLI seul** : fournit PostGIS, mais démarre une dizaine de conteneurs ; lourd pour
   la CI, et son installation dépend de la machine.
3. **Serveur Postgres + PostGIS dédié** (conteneur local, service dans GitHub Actions), le
   harnais créant une base par fichier de test et rejouant les migrations.

## Décision

Option 3. `TEST_DATABASE_URL` désigne un serveur Postgres avec PostGIS ; `apps/api/test/
e2e-database.ts` y crée une base `e2e_<pid>_<aléa>`, rejoue `prisma/migrations` dans l'ordre,
puis la supprime. En local, `docker/test-db.yml` (`pnpm db:test:up`) ou le Postgres du
Supabase CLI (port 54322) ; en CI, un service container.

L'image retenue est `imresamu/postgis:17-3.5`, construite pour amd64 et arm64, identique en
version de Postgres (17) et de PostGIS (3.5) à l'image officielle. Sur une machine x64,
`postgis/postgis:17-3.5` reste interchangeable.

## Conséquences

- Les e2e exercent le vrai PostGIS (rayon, polygone, plus proche arrêt) et la chaîne de
  migrations à chaque exécution.
- Les e2e demandent un serveur démarré ; le harnais nomme la commande à lancer quand il ne le
  trouve pas.
- Le Supabase CLI reste l'environnement de développement de référence (Auth, Studio) ; le
  conteneur PostGIS seul suffit pour les tests et pour un développement sans authentification
  réelle.
