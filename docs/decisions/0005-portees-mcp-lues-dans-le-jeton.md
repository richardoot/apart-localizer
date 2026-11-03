# 0005. Portées MCP lues dans le jeton ; un jeton sans portée vaut toutes les portées

Statut : acceptée, 3 novembre 2026 ; précisée par l'ADR 0017 (seules les portées `listings:…` du
jeton comptent, la découverte annonce `email`).

## Contexte

L'étude du besoin (§ 3.7, § 5) demande des portées OAuth `listings:read` et `listings:write`
pour le connecteur MCP, limite connue de `bankin-analyzer` où tout jeton Supabase valide peut
écrire. Le serveur d'autorisation est GoTrue (Supabase Auth en serveur OAuth 2.1) : c'est lui
qui émet le jeton d'accès remis à claude.ai, et l'API ne contrôle ni son format ni la liste des
portées qu'il accepte de délivrer. Hors ligne, il n'a pas été possible de vérifier si le
tableau de bord Supabase permet de déclarer des portées personnalisées et de les inscrire dans
le jeton.

Deux sortes de jetons atteignent `/mcp` : ceux d'un client OAuth tiers (claude.ai), qui portent
la revendication `scope` que GoTrue y a inscrite, et ceux d'une session de première main (un
test, un script, l'application web elle-même), qui n'en portent pas.

## Options

1. **Exiger la portée dans tous les jetons** : un jeton sans `scope` est refusé. Simple et
   strict, mais inutilisable tant que GoTrue n'inscrit pas les portées, et bloque les tests.
2. **Ignorer les portées** (comme `bankin-analyzer`) : tout jeton valide écrit. C'est la limite
   que l'étude demande de corriger.
3. **Lire la revendication si elle existe** : un jeton qui déclare ses portées n'a que celles-là ;
   un jeton qui n'en déclare aucune vaut toutes les portées, parce que la personne qu'il
   représente peut déjà tout faire dans l'application.

## Décision

Option 3. `McpAuthGuard` authentifie le jeton par Supabase (comme `SupabaseGuard`), puis lit la
charge utile JWT sans la vérifier de nouveau (`scopesFromToken`) : `scope` (chaîne séparée par
des espaces), `scopes` (tableau) ou `scp`. Les outils d'écriture refusent, en réponse et non en
exception, un jeton qui déclare des portées sans `listings:write`. La découverte
(`/.well-known/oauth-protected-resource`) annonce les deux portées pour que le client les
demande.

## Conséquences

- Dès que GoTrue inscrit les portées demandées par claude.ai dans le jeton, la restriction
  lecture seule est effective sans changement de code.
- Tant qu'il ne le fait pas, le comportement est celui de `bankin-analyzer`, documenté comme
  tel dans `docs/mcp.md` et `docs/deploiement.md` (point à vérifier dans le tableau de bord
  Supabase, « Authentication → OAuth Server »).
- Les tests e2e exercent les deux cas avec des jetons JWT non signés (le harnais remplace la
  vérification Supabase) : lecture seule refusée à l'écriture, écriture acceptée avec la portée.
