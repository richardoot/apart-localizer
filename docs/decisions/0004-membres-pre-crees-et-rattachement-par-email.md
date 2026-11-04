# 0004. Membres pré-créés, rattachement par e-mail, espace automatique

Statut : acceptée, 3 novembre 2026. Prolongée par l'ADR 0018 (invitations, e-mail vérifié,
retrait).

## Contexte

L'import de l'artefact doit conserver les avis de Richard et de Chloé et le drapeau « vue »,
avant que l'un ou l'autre ne se soit connecté avec Google. Dans `bankin-analyzer`, l'utilisateur
est créé à la première requête authentifiée, à partir de l'identité Supabase ; il n'existe pas
avant.

## Décision

- `Member` porte `authUserId` nullable, `email`, `displayName` et un `handle` stable par
  espace (`richard`, `chloe`). L'import crée les deux membres sans `authUserId`.
- À la première requête d'une identité Supabase inconnue, le garde cherche un membre sans
  `authUserId` dont l'e-mail correspond (insensible à la casse) et le rattache. Il faut donc
  donner les e-mails à l'import (`--richard-email`, `--chloe-email` ou variables
  `IMPORT_*_EMAIL`).
- Sans correspondance, l'identité reçoit un espace de travail à elle (« Mon espace »), dont elle
  est propriétaire : l'application reste utilisable par quiconque se connecte sans jamais
  exposer l'espace d'un autre. Rejoindre un espace existant (invitation) relève d'un lot
  ultérieur.

## Conséquences

- Le journal d'activité et les avis importés sont attribués aux bons membres dès le départ.
- Un e-mail saisi avec une faute lors de l'import laisse Richard ou Chloé dans un espace vide :
  la correction se fait en base (`authUserId` du membre importé) ou en relançant l'import avec
  le bon e-mail avant la première connexion.
- L'étude du besoin (§ 4, « Workspace : membres (utilisateur, rôle) ») est précisée, pas
  contredite.
