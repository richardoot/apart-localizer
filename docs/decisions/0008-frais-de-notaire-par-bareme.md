# 0008. Frais de notaire par barème : défauts Gironde, forfaits estimés, mode « taux » conservé par défaut, prix cible par bissection

Statut : acceptée, 3 novembre 2026.

## Contexte

Le besoin E5 et le modèle de calcul § 2 prévoient des frais de notaire par barème (droits de
mutation, émoluments, débours) à la place du pourcentage forfaitaire de l'artefact (7,5 %). Le
prix cible (§ 5) est en forme fermée parce que les frais sont proportionnels au prix ; un barème
par tranches avec forfaits casse cette hypothèse. Les valeurs réglementaires changent (le droit
départemental de la Gironde est passé de 4,5 % à 5 % le 1er mai 2025, pour trois ans) et une
partie des frais (débours, formalités) n'est qu'estimable.

## Options

1. **Barème codé en dur** dans `domain`, un taux unique de droits : simple, mais invérifiable et
   non datable ; chaque changement réglementaire est une version du code.
2. **Barème dans les hypothèses** (`contracts`, versionné avec elles) avec des défauts
   documentés et datés, le mode taux restant le défaut ; prix cible par recherche numérique en
   mode barème.
3. **Table de référence en base** (`ReferenceData`), chargée depuis une source ouverte : prévu
   pour les loyers de référence et le calendrier DPE, mais aucune source ouverte structurée
   n'existe pour les DMTO par département ni pour les émoluments.

## Décision

Option 2.

- `Assumptions.notaryMode` vaut `rate` (défaut : parité avec l'artefact, le golden synthétique
  et le golden privé ne changent pas) ou `scale`. `Assumptions.notaryScale` porte le barème :
  droit départemental, taxe communale, frais d'assiette (fraction du droit départemental),
  tranches d'émoluments (borne, taux) avec TVA, contribution de sécurité immobilière (taux,
  minimum), débours forfaitaires, libellé d'origine.
- Défauts (`DEFAULT_NOTARY_SCALE`) : Gironde au 3 novembre 2026, droit départemental 5 %
  (loi de finances 2025, art. 116 ; délibération relevée par legifiscal.fr le 21 mai 2025,
  confirmée par pretto.fr et toutsurmesfinances.com en 2026), taxe communale 1,2 %, frais
  d'assiette 2,37 %, émoluments de l'article A444-91 du code de commerce, CSI 0,10 % (minimum
  15 €), débours 800 €. Les primo-accédants restent à 4,5 % : l'application ne connaît pas la
  situation du foyer, c'est une hypothèse à régler à la main.
- `notaryFeesFromScale({ price, furniture, scale })` dans `domain` rend le détail par poste ;
  `compute` expose `notaryFeesDetail` à côté de `notaryFees`. Le mobilier déduit de l'assiette
  est le mobilier **compris dans la vente**, pas le `furnitureValue` de l'annonce (mobilier à
  acheter) ; `compute` passe donc 0.
- Le total est `estimated` dans les deux modes (taux forfaitaire, ou forfaits) : affiché « ≈ ».
- En mode barème, `priceForTotalCost` cherche le prix par bissection (coût croissant, arrêt au
  demi-centime). Les propriétés du prix cible (`rdtBrut(P_b) = s_b`, `effort(P_e) = −E`…) sont
  testées par fast-check dans les deux modes, à 1 € de coût près en mode barème.

## Conséquences

- Aucune migration : les hypothèses sont du JSON, et les versions enregistrées avant le lot 3
  sont relues avec les défauts (`notaryMode: rate`).
- Le modèle de calcul § 2 documente le barème et ses sources ; les valeurs sont à revoir au
  31 mars 2028 (fin de la hausse autorisée) et à chaque arrêté sur le tarif des notaires.
- L'écart maximal entre les deux modes sur l'exemple § 8 est d'un millier d'euros (15 000 € contre
  16 031 €) : le mode taux reste une approximation acceptable pour trier, le barème sert à
  chiffrer une offre.
