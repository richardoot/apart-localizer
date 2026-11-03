import { createHash } from 'node:crypto'

/**
 * Identifiants stables du jeu de démonstration (UUID version 5 dérivés d'un
 * nom) : relancer le seed recrée les mêmes lignes, sous les mêmes
 * identifiants, et un lien vers une annonce de démo reste valable.
 */
const NAMESPACE = 'apart-localizer/demo/v1'

export function demoId(name: string): string {
  const hash = createHash('sha1').update(`${NAMESPACE}:${name}`).digest()
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** L'espace « Démo » : identifiant fixe, le seul que le seed supprime et recrée. */
export const DEMO_WORKSPACE_ID = demoId('workspace')
