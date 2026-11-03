/**
 * Les versions attendues des outils, lues dans le dépôt (`engines`,
 * `packageManager`) plutôt que répétées ici. Fonctions pures : la commande
 * qui lit la version est lancée par l'orchestrateur.
 */

export interface Check {
  ok: boolean
  /** Un avertissement n'arrête pas le démarrage. */
  warning?: boolean
  message: string
}

/** Version minimale de la CLI Supabase : la configuration est celle de la 3.0 (serveur OAuth 2.1 compris). */
export const SUPABASE_CLI_MIN = '3.0.0'

export function parseVersion(text: string): [number, number, number] | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function compareVersions(
  a: [number, number, number],
  b: [number, number, number]
): number {
  for (let i = 0; i < 3; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** Node : la majeure de `engines.node` (« 24.x »). */
export function checkNode(version: string, engines: string): Check {
  const actual = parseVersion(version)
  const major = /^(\d+)/.exec(engines.trim())?.[1]
  if (!actual || !major) {
    return {
      ok: false,
      message: `Version de Node illisible (${version}) ; attendu ${engines}.`,
    }
  }
  if (String(actual[0]) !== major) {
    return {
      ok: false,
      message: `Node ${version} : attendu ${engines} (volta ou nvm ; le dépôt fixe la version dans package.json).`,
    }
  }
  return { ok: true, message: `Node ${version}` }
}

/** pnpm : exactement `packageManager` ; une majeure différente arrête, une mineure avertit. */
export function checkPnpm(version: string, packageManager: string): Check {
  const expected = parseVersion(packageManager)
  const actual = parseVersion(version)
  if (!expected || !actual) {
    return {
      ok: false,
      message: `Version de pnpm illisible (${version.trim()}) ; attendu ${packageManager}.`,
    }
  }
  const wanted = expected.join('.')
  if (actual[0] !== expected[0]) {
    return {
      ok: false,
      message: `pnpm ${actual.join('.')} : attendu ${wanted} (\`corepack enable\` ou volta).`,
    }
  }
  if (compareVersions(actual, expected) !== 0) {
    return {
      ok: true,
      warning: true,
      message: `pnpm ${actual.join('.')} au lieu de ${wanted} : ça devrait aller, mais \`corepack enable\` aligne la version.`,
    }
  }
  return { ok: true, message: `pnpm ${wanted}` }
}

export function checkSupabaseCli(version: string | null): Check {
  if (version === null) {
    return {
      ok: false,
      message:
        'Supabase CLI introuvable : installez-la (https://supabase.com/docs/guides/local-development/cli/getting-started), par exemple `npm i -g supabase` ou le binaire des releases GitHub.',
    }
  }
  const actual = parseVersion(version)
  const min = parseVersion(SUPABASE_CLI_MIN) as [number, number, number]
  if (!actual || compareVersions(actual, min) < 0) {
    return {
      ok: false,
      message: `Supabase CLI ${version.trim()} : ${SUPABASE_CLI_MIN} au moins (configuration de la 3.0, serveur OAuth 2.1).`,
    }
  }
  return { ok: true, message: `Supabase CLI ${actual.join('.')}` }
}
