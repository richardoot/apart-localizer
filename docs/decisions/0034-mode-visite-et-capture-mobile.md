# 0034. Mode visite et capture mobile : un écran pour la visite, une file d'écritures sur l'appareil, cinq champs après l'analyse

Statut : acceptée, 10 novembre 2026. Précise 0014 (visites et photos), 0030 (avis), 0031 (tri),
0032 (socle d'interface) et 0033 (accueil) ; troisième des lots 22 à 26 issus de l'audit
d'interface du 10 novembre 2026.

## Contexte

Pendant une visite (parcours P4), cocher les points, photographier, noter les critères et écrire
une remarque se faisaient dans trois onglets de la fiche (« À faire », la carte des visites plus
bas, « Synthèse », « Le bien »), une vingtaine de gestes. « Pendant la visite » était une liste
qu'on ne pouvait pas cocher. Une visite enregistrée ne se corrigeait plus : « Marquer faite »
changeait l'état, sans compte rendu. Rien ne s'affichait avant la réponse du serveur (aucun
`onMutate`), et rien ne tenait sans réseau. Après une analyse (parcours P2), la relecture était
le formulaire de 45 champs ; une pastille demandait de la survoler, ce qu'un iPhone ne fait pas.
Le téléphone visé est un iPhone (Safari et l'application installée).

## Décision

- **Mode visite** : une route plein écran sans la barre du bas (`/annonces/:id/visite`, page
  nue, `VisitModePage`), ouverte depuis la ligne « visite aujourd'hui » de l'accueil, « Mode
  visite » dans « À faire » (bloc « Pendant la visite ») et sur chaque carte de visite
  (`?visite=`). Un seul défilement : « À vérifier » (cochable), photos (appareil photo par
  `capture="environment"`, ou photothèque), remarque rapide, mes notes par critère et la note
  globale, compte rendu (points forts et faibles, note de la visite, participants) ; en bas,
  collé, « Terminer la visite » et ce qui n'est pas encore envoyé. Terminer propose « Visité » par
  le changement de statut habituel (une proposition quand l'espace décide à plusieurs).
- **Ce qu'on vérifie** (`visitPoints`, domain) : les tâches à nous (jamais une question pour
  l'annonceur) nées d'un désaccord des avis (« contre-visite », en tête), puis celles qui
  commencent par « Vérifier … » ou « Évaluer … » (ajout : « Évaluer l'ampleur réelle des
  travaux » est un point de visite). Les points faits restent cochés à leur place ; rien n'est
  inventé. « Pendant la visite » de la fiche lit la même liste.
- **Quelle visite** (`visitModeVisit`) : la visite planifiée d'aujourd'hui (Paris) la plus proche,
  sinon une visite faite aujourd'hui, sinon la dernière planifiée passée, sinon la prochaine ;
  sans visite, « Commencer la visite maintenant » en crée une (planifiée à l'heure, le membre
  parmi les participants), même hors ligne.
- **Notes à l'aveugle** : l'écran ne montre que mes notes ; une note part avec mon mot et ma
  phrase tels qu'ils sont (le `PUT` les remplace) et le garde-fou `expectedUpdatedAt`. Les notes se
  regroupent quinze secondes (une rafale = une écriture, une notification `opinion_added` au lieu
  de neuf) ; « Terminer », quitter l'écran ou le cacher les envoie tout de suite.
- **Remarque rapide** : `PATCH /visits/:id` accepte `remark: { text, at }` : le serveur ajoute
  « 18 h 42 : texte » (heure de Paris de l'appareil, `visitRemarkLine`) à la fin du compte rendu,
  sous un verrou de la ligne, **sans garde-fou** (deux membres peuvent en ajouter en même temps)
  et **sans doublon** (`appendVisitRemark` ignore une ligne déjà présente telle quelle : une
  remarque renvoyée après une réponse perdue). Le journal la lit en entier.
- **Visite modifiable** (`canEditVisit`, domain ; même règle à l'écran et dans `VisitsService`) :
  une visite planifiée se modifie par tout membre (la déplacer, la marquer faite avec son compte
  rendu, dire qui y va) ; une visite faite ne se corrige (compte rendu, points forts et faibles,
  note, participants, date) que par son auteur ou un participant (403 sinon) ; une visite sans
  auteur connu, par tout membre. Garde-fou `expectedUpdatedAt` inchangé ; chaque écriture entre
  au journal (`visit.updated`). « Marquer faite » ouvre la saisie du compte rendu.
- **File des écritures en attente** (`lib/outbox.ts` pur, `useOutbox`, stockage
  `lib/outbox-store.ts`) : toute écriture du mode visite est **d'abord gardée sur l'appareil**
  (IndexedDB, par membre connecté), puis part dans l'ordre. Une « voie » par chose écrite (une
  tâche, une visite, mon avis sur une annonce) : une voie part dans l'ordre, une écriture refusée
  bloque sa voie (rien ne s'applique par-dessus), les autres continuent. Avant l'envoi, deux
  écritures sur la même chose se fondent (le dernier état d'une tâche, les notes par clé, les
  champs d'une visite si rien ne s'est intercalé). Un échec de réseau réessaie (2 s, 4 s… une
  minute ; tout de suite au retour du réseau ou au rechargement) ; un refus (4xx) ou un conflit
  (409) reste « à revoir », avec « Réessayer » et « Abandonner » : **rien n'est retiré en
  silence**. Après une écriture, la suite de la voie prend le garde-fou rendu par le serveur.
  Une reprise ne double rien : une visite commencée hors ligne est retrouvée par sa date exacte
  avant d'être recréée ; un conflit sur une écriture déjà appliquée (réponse perdue) est reconnu
  en relisant la visite ou mon avis ; une remarque n'est pas doublée (règle du serveur) ; une
  photo garde son étape (annoncée, téléversée) et termine son envoi avant de recommencer. Un vrai
  conflit (l'autre membre a modifié) n'écrase rien et se dit. La file s'ouvre dès la connexion
  (`App.vue`) : ce qui attend repart depuis n'importe quelle page ; quitter le mode visite avec
  des écritures en attente le dit dans la zone de messages.
- **Photos gardées sur l'appareil** : réduites et sans EXIF avant d'entrer dans la file
  (`preparePhoto`), les deux fichiers (photo, vignette) sont dans IndexedDB jusqu'à la fin de
  l'envoi, puis effacés. L'écran montre les photos qui attendent (« en attente »). Le reste du
  chemin des photos (URL d'envoi signées, vérification, bucket privé) ne change pas.
- **Écran sans réseau** : le dernier état lu de l'écran (sans photo ni lien signé, seulement mon
  avis) est gardé sur l'appareil ; rouvert sans réseau, l'écran le montre avec un bandeau. Entre
  la réponse du serveur et la relecture, les écritures passées restent superposées (en mémoire)
  pour qu'aucune case ne se décoche un instant.
- **Réponses immédiates ailleurs** : cocher une tâche (« À faire », « Toutes les tâches »)
  s'affiche tout de suite (`onMutate`, `lib/optimistic.ts`) et revient en arrière si le serveur
  refuse, l'erreur dans la ligne. Au tri, un choix fait passer à la carte suivante sans attendre ;
  la réponse complète le bilan ; un refus retire le choix et remet la carte, avec l'erreur
  (« … La carte est revenue. ») ; « Annuler », « Terminer », « Décider sans attendre » et
  « Retour » attendent les réponses en route. Hors du mode visite, il n'y a pas de file : ces
  écritures demandent le réseau.
- **« Ce qui t'attend »** : une ligne `visit_today` (« visite aujourd'hui », « à 18 h 30 »,
  verbe « Mode visite ») qui ouvre le mode visite de l'annonce (l'étape À visiter s'il y en a
  plusieurs) ; « visites à venir » ne compte plus que les jours suivants.
- **Capture en cinq champs** : après l'analyse (ou un brouillon reçu), titre, prix, surface,
  commune et lien (`ListingQuickForm`), puis « Enregistrer » ; « Saisie complète » ouvre le
  formulaire entier sur le **même modèle** : la charge envoyée ne dépend pas de la vue (test qui
  compare les deux chemins, `legacy-listing-save.fixture.ts` inchangé). Une erreur hors des cinq
  champs ouvre la saisie complète sur le champ. La pastille de provenance se touche : un panneau
  montre la source, la confiance et l'extrait (plus de survol).
- **Sur iPhone, coller le lien** : la feuille de partage d'iOS ne propose pas une application web
  installée (pas de Web Share Target dans WebKit, bogue 194593 ouvert depuis 2019 ; à confirmer
  sur l'appareil). « Ajouter » ouvre le premier écran : le lien avec « Coller »
  (`navigator.clipboard.readText` au toucher ; Safari affiche « Coller » à confirmer ; refusé ou
  vide, l'écran le dit et le champ reçoit le focus), « Ajouter des captures d'écran » (photothèque,
  `image/jpeg` en premier pour qu'un HEIC soit converti), le texte en option. L'écran est honnête :
  « Un lien seul ne dit rien à l'IA : l'application n'ouvre jamais la page du portail. » ;
  « Enregistrer avec le lien seul » mène aux cinq champs avec le lien et son portail, titre et prix
  à saisir, doublons cherchés par le lien et ce qui est saisi (`POST /listings/duplicates`). La
  cible de partage Android (`share_target`, `/partager`) ne change pas ; sans IA, elle mène aussi
  aux cinq champs.

## Conséquences

- **Aucune migration**, aucune variable nouvelle, aucun outil MCP nouveau ni changé
  (`add_visit` et `list_visits` inchangés ; le MCP ne corrige pas une visite). `VisitUpdateSchema`
  gagne `remark` ; `WorkflowAgendaKeySchema` gagne `visit_today`. `PATCH /visits/:id` refuse
  désormais (403) la correction d'une visite faite par un membre qui n'en était ni l'auteur ni un
  participant.
- Des données de l'espace vivent sur l'appareil tant qu'elles ne sont pas envoyées
  (docs/confidentialite.md) ; Safari peut effacer ce stockage après sept jours sans usage.
- La file ne couvre que le mode visite. Le reste de l'application (fiche, tri, capture) demande le
  réseau ; c'est voulu (moins de chemins) et dit à l'écran.
- La file est rejouée sous le compte connecté ; une session expirée pendant une longue coupure
  (jeton Supabase d'une heure, rafraîchi au retour du réseau) attend la reconnexion. Non vérifié
  sur un iPhone : appareil photo et format rendu, presse-papiers, IndexedDB avec des fichiers dans
  l'application installée, marges de l'encoche ; captures sur Chromium seulement.
