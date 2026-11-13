# 0046. Le loyer visé estimé d'après l'observatoire des loyers, quand personne ne l'a donné

Statut : acceptée, 13 novembre 2026. Amende 0038 (le loyer observé n'entrait dans aucun calcul) ;
suit le modèle du plafond d'encadrement posé d'office (lot 4, `REFERENCE_RENT_KEY`).

## Contexte

Sans loyer visé, la rentabilité, le prix cible, le verdict et la réponse « Faut-il y aller ? » ne
se calculent pas. Une annonce créée par Claude au connecteur n'en a presque jamais : l'annonce ne
le dit pas, et le loyer de marché ne s'estime qu'à partir de cinq loyers comparables saisis par un
membre. La fiche restait donc « à confirmer » jusqu'à ce qu'un membre fixe un loyer, alors que
l'application a, pour presque toute la métropole, la médiane observée par l'observatoire local des
loyers pour la zone et le nombre de pièces (lot 28).

## Décision

1. **Quand** : à chaque recalcul de la fiche (`ListingEnrichmentService`) : à la création, quel
   que soit le canal (application, connecteur, brouillon gardé), puis à chaque changement de
   surface, de pièces, de phase 2 ou de localisation.
2. **Quelle valeur** (`estimatedTargetRent`, `domain`) : la médiane au m² des appartements du même
   nombre de pièces × la surface, arrondie aux 5 euros. Rien sans zone sûre (statut « ok » :
   adresse au numéro, ou à la rue avec la mention « lue à la rue »), sans ligne pour ce nombre de
   pièces (la médiane de toutes tailles ne vaut pas pour un T1 ou un T4), ni sans surface : la
   fiche reste alors sans loyer visé, comme avant.
3. **Marquée** : provenance `estimated` sous la clé `rentalPlan.targetRent` (`TARGET_RENT_KEY`),
   avec d'où vient le chiffre (`evidence`). La fiche affiche « estimé » et la source, la réponse
   dit « avec un loyer visé estimé », le connecteur le dit « estimé d'après l'observatoire des
   loyers, à confirmer avec le membre », le journal « loyer visé estimé à … ». La tâche « Fixer
   le loyer visé » d'une annonce lue par l'IA reste ouverte. Le loyer observé ne se compare plus
   à sa propre estimation (place dans les quartiles).
4. **Jamais d'écrasement** (`targetRentAction`) : un loyer donné par un membre, par Claude ou lu
   dans l'annonce n'est jamais touché. Un loyer estimé suit l'estimation du moment ; une
   estimation qui ne vaut plus (adresse moins précise, surface effacée) est retirée. Un loyer
   renvoyé inchangé (formulaire de la phase 2, connecteur) reste estimé ; changé, il prend la
   provenance de celui qui l'écrit. Un loyer vidé par un membre est de nouveau estimé, comme le
   plafond.
5. **Phase 2** : une fiche qui n'en avait pas la reçoit avec l'estimation, et le plafond
   d'encadrement s'y pose dans le même recalcul quand la commune est encadrée ; le loyer retenu
   reste borné par le plafond.
6. **Fusion** : un loyer donné sur la fiche absorbée remplace le loyer vide ou estimé de la fiche
   gardée (`mergeTargetRentFill`, compté parmi les champs complétés, montré dans l'aperçu) ;
   annuler la fusion le retire, et le recalcul pose de nouveau l'estimation.
7. **Rattrapage** : `pnpm refresh:target-rent [--dry-run]` estime les annonces existantes par le
   même recalcul (canal `system`, sans recherche du DPE), une seule fois par annonce.

## Options écartées

- **Le 3e quartile, ou une majoration pour le meublé** : l'observatoire ne distingue pas le vide
  du meublé, et ses loyers sont ceux de tous les locataires en place ; une majoration serait
  inventée. La médiane sous-estime plutôt une mise en location, ce qui est prudent pour décider
  d'un achat.
- **Estimer avec un repère au quartier ou au centre de la commune** : la zone y est « à
  vérifier », et une commune partagée entre zones donnerait un chiffre faux sans le dire.
- **Remplir le loyer de marché (`marketRent`)** : toujours écarté (0038), il reste celui que le
  membre retient de ses comparables.
- **Estimer à la lecture sans rien écrire** : le loyer visé nourrit le prix cible, les rangs, les
  exports et les comparaisons, qui lisent la fiche enregistrée ; une valeur calculée à part aurait
  multiplié les chemins.

## Conséquences

- Aucune migration : la colonne `rental_plans.target_rent` et `listings.field_sources` suffisent.
- Les brouillons « À valider » ne sont pas estimés : leur rentabilité reste « à confirmer »
  jusqu'à ce qu'ils deviennent une annonce.
- Code : `domain/src/rent-observatory.ts` (`estimatedTargetRent`, `targetRentAction`,
  `targetRentIsEstimated`, `TARGET_RENT_KEY`), `domain/src/listing-merge.ts`
  (`mergeTargetRentFill`), `api/src/listings/enrichment.service.ts`, `listings.service.ts`
  (provenance à la modification), `listing-merge.service.ts`, `mcp/mcp-tools.ts`
  (`describeListing`), `web/…/budget/RentalPhaseSection.vue`, `scripts/refresh-target-rent.ts`.
