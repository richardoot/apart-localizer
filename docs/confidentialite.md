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
- **Mode visite (lot 24, ADR 0034)** : ce qui est fait pendant une visite (points cochés,
  remarques, notes, compte rendu, photos) est d'abord gardé **sur l'appareil**, dans la base
  IndexedDB `apart-localizer` du navigateur, puis envoyé à l'API dès que le serveur répond. On y
  trouve : la file des écritures en attente, une par membre connecté (clé `outbox:<UUID
Supabase>` ; la file d'un membre n'est jamais rejouée sous le compte d'un autre) ; les photos
  pas encore envoyées, **déjà réduites et sans métadonnées EXIF** (position GPS comprise),
  effacées dès que leur envoi est terminé ou que le membre abandonne l'écriture ; le dernier état
  lu de l'écran de visite (`visit-mode:<UUID>:<annonce>` : titre, statut, commune, tâches, **mon**
  avis seulement, critères des avis, visites **sans photo ni lien signé**, noms des membres),
  pour rouvrir l'écran sans réseau. Rien n'y est chiffré au-delà de ce que fait le système ;
  la déconnexion ne vide pas la file (elle repart à la reconnexion du même membre). Les
  écritures passées restent quelques minutes en mémoire de la page, jamais sur le disque. Sans
  IndexedDB, la file ne vit qu'en mémoire et l'écran le dit. Safari peut effacer ce stockage
  après sept jours sans usage du site (règle de WebKit, l'application installée sur l'écran
  d'accueil a son propre compteur) : une file non envoyée depuis une semaine peut être perdue.
- **Presse-papiers (lot 24)** : « Coller » lit le presse-papiers seulement au toucher du bouton
  (Safari demande de confirmer « Coller ») ; le texte lu sert à remplir le lien et, s'il est long,
  le texte de l'annonce, sans être envoyé ailleurs qu'à l'analyse habituelle quand le membre la
  lance.
- **Export** (`GET /export`) : réservé aux membres de l'espace, ne contient ni photo, ni adresse
  e-mail de membre, ni identifiant de connexion ; `Cache-Control: no-store`. Le contact de
  l'annonceur et les demandes (lot 17) sont dans le JSON, jamais dans le CSV.
- **Notifications** : le texte d'une notification push transite par le service push du
  navigateur (Google, Apple, Mozilla) chiffré de bout en bout (Web Push, RFC 8291) ; il ne porte
  que le titre de l'annonce et le nom du membre. Un abonnement expiré est supprimé. L'e-mail est
  inactif sans configuration.
- **Alertes e-mail entrantes** : le webhook n'accepte qu'un appel signé (HMAC, secret du
  serveur) ; l'e-mail n'est pas conservé : seuls son sujet, son expéditeur et les extraits des
  annonces repérées vivent dans les brouillons.
- **IA** : seul le texte de l'annonce (ou de l'alerte) part au modèle, jamais de donnée de
  membre (docs/ia.md).
- **Vérifications des annonces (lot 15, ADR 0025)** : la page d'un portail est lue par Claude
  dans le navigateur de l'utilisateur, jamais téléchargée par le serveur. Une vérification garde
  la date, le membre (ou Claude pour lui), le résultat, les écarts, l'URL consultée et un
  extrait-preuve **court** (500 caractères au plus) dont les numéros de téléphone et les adresses
  e-mail sont masqués à l'écriture (`sanitizeEvidence` dans `domain`), pour ne pas conserver les
  coordonnées d'un agent ou d'un vendeur ; les avant et après d'une description sont tronqués et
  masqués de même. Les vérifications sont lisibles par les membres de l'espace, au journal et dans
  l'export ; elles partent avec l'annonce (cascade).
- **Explorations des portails (lot 16, ADR 0026)** : Claude lit les pages de recherche et
  d'annonces dans le navigateur de l'utilisateur ; le serveur ne télécharge aucune page et ne suit
  aucun lien (les liens de recherche sont fabriqués sans réseau). Une exploration garde le membre
  pour qui Claude a exploré, les dates, les critères, le bilan par portail (« bloqué » compris) et,
  par annonce lue, une ligne du compte rendu : lien, portail, titre, prix, surface, pièces,
  commune, quartier, résultat du tri, raison et un extrait **court** (500 caractères au plus) dont
  les téléphones et adresses e-mail sont masqués à l'écriture (`sanitizeEvidence`). Les
  **coordonnées des annonceurs** (agent, vendeur) ne sont ni demandées à Claude ni stockées : le
  prompt lui demande de ne pas les relever, et ce qui passerait dans un extrait est masqué ; la
  description d'un brouillon (2 000 caractères au plus) est masquée de même. Une annonce hors
  critères n'existe que comme cette ligne. Explorations, lignes et brouillons sont lisibles par les
  membres de l'espace, au journal et dans l'export JSON ; ils partent avec l'espace (cascade).
