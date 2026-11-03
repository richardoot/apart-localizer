# 0009. Offres et négociation : un outil `record_offer` pour l'offre et sa réponse, statut proposé jamais forcé, `set_assumptions` partiel avec garde de version et impact

Statut : acceptée, 3 novembre 2026.

## Contexte

Le lot 3 ajoute les offres (besoin S5), le prix cible et la négociation (N1 à N3, N5), et
l'écriture des hypothèses par le MCP (`set_assumptions`). L'étude du besoin fixe la liste des
outils (`get_target_price`, `record_offer`, `record_price_change`, `compare_listings`,
`set_assumptions`) et le modèle de données (`Offer` : annonce, date, montant, réponse, notes).
Quatre points demandaient une décision.

1. La réponse du vendeur arrive après l'offre ; faut-il un second outil MCP pour l'enregistrer ?
2. Une offre acceptée change-t-elle le statut de l'annonce ?
3. `set_assumptions` reçoit-il les hypothèses complètes ou seulement les champs modifiés, et
   comment éviter d'écraser une version enregistrée entre-temps ?
4. Le modèle `Offer` ne porte ni le canal de transmission demandé par le brief du lot ni la date
   de la réponse ; l'énumération de la réponse s'appelle `counter_offer` en base.

## Décision

1. **Un seul outil `record_offer`** : sans `offerId`, il crée une offre (`amount` obligatoire) ;
   avec `offerId`, il enregistre la réponse du vendeur (`response`, `counterAmount`, `notes`,
   garde-fou `expectedResponse`) et refuse de modifier le montant (une nouvelle offre est une
   nouvelle ligne). Le connecteur reste à dix-sept outils, sans suppression. En REST :
   `POST` et `PATCH /listings/:id/offers`.
2. **Statut proposé, jamais forcé.** Chaque écriture d'offre renvoie `suggestedStatus` (« offre
   faite » pour une offre en attente ou une contre-proposition, « offre acceptée », « offre
   refusée » ; rien pour une annonce écartée ou retirée) et le statut courant. Le web affiche un
   bouton « Passer à … » ; le MCP demande au membre puis appelle `set_listing_status`. Motif :
   accepter une offre n'est pas signer, et le statut est partagé avec l'autre membre.
3. **`set_assumptions` partiel** : `values` ne contient que les champs modifiés, fusionnés avec
   la version en vigueur puis revalidés par `AssumptionsSchema`. `expectedVersion` (identifiant
   rendu par `get_assumptions`, et par `GET /assumptions` pour le web) est le garde-fou
   optimiste : 409 si une autre version a été enregistrée depuis. La réponse porte l'**impact**
   (annonces actives dont le verdict change, répartition avant et après), calculé par une
   fonction pure (`assumptionsImpact`) partagée avec `PUT /assumptions` et
   `POST /assumptions/preview` (aperçu sans enregistrement).
4. **Migration `20261103120000_lot3_offers`** : `channel` (`OfferChannel` : e-mail, téléphone,
   agence, en personne, courrier, autre), `responded_at`, `created_by_id`, `created_at`,
   `updated_at` sur `offers`. L'énumération `counter_offer` est conservée (le brief écrit
   `counter`) : renommer une valeur d'énumération Postgres pour un libellé ne vaut pas une
   migration de données. Le SQL vient de `prisma migrate diff`, relu : les suppressions d'index
   GiST que Prisma propose (colonnes `Unsupported` qu'il ignore) sont écartées.

## Conséquences

- `EvaluatedListing` porte `offers` : la fiche, `get_listing` et `list_listings` les rendent sans
  appel supplémentaire ; le brief de négociation les lit.
- Le rang par décote (`GET /listings/:id/target-price`) compare l'annonce aux annonces actives
  de l'espace sous les hypothèses en vigueur ; avec un scénario d'hypothèses, il est omis.
- L'étude du besoin § 4 (`Offer`) est précisée, pas contredite ; le modèle de calcul décrit la
  négociation (§ 5) et la grille de sensibilité à deux entrées (§ 6).
