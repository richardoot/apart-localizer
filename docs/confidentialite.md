# Confidentialité et données personnelles

L'application sert un foyer (deux personnes, plus les invités du lot 8), sur des données qui leur
appartiennent ; le dépôt est public. Ce qui suit dit où sont les données personnelles et comment
elles sont protégées.

## Données et accès

- **Espace** : chaque requête passe par le garde Supabase, qui résout le membre et son espace ;
  aucune lecture ni écriture ne traverse un espace (tests e2e « stranger »). Le MCP suit la même
  règle, avec les portées `listings:read` et `listings:write` (ADR 0005).
- **Photos de visite** : bucket Supabase Storage **privé**, un dossier par espace, sans
  politique d'accès public ni authentifié ; seule l'API (clé `service_role`) émet des URL
  signées, valables 600 s par défaut. Le navigateur réduit chaque photo avant l'envoi, ce qui en
  retire les métadonnées EXIF (position GPS comprise). Une photo ne se supprime que par son
  auteur ; supprimer une visite supprime ses photos du stockage. Les photos ne passent ni par le
  MCP ni par l'export.
- **Export** (`GET /export`) : réservé aux membres de l'espace, ne contient ni photo, ni adresse
  e-mail, ni identifiant de connexion ; `Cache-Control: no-store`.
- **Notifications** : le texte d'une notification push transite par le service push du
  navigateur (Google, Apple, Mozilla) chiffré de bout en bout (Web Push, RFC 8291) ; il ne porte
  que le titre de l'annonce et le nom du membre. Un abonnement expiré est supprimé. L'e-mail est
  inactif sans configuration.
- **Alertes e-mail entrantes** : le webhook n'accepte qu'un appel signé (HMAC, secret du
  serveur) ; l'e-mail n'est pas conservé : seuls son sujet, son expéditeur et les extraits des
  annonces repérées vivent dans les brouillons.
- **IA** : seul le texte de l'annonce (ou de l'alerte) part au modèle, jamais de donnée de
  membre (docs/ia.md).
- **Invitations (lot 8, ADR 0018)** : inviter enregistre l'adresse e-mail et le nom affiché de
  la personne dans `app.members` dès l'invitation, avant tout consentement de sa part ; ils sont
  visibles des membres de l'espace (page Espace) et du journal d'activité (« a invité « Léa »
  (lea@…) »). Une invitation expire à 14 jours (`INVITATION_TTL_DAYS`) mais sa ligne reste,
  comme celle d'une invitation annulée ou refusée, pour l'historique ; la réinviter réutilise la
  ligne. L'e-mail d'invitation ne part que si l'envoi est configuré (ADR 0015) ; il ne contient
  que le nom de l'espace, celui du propriétaire, l'adresse invitée et le lien de l'application.
  Le rattachement exige une adresse vérifiée par le fournisseur (Google). Le MCP (`list_members`)
  ne rend aucune adresse.
- **Retrait d'un membre** : sa ligne reste (nom, adresse, rôle) pour que ses avis, tâches, visites
  et le journal gardent son nom ; son identité est détachée (l'accès est coupé dès la requête
  suivante, MCP compris), ses abonnements push sont supprimés. Un espace quitté pour en rejoindre
  un autre n'est jamais supprimé.

## Journaux

- Le journal de requêtes (`apps/api/src/common/request-log.ts`) n'écrit que méthode, chemin sans
  chaîne de requête, statut, durée, identifiant de requête et identifiant opaque du membre :
  jamais le corps, les en-têtes, la chaîne de requête, une adresse e-mail ou un jeton. Les
  chemins portent des identifiants techniques (UUID), pas de donnée personnelle.
- Les avertissements des envois (push, e-mail) ne citent que le code d'erreur.
- Sentry (facultatif) ne reçoit ni corps, ni chaîne de requête, ni cookies (docs/deploiement.md
  § 6).
- Le journal d'activité de l'espace (`activity_logs`) garde qui a changé quoi, quand et par
  quel canal : il est lisible par les membres de l'espace et ne fait pas partie de l'export
  (format version 1).

## Droits des personnes

- **Accès et portabilité** : export JSON complet (docs/export.md).
- **Effacement** : supprimer un espace (en base, `DELETE` sur `app.workspaces`) supprime en
  cascade annonces, visites, notifications, abonnements et brouillons ; les objets du dossier de
  l'espace dans le bucket se suppriment depuis le tableau de bord Supabase (Storage → dossier de
  l'espace). Retirer un membre dans l'application coupe son accès mais garde sa ligne (nom et
  adresse) pour l'historique ; pour effacer aussi cette ligne, la supprimer en base
  (`app.members`) : ses avis, annonces vues et notifications partent avec elle (cascade), ses
  autres écritures (tâches, visites, offres, journal) restent, anonymisées (auteur à null). Une
  invitation annulée, refusée ou expirée s'efface de même (elle n'a rien écrit).
- **Rectification** : tout se modifie dans l'application ; les avis et tâches de chacun restent
  à leur auteur.