- **Fonds de carte (lot 10, ADR 0020)** : le fond choisi est retenu dans le `localStorage` du
  navigateur, sous la clé `apart-localizer-base-map:<identifiant de la personne>` (l'UUID
  Supabase, déjà présent dans la session stockée par le même navigateur) ; la valeur n'est que
  le nom du fond. Rien n'est envoyé au serveur. Les tuiles viennent d'OpenFreeMap et de la
  Géoplateforme IGN : ces serveurs voient l'adresse IP du navigateur et les zones affichées,
  jamais une donnée de l'application. La recherche d'adresse « Centrer » passe par l'API, qui
  interroge le géocodeur IGN et met la réponse en cache (`reference_data`, sorte `geocode`,
  comme les adresses d'annonces) ; le texte cherché n'est ni journalisé (le journal de requêtes
  omet la chaîne de requête) ni rattaché à une annonce ou à un critère.
- **Invitations (lot 8, ADR 0018)** : inviter enregistre l'adresse e-mail et le nom affiché de
  la personne dans `app.members` dès l'invitation, avant tout consentement de sa part ; ils sont
  visibles des membres de l'espace (page Espace) et du journal d'activité (« a invité « Léa »
  (lea@…) »). Une invitation expire à 14 jours (`INVITATION_TTL_DAYS`) mais sa ligne reste,
  comme celle d'une invitation annulée ou refusée, pour l'historique ; la réinviter réutilise la
  ligne. L'e-mail d'invitation ne part que si l'envoi est configuré (ADR 0015) ; il ne contient
  que le nom de l'espace, celui du propriétaire, l'adresse invitée et le lien de l'application.
  Le rattachement exige une adresse vérifiée par le fournisseur (Google). Le MCP (`list_members`)
  ne rend aucune adresse.
- **Avis à l'aveugle (lot 20, ADR 0030)** : un avis (note globale, phrase, notes et mots par
  critère) est lisible par les membres de l'espace, sauf à l'aveugle (réglage de l'espace, actif
  par défaut) : tant qu'un membre n'a rien noté sur une annonce, l'avis des autres ne lui est
  jamais envoyé, ni à l'écran, ni au MCP, ni au journal, ni dans « ce qui a changé », ni dans son
  export ; il sait seulement qui a noté, combien de critères et si c'était après la visite. Ses
  « Voir quand même » sont gardés (annonce, date, avis visibles à ce moment) et lisibles des
  membres : son avis porte ensuite « après avoir vu celui de … ». Une notification d'avis ne
  contient jamais de note. Notes et révélations partent avec l'avis, l'annonce ou le membre
  (cascade).
- **Décisions à plusieurs (lot 21, ADR 0031)** : une proposition garde son auteur, son choix, sa
  raison (texte libre, 500 caractères au plus) et la réponse de chaque membre ; elle n'est lisible
  que des membres de l'espace, est dans le journal et l'export JSON, et ne contient aucune note
  d'avis : « Ce qui t'attend » dit seulement qu'un avis est à donner. Si la ligne d'un membre est
  effacée en base, ses propositions passées restent sans auteur (à null) et ses réponses partent
  avec elle.
- **Retrait d'un membre** : sa ligne reste (nom, adresse, rôle) pour que ses avis, tâches, visites
  et le journal gardent son nom ; son identité est détachée (l'accès est coupé dès la requête
  suivante, MCP compris), ses abonnements push sont supprimés. Un espace quitté pour en rejoindre
  un autre n'est jamais supprimé.
