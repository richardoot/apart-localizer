# 0012. Fiscalité estimée et projection : paramètres datés dans les hypothèses, pas de TMI inventée, conventions de projection, graphique SVG

Statut : acceptée, 3 novembre 2026.

## Contexte

Le lot 5 ajoute la fiscalité locative estimée (besoin E6 : micro-foncier, réel foncier, LMNP
micro-BIC et réel, prélèvements sociaux, TMI) et la projection jusqu'à la revente (E7 : loyers
indexés, impôt, crédit, plus-value, TRI, VAN). Le brief demande des paramètres fiscaux datés,
sourcés et configurables, jamais écrits dans les formules, et un résultat présenté comme une
estimation. Plusieurs paramètres bougent en 2025-2026 (LFSS 2026, loi de finances pour 2026,
réintégration des amortissements LMNP depuis la loi de finances pour 2025). Le modèle de calcul
§ 7 donnait 17,2 % de prélèvements sociaux pour tous les revenus locatifs, ce qui n'est plus
exact pour le meublé.

## Options

1. **Paramètres dans `ReferenceData`**, chargés en base : datables, mais aucune source ouverte
   structurée ne les publie, et un scénario « et si » ne pourrait pas les faire varier.
2. **Paramètres dans les hypothèses** (`Assumptions.taxParameters`), avec des défauts datés et
   sourcés dans `contracts`, comme le barème des frais de notaire (ADR 0008).

## Décision

Option 2.

- `DEFAULT_TAX_PARAMETERS` (`contracts/src/fiscal.ts`) : relevé le 3 novembre 2026, avec ses
  sources (URL, date de consultation) et ses incertitudes, versionné avec les hypothèses et
  modifiable champ par champ (`set_assumptions`). Valeurs et certitude : modèle de calcul § 7.3.
  Les prélèvements sociaux distinguent le foncier (17,2 %), les BIC LMNP (18,6 %, LFSS 2026,
  « probable, à confirmer » tant que le BOFiP ne l'a pas commenté) et la plus-value (17,2 %) ; le
  modèle de calcul est corrigé.
- **Aucune TMI inventée** : `marginalTaxRate` vaut `null` par défaut ; sans elle, l'impôt sur le
  revenu n'est pas estimé (`null`), les prélèvements sociaux le sont, et tout ce qui est « après
  impôt » vaut `null` avec un avertissement. Même règle pour le loyer actuel (`currentRent`) :
  sans lui, la phase 1 ne compte aucun loyer évité (signalé).
- **Défauts de modélisation, à régler** : horizon 15 ans, revalorisation 0 % (valeur constante),
  indexation 1,57 % (variation de l'IRL au 3e trimestre 2026, INSEE, 15 octobre 2026) appliquée
  aux loyers, aux charges, à la taxe foncière et au loyer actuel, frais de revente 5 %
  (estimation), actualisation au taux du crédit.
- **Conventions de projection** : simulation mois par mois depuis l'acquisition, agrégée par
  année de détention (assimilée à l'année civile pour l'impôt) ; tableau d'amortissement exact ;
  valeur de départ = prix + travaux ; le loyer actuel évité en phase 1 compte comme une recette
  (le TRI compare l'achat au fait de rester locataire) ; TRI par Newton avec bissection de
  secours, VAN, enrichissement = somme des flux.
- **Régimes** : par défaut selon le bail (vide : micro-foncier ; meublé et colocation, supposée
  meublée : micro-BIC) ; un régime incompatible avec le bail est remplacé par son équivalent ; un
  plafond micro dépassé impose le réel l'année concernée ; la projection compare toujours les
  deux régimes du bail. LMNP réel : bâti à sa valeur estimée à la mise en location, terrain et
  composants selon la pratique comptable usuelle (pas des valeurs légales), amortissements qui ne
  créent pas de déficit (excédent différé), réintégrés dans la plus-value (paramètre).
- **Plus-value** : exonération de la résidence principale seulement si la vente précède la mise
  en location ; une fois loué, plus d'exonération ; surtaxe calculée sur la plus-value totale
  (le seuil par vendeur est signalé). Le dispositif « Jeanbrun » (loi de finances pour 2026) n'est
  pas modélisé : il exige une location dans les douze mois suivant l'acquisition.
- **Année de location des contrôles** : `rentalChecks` lit l'année de la phase 2 de l'annonce,
  sinon celle de `rentalStartDate`, sinon `rentalYear` ; sans date précise, rien ne change (jeux
  golden identiques).
- **Graphique** : un SVG écrit à la main (barres des cash-flows, ligne de la position latente),
  sans bibliothèque ; les choix techniques prévoyaient ApexCharts « si besoin », le besoin tient
  en deux séries.

## Conséquences

- Aucune migration pour les hypothèses : JSON relu avec les nouveaux défauts ; une version
  antérieure n'a ni TMI ni dates, donc rien d'« après impôt » tant que le foyer ne les saisit pas.
- À revoir : le seuil micro-BIC de 83 600 € (période 2026-2028), les prélèvements sociaux BIC
  quand le BOFiP paraîtra, le plafond de 21 400 € (travaux payés jusqu'au 31 décembre 2027), toute
  réforme du LMNP ou des abattements de plus-value. Chaque mise à jour change la constante, sa
  date, ses sources et le modèle de calcul ensemble.
- Les chiffres sont des estimations, et l'interface, le MCP et la documentation le disent.
