-- Lot 18 : une annonce, plusieurs portails (ADR 0028).
--  - `listing_links` : un lien par portail où l'annonce est publiée (portail,
--    URL et URL normalisée, unique par espace, identifiant sur le portail,
--    prix affiché et sa date, première vue, dernière vue en ligne, dernière
--    vérification, hors ligne depuis, origine, agence et référence lues,
--    extrait-preuve masqué, auteur) ;
--  - `listings.seller_type` (agence, mandataire, particulier, inconnu par
--    défaut), `seller_name` (agence ou réseau), `seller_reference` et sa clé
--    de comparaison `seller_reference_key` ;
--  - `listing_checks.link_id` (le lien vérifié) ;
--  - `listing_drafts.attached_link_id`, `attached_at`, `detached_at` (lien
--    rattaché d'office : même agence, même référence ; « Ce n'est pas la
--    même ») ;
--  - valeurs d'énumération `link_added` (vérification) et `attached` (tri
--    d'une exploration), non utilisées dans cette migration (ALTER TYPE …
--    ADD VALUE en transaction).
-- Migration additive : colonnes facultatives ou à valeur par défaut, une
-- table, trois énumérations nouvelles ; aucune colonne existante modifiée.
-- SQL produit par `prisma migrate diff --from-schema … --to-schema …
-- --script` (schéma à schéma, sans base) puis relu. Ajouté à la main, à la
-- fin : le rattrapage (un lien d'origine par annonce qui a une URL, le lien
-- des vérifications existantes, le nom d'agence du contact du lot 17).

-- CreateEnum
CREATE TYPE "app"."ListingPortal" AS ENUM ('leboncoin', 'seloger', 'bienici', 'pap', 'logicimmo', 'agence', 'autre');

-- CreateEnum
CREATE TYPE "app"."ListingLinkOrigin" AS ENUM ('original', 'manual', 'claude', 'exploration', 'share', 'email');

-- CreateEnum
CREATE TYPE "app"."SellerType" AS ENUM ('agency', 'mandatary', 'private', 'unknown');

-- AlterEnum
ALTER TYPE "app"."ListingCheckOutcome" ADD VALUE 'link_added';

-- AlterEnum
ALTER TYPE "app"."ExplorationOutcome" ADD VALUE 'attached';

-- AlterTable
ALTER TABLE "app"."listings" ADD COLUMN     "seller_name" TEXT,
ADD COLUMN     "seller_reference" TEXT,
ADD COLUMN     "seller_reference_key" TEXT,
ADD COLUMN     "seller_type" "app"."SellerType" NOT NULL DEFAULT 'unknown';

-- AlterTable
ALTER TABLE "app"."listing_checks" ADD COLUMN     "link_id" TEXT;

-- AlterTable
ALTER TABLE "app"."listing_drafts" ADD COLUMN     "attached_at" TIMESTAMPTZ(6),
ADD COLUMN     "attached_link_id" TEXT,
ADD COLUMN     "detached_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "app"."listing_links" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "portal" "app"."ListingPortal" NOT NULL,
    "url" TEXT NOT NULL,
    "normalized_url" TEXT NOT NULL,
    "external_id" TEXT,
    "price" DECIMAL(12,2),
    "price_at" TIMESTAMPTZ(6),
    "first_seen_at" TIMESTAMPTZ(6),
    "last_seen_online_at" TIMESTAMPTZ(6),
    "last_checked_at" TIMESTAMPTZ(6),
    "offline_since" TIMESTAMPTZ(6),
    "origin" "app"."ListingLinkOrigin" NOT NULL,
    "read_seller_name" TEXT,
    "read_reference" TEXT,
    "evidence" TEXT,
    "added_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listing_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_links_listing_id_created_at_idx" ON "app"."listing_links"("listing_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "listing_links_workspace_id_normalized_url_key" ON "app"."listing_links"("workspace_id", "normalized_url");

-- CreateIndex
CREATE INDEX "listings_workspace_id_seller_reference_key_idx" ON "app"."listings"("workspace_id", "seller_reference_key");

-- AddForeignKey
ALTER TABLE "app"."listing_checks" ADD CONSTRAINT "listing_checks_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "app"."listing_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_drafts" ADD CONSTRAINT "listing_drafts_attached_link_id_fkey" FOREIGN KEY ("attached_link_id") REFERENCES "app"."listing_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_links" ADD CONSTRAINT "listing_links_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_links" ADD CONSTRAINT "listing_links_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "app"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."listing_links" ADD CONSTRAINT "listing_links_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "app"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rattrapage (écrit à la main)
-- ---------------------------------------------------------------------------

-- 1. Un lien d'origine pour chaque annonce qui a une URL : rien ne se perd.
--    L'URL normalisée suit `normalizeListingUrl` (domain, listing-urls.ts) :
--    https, hôte en minuscules sans `www.` ni port, chemin sans barre
--    finale ; sur un portail connu, sans requête (et sur Leboncoin la forme
--    `/ad/<catégorie>/<numéro>`) ; ailleurs, requête sans les paramètres de
--    suivi, triée par clé (approximation : une requête aux caractères encodés
--    autrement peut donner une autre clé). Un lien qui n'est pas http(s) est
--    gardé tel quel. Le portail vient de l'hôte, à défaut de la source. Le
--    prix affiché du lien est le prix de la fiche (la fiche suivait son lien),
--    daté du dernier changement de prix ; hors ligne si la dernière
--    vérification concluante l'a dit. Deux annonces de l'espace au même lien
--    (doublon d'avant le lot 18) : la plus ancienne garde la clé, l'autre
--    reçoit une clé suffixée `#doublon-<id>` (son lien reste affiché tel
--    quel, la contrainte d'unicité tient).
WITH "source_links" AS (
  SELECT
    l."id" AS "listing_id",
    l."workspace_id",
    btrim(l."url") AS "url",
    l."source"::text AS "source",
    l."source_label",
    l."external_id",
    l."price",
    l."created_at",
    l."created_by_id",
    l."last_seen_online_at",
    l."last_checked_at",
    regexp_match(btrim(l."url"), '^(https?)://([^/?#]*)([^?#]*)(\?[^#]*)?', 'i') AS "m"
  FROM "app"."listings" l
  WHERE l."url" IS NOT NULL AND btrim(l."url") <> ''
),
"hosts" AS (
  SELECT
    s.*,
    CASE
      WHEN s."m" IS NULL THEN NULL
      ELSE regexp_replace(
        regexp_replace(lower(regexp_replace(s."m"[2], '^.*@', '')), ':[0-9]+$', ''),
        '^www\.', ''
      )
    END AS "host",
    CASE
      WHEN s."m" IS NULL THEN NULL
      ELSE coalesce(nullif(regexp_replace(coalesce(s."m"[3], ''), '/+$', ''), ''), '/')
    END AS "path",
    s."m"[4] AS "query"
  FROM "source_links" s
),
"portals" AS (
  SELECT
    h.*,
    CASE
      WHEN h."host" ~ '(^|\.)leboncoin\.fr$' THEN 'leboncoin'
      WHEN h."host" ~ '(^|\.)seloger\.com$' THEN 'seloger'
      WHEN h."host" ~ '(^|\.)(bienici|bien-ici)\.com$' THEN 'bienici'
      WHEN h."host" ~ '(^|\.)pap\.fr$' THEN 'pap'
      WHEN h."host" ~ '(^|\.)logic-immo\.com$' THEN 'logicimmo'
      ELSE NULL
    END AS "host_portal"
  FROM "hosts" h
),
"normalized" AS (
  SELECT
    p.*,
    CASE
      WHEN p."m" IS NULL THEN p."url"
      WHEN p."host_portal" = 'leboncoin' THEN
        'https://' || p."host" ||
        regexp_replace(p."path", '^/(ad/)?([a-z_]+)/([0-9]{6,})(\.htm)?$', '/ad/\2/\3')
      WHEN p."host_portal" IS NOT NULL THEN 'https://' || p."host" || p."path"
      ELSE 'https://' || p."host" || p."path" || coalesce(
        nullif(
          '?' || array_to_string(
            ARRAY(
              SELECT
                CASE WHEN position('=' IN q."kv") > 0 THEN q."kv" ELSE q."kv" || '=' END
              FROM unnest(string_to_array(substr(coalesce(p."query", ''), 2), '&'))
                WITH ORDINALITY AS q("kv", "ord")
              WHERE q."kv" <> ''
                AND lower(split_part(q."kv", '=', 1)) NOT IN (
                  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term',
                  'utm_content', 'fbclid', 'gclid', 'ref', 'referrer', 'from',
                  'origin', 'source', 'page', 'sort', 'order', 'tri', 'xtor',
                  'msclkid', 'gclsrc', 'dclid', 'yclid', 'ttclid', 'igshid',
                  'mc_cid', 'mc_eid', '_gl', 'srsltid', 'cmp', 'campaign'
                )
                AND lower(split_part(q."kv", '=', 1)) !~ '^(utm_|at_|mtm_|pk_)'
              ORDER BY lower(split_part(q."kv", '=', 1)), q."ord"
            ),
            '&'
          ),
          '?'
        ),
        ''
      )
    END AS "key",
    coalesce(
      p."host_portal",
      CASE
        WHEN p."source" = 'autre' AND lower(btrim(coalesce(p."source_label", ''))) = 'logic-immo' THEN 'logicimmo'
        WHEN p."source" IN ('seloger', 'leboncoin', 'pap', 'bienici', 'agence') THEN p."source"
        ELSE 'autre'
      END
    ) AS "portal"
  FROM "portals" p
),
"ranked" AS (
  SELECT
    n.*,
    row_number() OVER (
      PARTITION BY n."workspace_id", n."key"
      ORDER BY n."created_at", n."listing_id"
    ) AS "rank"
  FROM "normalized" n
)
INSERT INTO "app"."listing_links" (
  "id", "workspace_id", "listing_id", "portal", "url", "normalized_url",
  "external_id", "price", "price_at", "first_seen_at", "last_seen_online_at",
  "last_checked_at", "offline_since", "origin", "added_by_id", "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  r."workspace_id",
  r."listing_id",
  r."portal"::"app"."ListingPortal",
  r."url",
  CASE WHEN r."rank" = 1 THEN r."key" ELSE r."key" || '#doublon-' || r."listing_id" END,
  r."external_id",
  r."price",
  coalesce(
    (SELECT max(pe."occurred_at") FROM "app"."price_events" pe WHERE pe."listing_id" = r."listing_id"),
    r."created_at"
  ),
  r."created_at",
  r."last_seen_online_at",
  r."last_checked_at",
  (
    SELECT CASE WHEN c."outcome" = 'offline' THEN c."checked_at" END
    FROM "app"."listing_checks" c
    WHERE c."listing_id" = r."listing_id" AND c."outcome" <> 'inaccessible'
    ORDER BY c."checked_at" DESC
    LIMIT 1
  ),
  'original'::"app"."ListingLinkOrigin",
  r."created_by_id",
  r."created_at",
  CURRENT_TIMESTAMP
FROM "ranked" r;

-- 2. Les vérifications existantes (lot 15) portaient sur le lien de
--    l'annonce : elles sont rattachées à son lien d'origine.
UPDATE "app"."listing_checks" c
SET "link_id" = ll."id"
FROM "app"."listing_links" ll
WHERE ll."listing_id" = c."listing_id" AND c."link_id" IS NULL;

-- 3. Un seul nom d'agence : le contact du lot 17 lit désormais celui de
--    l'annonce ; le nom saisi dans le contact y est reporté (provenance
--    « user »), « particulier » donne le vendeur Particulier sans nom. Le
--    vendeur reste inconnu sinon : jamais deviné.
UPDATE "app"."listings" l
SET
  "seller_type" = CASE
    WHEN lower(btrim(c."agency_name")) LIKE 'particulier%' THEN 'private'::"app"."SellerType"
    ELSE l."seller_type"
  END,
  "seller_name" = CASE
    WHEN lower(btrim(c."agency_name")) LIKE 'particulier%' THEN NULL
    ELSE btrim(c."agency_name")
  END,
  "field_sources" = l."field_sources" || jsonb_build_object(
    CASE WHEN lower(btrim(c."agency_name")) LIKE 'particulier%' THEN 'sellerType' ELSE 'sellerName' END,
    jsonb_build_object(
      'source', 'user',
      'evidence', 'Repris du contact de l''annonceur (lot 18)',
      'recordedAt', to_char(c."updated_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  )
FROM "app"."listing_contacts" c
WHERE c."listing_id" = l."id"
  AND c."agency_name" IS NOT NULL
  AND btrim(c."agency_name") <> ''
  AND l."seller_name" IS NULL;
