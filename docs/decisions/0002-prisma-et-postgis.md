# 0002. Prisma 7 conservé, PostGIS activé pour la géo

Statut : acceptée, 3 novembre 2026.

## Contexte

Avec Hono, Drizzle était proposé (SQL explicite, léger, `drizzle-zod`, type `geometry` natif).
Une fois NestJS retenu (ADR 0001), la question de l'ORM s'est reposée, puis un nouveau besoin est
apparu : filtrer les annonces par un point et un rayon, un polygone dessiné sur une carte ou une
isochrone, et interroger des données volumineuses (ventes DVF de la Gironde, arrêts de tram) dans
ces périmètres.

## Options

1. **Drizzle** : type `geometry` natif, requêtes SQL typées (`ST_DWithin` dans `sql`), pas de
   client généré ; pas de module Nest officiel ; tout le socle Prisma de `bankin-analyzer` à
   réécrire.
2. **Prisma 7** : `PrismaService`, mapping d'erreurs, harnais e2e, pipeline Vercel déjà écrits ;
   schéma déclaratif lisible ; sans moteur Rust avec `@prisma/adapter-pg` ; pas de type
   géométrique natif, d'où `Unsupported` et SQL brut pour la géo.

## Décision

Prisma 7 avec `@prisma/adapter-pg`, PostGIS activé dès la première migration.

- Colonnes `geography(Point, 4326)` et `geography(Polygon, 4326)` déclarées `Unsupported`,
  latitude et longitude en colonnes classiques à côté, GeoJSON d'origine en `Json`.
- Index GiST et `CREATE EXTENSION postgis` dans le SQL des migrations Prisma.
- Toutes les requêtes géographiques dans un module `geo`, en TypedSQL ou `$queryRaw` dont le
  résultat est validé par un schéma Zod ; aucune requête géo ailleurs.

Motif : les besoins géo tiennent en une poignée de requêtes (rayon, périmètre, plus proche
arrêt, comparables DVF). Ils ne justifient pas de perdre le socle Prisma réutilisable.

## Conséquences

- Supabase CLI en local fournit PostGIS ; le Postgres de test des e2e l'active aussi.
- Si la géo devenait centrale (cartes de chaleur, polygones de quartier, isochrones en masse), le
  module `geo` passerait à un accès SQL dédié ou à Drizzle, sur la même base, sans toucher au
  reste.
- Les géométries échangées avec le web et le MCP sont du GeoJSON validé par `contracts`.
