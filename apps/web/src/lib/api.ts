import type { WorkspaceMe } from '@apart/contracts'
import { supabase } from './supabase'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly requestId?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const baseUrl = (
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
).replace(/\/$/, '')

/** The bearer token of the current session, refreshed by Supabase as needed. */
async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * One fetch for every call: bearer token, JSON in and out, and the server's
 * own message when it refuses (the exception filter always sends one).
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const token = await accessToken()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.json !== undefined) headers.set('Content-Type', 'application/json')

  const { json, ...rest } = init
  const request: RequestInit = { ...rest, headers }
  if (json !== undefined) request.body = JSON.stringify(json)

  const response = await fetch(`${baseUrl}${path}`, request)

  if (!response.ok) {
    let message = `Erreur ${response.status}`
    let requestId: string | undefined
    try {
      const body = (await response.json()) as {
        message?: unknown
        requestId?: string
      }
      if (Array.isArray(body.message)) message = body.message.join(', ')
      else if (typeof body.message === 'string') message = body.message
      requestId = body.requestId
    } catch {
      // Pas de corps JSON : le statut suffit.
    }
    throw new ApiError(response.status, message, requestId)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  workspace: () => apiFetch<WorkspaceMe>('/workspace'),
}
