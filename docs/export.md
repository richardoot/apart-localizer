# Export des données

`GET /export` (jeton du membre, comme toute l'API) rend un fichier en pièce jointe
(`Content-Disposition: attachment`, `Cache-Control: no-store`). Le web le propose par le bouton
« Exporter » de la liste des annonces. Il n'y a pas d'outil MCP d'export : le MCP lit déjà tout
(ADR 0014).

| Paramètre | Valeurs                               | Rôle                                                                                                                     |
| --------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `format`  | `json` (défaut), `csv`                | JSON complet et versionné, ou CSV pour un tableur                                                                        |
| `scope`   | `workspace` (défaut), `selection`     | Toutes les annonces de l'espace, tous statuts ; ou la sélection courante : les filtres de la liste (`GET /listings`)     |
| `ids`     | identifiants séparés par des virgules | Avec `selection`, restreint aux annonces cochées                                                                         |
| filtres   | ceux de `GET /listings`               | `status`, `commune`, `dpe`, `verdict`, `priceMin`… `criteriaId`, `lng`/`lat`/`radius` (sans `status` : annonces actives) |

L'export ne contient que l'espace du membre connecté. Aucune photo n'en sort (elles restent dans
le stockage privé), aucune adresse e-mail ni identifiant de connexion de membre. `members`
liste les membres actifs et les anciens membres (auteurs d'avis, de tâches, de visites), jamais
les invitations (lot 8).

## CSV

Une ligne par annonce, pour Excel ou LibreOffice : séparateur `;`, encodage UTF-8 avec BOM, fins
de ligne CRLF, nombres à la française sans séparateur de milliers (`4,09`, `-361,92`), dates ISO
(`2026-11-03`), booléens `oui` / `non`. Une cellule de texte qui commencerait par `=`, `+`, `-`
ou `@` est précédée d'une apostrophe (injection de formule). Les indicateurs sont ceux de
`packages/domain`, calculés à l'export avec les hypothèses en vigueur.

Colonnes, dans l'ordre (`LISTING_CSV_COLUMNS`, `apps/api/src/export/csv.ts`) : Titre, Statut,
Portail, Lien, Commune, Quartier, Adresse, Prix (€), Honoraires d'agence (€), Surface Carrez (m²),
Pièces, Chambres, Étage, Ascenseur, Année de construction, DPE, GES, Charges annuelles (€),
Taxe foncière (€), Loyer visé (€/mois), Loyer retenu (€/mois), Prix au m² (€), Frais de notaire
(€), Travaux (€), Coût total (€), Mensualité (€), Rendement brut (%), Rendement net (%), Effort
mensuel (€), Verdict, Location, Prix cible (€), Décote nécessaire (%), Note moyenne (/5), Tâches
ouvertes, Visites, Dernière offre (€), Ajoutée le, Modifiée le, Identifiant.

La colonne « Coût total (€) » garde son nom depuis le lot 9, pour les tableurs qui la lisent :
c'est le **coût tout compris** de l'interface (prix affiché + frais de notaire + travaux +
mobilier, ADR 0019).

## JSON, version 1

Validé à l'écriture par `ExportDocumentSchema` (`packages/contracts/src/export.ts`) ; les nombres
non finis (rendement d'une annonce sans coût) valent `null`. Une modification incompatible du
format change `version`. Le lot 9 n'ajoute que des champs, la version reste 1 :
`indicators.metrics.furnitureValue`, et dans `indicators.targetPrice` le coût tout compris
maximal de chaque critère (`criteria[].maxTotalCost`) et l'annonce évaluée au prix cible
(`atTarget`). Le lot 11 non plus : l'instantané `listing.openDataContext` gagne `surroundings`
(quartier et équipements les plus proches, `null` tant qu'il n'a pas été calculé).

```text
{
  format: "apart-localizer.export",
  version: 1,
  exportedAt: ISO 8601,
  scope: "workspace" | "selection",
  workspace: { id, name },
  members: [{ id, handle, displayName }],
  assumptions: { current: AssumptionsVersion, history: AssumptionsVersion[] },
  listings: [{
    listing: Listing,                       // champs, provenance, travaux, phase 2, « vu par »
    indicators: { metrics, rentalVerdict, targetPrice },   // calculés à l'export
    opinions: Opinion[],
    tasks: Task[],
    priceEvents: PriceEvent[],
    offers: Offer[],
    visits: Visit[],                        // sans `photos` ; `photoCount` seulement
    rentComparables: RentComparable[]
  }],
  searchCriteria: SearchCriteria[],         // filtres et périmètre GeoJSON
  scenarios: Scenario[]                     // de l'espace et des annonces exportées
}
```

Les objets reprennent les schémas de `packages/contracts` (montants en euros, surfaces en m²,
taux en fractions, dates ISO 8601). Le fichier se relit avec `ExportDocumentSchema.parse` ; il
n'existe pas encore d'import depuis ce format.
