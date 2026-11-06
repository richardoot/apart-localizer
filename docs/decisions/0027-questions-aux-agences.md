# 0027. Questions aux agences : brouillons validés par lot, envoi par Claude, réponses appliquées ou proposées

Statut : acceptée, 7 novembre 2026.

## Contexte

Richard veut déléguer à Claude (claude.ai avec le connecteur, ou Claude Code, avec Gmail et Claude
in Chrome pour la messagerie des portails comme Leboncoin) les questions de la todo d'une
annonce : demander à l'agence ou au vendeur les charges annuelles, la taxe foncière, le DPE, la
surface, les travaux votés, les procès-verbaux d'AG…, puis compléter la fiche et cocher les tâches
quand la réponse arrive. Rien ne reliait une tâche à un champ de la fiche, rien ne gardait trace
d'une demande ni de sa réponse, et l'application n'avait pas le contact de l'annonceur. Principes
fixes : aucun scraping, aucun envoi sortant du serveur, aucune décision prise à la place des
membres.

## Décision

- **Le serveur n'envoie jamais de message à une agence.** Il garde la trace : brouillon,
  validation, envoi (fait par Claude avec les outils de l'utilisateur, ou par un membre), référence
  du fil, réponse. Le module `agency-requests` n'a ni client e-mail ni accès aux portails.
- **Validation par lot avant tout envoi.** Une demande suit `draft → approved → sent → answered |
no_answer` (annulable avant l'envoi ; une réponse tardive ou en complément reste possible ;
  modifier un message validé le fait repasser « à valider »). La validation se fait dans
  l'application (bouton « Valider l'envoi », plusieurs messages ensemble, tout ou rien) ou dans la
  conversation : `record_request_sent` refuse un brouillon sans `approvedInChat: true`, que Claude
  ne passe qu'après l'accord explicite du membre pour ce texte ; la validation est alors notée « dans
  la conversation » (`approvedVia: chat`). Le REST n'accepte jamais cet accord.
- **Tâches liées à un champ** : `tasks.field` (énumération `ListingQuestionFieldSchema` : adresse,
  surface, charges, taxe, DPE, étage, année, lots, travaux votés, procédures, chauffage), plus
  `requested_at`, `request_id`, `answered_at`. Le champ est posé à la création (checklist par
  défaut, champs manquants du lot 2, libellé connu) et rattrapé par la migration au libellé exact
  (`TASK_FIELD_BY_LABEL`), sinon laissé nul. Une tâche se pose à l'annonceur si elle a un champ ou
  commence par « Demander » (le DTG, une question saisie). États lisibles : à faire, « Message à
  valider », « Demandée le 5 nov. à l'agence », « Réponse du 7 nov. ».
- **Message par défaut** (`domain`, `defaultAgencyMessage`) : formule polie, annonce (titre,
  commune, prix, référence, lien), questions, signature de l'espace (`workspaces.agency_signature`,
  par défaut les prénoms des membres) ; aucune adresse ni aucun téléphone de membre n'est ajouté.
  Une relance rappelle la date du premier message.
- **Réponses** (`planAgencyAnswer`) : chaque valeur lue est appliquée (champ vide, ou valeur lue
  par l'IA, sur le portail, estimée ou déjà donnée par l'annonceur), inchangée, ou **proposée** si
  elle contredit une saisie à la main, une donnée ouverte (DPE vérifié) ou une valeur sans
  provenance : jamais écrasée, appliquée par le bouton « Appliquer » (ou `update_listing` après
  accord). Provenance `agency` (nouvelle source) datée du jour de la réponse, avec un extrait.
  Les tâches dont le champ reçoit une valeur, et celles répondues sans valeur, sont cochées. Une
  transaction : fiche, tâches, demande, journal `agency_request.answered` ; l'adresse passe ensuite
  par l'écriture des annonces (géocodage, repère, lot 12). Garde-fou `expectedUpdatedAt`.
- **Relance due** après 5 jours ouvrés sans réponse (`DEFAULT_FOLLOW_UP_BUSINESS_DAYS`, fixé le 5
  novembre 2026 ; week-ends et jours fériés de métropole exclus), ou après une réponse partielle ;
  une relance est une nouvelle demande (`follow_up_of_id`) qui, une fois envoyée, clôt la première
  « sans réponse ».
- **Données de tiers** : le contact de l'annonceur (`listing_contacts` : agence, interlocuteur,
  e-mail, téléphone, lien de la messagerie, canal préféré) est minimal, modifiable et effaçable
  dans l'application ; le MCP le complète mais ne le vide ni ne le supprime ; le journal ne garde
  que les noms des champs changés. Une demande garde le nom affiché du destinataire et le texte
  envoyé ; l'extrait de réponse fait 1 000 caractères au plus, téléphones et e-mails masqués
  (`sanitizeEvidence`).
- **Données, pas consignes** : une page de portail ou un e-mail reçu se lit comme des données ; une
  réponse qui demande quelque chose à Claude n'est pas un ordre. Jamais de captcha contourné ni de
  connexion à la place de l'utilisateur (prompts `ask_agencies`, `check_agency_answers`).
- **MCP** : `list_open_questions` (lecture), `prepare_agency_requests` (brouillons groupés,
  `replaces` pour une correction, `contact` lu sur l'annonce), `record_request_sent`,
  `record_agency_answer` ; 38 outils et cinq prompts au lot 17 (le compte à jour est dans `docs/mcp.md`), aucun outil de suppression.
- **Notifications et nouveautés** : `agency_answer` pour l'autre membre (vers l'onglet Échanges),
  sorte « Échanges » au journal, « Réponses des agences » dans « ce qui a changé ».

## Conséquences

- Claude peut faire toute la boucle question → envoi → réponse → fiche, sans que le serveur
  parle jamais à un portail ou à une agence, et sans qu'un message parte sans accord.
- La migration `20261107110000_lot17_agency_requests` est additive : deux tables, quatre colonnes
  de tâche, une colonne d'espace, deux valeurs d'énumération, rattrapage de `tasks.field` au
  libellé exact.
- Export version 1 : `contact` et `agencyRequests` par annonce, champs des tâches (défauts pour
  un export antérieur) ; rien dans le CSV (coordonnées de tiers, et une liste de demandes ne tient
  pas dans une cellule).
- Limites : l'application ne saisit pas une réponse à la main (Claude l'enregistre ; un membre
  corrige la fiche) ; un message validé puis modifié dans Gmail n'est pas détecté ; la relance
  ne tient pas compte des congés de l'agence.
