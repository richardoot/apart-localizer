# Étude du besoin : apart-localizer

Outil de suivi d'annonces d'achat d'appartement assisté par IA. Il normalise les critères des
annonces, suit chaque bien dans un pipeline partagé (interface web et MCP), et évalue sa
rentabilité ainsi que le prix à partir duquel il devient intéressant.

Document rédigé le 2 novembre 2026 à partir de l'artefact Claude « Comparateur d'annonces
locatives » utilisé aujourd'hui, et de la structure du projet `bankin-analyzer`. Mis à jour le
3 novembre 2026 : choix NestJS + Prisma + PostGIS confirmé, critères de recherche géographiques
ajoutés (§ 3.9) ; le 4 novembre 2026 : deux bases de calcul de la fiche, « sur le prix » et
« tout compris » (P5, lot 9) ; le 6 novembre 2026 : une fiche en sept onglets, un par question,
et l'année, le type de location et les hypothèses réglés pour tout l'espace (lot 19, ADR 0029).

Documents liés : [modèle de calcul](modele-de-calcul.md), [choix techniques](tech-stack.md),
[feuille de route](roadmap.md), [décisions](../decisions/).

---

## 1. Contexte et problème

### 1.1 Situation

Richard et Chloé cherchent un appartement à acheter dans Bordeaux Métropole (Talence, Mérignac,
Pessac, Bègles, Bordeaux, Le Bouscat, Villenave-d'Ornon, Gradignan). Le projet se déroule en deux
temps :

1. **Phase 1, habitation** : achat en résidence principale, éventuellement après travaux
   (« travaux avant d'emménager »).
2. **Phase 2, mise en location** : quelques années plus tard (2028 dans les hypothèses
   actuelles), le bien est loué (vide, meublé ou colocation). Le bien doit donc être
   « louable » : rendement, DPE, encadrement des loyers à Bordeaux, règlement de copropriété,
   décence, permis de louer, demande locative.

Le suivi se fait aujourd'hui dans un artefact Claude : une page HTML unique, avec stockage dans la
base de l'artefact, utilisable uniquement depuis claude.ai.

### 1.2 Ce que fait l'artefact actuel

Inventaire précis, car c'est le socle fonctionnel à reprendre.

**Fiche annonce** (saisie manuelle) : titre, lien, adresse exacte, commune, quartier / arrêt de
tram, statut, prix FAI, surface, pièces, étage, DPE, année de construction, loyer visé HC,
charges de copropriété annuelles, part non récupérable, taxe foncière, mobilier, notes libres.

**Travaux avant emménagement** : interrupteur, ampleur (rafraîchissement, rénovation, lourde,
énergétique), durée estimée, postes chiffrés (peinture, sols, cuisine…), notes.

**Phase 2, mise en location** : année de mise en location, type de bail (dans l'application,
réglés pour tout l'espace depuis le lot 19), encadrement des loyers
(automatique pour Bordeaux), loyer de référence majoré au m², loyer de marché constaté, demande
locative, règlement de copro, décence, permis de louer, notes. Un verdict « Compatible / Sous
conditions / Incompatible » agrège des contrôles, dont le calendrier d'interdiction de location
selon le DPE (G depuis 2025, F en 2028, E en 2034).

**Hypothèses globales** : apport, taux nominal, durée, assurance, frais de notaire, vacance,
frais fixes annuels, seuil de rendement brut, effort mensuel maximal.

**Calculs** : prix au m², coût total, mensualité, rendement brut et net, effort mensuel, repère
« 220 × loyer », verdict « Cible / À creuser / Hors cible ». Les valeurs estimées faute de saisie
(taxe foncière = 1 mois de loyer, part non récupérable = 25 % des charges) sont marquées « ≈ ».

**Collaboration** : avis de Richard et de Chloé (note sur 5 et texte), liste de tâches par annonce
avec une checklist par défaut (charges, taxe foncière, PV d'AG, DTG, travaux, loyer de marché,
desserte, règlement de copro, permis de louer), indicateur « nouveau » tant qu'une annonce n'a pas
été ouverte.

**Lecture** : tableau comparatif triable (16 colonnes), cartes sur mobile, filtres par statut et
commune, recherche, synthèse (nouvelles, suivies, dans la cible, meilleur rendement, prix moyen au
m², à visiter), blocs « Nouvelles annonces » et « Annonces suivies ».

### 1.3 Limites qui motivent le nouveau projet

| Limite | Conséquence |
| --- | --- |
| Saisie 100 % manuelle, champs hétérogènes selon les sites | Temps perdu, données incomplètes, comparaisons biaisées |
| Logique de calcul enfermée dans la page, non testée | Une formule fausse passe inaperçue, pas de réutilisation côté IA |
| Pas d'API ni de MCP | Claude ne peut ni ajouter ni analyser une annonce depuis une conversation ou le navigateur |
| Une seule version des hypothèses, pas de scénario | Impossible de comparer « taux 3,2 % contre 3,8 % » ou un apport différent par bien |
| Pas de « prix cible » | On sait si le bien est dans la cible au prix affiché, pas à quel prix il le deviendrait |
| Pas d'historique (prix, statut, offres) | Pas de levier de négociation, pas de trace des décisions |
| Pas d'enrichissement externe | DPE, ventes comparables (DVF), plafond de loyer, desserte : tout est à chercher à la main |
| Pas de carte ni de filtre géographique | Impossible de cibler « à dix minutes du tram B » ou un secteur dessiné ; on filtre par commune seulement |
| Deux personnes codées en dur, pas d'authentification | Pas extensible, pas de « vu par moi » |
| Stockage lié à claude.ai | Pas d'export, pas d'accès hors claude.ai, pas de sauvegarde maîtrisée |

---

## 2. Utilisateurs et parcours

### 2.1 Acteurs

- **Richard** : porteur du projet, saisit et analyse, utilise Claude (claude.ai, Claude in
  Chrome, Claude Code) au quotidien.
- **Chloé** : co-acheteuse, consulte surtout sur mobile, donne son avis, coche des tâches, ajoute
  des annonces repérées.
- **Claude, agent** : via le MCP, ajoute une annonce depuis une page web, la normalise, l'évalue,
  répond à « laquelle visiter en premier ? », prépare une offre.
- **Tiers** (agence, notaire, courtier) : hors périmètre, pas d'accès.

### 2.2 Parcours principaux

**P1. Capturer une annonce depuis le navigateur.** Richard est sur une annonce SeLoger ou
Leboncoin avec Claude in Chrome. « Ajoute cette annonce. » Claude lit la page, remplit le schéma
normalisé, détecte un éventuel doublon (même URL, même adresse, mêmes prix et surface), appelle le
MCP. L'annonce apparaît « nouvelle » pour Chloé, avec les tâches par défaut et les champs
manquants transformés en tâches (« demander la taxe foncière »).

**P2. Capturer depuis le mobile.** Chloé partage un lien ou colle le texte de l'annonce dans
l'application. L'IA pré-remplit la fiche ; elle valide en trois gestes.

**P3. Comparer et prioriser.** Le tableau comparatif classe les annonces par verdict, rendement,
effort, prix au m², écart au prix cible. Les filtres par statut, commune, DPE et « nouveau pour
moi » restent.

**P4. Préparer une visite.** Sur mobile, la fiche affiche la checklist, les points d'attention,
les documents à demander. Pendant la visite : photos, notes, avis à chaud.

**P5. Décider d'une offre.** La fiche donne le prix cible selon chaque critère (rendement, effort,
marché), la décote nécessaire par rapport au prix affiché, l'ancienneté de l'annonce et ses
baisses de prix. L'offre et sa réponse sont historisées. Chaque valeur dit sur quelle base elle
porte : le prix affiché (prix cible, décote, offre) ou le coût tout compris, prix + notaire +
travaux + mobilier (rendements, effort, mensualité) ; la synthèse répond à « combien négocier ? »,
« combien ça coûte ? », « est-ce rentable ? » et « et au prix cible ? » (lot 9).

**P6. Vérifier la louabilité (phase 2).** Pour l'année de mise en location choisie : DPE et
calendrier d'interdiction, plafond d'encadrement, loyer de marché, copropriété, décence, permis de
louer, demande. Verdict et liste des points à vérifier.

**P7. Interroger par la conversation.** « Quelles annonces à Talence passent sous 150 € d'effort
si le taux descend à 3,2 % ? » « Compare les trois visitées. » « À quel prix le T3 de Pessac
devient-il rentable ? » Le MCP répond avec les mêmes calculs que l'écran.

**P8. Définir un secteur de recherche.** Richard dessine sur la carte un polygone autour de
Talence Forum et du CHU, ou choisit « quinze minutes de tram depuis le campus ». Le critère est
enregistré et partagé ; la liste et la carte se filtrent dessus, et toute nouvelle annonce qui y
entre est signalée dans la synthèse. Chloé ajoute un second secteur ; les deux se cumulent.

---

## 3. Besoins fonctionnels

Priorité : **M** (MVP, parité avec l'artefact plus le MCP), **S** (suivant), **L** (plus tard).

### 3.1 Collecte et normalisation des annonces

| # | Besoin | Prio |
| --- | --- | --- |
| C1 | Schéma normalisé d'annonce (voir § 4), unique pour l'interface, l'API, le MCP et l'extraction IA | M |
| C2 | Saisie manuelle complète avec aperçu des calculs en direct (comme aujourd'hui) | M |
| C3 | Création par le MCP à partir d'un contenu lu par Claude (page, texte, capture) | M |
| C4 | Extraction IA côté serveur depuis un texte collé ou des captures d'écran, retour sous forme de fiche pré-remplie à valider | S |
| C5 | Provenance et confiance par champ : `annonce`, `utilisateur`, `ia`, `open data`, `estimé`. L'écran garde le marqueur « ≈ » | S |
| C6 | Détection de doublons (URL, adresse, couple prix et surface) avec fusion assistée ; au lot 18, par n'importe lequel des liens d'une annonce et par la même agence avec la même référence | S |
| C7 | Champs manquants transformés automatiquement en tâches | S |
| C8 | Historique des prix et des modifications de l'annonce source (baisse de prix, retrait) | S |
| C9 | Partage depuis le mobile (PWA share target) et transfert d'alertes e-mail | L |
| C10 | Exploration des portails à partir des critères actifs (lot 16) : Claude cherche dans le navigateur de l'utilisateur, l'application trie (déjà suivie = vérification, écartée jamais reproposée, hors critères en simple ligne de compte rendu) et dépose le reste en brouillons « à valider » ; rien n'est ajouté sans un membre | S |
| C11 | Une annonce, plusieurs portails (lot 18) : tous les liens d'une même annonce sur une seule fiche (portail, prix affiché, en ligne ou non), le prix de la fiche étant le plus bas en ligne et un écart entre portails noté sans être tranché ; qui vend (agence, mandataire, particulier, inconnu, jamais deviné), le nom de l'agence ou du réseau et la référence de l'annonce, qui fait reconnaître la même annonce ailleurs (même agence et même référence : rattachée d'office, détachable ; même référence chez une autre agence : à trancher) | S |

Point de vigilance : pas de scraping automatisé des portails (conditions d'utilisation, anti-bot).
Le canal principal est Claude qui lit la page dans le navigateur de l'utilisateur et appelle le
MCP. Un éventuel appel serveur ne récupère que des métadonnées publiques (Open Graph, JSON-LD) et
reste optionnel.

### 3.2 Suivi et pipeline

| # | Besoin | Prio |
| --- | --- | --- |
| S1 | Statuts : à étudier, à visiter, visité, offre faite, offre acceptée, offre refusée, écarté, vendu ou retiré | M |
| S2 | Raison d'écartement et date, pour ne pas reproposer | M |
| S3 | « Vu par moi » par membre, remplaçant le drapeau global « vue » | M |
| S4 | Visites : date, participants, compte rendu, photos | S |
| S5 | Offres : montant, date, réponse, contre-proposition | S |
| S6 | Journal d'activité par annonce (qui a changé quoi, quand, par quel canal : web ou MCP) | S |
| S7 | Notifications (nouvelle annonce, changement de statut, tâche assignée) par e-mail ou web push ; livrées au lot 6 avec aussi l'entrée dans un critère, la réponse à une offre et les annonces reçues par e-mail, dans l'application et en web push, l'e-mail restant en option (ADR 0015) | L |
| S8 | Suivi des mises à jour : Claude revérifie les annonces sur leur portail (dans le navigateur de l'utilisateur), une vérification datée par annonce (qui, résultat, changements, preuve), faits appliqués, statut proposé jamais appliqué d'office, file « à revérifier », republication rattachée (lot 15, ADR 0025) | S |
| S9 | Questions aux agences : Claude pose à l'annonceur (agence ou vendeur) les questions ouvertes de la todo (charges, taxe foncière, DPE, travaux votés, PV d'AG…) par Gmail ou la messagerie du portail, **après validation des messages par lot** par un membre ; le serveur n'envoie rien ; la réponse remplit la fiche (source « agence ») ou propose une valeur qui contredit une saisie à la main, et coche les tâches ; contact de l'annonceur minimal et effaçable ; relance due après 5 jours ouvrés (lot 17, ADR 0027) | S |

### 3.3 Évaluation financière

Détail des formules dans [modele-de-calcul.md](modele-de-calcul.md).

| # | Besoin | Prio |
| --- | --- | --- |
| E1 | Reprise des calculs actuels : coût total, mensualité, rendements brut et net, effort, verdict | M |
| E2 | Hypothèses globales versionnées, valables pour toutes les annonces (la surcharge par annonce, prévue d'abord, est retirée au lot 19 : aucune annonce ne s'en servait ; un taux négocié ou un autre apport passent par un scénario) | M |
| E3 | Coût d'occupation en phase 1 (mensualité + charges + taxe foncière, comparé au loyer actuel) | S |
| E4 | Scénarios « et si » sans enregistrement (taux, apport, loyer, durée) depuis l'écran et le MCP | S |
| E5 | Frais de notaire par barème (droits de mutation, émoluments, débours) et honoraires d'agence à charge acquéreur distingués du net vendeur | S |
| E6 | Fiscalité locative estimée (micro-foncier ou réel, LMNP micro-BIC, TMI) et cash-flow net d'impôt | L |
| E7 | Horizon de détention, revente, TRI | L |

### 3.4 Prix cible et négociation

| # | Besoin | Prio |
| --- | --- | --- |
| N1 | Prix maximal pour chaque critère : rendement brut cible, rendement net cible, effort maximal, repère 220 × loyer | S |
| N2 | Prix cible = minimum des critères actifs ; décote nécessaire par rapport au prix affiché ; classement « négociable / tendu / hors de portée » | S |
| N3 | Tableau de sensibilité : prix de −15 % à 0, taux ± 0,5 point, loyer ± 10 % | S |
| N4 | Ancrage marché : prix au m² des ventes comparables (DVF) dans le quartier, écart avec le prix affiché | L |
| N5 | Leviers de négociation : ancienneté de l'annonce, baisses de prix, travaux, DPE, charges élevées | L |

### 3.5 Mise en location (phase 2) et conformité

| # | Besoin | Prio |
| --- | --- | --- |
| L1 | Contrôles actuels : calendrier DPE, encadrement, loyer de marché, règlement de copro, décence, permis de louer, demande, effort une fois loué | M |
| L2 | Table des loyers de référence de Bordeaux par année d'arrêté, zone, nombre de pièces, époque de construction, meublé ou non ; calcul automatique du plafond | S |
| L3 | Vérification du DPE auprès de l'observatoire ADEME (date, classe, consommation) et alerte si le DPE date d'avant juillet 2021 ou si l'audit énergétique est dû | S |
| L4 | Loyer de marché : saisie de 5 à 10 annonces comparables avec médiane calculée | S |
| L5 | Checklist réglementaire datée (évolutions de la loi Climat et résilience, prolongation de l'encadrement) tenue dans une table de référence, pas dans le code | S |

### 3.6 Collaboration

| # | Besoin | Prio |
| --- | --- | --- |
| K1 | Espace de travail (foyer) avec membres authentifiés ; une annonce appartient à l'espace | M |
| K2 | Avis par membre : note sur 5, texte, date ; moyenne affichée | M |
| K3 | Tâches partagées par annonce, checklist par défaut, assignation à un membre | M |
| K4 | Vue « ce qui a changé depuis ma dernière visite » | S |
| K5 | Invitation d'un nouveau membre par e-mail dans un espace existant (rattachement à sa première connexion Google, expiration, annulation) | L |
| K6 | Rôles propriétaire et membre ; retrait d'un membre, historique conservé | L |

### 3.7 MCP

Le MCP suit les principes éprouvés dans `bankin-analyzer` : authentification OAuth 2.1 par
Supabase, refus rendus en réponse et non en exception, garde-fous optimistes (« je crois que le
prix est X »), journal des écritures, données encadrées dans une balise pour que le modèle les
lise comme des données.

Lecture :

| Outil | Rôle |
| --- | --- |
| `list_listings` | Annonces filtrées (statut, commune, DPE, verdict, nouveau pour moi, critère enregistré, point et rayon, adéquation aux critères) et triées, avec les indicateurs calculés et l'adéquation (par défaut l'onglet « Dans les critères », lot 14) |
| `get_listing` | Une annonce complète : champs, provenance, calculs, phase 2, avis, tâches, historique |
| `get_assumptions` | Hypothèses globales en vigueur |
| `evaluate_listing` | Calcule une annonce hypothétique ou une variante (taux, apport, loyer) sans rien enregistrer |
| `get_target_price` | Prix cible par critère, décote nécessaire et sa classe, rang parmi les annonces actives, brief de négociation (offre suggérée, arguments), tableau de sensibilité en option, pour une annonce ou une hypothèse |
| `compare_listings` | Tableau comparatif de 2 à 6 annonces |
| `find_duplicates` | Doublons probables pour une URL, une adresse, un point (50 m) ou un trio commune, prix et surface, ou pour une annonce enregistrée |
| `get_market_context` | Plafond d'encadrement, références DVF, desserte pour une commune ou une adresse |
| `list_search_criteria` | Critères de recherche enregistrés, avec leur marge de tolérance, le nombre d'annonces par niveau d'adéquation et de nouveautés dans chacun |
| `evaluate_scenario` | Scénario « et si » sur une annonce (surcharges ou scénario enregistré) comparé à la base ; `saveAs` l'enregistre (portée écriture) |
| `get_projection` | Fiscalité estimée par régime, projection annuelle jusqu'à la revente, plus-value, TRI, VAN, enrichissement net |
| `get_compliance` | Checklist réglementaire datée à la date de mise en location, risques Géorisques à l'adresse |
| `list_visits` | Visites d'une annonce : date, état, participants, compte rendu, points positifs et négatifs, note, nombre de photos (lot 6) |
| `whats_new` | Ce qui a changé pour le membre depuis sa dernière visite : nouvelles annonces, prix, statuts, avis et tâches de l'autre membre, entrées dans un critère et sorties vers « hors critères » (lots 6 et 14) |
| `get_search_brief` | Ce que Claude cherche : critères actifs marges comprises, zones, portails cochés et liens de recherche fabriqués sans réseau, annonces déjà suivies et écartées, dernière exploration (lot 16) |
| `triage_candidates` | Trie des annonces lues sur les portails sans rien écrire : déjà suivie, déjà écartée, hors critères, doublon probable, nouvelle, avec l'adéquation (lot 16) |
| `check_listing` | Compare la page d'une annonce lue par Claude (ou son texte) à la fiche : écarts classés (appliqués, proposés, notés), résultat, statut proposé, republications probables ; rien n'est écrit (lot 15) |
| `list_open_questions` | Questions ouvertes à poser à l'annonceur, par annonce : tâches liées à un champ, contact, demandes en cours, relances dues (lot 17) |

Écriture (toutes réversibles, aucune suppression) :

| Outil | Rôle |
| --- | --- |
| `create_listing` | Crée une annonce à partir du schéma normalisé, avec le texte source et la provenance par champ en option ; répond avec les doublons probables sans bloquer la création (`ignoreDuplicates` journalisé, ADR 0007) et les tâches posées pour les champs manquants |
| `update_listing` | Met à jour des champs avec garde-fous sur les valeurs attendues |
| `set_listing_status` | Change le statut avec raison |
| `add_opinion` | Avis du membre connecté |
| `add_task`, `complete_task` | Tâches |
| `record_price_change` | Baisse ou hausse constatée sur l'annonce source |
| `record_offer` | Offre (montant, date, canal) et, pour une offre existante, réponse du vendeur et contre-proposition ; renvoie le statut proposé |
| `set_assumptions` | Hypothèses globales : champs modifiés seulement, garde-fou sur la version en vigueur, impact rendu (verdicts qui changent) (portée écriture) |
| `create_search_criteria`, `update_search_criteria` | Critères de recherche : filtres, marge de tolérance (lot 14) et périmètre en GeoJSON (point et rayon, polygone) ou paramètres d'isochrone |
| `add_rent_comparable` | Une annonce de location comparable saisie (loyer, surface, meublé, date, source) ; répond avec la médiane à jour |
| `add_visit` | Une visite faite ou planifiée (date, participants, compte rendu, points positifs et négatifs, note, tâche de préparation), sans photo ; renvoie le statut proposé sans l'appliquer (lot 6) |
| `record_exploration` | Enregistre une exploration : le serveur retrie, crée le compte rendu et les brouillons « à valider » (jamais une annonce), applique les vérifications des annonces déjà suivies ; idempotent par `runKey` (lot 16) |
| `apply_listing_check` | Enregistre une vérification : faits lus appliqués (prix par l'historique), dates de vérification, republication rattachée, extrait-preuve ; renvoie le statut proposé sans l'appliquer (lot 15) |
| `prepare_agency_requests` | Brouillons de messages à l'annonceur, groupés par annonce, texte poli par défaut ; rien n'est envoyé, le membre valide d'abord (lot 17) |
| `record_request_sent` | Enregistre l'envoi fait par Claude avec Gmail ou la messagerie du portail ; refusé sans validation dans l'application ou accord explicite dans la conversation (lot 17) |
| `record_agency_answer` | Enregistre la réponse : valeurs appliquées (source « agence ») ou proposées, tâches cochées, extrait masqué (lot 17) |
| `add_listing_link` | Rattache à une annonce le lien de la même annonce sur un autre portail, lu par Claude, seulement si l'agence et la référence sont les mêmes ; prix affiché, vendeur et référence lus ; prix de la fiche au plus bas en ligne, écart noté (lot 18) |

Ressources et prompts : le schéma d'annonce en JSON Schema (`apart://schema/listing`), le
glossaire des indicateurs (`apart://glossaire`), un prompt « analyser cette annonce » qui
enchaîne lecture de page, extraction (`extract_listing`), doublons, confirmation du membre,
création, évaluation. Le prompt est livré au lot 2, les ressources au lot 3 ; au lot 17, « questions aux agences » (montrer le lot, attendre l’accord, envoyer) et « réponses des agences » (relever, enregistrer, faire confirmer les valeurs proposées).

Portées OAuth `listings:read` et `listings:write`, limite connue de `bankin-analyzer` à corriger
dès le départ.

### 3.8 Enrichissement par données ouvertes

| # | Source | Usage | Prio |
| --- | --- | --- | --- |
| D1 | Géocodage IGN Géoplateforme (successeur de l'API Adresse) | Normaliser l'adresse, obtenir les coordonnées et l'identifiant BAN | S |
| D2 | Observatoire DPE ADEME (logements existants depuis juillet 2021) | Retrouver le DPE par adresse, vérifier classe, date, consommation | S |
| D3 | Loyers de référence de l'encadrement à Bordeaux (arrêté préfectoral annuel, données Bordeaux Métropole) | Plafond de loyer automatique | S |
| D4 | Arrêts de tram et bus TBM (données Bordeaux Métropole) | Distance au tram le plus proche | L |
| D5 | DVF (demandes de valeurs foncières, DGFiP) importé pour la Gironde dans la base du projet | Prix au m² des ventes comparables, ancrage du prix cible | L |
| D6 | Géorisques | Risques à l'adresse (inondation, argiles, radon) dans la checklist | L |
| D7 | Isochrones IGN Géoplateforme | Périmètre « n minutes à pied, à vélo ou en voiture depuis un point », figé en polygone à l'enregistrement ; le vélo est approché par une distance sur le réseau piéton et « en transport » reste à venir, la Géoplateforme n'ayant ni profil vélo ni transports en commun (ADR 0010) | L |
| D8 | Recensement des équipements sportifs (Data ES, ministère des Sports), complété par OpenStreetMap | Piste d'athlétisme la plus proche de chaque annonce (nom, distance à vol d'oiseau, nature : stade, piste isolée, couverte ou non, longueur, publics accueillis) (lot 11, ADR 0021) | L |
| D9 | OpenStreetMap (Overpass) | Supermarchés avec drive : le plus proche de chaque enseigne préférée (Carrefour, Auchan, Intermarché, toutes déclinaisons) et le plus proche toutes enseignes ; drive signalé par la donnée ou « à vérifier », jamais supposé ; aucune lecture des sites des enseignes (lot 11, ADR 0021) | L |
| D10 | OpenStreetMap (Overpass) | Salle Fitness Park la plus proche, chaque club vérifié (marque, nom, exploitant) (lot 11, ADR 0021) | L |
| D11 | Quartiers de Bordeaux Métropole et de la Ville de Bordeaux, Contours IRIS IGN-INSEE | Quartier de chaque annonce, pour toute la métropole : quartier officiel (secteur de vie à Bordeaux) là où la commune en publie, IRIS ailleurs, commune entière pour une commune non découpée, avec la provenance de chaque contour (lot 11, ADR 0021) | L |
| D12 | Contours des quartiers (D11) et lieux-dits OpenStreetMap | Placement du repère d'une annonce sans adresse au numéro au centre du quartier cité par l'annonce (secteur, quartier, IRIS, quartier qui regroupe des secteurs, lieu-dit), sinon de la commune ; précision visible partout (« Adresse exacte », « Au quartier (X) », « Commune seulement »), distances « ≈ » depuis un repère approché, filtre de la liste par précision (lot 12, ADR 0022) | S |

Les sources ouvertes changent d'adresse et de format : chaque connecteur est isolé derrière une
interface, avec un cache en base et un marquage de la date de récupération.

### 3.9 Carte et critères de recherche géographiques

| # | Besoin | Prio |
| --- | --- | --- |
| G1 | Carte des annonces (fond plan OpenStreetMap, plan IGN ou photo aérienne IGN, voir G8) avec les mêmes filtres que le tableau, couleur par verdict, ouverture de la fiche au clic | M |
| G2 | Filtre par point et rayon : adresse saisie ou clic sur la carte, rayon en mètres | M |
| G3 | Critères de recherche enregistrés et partagés dans l'espace : nom, communes, prix, surface, pièces, DPE, verdict, périmètre | S |
| G4 | Périmètre dessiné sur la carte (polygone), modifiable | S |
| G5 | Périmètre par isochrone : « n minutes à pied, à vélo ou en voiture depuis un point », calculé par un service externe et figé en polygone ; « en transport » attend un service qui le propose (ADR 0010) | L |
| G6 | Alerte : une nouvelle annonce qui entre dans un critère est marquée et comptée dans la synthèse ; une annonce ajoutée par le MCP est confrontée aux critères à la création | S |
| G7 | Couches de contexte sur la carte : arrêts de tram et bus, ventes DVF récentes, zone d'encadrement | L |
| G8 | Voir les rues et les bâtiments, surtout pour dessiner un périmètre : choix du fond (plan OpenStreetMap, plan IGN, photo aérienne IGN avec les noms de rues) commun aux cartes et retenu par appareil, couches et dessin conservés au changement de fond, carte de dessin cadrée de près et recentrée sur une adresse (lot 10, ADR 0020) | S |
| G9 | Couches d'équipements et de quartiers, sur la carte des annonces et la carte du quartier de la fiche : pistes d'athlétisme, supermarchés drive (enseignes préférées distinguées par la forme et la légende), salles Fitness Park, contours des quartiers (nom au survol et au clic) ; fenêtres avec nom, enseigne, adresse et source ; lisibles sur les trois fonds (lot 11, ADR 0021) | L |
| G10 | Adéquation aux critères actifs, distincte du statut : « dans les critères », « à confirmer » (adresse au quartier ou à la commune dont le contour touche le périmètre ou sa marge, ou donnée manquante), « à la marge » (dépassement dans la marge de tolérance du critère, raison chiffrée), « hors critères » ; marge réglable par critère (0 = strict) ; onglets « Dans les critères » et « Hors critères » de la liste, rien n'est perdu ; une annonce hors critères avec une offre en cours ou une visite prévue reste dans la liste (lot 14, ADR 0024) | S |

Le filtrage géographique se fait en base (PostGIS) et jamais dans le navigateur, pour que la
liste, la carte, le MCP et les alertes donnent le même résultat. Depuis le lot 14, PostGIS mesure
(distance au périmètre, relation du contour de l'annonce au périmètre, distance au tram) et
`domain` décide du niveau d'adéquation ; pour une adresse au quartier ou à la commune, c'est le
contour qui est comparé, jamais le repère. Sur mobile, le point et rayon et
l'isochrone sont les modes principaux ; le dessin de polygone vise le grand écran.

---

## 4. Modèle de données

Entités principales. Les montants sont en euros, les surfaces en m², les dates en ISO 8601.

**Workspace** (foyer) : nom, membres (utilisateur, rôle), hypothèses globales courantes.

**Listing** (annonce) :

- identité : source (`seloger`, `leboncoin`, `pap`, `bienici`, `agence`, `autre`), URL,
  identifiant externe, titre, dates de publication et de dernière mise à jour constatées ; depuis
  le lot 18, source, URL et identifiant sont ceux du lien principal (le plus ancien en ligne) ;
- vendeur (lot 18) : agence, mandataire, particulier ou inconnu (jamais deviné), nom de l'agence
  ou du réseau (jamais celui d'une personne), référence de l'annonce et sa clé de comparaison ;
- localisation : adresse saisie, adresse normalisée, identifiant BAN, coordonnées et point
  géographique PostGIS, précision (adresse exacte, rue, quartier, commune), commune, code INSEE,
  quartier ou arrêt ;
- bien : prix affiché, honoraires (montant ou %, à charge acquéreur ou vendeur), surface Carrez,
  surface totale, pièces, chambres, étage et nombre d'étages, ascenseur, année ou époque de
  construction, DPE (classe, consommation, GES, date), chauffage (type, individuel ou collectif),
  extérieur (balcon, terrasse, jardin), stationnement, cave, orientation, état général ;
- copropriété : charges annuelles, part non récupérable, nombre de lots, procédures en cours,
  travaux votés, syndic ;
- fiscalité locale : taxe foncière ;
- textes : description brute, notes ;
- état du suivi : statut, raison d'écartement, « vu par » (par membre, avec date).

Chaque champ saisi ou extrait porte une **provenance** (`listing`, `user`, `ai`, `open_data`,
`estimated`) et, pour l'IA, une confiance et l'extrait justificatif.

**ListingRenovation** : actif, niveau, durée, postes (libellé, montant), notes.

**ListingRentalPlan** (phase 2) : année, type de bail, encadrement (auto, oui, non), loyer de
référence majoré au m², loyer visé, loyer de marché constaté, demande locative, règlement de
copro, décence, permis de louer, notes. Les comparables sont des lignes **RentComparable**
depuis le lot 5 (ADR 0013).

**RentComparable** (lot 5) : annonce, loyer hors charges, surface, meublé, pièces, date de
l'annonce, source, lien, adresse, note, auteur ; la matière du loyer de marché (médiane au m²).

**Scenario** (lot 5) : espace, annonce (ou aucune : scénario d'espace), nom, surcharges (champs
de l'annonce et hypothèses), notes, auteur ; enregistré, réappliqué, jamais supprimé par le MCP.

**Assumptions** : apport, taux, durée, assurance, frais de notaire (taux forfaitaire ou barème :
droits de mutation, émoluments par tranches, CSI, débours), vacance, frais fixes, seuils de
rendement et d'effort, critères retenus pour le prix cible, seuils de décote ; au lot 5 : loyer
actuel, entretien, dates d'achat et de mise en location, TMI, régime fiscal, nature du meublé,
horizon, revalorisation, indexation (IRL), frais de revente, taux d'actualisation et paramètres
fiscaux datés ; au lot 19 : type de location de la phase 2 ; versionnées (date d'effet) ; plus de
surcharge par annonce depuis le lot 19 (colonne gardée, plus lue).

**Opinion** : annonce, membre, note, texte, date.

**Task** : annonce, libellé, fait, assigné, origine (défaut, manuelle, champ manquant).

**PriceEvent** : annonce, date, ancien prix, nouveau prix, source.

**ListingCheck** (lot 15) : annonce, date, membre et canal, résultat (inchangée, mise à jour, plus
en ligne, republiée, page inaccessible), écarts (champ, avant, après, appliqué, proposé ou noté),
résumé, extrait-preuve court, URL consultée, annonce liée, statut proposé. Sur l'annonce :
dernière vérification, dernière fois vue en ligne, annonce dont elle est la republication. Au
lot 18, une vérification porte sur un lien de l'annonce.

**ListingLink** (lot 18) : annonce, portail (Leboncoin, SeLoger, Bien'ici, PAP, Logic-Immo, site
d'agence, autre), lien et sa forme normalisée (unique dans l'espace), identifiant sur le portail,
prix affiché et sa date, première vue, dernière vue en ligne, dernière vérification, hors ligne
depuis, origine (lien d'origine, à la main, Claude, exploration, partage, alerte e-mail), agence
et référence lues, extrait-preuve court, auteur. Le prix de la fiche est le plus bas des liens en
ligne ; un prix saisi à la main n'est jamais écrasé (proposé). Le dernier lien ne se retire pas.

**Offer** : annonce, date, montant, canal (e-mail, téléphone, agence, en personne, courrier), réponse (en attente, acceptée, refusée, contre-proposition), contre-proposition, date de la réponse, auteur, notes. Une offre ne se supprime pas ; sa réponse propose un statut à l'annonce sans le changer d'office (ADR 0009).

**Visit** : annonce, date, état (faite, planifiée), participants (membres), compte rendu, points
positifs et négatifs, note sur 5, auteur, tâche « Préparer la visite » éventuelle ; les photos
sont des lignes **VisitPhoto** (lot 6, ADR 0014).

**VisitPhoto** (lot 6) : visite, espace, chemins de l'objet et de sa vignette dans le bucket
privé, type, taille, dimensions, légende, auteur, état (envoi en cours, prête). Lue par URL
signées à durée courte, supprimée par son auteur seulement.

**Notification** (lot 6) : destinataire, type (nouvelle annonce, statut, tâche assignée, entrée
dans un critère, réponse à une offre, annonces reçues par e-mail), titre, texte, lien, annonce,
ligne du journal d'origine, lu le, état d'envoi push et e-mail. Les préférences par type et par
canal sont un JSON sur le membre ; les appareils abonnés au web push sont des lignes
**PushSubscription**.

**ListingDraft** (lot 6) : espace, origine (alerte e-mail), fiche pré-remplie, doublons à la
réception, lecture par l'IA ou l'analyseur simple, sujet et expéditeur de l'e-mail, décision
(validé avec l'annonce créée, écarté).

**ActivityLog** : annonce, acteur (membre ou MCP), action, avant, après, date. Le canal (web,
MCP, import, système) est une colonne ; la phrase lisible et le détail des champs sont dérivés à
la lecture (lot 6). Le membre porte aussi sa dernière visite de l'application et le point de
départ de « ce qui a changé ».

**SearchCriteria** : espace, nom, créé par, actif, filtres (communes, prix, surface, pièces, DPE,
verdict, statuts, distance maximale au tram), marge de tolérance (lot 14 : périmètre, prix
maximal et minimal, surface, pièces, DPE, tram ; 0 = strict), périmètre : type (`point_radius`,
`polygon`, `isochrone`), géométrie PostGIS, GeoJSON d'origine, paramètres de l'isochrone (point,
mode, durée, date de calcul, approximation éventuelle).

**CriteriaMatch** : l'adéquation d'une annonce à un critère actif (lot 14) : niveau (dans les
critères, à confirmer, à la marge, hors critères), raisons chiffrées, détail filtre par filtre,
date du dernier changement de niveau, date de la dernière entrée, « à confirmer » à cause de la
localisation ; la matière des alertes, du badge et de l'historique (ADR 0010, 0024). L'annonce
porte son meilleur niveau, sa date et sa cause.

**TransitStop** : réseau, identifiant d'import, mode (tram, bus, bateau), lignes, nom, point
géographique (import TBM).

**DvfSale** : identifiant de mutation, nature, date de mutation, prix, surface, type de bien,
pièces, adresse, commune, code postal, point géographique, prix au m², source (import Bordeaux
Métropole depuis le fichier de la Gironde).

**RentControlZone** : territoire, zone de l'encadrement, secteur IRIS, code INSEE, multipolygone
PostGIS (zonage de Bordeaux, ADR 0011).

**Amenity** (lot 11) : genre (piste d'athlétisme, supermarché avec drive, salle Fitness Park),
source (`res`, `osm`) et identifiant dans la source, nom, enseigne et groupe d'enseigne, drive
(signalé ou à vérifier), adresse, commune, attributs propres au genre (nature, couverture,
longueur, couloirs, revêtement, publics, preuve du drive), point PostGIS (ADR 0021).

**Neighbourhood** (lot 11) : territoire, nature (quartier officiel, IRIS, commune entière), code
dans la source, nom, quartier parent, commune, code INSEE, provenance, multipolygone PostGIS et
part dessinée sur la carte (ADR 0021).

Le **Listing** porte aussi le numéro de son DPE et un instantané des données ouvertes (arrêt de
tram, médiane DVF, état du plafond, dernière recherche DPE ; lot 11 : quartier et équipements
les plus proches) qui alimente le critère « marché ».

**ReferenceData** : loyers de référence par arrêté (date d'application, zone, pièces, époque,
meublé), table des règles réglementaires datées (sorte `regulatory_rules`, lot 5 ; défaut dans
`contracts`), cache des appels open data (géocodage, DPE, isochrones, Géorisques). Le barème des
frais de notaire et les paramètres fiscaux vivent dans les hypothèses (ADR 0008, 0012).

---

## 5. Exigences non fonctionnelles

- **Usage** : deux utilisateurs, quelques dizaines d'annonces actives, quelques centaines au
  total. Aucune contrainte de charge ; la simplicité d'exploitation prime.
- **Mobile d'abord** : consultation et saisie rapide en visite, PWA installable, lecture hors
  ligne du cache.
- **Sécurité** : authentification obligatoire (Google via Supabase Auth), accès limité à
  l'espace de travail, MCP en OAuth 2.1 avec portées lecture et écriture, journal des écritures,
  aucun secret dans le dépôt.
- **Fiabilité des calculs** : la logique de calcul vit dans un paquet partagé, pur et testé
  (cas de l'artefact repris comme jeux de tests), identique à l'écran, dans l'API et dans le MCP.
- **Traçabilité** : chaque valeur affichée sait d'où elle vient et si elle est estimée.
- **Observabilité** : journaux structurés, identifiant de requête, Sentry, point de santé, comme
  dans `bankin-analyzer`.
- **Coût** : offres gratuites ou de base de Supabase et Vercel ; coût IA de l'ordre de quelques
  centimes par annonce extraite.
- **Langue** : français, formats fr-FR, euros.
- **Portabilité des données** : export JSON (complet, versionné) et CSV ; import initial des
  annonces de l'artefact actuel. Livré au lot 6 ([docs/export.md](../export.md)).
- **Confidentialité** : photos privées lues par URL signées, export réservé aux membres, aucune
  donnée personnelle dans les journaux de requêtes ([docs/confidentialite.md](../confidentialite.md)).

---

## 6. Risques et points ouverts

| Risque ou question | Réponse envisagée |
| --- | --- |
| Conditions d'utilisation des portails d'annonces | Pas de scraping serveur ; Claude lit la page dans le navigateur de l'utilisateur ; saisie manuelle toujours possible |
| Qualité de l'extraction IA (surface Carrez ou totale, charges mensuelles ou annuelles, prix FAI ou net vendeur) | Schéma strict avec unités explicites, provenance et confiance, validation humaine avant enregistrement |
| Évolution réglementaire (encadrement prolongé ou non, calendrier DPE, audit énergétique) | Données de référence datées en base, pas de constantes dans le code |
| Encadrement limité à la commune de Bordeaux, pas aux autres communes de la métropole | Règle portée par la table de référence par code INSEE |
| Fiscalité complexe et dépendante de la situation du foyer | Hors MVP ; champs TMI et régime prévus, estimation signalée comme telle |
| Accès aux données DVF (API officielle instable, services tiers payants) | Import des fichiers ouverts DGFiP pour la Gironde dans Postgres ; pas de dépendance à une API tierce |
| Dessin d'un polygone peu pratique sur mobile | Point et rayon et isochrone comme modes principaux sur mobile ; polygone sur grand écran |
| Adresse approximative dans l'annonce (quartier seulement) | Précision stockée avec le point ; pour un critère à périmètre, le contour du quartier ou de la commune est comparé, jamais le repère : contour qui touche le périmètre = « à confirmer » jusqu'à l'adresse (lot 14) |
| Migration des données de l'artefact | Export de la collection `annonces` et des réglages, script d'import avec correspondance des champs |

Questions à trancher avec Richard avant le squelette : voir la fin de [tech-stack.md](tech-stack.md).

---

## 7. Périmètre du MVP

Inclus : schéma normalisé, espace de travail à deux membres, fiche et tableau comparatif à parité
avec l'artefact, carte des annonces et filtre par point et rayon, hypothèses versionnées, calculs
partagés et testés, statuts étendus, « vu par moi », avis, tâches, MCP de lecture et d'écriture
de base (`list`, `get`, `create`, `update`, `set_status`, `evaluate`, `add_opinion`,
`add_task`), import des données actuelles.

Exclu du MVP : extraction IA côté serveur, prix cible, critères enregistrés avec polygone et
isochrone, alertes, enrichissement open data, fiscalité, TRI, notifications, partage mobile. Ces
lots suivent dans la [feuille de route](roadmap.md).
