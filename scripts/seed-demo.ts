#!/usr/bin/env tsx
/**
 * Le jeu de démonstration FICTIF (lot 7, ADR 0016) : un espace « Démo » à
 * deux membres (demo@apart.local, demo2@apart.local), recréé à l'identique à
 * chaque lancement, sans jamais toucher aux autres espaces.
 *
 *   pnpm seed:demo [--database-url URL] [--dry-run]
 *
 * Les comptes sont créés (ou remis à leur mot de passe documenté) dans le
 * GoTrue LOCAL par son API d'administration (SUPABASE_URL et
 * SUPABASE_SERVICE_ROLE_KEY de apps/api/.env). Base et GoTrue locaux
 * seulement : le script refuse tout autre hôte.
 */
import 'reflect-metadata'
import { parseArgs } from 'node:util'
import { cliArgs } from './lib/cli.js'
import { databaseUrlFrom, elapsed, openDatabase, redact } from './lib/db.js'
import { assertLocalUrl } from './lib/local-guard.js'
import { gotrueAdmin } from './lib/gotrue-admin.js'
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './lib/demo/accounts.js'
import {
  buildDemoDataset,
  currentAssumptions,
  demoMetrics,
} from './lib/demo/dataset.js'
import { DemoSeedConflict, writeDemoDataset } from './lib/demo/write.js'
import type { AuthUserIds } from './lib/demo/write.js'

const { values: args } = parseArgs({
  args: cliArgs(),
  options: {
    'database-url': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
})

async function main(): Promise<void> {
  if (args.help) {
    console.log(
      'Recrée l’espace « Démo » (fictif) et ses deux comptes locaux.\n\n' +
        '  --dry-run            affiche le jeu sans rien écrire\n' +
        '  --database-url URL   base locale (défaut DATABASE_URL de apps/api/.env)'
    )
    return
  }
  const started = Date.now()
  const now = new Date()
  const dataset = buildDemoDataset(now)
  if (args['dry-run']) {
    const assumptions = currentAssumptions(dataset)
    for (const l of dataset.listings) {
      const m = demoMetrics(l, assumptions, now)
      console.log(
        `- ${l.input.title} : ${l.input.price} €, ${l.input.status}, verdict ${m.verdict}`
      )
    }
    return
  }

  const url = databaseUrlFrom(args['database-url'])
  assertLocalUrl(url, 'le seed de démonstration')
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY manquent (apps/api/.env) : lancez `pnpm stack:up`.'
    )
  }
  const admin = gotrueAdmin({ supabaseUrl, serviceRoleKey })
  const ids = {} as AuthUserIds
  for (const account of DEMO_ACCOUNTS) {
    const user = await admin.ensureUser({
      email: account.email,
      password: DEMO_PASSWORD,
      displayName: account.displayName,
    })
    ids[account.handle] = user.id
    console.log(
      `  compte ${account.email} ${user.created ? 'créé' : 'remis à l’identique'} (${user.id})`
    )
  }

  const db = openDatabase(url)
  try {
    const report = await writeDemoDataset(db.prisma, dataset, ids, now)
    console.log(
      `  espace « Démo » recréé sur ${redact(url)} : ${report.listings} annonces, ${report.members} membres, ` +
        `${report.tasks} tâches, ${report.offers} offres, ${report.visits} visites, ${report.opinions} avis, ` +
        `${report.criteria} critères (${report.criteriaMatches} entrées), ${report.activity} lignes de journal, ` +
        `${report.notifications} notifications (${elapsed(started)}).`
    )
    for (const other of report.otherWorkspaces) {
      console.log(
        `  intact : espace « ${other.name} » (${other.listings} annonces, ${other.members} membres, ${other.activity} lignes de journal)`
      )
    }
    console.log(
      `  connexion : ${DEMO_ACCOUNTS.map(a => a.email).join(' ou ')}, mot de passe ${DEMO_PASSWORD}`
    )
  } finally {
    await db.close()
  }
}

main().catch((error: unknown) => {
  if (error instanceof DemoSeedConflict) console.error(`✗ ${error.message}`)
  else console.error(error)
  process.exit(1)
})
