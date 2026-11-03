import { HttpException } from '@nestjs/common'
import { ZodError } from 'zod'
import { MCP_SCOPE_WRITE } from '@apart/contracts'
import type { McpScope } from '@apart/contracts'
import { hasScope } from './mcp-scopes'

/** Ce qu'un outil renvoie : du texte lisible, du JSON structuré, ou un refus. */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
  [key: string]: unknown
}

/** La balise qui encadre les données pour que le modèle les lise comme des données. */
export const DATA_TAG = 'apart_listing_data'

/**
 * Une réponse de données : une ligne lisible, puis le JSON encadré dans la
 * balise ; le même JSON en `structuredContent` pour les clients qui le lisent.
 * Les `NaN` (surface ou coût nul) deviennent `null` au passage en JSON.
 */
export function dataResult(
  summary: string,
  payload: Record<string, unknown>
): ToolResult {
  const json = JSON.stringify(payload, (_key, value: unknown) =>
    typeof value === 'number' && Number.isNaN(value) ? null : value
  )
  return {
    content: [
      {
        type: 'text',
        text: `${summary}\n<${DATA_TAG}>\n${json}\n</${DATA_TAG}>`,
      },
    ],
    structuredContent: JSON.parse(json) as Record<string, unknown>,
  }
}

/**
 * Un refus que l'agent peut lire et dont il peut tirer parti. Rendu, jamais
 * lancé : une exception sortie d'un outil devient une erreur de transport et
 * l'agent n'apprend rien de la cause.
 */
export function refusal(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

/** Le refus d'écriture d'un jeton sans la portée `listings:write`, ou null s'il peut écrire. */
export function writeRefusal(scopes: McpScope[]): ToolResult | null {
  if (hasScope(scopes, MCP_SCOPE_WRITE)) return null
  return refusal(
    `Refusé : le jeton ne porte pas la portée « ${MCP_SCOPE_WRITE} » ; reconnectez le connecteur en accordant l'écriture.`
  )
}

/**
 * Exécute le corps d'un outil en traduisant les refus des services (404,
 * 400, 409...) et les erreurs de validation en réponses. Le reste est une
 * vraie panne et continue de remonter.
 */
export async function answer(
  body: () => Promise<ToolResult>
): Promise<ToolResult> {
  try {
    return await body()
  } catch (error) {
    if (error instanceof HttpException && error.getStatus() < 500) {
      return refusal(`Refusé : ${httpMessage(error)}`)
    }
    if (error instanceof ZodError) {
      const issues = error.issues
        .map(
          issue => `${issue.path.join('.') || '(racine)'} : ${issue.message}`
        )
        .join(' ; ')
      return refusal(`Entrée invalide : ${issues}`)
    }
    throw error
  }
}

function httpMessage(error: HttpException): string {
  const response = error.getResponse()
  if (typeof response === 'string') return response
  const message = (response as { message?: unknown }).message
  if (Array.isArray(message)) return message.join(', ')
  if (typeof message === 'string') return message
  return error.message
}
