import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * Lecture et fusion des fichiers `.env` de la pile locale.
 *
 * Règle : fusion, jamais d'écrasement. Seules les clés gérées par
 * `pnpm stack:up` sont réécrites ; les valeurs saisies par l'utilisateur
 * (ANTHROPIC_API_KEY, SENTRY_*, VAPID, Google…) restent telles quelles, comme
 * les commentaires et l'ordre des lignes. Un fichier existant est sauvegardé
 * (`.env.backup`) avant la première écriture.
 */

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/

/**
 * La valeur d'une ligne `CLÉ=valeur`, lue comme dotenv : entre guillemets
 * simples, doubles ou obliques, jusqu'au guillemet fermant (`\n` développé
 * entre guillemets doubles) ; sans guillemets, jusqu'à un commentaire ` #`.
 */
export function parseEnvValue(raw: string): string {
  const value = raw.trim()
  const quote = value[0]
  if ((quote === '"' || quote === "'" || quote === '`') && value.length >= 2) {
    const end = value.indexOf(quote, 1)
    if (end > 0) {
      const inner = value.slice(1, end)
      return quote === '"' ? inner.replace(/\\n/g, '\n') : inner
    }
  }
  const comment = value.search(/\s#/)
  return comment >= 0 ? value.slice(0, comment).trimEnd() : value
}

/** Les variables d'un fichier `.env` ; la dernière occurrence d'une clé l'emporte, comme dotenv. */
export function parseEnv(text: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const match = LINE.exec(line)
    if (match?.[1]) values.set(match[1], parseEnvValue(match[2] ?? ''))
  }
  return values
}

/**
 * Une valeur écrite pour que dotenv la relise à l'identique : telle quelle
 * si elle ne contient ni blanc, ni « # », ni guillemet ; sinon entre les
 * premiers guillemets qu'elle ne contient pas (dotenv ne connaît pas
 * d'échappement des guillemets).
 */
export function formatEnvValue(value: string): string {
  if (value === '') return ''
  if (!/[\s#"'`\\]/.test(value)) return value
  if (!value.includes("'") && !value.includes('\n')) return `'${value}'`
  if (!value.includes('"')) return `"${value.replace(/\n/g, '\\n')}"`
  if (!value.includes('`') && !value.includes('\n')) return `\`${value}\``
  throw new Error(
    'Valeur impossible à écrire dans un .env (guillemets de trois sortes)'
  )
}

export interface EnvMergePlan {
  /** Écrites à chaque fois : la pile locale les détient (URL, clés de la CLI Supabase). */
  managed: Record<string, string>
  /** Écrites seulement si absentes ou vides : générées une fois, puis à l'utilisateur. */
  defaults?: Record<string, string>
}

export interface EnvMergeResult {
  text: string
  /** Clés gérées dont la valeur a changé. */
  updated: string[]
  /** Clés ajoutées (absentes ou vides auparavant). */
  added: string[]
}

export const MANAGED_HEADER =
  '# Géré par `pnpm stack:up` (pile locale) : ajouté automatiquement.'

/**
 * Fusionne le plan dans le texte existant (ou, pour un fichier à créer, dans
 * le modèle `.env.example`) en ne touchant que les lignes des clés du plan.
 */
export function mergeEnv(
  existing: string | null,
  plan: EnvMergePlan,
  template: string | null = null
): EnvMergeResult {
  const base = existing ?? template ?? ''
  const lines = base === '' ? [] : base.replace(/\r\n/g, '\n').split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  const defaults = plan.defaults ?? {}
  const previous =
    existing === null ? new Map<string, string>() : parseEnv(existing)
  const seen = new Set<string>()
  const updated = new Set<string>()
  const added = new Set<string>()

  const record = (key: string, before: string | undefined, after: string) => {
    if (before === after) return
    if (before === undefined || before === '') added.add(key)
    else updated.add(key)
  }

  for (let i = 0; i < lines.length; i++) {
    const match = LINE.exec(lines[i] ?? '')
    const key = match?.[1]
    if (!key) continue
    const current = parseEnvValue(match[2] ?? '')
    if (Object.hasOwn(plan.managed, key)) {
      const next = plan.managed[key] as string
      seen.add(key)
      if (current !== next) lines[i] = `${key}=${formatEnvValue(next)}`
      record(key, previous.get(key), next)
    } else if (Object.hasOwn(defaults, key)) {
      seen.add(key)
      if (current === '') {
        const next = defaults[key] as string
        lines[i] = `${key}=${formatEnvValue(next)}`
        record(key, previous.get(key), next)
      }
    }
  }

  const missing = [
    ...Object.entries(plan.managed),
    ...Object.entries(defaults),
  ].filter(([key]) => !seen.has(key))
  if (missing.length > 0) {
    if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('')
    lines.push(MANAGED_HEADER)
    for (const [key, value] of missing) {
      if (seen.has(key)) continue
      seen.add(key)
      lines.push(`${key}=${formatEnvValue(value)}`)
      record(key, previous.get(key), value)
    }
  }

  return {
    text: `${lines.join('\n')}\n`,
    updated: [...updated],
    added: [...added],
  }
}

export interface EnvWriteResult extends EnvMergeResult {
  action: 'created' | 'updated' | 'unchanged'
  /** La sauvegarde faite avant cette écriture, s'il y en a eu une. */
  backup: string | null
}

/** Le chemin de la sauvegarde d'un fichier `.env` (ignoré par git, motif `.env.*`). */
export function backupPathOf(file: string): string {
  return `${file}.backup`
}

/**
 * Écrit le fichier fusionné s'il change. Un fichier qui existait est copié
 * dans `<fichier>.backup` avant la première écriture du script (la copie
 * n'est jamais remplacée : elle garde l'état d'avant la pile locale).
 */
export function writeEnvFile(
  file: string,
  plan: EnvMergePlan,
  templateFile: string | null = null
): EnvWriteResult {
  const existed = existsSync(file)
  const existing = existed ? readFileSync(file, 'utf8') : null
  const template =
    templateFile && existsSync(templateFile)
      ? readFileSync(templateFile, 'utf8')
      : null
  const result = mergeEnv(existing, plan, template)
  if (existing !== null && result.text === existing) {
    return { ...result, action: 'unchanged', backup: null }
  }
  let backup: string | null = null
  if (existing !== null && !existsSync(backupPathOf(file))) {
    backup = backupPathOf(file)
    copyFileSync(file, backup)
  }
  writeFileSync(file, result.text, { mode: 0o600 })
  return { ...result, action: existed ? 'updated' : 'created', backup }
}

/** Les variables d'un fichier `.env`, ou une table vide s'il n'existe pas. */
export function readEnvFile(file: string): Map<string, string> {
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : new Map()
}
