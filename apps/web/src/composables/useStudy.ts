import { computed, unref } from 'vue'
import type { MaybeRef } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type {
  Assumptions,
  Listing,
  RentComparableInputRaw,
  RentComparableUpdate,
  ScenarioInputRaw,
  ScenarioUpdate,
} from '@apart/contracts'
import { studyInputFromListing } from '@apart/domain'
import type { StudyInput } from '@apart/domain'
import { api } from '@/lib/api'

export const studyKeys = {
  compliance: (id: string) => ['listings', 'compliance', id] as const,
  comparables: (id: string) => ['listings', 'rent-comparables', id] as const,
  scenarios: (listingId: string) => ['scenarios', listingId] as const,
}

/**
 * L'entrée de l'étude d'une annonce, calculée dans le navigateur par
 * `domain` exactement comme l'API : l'annonce et les hypothèses de l'espace
 * (dont l'année et le type de location, lot 19). Null tant que les
 * hypothèses ne sont pas chargées.
 */
export function useStudyInput(
  listing: MaybeRef<Listing | null | undefined>,
  base: MaybeRef<Assumptions | null | undefined>
) {
  return computed<{ input: StudyInput; assumptions: Assumptions } | null>(
    () => {
      const l = unref(listing)
      const a = unref(base)
      if (!l || !a) return null
      return {
        input: studyInputFromListing(l, a),
        assumptions: a,
      }
    }
  )
}

/** La checklist réglementaire et les risques Géorisques, calculés par le serveur. */
export function useCompliance(id: MaybeRef<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => studyKeys.compliance(unref(id) ?? '')),
    queryFn: () => api.study.compliance(unref(id) as string),
    enabled: computed(() => Boolean(unref(id))),
  })
}

/** Les comparables de loyer d'une annonce et leur synthèse. */
export function useRentComparables(id: MaybeRef<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => studyKeys.comparables(unref(id) ?? '')),
    queryFn: () => api.study.comparables(unref(id) as string),
    enabled: computed(() => Boolean(unref(id))),
  })
}

export function useRentComparableMutations(listingId: MaybeRef<string>) {
  const client = useQueryClient()
  const settle = (): void => {
    void client.invalidateQueries({
      queryKey: studyKeys.comparables(unref(listingId)),
    })
  }
  const add = useMutation({
    mutationFn: (input: RentComparableInputRaw) =>
      api.study.addComparable(unref(listingId), input),
    onSuccess: settle,
  })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: RentComparableUpdate }) =>
      api.study.updateComparable(unref(listingId), id, patch),
    onSuccess: settle,
  })
  const remove = useMutation({
    mutationFn: (id: string) =>
      api.study.removeComparable(unref(listingId), id),
    onSuccess: settle,
  })
  return { add, update, remove }
}

/** Les scénarios applicables à une annonce : les siens et ceux de l'espace. */
export function useScenarios(listingId: MaybeRef<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => studyKeys.scenarios(unref(listingId) ?? '')),
    queryFn: () => api.scenarios.list(unref(listingId) as string),
    enabled: computed(() => Boolean(unref(listingId))),
  })
}

export function useScenarioMutations() {
  const client = useQueryClient()
  const settle = (): void => {
    void client.invalidateQueries({ queryKey: ['scenarios'] })
  }
  const create = useMutation({
    mutationFn: (input: ScenarioInputRaw) => api.scenarios.create(input),
    onSuccess: settle,
  })
  const update = useMutation({
    mutationFn: ({ id, update }: { id: string; update: ScenarioUpdate }) =>
      api.scenarios.update(id, update),
    onSuccess: settle,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.scenarios.remove(id),
    onSuccess: settle,
  })
  return { create, update, remove }
}
