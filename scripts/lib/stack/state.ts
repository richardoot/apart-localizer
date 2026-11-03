import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Dataset } from './options.js'

/**
 * Ce que le dernier `stack:up` a fait, gardé dans `supabase/.temp/` (ignoré
 * par git) : l'empreinte de la configuration avec laquelle la pile a
 * démarré (une configuration modifiée depuis demande un redémarrage, les
 * données restent), le jeu de données chargé et l'heure.
 */
export interface StackState {
  configHash: string
  dataset: Dataset
  opendata: boolean
  startedAt: string
}

export function configHash(contents: ReadonlyArray<string | null>): string {
  const hash = createHash('sha256')
  for (const content of contents)
    hash.update(content ?? '\0absent\0').update('\n--\n')
  return hash.digest('hex').slice(0, 16)
}

export function stateFile(root: string): string {
  return path.join(root, 'supabase', '.temp', 'apart-stack.json')
}

export function readState(root: string): StackState | null {
  const file = stateFile(root)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as StackState
  } catch {
    return null
  }
}

export function writeState(root: string, state: StackState): void {
  const file = stateFile(root)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`)
}
