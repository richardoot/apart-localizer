#!/usr/bin/env tsx
/**
 * Rattache chaque membre pré-créé à l'identité GoTrue LOCALE de même e-mail
 * (ADR 0004), l'équivalent de `scripts/link-local-identities.mjs` de
 * bankin-analyzer. Lancé par `pnpm stack:up` après le jeu de données.
 *
 *   pnpm link:identities [--dry-run] [--database-url URL]
 *
 * Refuse tout hôte non local : réécrire des identités sur une vraie base
 * donnerait les annonces de l'un à l'autre. Les règles sont dans
 * lib/link-identities.ts.
 */
import { parseArgs } from 'node:util'
import pg from 'pg'
import { cliArgs } from './lib/cli.js'
import { databaseUrlFrom, redact } from './lib/db.js'
import { assertLocalUrl } from './lib/local-guard.js'
import { planIdentityLinks } from './lib/link-identities.js'
import type { AuthUserRow, MemberRow } from './lib/link-identities.js'

const { values: args } = parseArgs({
  args: cliArgs(),
  options: {
    'dry-run': { type: 'boolean', default: false },
    'database-url': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
})

async function main(): Promise<void> {
  if (args.help) {
    console.log(
      'Rattache les membres pré-créés à leur compte GoTrue local de même e-mail.\n\n' +
        '  --dry-run            affiche sans écrire\n' +
        '  --database-url URL   base locale (défaut DATABASE_URL de apps/api/.env)'
    )
    return
  }
  const url = databaseUrlFrom(args['database-url'])
  assertLocalUrl(url, 'le raccordement des identités')
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    const presence = await client.query<{ auth: boolean; app: boolean }>(
      `SELECT to_regclass('auth.users') IS NOT NULL AS auth,
              to_regclass('app.members') IS NOT NULL AS app`
    )
    if (!presence.rows[0]?.app) {
      console.log(
        '  schéma app absent : rien à rattacher (migrations à appliquer).'
      )
      return
    }
    if (!presence.rows[0]?.auth) {
      console.log(
        `  pas de schéma auth sur ${redact(url)} (base sans Supabase) : rien à rattacher.`
      )
      return
    }
    const members = await client.query<MemberRow>(
      `SELECT m.id, m.handle, m.email, m.auth_user_id AS "authUserId",
              w.name AS "workspaceName", m.created_at AS "createdAt",
              m.status::text AS status
       FROM app.members m JOIN app.workspaces w ON w.id = m.workspace_id`
    )
    const users = await client.query<AuthUserRow>(
      'SELECT id::text AS id, email FROM auth.users'
    )
    const plan = planIdentityLinks(members.rows, users.rows)

    if (!args['dry-run'] && plan.link.length > 0) {
      await client.query('BEGIN')
      try {
        for (const link of plan.link) {
          await client.query(
            'UPDATE app.members SET auth_user_id = $1, updated_at = now() WHERE id = $2',
            [link.authUserId, link.memberId]
          )
        }
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
    const verb = args['dry-run'] ? 'rattacherait' : 'rattaché'
    for (const link of plan.link) {
      console.log(
        `  ${verb} ${link.label} → ${link.authUserId}${link.replaces ? ` (remplace ${link.replaces}, absent de auth.users)` : ''}`
      )
    }
    if (
      plan.link.length === 0 &&
      plan.orphans.length === 0 &&
      plan.conflicts.length === 0
    ) {
      console.log(
        plan.linked.length > 0
          ? `  ✓ ${plan.linked.length} membre(s) déjà relié(s) à leur compte local`
          : '  aucun membre à rattacher'
      )
    } else if (plan.linked.length > 0) {
      console.log(`  ✓ ${plan.linked.length} membre(s) déjà relié(s)`)
    }
    for (const orphan of plan.orphans) {
      console.log(
        `  ! ${orphan} : pas encore de compte local. Connectez-vous une fois avec cette adresse ` +
          '(Google si configuré, sinon « Créer un compte local » sur la page de connexion).'
      )
    }
    for (const member of plan.withoutEmail) {
      console.log(
        `  ! ${member} : sans e-mail, rattachement impossible (pnpm stack:up --dataset artifact --richard-email … --chloe-email …, ou import:artifact avec ces options).`
      )
    }
    for (const conflict of plan.conflicts) console.log(`  ! ${conflict}`)
    if (plan.skipped.length > 0) {
      console.log(
        `  · ${plan.skipped.length} invitation(s) ou ancien(s) membre(s) ignoré(s) : une invitation se rattache à la connexion (e-mail vérifié), un ancien membre jamais.`
      )
    }
  } finally {
    await client.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `✗ ${error.message}` : error)
  process.exit(1)
})