- **Questions aux agences (lot 17, ADR 0027)** : le **contact de l'annonceur** (`listing_contacts` :
  nom de l'agence, lu et écrit sur l'annonce depuis le lot 18, interlocuteur, e-mail, téléphone, lien de la messagerie du portail, canal
  préféré) est une donnée personnelle d'un tiers : seulement ce que l'annonce donne, saisi par un
  membre ou complété par Claude (lu sur la page de l'annonce), modifiable et effaçable dans
  l'onglet « À faire » de la fiche (`DELETE /listings/:id/contact` ; « Échanges » jusqu'au lot 18), jamais vidé ni supprimé par
  le MCP. Le journal d'activité n'en garde que les noms des champs changés (« a mis à jour le
  contact de l'annonceur (e-mail, téléphone) »), jamais les valeurs : effacé, il l'est vraiment.
  Une **demande** garde le nom affiché du destinataire (« Agence [Exemple] »), l'objet et le texte
  du message, le canal, les dates (validation, envoi, réponse), la référence du fil (identifiant
  de fil Gmail ou lien de la conversation sur le portail) et, par réponse, un **extrait court**
  (1 000 caractères au plus) dont les numéros de téléphone et les adresses e-mail sont masqués à
  l'écriture (`sanitizeEvidence`), avec les valeurs lues ; la provenance « agence » d'un champ
  porte la date et un extrait de 300 caractères au plus, déjà masqué. Aucune signature n'ajoute
  l'adresse ou le téléphone d'un membre : seule la signature choisie par l'espace signe (par
  défaut, les prénoms). **Le serveur n'envoie aucun message** : Claude envoie, après la
  validation d'un membre, avec les outils de l'utilisateur (Gmail, messagerie du portail dans son
  navigateur) ; l'e-mail reçu n'est pas conservé en entier. Contacts et demandes partent avec
  l'annonce (cascade) et figurent dans l'export JSON.
- **Une annonce, plusieurs portails (lot 18, ADR 0028)** : les liens d'une annonce
  (`listing_links`) sont des pages publiques de portails, lues par Claude dans le navigateur de
  l'utilisateur ou collées par un membre ; le serveur n'en télécharge aucune et ne suit aucun
  lien. Un lien garde son portail, son URL, son prix affiché, ses dates (vu, vérifié, hors
  ligne), son origine, l'agence et la référence lues sur sa page, son auteur et un extrait-preuve
  **court** (500 caractères au plus, téléphones et e-mails masqués : `sanitizeEvidence`). Le
  **vendeur** de l'annonce (agence, mandataire, particulier ou inconnu), le nom de l'agence ou du
  réseau et la référence sont des faits de l'annonce, pas des coordonnées : le nom d'une personne
  (conseiller, mandataire nommé, particulier) n'y est jamais écrit ; il ne vit que dans le contact
  de l'annonceur (lot 17), effaçable. Le nom de l'agence du contact est désormais celui de
  l'annonce (la migration l'y a reporté) : il figure dans la colonne CSV « Agence », et effacer
  le contact ne l'efface pas. Un particulier n'a ni agence ni référence. Liens et vendeur partent
  avec l'annonce (cascade) et figurent dans l'export (JSON ; CSV : vendeur, agence, référence et
  liens).

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
- Lot 17 : le contact de l'annonceur et le texte des demandes passent dans le corps des requêtes
  (`PUT /listings/:id/contact`, `POST /agency-requests/:id/answer`…), jamais dans le chemin ni
  la chaîne de requête : le journal de requêtes et Sentry ne les voient pas ; le journal
  d'activité ne garde ni les coordonnées du contact ni le texte d'une réponse (seulement le
  résumé de ce qui a été appliqué à la fiche).

## Droits des personnes

- **Accès et portabilité** : export JSON complet (docs/export.md).
- **Effacement** : supprimer un espace (en base, `DELETE` sur `app.workspaces`) supprime en
  cascade annonces, visites, notifications, abonnements, brouillons et explorations ; les objets du dossier de
  l'espace dans le bucket se suppriment depuis le tableau de bord Supabase (Storage → dossier de
  l'espace). Retirer un membre dans l'application coupe son accès mais garde sa ligne (nom et
  adresse) pour l'historique ; pour effacer aussi cette ligne, la supprimer en base
  (`app.members`) : ses avis, annonces vues et notifications partent avec elle (cascade), ses
  autres écritures (tâches, visites, offres, journal) restent, anonymisées (auteur à null). Une
  invitation annulée, refusée ou expirée s'efface de même (elle n'a rien écrit).
- **Rectification** : tout se modifie dans l'application ; les avis et tâches de chacun restent
  à leur auteur.
- **Tiers (lot 17)** : le contact d'un annonceur s'efface depuis l'onglet « À faire » (lot 19) de la
  fiche (bouton « Effacer ») ; les demandes déjà envoyées gardent le nom affiché du destinataire
  et le texte envoyé, et partent avec l'annonce. Lot 18 : le nom de l'agence reste sur l'annonce
  (« Qui la vend », modifiable) ; l'ancienne colonne `listing_contacts.agency_name`, gelée (plus lue),
  garde sa valeur d'avant le lot 18 jusqu'à la prochaine écriture du contact, dans l'application
  ou par Claude (elle est alors vidée), ou jusqu'à son effacement.
