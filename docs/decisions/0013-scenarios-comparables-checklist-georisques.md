# 0013. Scénarios et comparables en tables, évaluation sans écriture, règles réglementaires datées remplaçables, Géorisques v1 en cache

Statut : acceptée, 3 novembre 2026.

## Contexte

Le lot 5 ajoute les scénarios « et si » enregistrables (E4), le loyer de marché par 5 à 10
comparables saisis (L4), une checklist réglementaire datée tenue dans une table de référence
(L5) et les risques Géorisques à l'adresse (D6). La phase 2 portait depuis le lot 0 une liste
JSON `rental_plans.comparables` (loyer, surface, lien, note), jamais alimentée par l'interface et
vide dans les deux bases locales. L'étude du besoin prévoit un MCP sans suppression.

## Décision

1. **Deux tables**, migration `20261103210000_lot5_scenarios_rent_comparables` : `scenarios`
   (espace, annonce ou aucune pour un scénario d'espace, nom, surcharges JSON validées par
   `ScenarioOverridesSchema`, notes, auteur) et `rent_comparables` (annonce, loyer, surface,
   meublé, pièces, date de l'annonce, source, lien, adresse, note, auteur). SQL de
   `prisma migrate diff`, relu : les suppressions d'index GiST proposées par Prisma sont écartées.
   L'ancienne liste JSON n'est plus lue ni écrite (le champ quitte le contrat) ; la migration
   recopie ses éventuelles lignes complètes dans la nouvelle table et garde la colonne, pour ne
   rien perdre.
2. **Une évaluation n'écrit rien** : `POST /listings/:id/scenarios/evaluate` et
   `evaluate_scenario` comparent la base et le scénario ; un scénario enregistré se complète de
   surcharges champ par champ. Le MCP enregistre par `saveAs` (portée écriture, journalisé) dans
   le même outil, comme `record_offer` ; aucune suppression par le MCP. En REST, scénarios et
   comparables se modifient et se suppriment depuis l'application web, journalisés.
3. **Règles réglementaires** : `DEFAULT_REGULATORY_RULES` (`contracts/src/compliance.ts`),
   relevées le 3 novembre 2026, chaque règle avec sa date et sa source ; une table déposée en
   `reference_data` (sorte `regulatory_rules`, clé `current`) la remplace si elle est valide
   (sinon la table par défaut). L'évaluation (`complianceReport`, domain) se fait à la date de
   mise en location prévue et rend ok, attention, bloquant ou à vérifier. Le permis de louer et
   le plan d'exposition au bruit ne se déduisent pas de l'adresse : « à vérifier », avec la carte
   de Bordeaux Métropole en lien. Le calendrier DPE de `rentalChecks` (constante du lot 0) reste
   inchangé pour ne pas toucher aux verdicts du jeu golden ; ses dates sont identiques à la table.
4. **Géorisques** : rapport `resultats_rapport_risque` de l'API v1 (sans jeton ; la v2 en exige
   un), un appel par annonce au point géocodé, cache `reference_data` (sorte `georisques`)
   trente jours, panne « indisponible » jamais mise en cache, niveau de chaque aléa par une
   fonction pure de `domain` (`georisqueLevel`). Licence Etalab 2.0.
5. **Un module `study`** pour l'étude de l'annonce dans le temps (phase 1, projection,
   scénarios, comparables, conformité), plutôt que d'alourdir `listings` ; le MCP l'orchestre.
6. **Web** : phase 1, scénarios et projection sont calculés dans le navigateur par `domain`
   (aperçu en direct, mêmes fonctions que l'API) ; loyer de marché et conformité viennent du
   serveur et ne se chargent qu'à l'ouverture de leur onglet (Géorisques n'est pas appelé à
   chaque ouverture de fiche).

## Conséquences

- Le connecteur passe de 21 à 25 outils (`evaluate_scenario`, `get_projection`,
  `get_compliance`, `add_rent_comparable`).
- La colonne `rental_plans.comparables` est à supprimer dans un lot ultérieur, une fois la copie
  vérifiée en production.
- La table des règles se met à jour sans déploiement (ligne `reference_data`), mais la table
  par défaut, sa version et le modèle de calcul § 11 restent la référence à tenir à jour (fin de
  l'encadrement au 24 novembre 2026 sans prolongation définitive au relevé).
