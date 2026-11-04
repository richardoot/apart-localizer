# 0018. Invitations : ligne de membre en attente, e-mail vérifié, espace quitté intact, retrait sans suppression

Statut : acceptée, 4 novembre 2026. Prolonge l'ADR 0004.

## Contexte

Le lot 8 (besoins K5, K6) ouvre l'espace à une troisième personne ou plus : un propriétaire
invite par e-mail, la personne se connecte avec Google et arrive dans l'espace partagé ; un
membre peut être retiré sans que son historique disparaisse. L'ADR 0004 rattachait déjà, à la
première connexion, l'identité Supabase au membre pré-créé de même e-mail (import de
l'artefact) et donnait un « Mon espace » à toute identité inconnue. Une identité ne se rattache
qu'à un seul membre (`members.auth_user_id` unique). La base de production contient déjà deux
espaces, trois membres et vingt-neuf annonces.

## Options

1. **Une table `invitations` à part**, le membre n'étant créé qu'à l'acceptation : deux cycles de
   vie à tenir alignés, et le rattachement de l'ADR 0004 à dédoubler.
2. **L'invitation est une ligne de membre en attente** (`status = invited`, sans compte), datée
   et qui expire : le rattachement existant la trouve par e-mail, comme un membre importé.

## Décision

Option 2.

- **Modèle** : `members.status` (`active`, `invited`, `canceled`, `declined`, `removed`), et
  `invited_at`, `invited_by_id`, `invitation_expires_at`, `invitation_closed_at`, `joined_at`,
  `removed_at`, `removed_by_id`. Invariant : une ligne reliée à un compte est `active`. Migration
  purement additive (`20261104120000_lot8_invitations`) : les lignes existantes prennent
  `active`, rôles inchangés (Richard `owner`, Chloé `member`). Les règles sont pures, dans
  `packages/domain/src/members.ts` ; l'API applique dans une transaction, sous un verrou
  consultatif par espace (deux propriétaires qui se retirent l'un l'autre ne laissent pas
  l'espace sans propriétaire).
- **Rôles** : seul un propriétaire actif renomme l'espace, invite, annule une invitation, change
  un rôle ou retire un membre ; l'espace garde toujours au moins un propriétaire actif (le
  dernier ne peut ni être retiré, ni être rétrogradé, ni partir). « Transmettre la propriété »,
  c'est nommer un autre propriétaire, puis partir.
- **Invitation** : e-mail (normalisé en minuscules) et nom affiché ; échéance à 14 jours
  (`INVITATION_TTL_DAYS`, 1 à 90) ; dix invitations en attente au plus par espace. Refus : adresse
  invalide (400), adresse d'un membre actif ou invitation déjà en attente (409), `member` qui
  invite (403). Réinviter une adresse dont l'invitation a expiré, a été annulée ou refusée, ou un
  ancien membre, **réutilise sa ligne** : un ancien membre réinvité retrouve son historique.
  L'e-mail part par l'envoi HTTP de l'ADR 0015 s'il est configuré ; sinon (ou en échec) la
  réponse donne le lien de l'application, que le propriétaire transmet lui-même.
- **Rattachement à la première connexion** (garde Supabase et garde MCP) : seulement si
  l'adresse est **vérifiée**. `getUser` rend l'utilisateur GoTrue, pas les revendications du
  JWT ; « vérifiée » veut dire `email_confirmed_at` renseigné (écrit par GoTrue quand Google dit
  `email_verified: true`, ou après le lien de confirmation d'un compte e-mail) et aucune
  identité d'un fournisseur externe portant cette adresse avec `identity_data.email_verified:
false`. `user_metadata.email_verified` n'est pas lu : la personne peut le réécrire
  (`updateUser({ data })`). Ordre : le membre **pré-créé** (ligne `active` sans compte et
  **sans `invited_at`** : c'est ce qui distingue l'import et le jeu de démo d'une invitation) le
  plus ancien, sinon l'invitation en attente et non expirée la plus récente, sinon « Mon
  espace ». La règle de l'adresse vérifiée vaut aussi pour les membres pré-créés : avec Google,
  rien ne change pour eux. Chaque rattachement est journalisé (`member.joined`) ; seule
  l'arrivée par invitation notifie les propriétaires (`member_joined`).
- **Personne déjà inscrite** (elle a son « Mon espace ») : pas de rattachement automatique ; un
  bandeau du web liste les invitations en attente adressées à son adresse vérifiée, « Rejoindre »
  ou « Refuser ». Rejoindre détache l'identité de son membre actuel (ligne gardée, `removed`,
  auteur = elle-même : « partie ») et la rattache à l'invitation, dans une transaction ; ses
  appareils push la suivent. **L'espace quitté n'est jamais supprimé** : il reste intact, ses
  annonces comprises. S'il n'a plus aucun membre actif, il devient orphelin et inaccessible, et
  ses invitations en attente sont annulées (personne n'arrivera dans un espace sans
  propriétaire). Rejoindre est **refusé** (409) au seul propriétaire d'un espace qui compte
  d'autres membres actifs : il nomme d'abord un autre propriétaire. Refuser passe l'invitation
  `declined`, visible du propriétaire, qui peut réinviter.
- **Retrait** : la ligne n'est pas supprimée ; elle passe `removed` (date, auteur), l'identité
  est détachée, ses abonnements push supprimés, ses envois en attente abandonnés. Le membre étant
  résolu à chaque requête, l'accès est coupé dès la suivante (web, REST, jetons MCP encore
  valides). Avis, tâches, visites et journal gardent son nom ; on ne lui assigne plus de tâche.
  S'il se reconnecte, il retrouve une invitation en attente ou reçoit un espace à lui.
  Partir (`POST /workspace/leave`) suit la même règle.
- **MCP** : aucun outil d'écriture sur les membres. `list_members` (lecture seule) donne les
  identifiants courts, rôles et l'état de connexion, sans adresse e-mail.

## Conséquences

- Routes REST : `GET /workspace` (membres actifs puis anciens, invitations en attente,
  expirées ou refusées), `PATCH /workspace`, `POST /workspace/invitations`,
  `POST /workspace/invitations/:id/cancel`, `GET /workspace/invitations/received`,
  `POST /workspace/invitations/:id/accept | decline`, `PATCH /workspace/members/:id`,
  `POST /workspace/members/:id/remove`, `POST /workspace/leave`. Page « Espace » (`/espace`) et
  bandeau d'invitation dans le web.
- Les e-mails des invités sont stockés dès l'invitation (docs/confidentialite.md) ; une
  invitation annulée garde sa ligne (historique du journal).
- `scripts/link-local-identities.ts` ne rattache plus que les membres actifs : une invitation
  passe par la connexion, un ancien membre ne retrouve jamais l'accès par ce script.
- Un GoTrue réglé pour confirmer d'office les adresses (« Confirm email » désactivé avec
  l'inscription par e-mail ouverte) rendrait toute adresse « vérifiée » : en production, seul
  Google est ouvert (docs/deploiement.md § 1). En local, les comptes e-mail et mot de passe sont
  confirmés d'office : ils comptent comme vérifiés, ce qui permet de tester les invitations.
- Un espace orphelin ne se récupère qu'en base (rattacher une identité à l'une de ses lignes) ;
  rien ne le supprime.
