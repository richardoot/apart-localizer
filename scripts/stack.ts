#!/usr/bin/env tsx
/**
 * La pile locale en une commande (lot 7, ADR 0016) :
 *
 *   pnpm stack:up [--dataset none|demo|artifact] [--opendata] [--dev]
 *   pnpm stack:down | pnpm stack:status | pnpm stack:reset --yes
 *
 * Supabase CLI (base, Auth avec e-mail et serveur OAuth 2.1, Storage,
 * Studio, Mailpit) et la base de test ; l'API et le web tournent par
 * `pnpm dev`, jamais en conteneur. Voir docs/developpement-local.md.
 */
import path from 'node:path'
import { cliArgs } from './lib/cli.js'
import { pgDatabase } from './lib/stack/database.js'
import { socketAlive } from './lib/stack/docker-host.js'
import {
  STACK_HELP,
  StackUsageError,
  parseStackArgs,
} from './lib/stack/options.js'
import { processRunner } from './lib/stack/runner.js'
import { Stack, StackError } from './lib/stack/stack.js'

async function probe(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
    return response.status
  } catch {
    return null
  }
}

async function main(): Promise<number> {
  const options = parseStackArgs(cliArgs())
  if (options.help) {
    console.log(STACK_HELP)
    return 0
  }
  const stack = new Stack({
    root: path.resolve(import.meta.dirname, '..'),
    runner: processRunner,
    db: pgDatabase,
    env: process.env,
    platform: process.platform,
    nodeVersion: process.version,
    log: line => console.log(line),
    now: () => Date.now(),
    probe,
    socketAlive,
  })
  switch (options.command) {
    case 'up':
      await stack.up(options)
      break
    case 'down':
      await stack.down()
      break
    case 'status':
      await stack.status()
      break
    case 'reset':
      await stack.reset(options)
      break
  }
  return 0
}

main().then(
  code => process.exit(code),
  (error: unknown) => {
    if (error instanceof StackUsageError || error instanceof StackError) {
      console.error(`\n✗ ${error.message}`)
    } else {
      console.error(error)
    }
    process.exit(1)
  }
)
