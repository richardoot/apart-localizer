# 0017. Portées MCP : seules celles de l'application comptent, la découverte annonce ce que GoTrue délivre ; page de consentement dans le web

Statut : acceptée, 3 novembre 2026. Précise l'ADR 0005.

## Contexte

En activant le serveur OAuth 2.1 de GoTrue en local (CLI 3.0, GoTrue 2.197), le flux complet
d'un client MCP a pu être rejoué pour la première fois. Deux constats, valables aussi pour
Supabase cloud :

1. GoTrue n'accepte que les portées OpenID (`openid`, `email`, `profile`, `phone`,
   `offline_access`) : une demande d'autorisation avec `listings:read` est renvoyée au client avec
   `error=invalid_request&error_description=unsupported scope: listings:read`, avant tout
   consentement. Or un client MCP qui suit la spécification (le SDK MCP, donc l'inspecteur)
   demande exactement les `scopes_supported` de la ressource protégée, qui annonçaient
   `listings:read listings:write` : le connecteur ne pouvait pas s'autoriser.
2. Tout jeton émis par ce serveur porte une revendication `scope` (`email` par défaut, ou les
   portées OpenID demandées). Avec la règle de l'ADR 0005 (« un jeton qui déclare ses portées n'a
   que celles-là »), un tel jeton n'avait ni `listings:read` ni `listings:write` : toutes les
   écritures MCP auraient été refusées.

Par ailleurs, GoTrue délègue le consentement à l'application : il redirige vers
`site_url` + `authorization_url_path` (`/oauth/consent?authorization_id=…`). Cette page
n'existait pas dans le web.

## Décision

- `scopesFromToken` ne retient que les portées de l'application (préfixe `listings:`) ; un jeton
  qui n'en déclare aucune vaut toutes les portées, comme un jeton de session. Un jeton qui
  déclare `listings:read` sans `listings:write` reste en lecture seule ; une portée inconnue
  `listings:…` ne donne aucun droit.
- `/.well-known/oauth-protected-resource` annonce `scopes_supported: ["email"]`, la portée par
  défaut de GoTrue, qui n'exige ni jeton d'identité ni clé asymétrique.
- Page `/oauth/consent` dans le web (`OAuthConsentPage.vue`, connexion exigée, sans l'en-tête de
  l'application) : client, compte, hôte de retour, portées en phrases, ce que l'autorisation
  permet (lire, ajouter, modifier, jamais supprimer, journal au canal MCP), « Autoriser » et
  « Refuser » par `supabase.auth.oauth` ; un accord déjà donné repart aussitôt vers le client.
- En local, `[auth.oauth_server]` est activé avec l'enregistrement dynamique et ce chemin.

## Conséquences

- Le connecteur claude.ai, Claude Code et l'inspecteur MCP peuvent s'autoriser ; le flux a été
  rejoué par HTTP en local (enregistrement, autorisation, consentement, jeton ES256 portant
  `scope: email`, `tools/list` puis une écriture acceptée).
- La restriction « lecture seule » ne s'appliquera que lorsque le serveur d'autorisation saura
  inscrire `listings:read` dans le jeton ; d'ici là, un client autorisé lit et écrit, comme une
  session web, sans jamais supprimer.
- En production, le tableau de bord Supabase doit déclarer le chemin d'autorisation
  `/oauth/consent` avec `Site URL` = l'URL du web (`docs/deploiement.md`).
