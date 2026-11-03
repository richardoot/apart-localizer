# 0001. NestJS plutôt que Hono pour l'API

Statut : acceptée, 3 novembre 2026.

## Contexte

L'étude du 2 novembre proposait Hono + Zod pour l'API : moins de boilerplate que NestJS, un seul
schéma Zod partagé entre API, MCP, extraction IA et formulaires, tests sans serveur, exécution
identique en fonction Vercel ou en serveur Node. `bankin-analyzer` est écrit en NestJS 11 et
Richard en maîtrise les patrons (MCP, auth Supabase, e2e, déploiement Vercel).

Question posée : le choix reste-t-il pertinent si l'application grandit en cas d'usage et en
utilisateurs ?

## Options

1. **Hono** : rapide, léger, Zod natif ; aucune convention de structure, tâches de fond,
   WebSockets et files à assembler soi-même ; discipline à imposer (modules par contexte, dépôts,
   injection légère).
2. **NestJS** : modules, injection de dépendances, guards, intercepteurs, tâches planifiées,
   intégrations prêtes ; plus de code de cérémonie ; DTO class-validator en doublon des schémas
   Zod, sauf à passer par `nestjs-zod`.

## Décision

NestJS 11, avec `nestjs-zod` pour que les DTO dérivent des schémas Zod de `packages/contracts`
et que l'OpenAPI soit produit depuis ces mêmes schémas.

Motif : le nombre d'utilisateurs n'est pas le facteur limitant (les deux tiennent la charge) ;
c'est la croissance des cas d'usage et l'éventuelle arrivée d'autres développeurs. Les conventions
de Nest évitent de réinventer une structure et se reportent telles quelles de `bankin-analyzer`.

## Conséquences

- Le garde MCP, la découverte OAuth, le journal de requêtes, les en-têtes de sécurité, le filtre
  d'exceptions, `/health` et le `build:vercel` sont repris de `bankin-analyzer`.
- Un module Nest par contexte métier ; le module `mcp` orchestre sans logique propre.
- `packages/domain` et `packages/contracts` restent indépendants du framework : le choix de
  l'API reste réversible à faible coût.
