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
les invitations (lot 8). Le contact de l'annonceur (lot 17 : agence, interlocuteur, e-mail,
téléphone, messagerie, données d'un tiers) n'est que dans le JSON.

## CSV

Une ligne par annonce, pour Excel ou LibreOffice : séparateur `;`, encodage UTF-8 avec BOM, fins
de ligne CRLF, nombres à la française sans séparateur de milliers (`4,09`, `-361,92`), dates ISO
(`2026-11-03`), booléens `oui` / `non`. Une cellule de texte qui commencerait par `=`, `+`, `-`
ou `@` est précédée d'une apostrophe (injection de formule). Les indicateurs sont ceux de
`packages/domain`, calculés à l'export avec les hypothèses en vigueur.

Colonnes, dans l'ordre (`LISTING_CSV_COLUMNS`, `apps/api/src/export/csv.ts`) : Titre, Statut,
Portail, Lien, Commune, Quartier, Adresse, Repère, Prix (€), Honoraires d'agence (€), Surface Carrez (m²),
Pièces, Chambres, Étage, Ascenseur, Année de construction, DPE, GES, Charges annuelles (€),
Taxe foncière (€), Loyer visé (€/mois), Loyer retenu (€/mois), Prix au m² (€), Frais de notaire
(€), Travaux (€), Coût total (€), Mensualité (€), Rendement brut (%), Rendement net (%), Effort
mensuel (€), Verdict, Location, Prix cible (€), Décote nécessaire (%), Note moyenne (/5), Tâches
ouvertes, Visites, Dernière offre (€), Ajoutée le, Modifiée le, Identifiant, puis, en fin de ligne
pour ne décaler aucune colonne existante, Vérifiée le, Vue en ligne le, Dernière vérification
(lot 15) et Adéquation, Raisons de l'adéquation (lot 14).

« Vérifiée le » est la dernière vérification sur le portail, quel qu'en soit le résultat ;
« Dernière vérification » en donne le résultat (« Inchangée », « Mise à jour », « Plus en ligne »,
« Republiée », « Non vérifiée : page inaccessible » ; vide si jamais vérifiée). Les deux colonnes
du lot 14 (ADR 0024) : « Adéquation » vaut « Dans les critères », « À confirmer », « À la marge »,
« Hors critères » ou « Aucun critère actif » ; « Raisons de l'adéquation » donne le critère qui
fixe ce niveau, ses raisons chiffrées (« « Talence » : Prix +3,6 % (maximum 220 000 €, marge
5 %) ») et, le cas échéant, « Gardée dans la liste : offre en cours ». L'export de tout l'espace
(`scope=workspace`) prend toutes les annonces, hors critères comprises ; une sélection suit
l'onglet de la liste (`fit`).

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
(quartier et équipements les plus proches, `null` tant qu'il n'a pas été calculé). Le lot 12
non plus : `listing.location.placement` (comment le repère a été placé : méthode, zone retenue,
texte reconnu, réserves ; `null` pour une annonce antérieure au lot 12), les champs
`approximate` des équipements de `surroundings` (`false` par défaut), et la colonne CSV
« Repère » (« Adresse exacte », « À la rue », « Au quartier (X) », « Commune seulement »,
« Non localisée »). Le lot 14 non plus : `criteriaFit` par annonce (niveau, critère, raisons,
« depuis » et sa cause, `kept`, détail par critère filtre par filtre) et `tolerance` de chaque
critère dans `searchCriteria` (la marge par défaut pour un critère antérieur). Le lot 15 non plus :
`listing.lastCheckedAt`, `listing.lastSeenOnlineAt` et `listing.republishedFromId` (`null` par
défaut), et `checks` par annonce (les vérifications sur le portail, de la plus récente à la plus
ancienne ; une liste vide quand un export antérieur n'en a pas) ; l'extrait-preuve d'une
vérification est court (500 caractères), téléphones et adresses e-mail masqués. Le lot 16 non
plus : `explorations` (les explorations des portails par Claude, de la plus récente à la plus
ancienne : membre, canal, dates, critères, bilan par portail, compteurs, résumé, notes, et les
lignes du compte rendu — lien, portail, titre, prix, surface, pièces, commune, quartier, résultat,
raison, niveau d'adéquation, annonce et brouillon liés, extrait court masqué ; une liste vide
quand un export antérieur n'en a pas) et `portals` de chaque critère (portails cochés, tous par
défaut). Les brouillons « à valider » ne sont pas exportés. Le CSV est inchangé.
Le lot 17 non
plus : `contact` par annonce (le contact de l'annonceur, `null` s'il n'y en a pas ou dans un
export antérieur), `agencyRequests` (les demandes à l'annonceur : message, tâches posées,
validation, envoi, référence du fil, réponses avec leurs valeurs appliquées ou proposées et un
extrait de 1 000 caractères masqué ; liste vide par défaut) et, dans chaque tâche, `field`,
`requestedAt`, `requestId`, `answeredAt` (`null` par défaut). Le CSV ne change pas : une liste de
demandes ne tient pas dans une cellule, et les coordonnées d'un tiers n'ont rien à faire dans un
tableur partagé ; les tâches cochées par une réponse comptent déjà dans « Tâches ouvertes ».

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
    rentComparables: RentComparable[],
    checks: ListingCheck[],                 // lot 15 : date, auteur, canal, résultat, écarts, extrait
    criteriaFit: ListingCriteriaFit,        // lot 14 : adéquation aux critères actifs
    contact: ListingContact | null,         // lot 17 : contact de l'annonceur
    agencyRequests: AgencyRequest[]         // lot 17 : demandes, validation, envoi, réponses
  }],
  searchCriteria: SearchCriteria[],         // filtres, marge de tolérance, périmètre GeoJSON, portails (lot 16)
  scenarios: Scenario[],                    // de l'espace et des annonces exportées
  explorations: Exploration[]               // lot 16 : explorations des portails et lignes du compte rendu
}
```

Les objets reprennent les schémas de `packages/contracts` (montants en euros, surfaces en m²,
taux en fractions, dates ISO 8601). Le fichier se relit avec `ExportDocumentSchema.parse` ; il
n'existe pas encore d'import depuis ce format.
