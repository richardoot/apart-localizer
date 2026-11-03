import { listingFiltersToQuery } from '@apart/contracts'
import type {
  Assumptions,
  AssumptionsImpact,
  AssumptionsUpdate,
  AssumptionsUpdateResult,
  AssumptionsVersion,
  CompareResult,
  DuplicateCandidate,
  DuplicateProbe,
  EvaluateRequest,
  EvaluateResult,
  EvaluatedListing,
  ExtractionRequestInput,
  ExtractionResult,
  ListingCreateRaw,
  ListingCreateResult,
  ListingFiltersInput,
  ListingList,
  ListingPatch,
  ListingStatusChange,
  NegotiationBrief,
  Offer,
  OfferInputRaw,
  OfferUpdate,
  OfferWriteResult,
  Opinion,
  OpinionInput,
  PriceEventInput,
  SensitivityGrid,
  SensitivityRequestInput,
  TargetPriceReport,
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
      apiFetch<AssumptionsUpdateResult>('/assumptions', {
        method: 'PUT',
        json: update,
      }),
    /** Impact d'hypothèses candidates sur les annonces actives ; rien n'est enregistré. */
    preview: (values: Assumptions) =>
      apiFetch<AssumptionsImpact>('/assumptions/preview', {
        method: 'POST',
        json: { values },
      }),
  },

  listings: {
    list: (filters: ListingFiltersInput) =>
      apiFetch<ListingList>(
        `/listings${queryString(listingFiltersToQuery(filters))}`
      ),
    get: (id: string) => apiFetch<EvaluatedListing>(`/listings/${id}`),
    create: (input: ListingCreateRaw) =>
      apiFetch<ListingCreateResult>('/listings', {
        method: 'POST',
        json: input,
      }),
    /** Texte collé et/ou captures vers une fiche pré-remplie ; rien n'est enregistré. */
    extract: (request: ExtractionRequestInput) =>
      apiFetch<ExtractionResult>('/listings/extract', {
        method: 'POST',
        json: request,
      }),
    findDuplicates: (probe: DuplicateProbe) =>
      apiFetch<DuplicateCandidate[]>('/listings/duplicates', {
        method: 'POST',
        json: probe,
      }),
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
    /** « À partir de quel prix ? » : prix cibles, rang, brief de négociation, notaire. */
    targetPrice: (id: string) =>
      apiFetch<TargetPriceReport>(`/listings/${id}/target-price`),
    sensitivity: (id: string, request: SensitivityRequestInput) =>
      apiFetch<SensitivityGrid>(`/listings/${id}/sensitivity`, {
        method: 'POST',
        json: request,
      }),
    negotiation: (id: string) =>
      apiFetch<NegotiationBrief>(`/listings/${id}/negotiation`),
    compare: (listingIds: string[]) =>
      apiFetch<CompareResult>('/listings/compare', {
        method: 'POST',
        json: { listingIds },
      }),
  },

  offers: {
    list: (listingId: string) =>
      apiFetch<Offer[]>(`/listings/${listingId}/offers`),
    create: (listingId: string, input: OfferInputRaw) =>
      apiFetch<OfferWriteResult>(`/listings/${listingId}/offers`, {
        method: 'POST',
        json: input,
      }),
    update: (listingId: string, offerId: string, update: OfferUpdate) =>
      apiFetch<OfferWriteResult>(`/listings/${listingId}/offers/${offerId}`, {
        method: 'PATCH',
        json: update,
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
