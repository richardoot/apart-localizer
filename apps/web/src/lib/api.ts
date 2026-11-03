import { listingFiltersToQuery } from '@apart/contracts'
import type {
  Assumptions,
  AssumptionsImpact,
  AssumptionsUpdate,
  AssumptionsUpdateResult,
  AssumptionsVersion,
  CompareResult,
  ComplianceReport,
  OccupancyReport,
  ProjectionQuery,
  ProjectionReport,
  RentComparableInputRaw,
  RentComparableList,
  RentComparableUpdate,
  RentComparableWriteResult,
  Scenario,
  ScenarioComparison,
  ScenarioEvaluateRequest,
  ScenarioInputRaw,
  ScenarioUpdate,
  DpeVerifyRequest,
  DuplicateCandidate,
  DuplicateProbe,
  LayerFeatureCollection,
  ListingContext,
  MarketContext,
  MarketContextReport,
  MarketContextRequest,
  SearchCriteriaInputRaw,
  SearchCriteriaPreview,
  SearchCriteriaPreviewRequestInput,
  SearchCriteriaSummary,
  SearchCriteriaUpdate,
  TransitMode,
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
    /** Contexte open data : tram, plafond d'encadrement, DPE vérifié, comparables DVF. */
    context: (id: string) =>
      apiFetch<ListingContext>(`/listings/${id}/context`),
    market: (id: string) => apiFetch<MarketContext>(`/listings/${id}/market`),
    /** Relance le géocodage (sans cache) puis les enrichissements. */
    regeocode: (id: string) =>
      apiFetch<EvaluatedListing>(`/listings/${id}/geocode`, { method: 'POST' }),
    searchDpe: (id: string) =>
      apiFetch<ListingContext>(`/listings/${id}/dpe/search`, {
        method: 'POST',
      }),
    verifyDpe: (id: string, request: DpeVerifyRequest) =>
      apiFetch<EvaluatedListing>(`/listings/${id}/dpe/verify`, {
        method: 'POST',
        json: request,
      }),
  },

  /** Critères de recherche enregistrés et partagés (lot 4). */
  searchCriteria: {
    list: (includeArchived = false) =>
      apiFetch<SearchCriteriaSummary[]>(
        `/search-criteria${includeArchived ? '?includeArchived=true' : ''}`
      ),
    get: (id: string) =>
      apiFetch<SearchCriteriaSummary>(`/search-criteria/${id}`),
    create: (input: SearchCriteriaInputRaw) =>
      apiFetch<SearchCriteriaSummary>('/search-criteria', {
        method: 'POST',
        json: input,
      }),
    update: (id: string, patch: SearchCriteriaUpdate) =>
      apiFetch<SearchCriteriaSummary>(`/search-criteria/${id}`, {
        method: 'PATCH',
        json: patch,
      }),
    remove: (id: string) =>
      apiFetch<void>(`/search-criteria/${id}`, { method: 'DELETE' }),
    /** Périmètre résolu (isochrone calculée) et annonces retenues, sans enregistrer. */
    preview: (request: SearchCriteriaPreviewRequestInput) =>
      apiFetch<SearchCriteriaPreview>('/search-criteria/preview', {
        method: 'POST',
        json: request,
      }),
  },

  /** Couches de carte et contexte de marché (lot 4). */
  opendata: {
    transitStops: (mode?: TransitMode) =>
      apiFetch<LayerFeatureCollection>(
        `/opendata/layers/transit-stops${mode ? `?mode=${mode}` : ''}`
      ),
    rentControlZones: () =>
      apiFetch<LayerFeatureCollection>('/opendata/layers/rent-control-zones'),
    dvf: (bbox: readonly [number, number, number, number]) =>
      apiFetch<LayerFeatureCollection>(
        `/opendata/layers/dvf?bbox=${bbox.map(v => v.toFixed(5)).join(',')}`
      ),
    marketContext: (request: MarketContextRequest) =>
      apiFetch<MarketContextReport>('/market-context', {
        method: 'POST',
        json: request,
      }),
  },

  /** Lot 5 : phase 1, projection, scénarios, loyer de marché, conformité. */
  study: {
    occupancy: (id: string) =>
      apiFetch<OccupancyReport>(`/listings/${id}/occupancy`),
    projection: (id: string, query: ProjectionQuery = {}) =>
      apiFetch<ProjectionReport>(
        `/listings/${id}/projection${queryString(
          Object.fromEntries(
            Object.entries(query)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)])
          )
        )}`
      ),
    evaluateScenario: (id: string, request: ScenarioEvaluateRequest) =>
      apiFetch<ScenarioComparison>(`/listings/${id}/scenarios/evaluate`, {
        method: 'POST',
        json: request,
      }),
    compliance: (id: string) =>
      apiFetch<ComplianceReport>(`/listings/${id}/compliance`),
    comparables: (id: string) =>
      apiFetch<RentComparableList>(`/listings/${id}/rent-comparables`),
    addComparable: (id: string, input: RentComparableInputRaw) =>
      apiFetch<RentComparableWriteResult>(`/listings/${id}/rent-comparables`, {
        method: 'POST',
        json: input,
      }),
    updateComparable: (
      id: string,
      comparableId: string,
      patch: RentComparableUpdate
    ) =>
      apiFetch<RentComparableWriteResult>(
        `/listings/${id}/rent-comparables/${comparableId}`,
        { method: 'PATCH', json: patch }
      ),
    removeComparable: (id: string, comparableId: string) =>
      apiFetch<RentComparableList>(
        `/listings/${id}/rent-comparables/${comparableId}`,
        { method: 'DELETE' }
      ),
  },

  scenarios: {
    list: (listingId?: string) =>
      apiFetch<Scenario[]>(
        `/scenarios${listingId ? `?listingId=${listingId}` : ''}`
      ),
    create: (input: ScenarioInputRaw) =>
      apiFetch<Scenario>('/scenarios', { method: 'POST', json: input }),
    update: (id: string, update: ScenarioUpdate) =>
      apiFetch<Scenario>(`/scenarios/${id}`, { method: 'PATCH', json: update }),
    remove: (id: string) =>
      apiFetch<void>(`/scenarios/${id}`, { method: 'DELETE' }),
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
