import { listingFiltersToQuery } from '@apart/contracts'
import type {
  AssumptionsUpdate,
  AssumptionsVersion,
  EvaluateRequest,
  EvaluateResult,
  EvaluatedListing,
  ListingFiltersInput,
  ListingInputRaw,
  ListingList,
  ListingPatch,
  ListingStatusChange,
  Opinion,
  OpinionInput,
  PriceEventInput,
  Task,
  TaskInput,
  TaskUpdate,
  WorkspaceMe,
} from '@apart/contracts'
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

/** `?a=1&b=2` from a record, empty string when there is nothing to say. */
export function queryString(params: Record<string, string>): string {
  const search = new URLSearchParams(params).toString()
  return search ? `?${search}` : ''
}

/**
 * The API, one function per endpoint. The filters go through the very
 * schema the API reads them with (`listingFiltersToQuery`).
 */
export const api = {
  workspace: () => apiFetch<WorkspaceMe>('/workspace'),

  assumptions: {
    current: () => apiFetch<AssumptionsVersion>('/assumptions'),
    history: () => apiFetch<AssumptionsVersion[]>('/assumptions/history'),
    update: (update: AssumptionsUpdate) =>
      apiFetch<AssumptionsVersion>('/assumptions', {
        method: 'PUT',
        json: update,
      }),
  },

  listings: {
    list: (filters: ListingFiltersInput) =>
      apiFetch<ListingList>(
        `/listings${queryString(listingFiltersToQuery(filters))}`
      ),
    get: (id: string) => apiFetch<EvaluatedListing>(`/listings/${id}`),
    create: (input: ListingInputRaw) =>
      apiFetch<EvaluatedListing>('/listings', { method: 'POST', json: input }),
    update: (id: string, patch: ListingPatch) =>
      apiFetch<EvaluatedListing>(`/listings/${id}`, {
        method: 'PATCH',
        json: patch,
      }),
    setStatus: (id: string, change: ListingStatusChange) =>
      apiFetch<EvaluatedListing>(`/listings/${id}/status`, {
        method: 'POST',
        json: change,
      }),
    markSeen: (id: string) =>
      apiFetch<EvaluatedListing>(`/listings/${id}/seen`, { method: 'POST' }),
    recordPriceChange: (id: string, input: PriceEventInput) =>
      apiFetch<EvaluatedListing>(`/listings/${id}/price-events`, {
        method: 'POST',
        json: input,
      }),
    evaluate: (request: EvaluateRequest) =>
      apiFetch<EvaluateResult>('/listings/evaluate', {
        method: 'POST',
        json: request,
      }),
  },

  opinions: {
    upsertMine: (listingId: string, input: OpinionInput) =>
      apiFetch<Opinion>(`/listings/${listingId}/opinions/me`, {
        method: 'PUT',
        json: input,
      }),
  },

  tasks: {
    create: (
      listingId: string,
      input: Partial<TaskInput> & { label: string }
    ) =>
      apiFetch<Task>(`/listings/${listingId}/tasks`, {
        method: 'POST',
        json: input,
      }),
    update: (listingId: string, taskId: string, update: TaskUpdate) =>
      apiFetch<Task>(`/listings/${listingId}/tasks/${taskId}`, {
        method: 'PATCH',
        json: update,
      }),
    remove: (listingId: string, taskId: string) =>
      apiFetch<void>(`/listings/${listingId}/tasks/${taskId}`, {
        method: 'DELETE',
      }),
  },
}
