# 0015. Notifications posées avec le journal, web push sans fournisseur, e-mail inerte ou HTTP générique, partage GET, alertes e-mail signées en brouillons

Statut : acceptée, 3 novembre 2026.

## Contexte

Le lot 6 ajoute les notifications (S7 : nouvelle annonce, statut, tâche assignée, et ici entrée
dans un critère, réponse à une offre, annonces reçues par e-mail ; dans l'application, en web
push, par e-mail) et la capture mobile (C9 : partage depuis le téléphone, transfert d'alertes
e-mail). L'API tourne en fonctions Vercel : rien ne garantit l'exécution après la réponse. Le
dépôt est public : aucune clé, aucun fournisseur imposé. Pas de scraping des portails.

## Décision

1. **Naissance** : chaque écriture journalisée passe par `domain/notificationsForActivity`, qui
   dit qui prévenir et en quels termes ; les préférences du destinataire (JSON
   `notification_preferences`, par type et par canal, défaut : application et push, pas
   d'e-mail) disent par quels canaux. La ligne `notifications` est écrite **dans la transaction
   du journal** : aucune écriture sans sa notification. Règles : jamais l'auteur, sauf une annonce
   ajoutée (ou entrée dans un critère) par Claude au MCP, que le membre n'a pas vue à l'écran ;
   une tâche assignée ne prévient que l'assigné ; une écriture du système (alerte e-mail) prévient
   tout le monde. Ouvrir une fiche marque lues ses notifications.
2. **Envoi** : après chaque requête d'écriture réussie, un intercepteur global envoie ce qui est
   en attente **avant la réponse** (au MCP, juste après, au mieux) ; une notification non envoyée
   reste « en attente » vingt-quatre heures et part à la requête suivante. Web push par la
   bibliothèque `web-push` 3.6.7 (clés VAPID en variables, détails passés à chaque appel) ; un
   abonnement qui répond 404 ou 410, ou cinq échecs de suite, est retiré. Envois injectés
   (`PUSH_SENDER`, `EMAIL_SENDER`) : faux dans les tests, aucun réseau.
3. **E-mail sans fournisseur** : l'interface `EmailSender`, une implémentation inerte (défaut) et
   un envoi HTTP générique (`EMAIL_HTTP_URL`, `EMAIL_FROM`, `EMAIL_HTTP_TOKEN` en Bearer) qui
   poste `{ from, to, subject, text, html }` : un relais maison ou l'API d'un service qui accepte
   ce corps. Aucun fournisseur n'est choisi ; en ajouter un, c'est une nouvelle implémentation de
   l'interface et un ADR.
4. **Partage mobile** : `share_target` du manifeste en **GET** vers `/partager` (titre, texte,
   lien) : la route ouvre « Nouvelle annonce » pré-remplie et lance l'extraction IA existante ;
   sans IA (503), la saisie manuelle reprend le lien, le titre, le portail et le texte. Le lien est
   cherché dans `url`, sinon dans le texte (les applications Leboncoin et SeLoger l'y mettent).
   Pas de partage de fichiers (captures) : il demanderait un POST intercepté par le service
   worker ; à faire plus tard si le besoin se confirme.
5. **Alertes e-mail** : `POST /inbound/email/:workspaceId`, sans session, signé
   (HMAC-SHA256 de `horodatage.corps brut` avec `INBOUND_EMAIL_SECRET`, en-têtes
   `X-Apart-Timestamp` et `X-Apart-Signature`, cinq minutes de tolérance), format générique
   (sujet, texte, HTML). L'espace est dans le chemin : le secret appartient à l'exploitant.
   Les liens d'annonces des portails connus sont repérés dans l'e-mail (`contracts/parseAlertEmail`,
   dix au plus), chacun avec le texte qui l'accompagne ; l'IA lit chaque extrait (modèle
   économique) si elle est configurée, sinon l'analyseur simple prend lien, prix, surface, pièces
   et commune quand le texte les dit (provenance « annonce », confiance 0,6). Chaque annonce
   devient un **brouillon** (`listing_drafts`) à valider, doublons signalés ; une alerte reçue deux
   fois ne double rien. Valider ouvre la fiche pré-remplie ; l'annonce créée est liée au brouillon.
   Aucun service d'e-mails entrants n'est imposé : un adaptateur le convertit au format générique
   et signe (docs/deploiement.md).

## Conséquences

- Tables `notifications`, `push_subscriptions`, `listing_drafts`, colonnes de préférences et de
  visite sur `members` (migration de l'ADR 0014).
- Le push ne marche qu'avec la PWA construite (service worker `importScripts` de
  `public/push-handler.js`), en https, et sur iPhone une fois l'application installée sur l'écran
  d'accueil. Pas d'essai sur un vrai téléphone dans ce lot.
- Les liens d'une alerte peuvent être des liens de suivi du portail : ils sont gardés tels quels
  (les suivre serait télécharger une page).
- `ActivityService.record` sans transaction en ouvre une (journal et notifications ensemble).
