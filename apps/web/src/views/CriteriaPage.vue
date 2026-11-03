<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { SearchCriteriaSummary } from '@apart/contracts'
  import SidePanel from '@/components/ui/SidePanel.vue'
  import CriteriaEditor from '@/components/criteria/CriteriaEditor.vue'
  import {
    useCriteriaMutations,
    useSearchCriteriaList,
  } from '@/composables/useSearchCriteria'
  import { ApiError } from '@/lib/api'
  import { formatEuros } from '@/lib/format'
  import { VERDICT_LABELS } from '@/lib/labels'
  import { describePerimeter } from '@/lib/perimeter'

  /**
   * Critères de recherche enregistrés et partagés (besoins G3 à G6) : la
   * liste avec les compteurs (annonces, nouveautés pour moi, sous réserve),
   * création, modification, archivage, suppression ; « Voir les annonces »
   * ouvre la liste filtrée par le critère.
   */
  const showArchived = ref(false)
  const { data, isPending, error } = useSearchCriteriaList(showArchived)
  const mutations = useCriteriaMutations()
  const editing = ref<SearchCriteriaSummary | null>(null)
  const creating = ref(false)
  const failure = ref<string | null>(null)
  const criteria = computed(() => data.value ?? [])

  function summary(c: SearchCriteriaSummary): string {
    const f = c.filters
    return [
      f.priceMax !== null ? `≤ ${formatEuros(f.priceMax)}` : null,
      f.priceMin !== null ? `≥ ${formatEuros(f.priceMin)}` : null,
      f.surfaceMin !== null ? `≥ ${f.surfaceMin} m²` : null,
      f.roomsMin !== null ? `${f.roomsMin} p. et plus` : null,
      f.dpeMax !== null ? `DPE ≤ ${f.dpeMax}` : null,
      f.maxTramDistanceMeters !== null
        ? `tram ≤ ${f.maxTramDistanceMeters} m`
        : null,
      f.communes.length ? f.communes.join(', ') : null,
      f.verdicts.length
        ? f.verdicts.map(v => VERDICT_LABELS[v]).join(', ')
        : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  async function run(action: Promise<unknown>): Promise<void> {
    failure.value = null
    try {
      await action
    } catch (err) {
      failure.value = err instanceof ApiError ? err.message : 'Échec.'
    }
  }

  function archive(c: SearchCriteriaSummary): void {
    void run(
      mutations.update.mutateAsync({
        id: c.id,
        patch: { active: !c.active, expectedUpdatedAt: c.updatedAt },
      })
    )
  }

  function remove(c: SearchCriteriaSummary): void {
    if (
      !window.confirm(`Supprimer définitivement le critère « ${c.name} » ?`)
    ) {
      return
    }
    void run(mutations.remove.mutateAsync(c.id))
  }

  function close(): void {
    editing.value = null
    creating.value = false
  }
</script>

<template>
  <section class="mx-auto grid max-w-5xl gap-4 px-4 py-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl font-bold">Critères de recherche</h1>
        <p class="text-sm text-muted">
          Partagés dans l'espace ; une annonce qui entre dans un critère est
          signalée à sa création, y compris par le MCP.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <label class="flex items-center gap-2 text-sm">
          <input v-model="showArchived" type="checkbox" class="accent-accent" />
          Archivés
        </label>
        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
          @click="creating = true"
        >
          + Nouveau critère
        </button>
      </div>
    </header>

    <p
      v-if="failure"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ failure }}
    </p>
    <p
      v-if="error"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ error.message }}
    </p>
    <p v-else-if="isPending" class="text-sm text-muted">
      Chargement des critères…
    </p>
    <p v-else-if="criteria.length === 0" class="text-sm text-muted">
      Aucun critère : créez-en un pour suivre un quartier, un trajet à pied ou
      un budget.
    </p>

    <ul class="grid gap-3">
      <li
        v-for="c in criteria"
        :key="c.id"
        class="grid gap-2 rounded-xl border border-line bg-surface p-4"
        :class="{ 'opacity-60': !c.active }"
        :data-criteria="c.id"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="font-display text-lg font-semibold">
            {{ c.name }}
            <span v-if="!c.active" class="text-xs font-normal text-muted"
              >(archivé)</span
            >
          </h2>
          <p class="text-sm">
            <strong data-testid="count">{{ c.listingCount }}</strong> annonce(s)
            <span
              v-if="c.newCount"
              class="ml-1 rounded-full bg-accent-soft px-2 text-xs"
              >{{ c.newCount }} nouvelle(s)</span
            >
            <span v-if="c.approximateCount" class="ml-1 text-xs text-muted"
              >dont {{ c.approximateCount }} sous réserve</span
            >
          </p>
        </div>
        <p class="text-sm text-muted">
          {{ describePerimeter(c.perimeter)
          }}<template v-if="summary(c)"> · {{ summary(c) }}</template>
        </p>
        <div class="flex flex-wrap gap-2 text-sm">
          <RouterLink
            :to="{ name: 'listings', query: { criteriaId: c.id } }"
            class="rounded-lg border border-accent px-3 py-1"
          >
            Voir les annonces
          </RouterLink>
          <button
            type="button"
            class="rounded-lg border border-line px-3 py-1"
            @click="editing = c"
          >
            Modifier
          </button>
          <button
            type="button"
            class="rounded-lg border border-line px-3 py-1"
            data-action="archive"
            @click="archive(c)"
          >
            {{ c.active ? 'Archiver' : 'Réactiver' }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-line px-3 py-1 text-bad"
            data-action="delete"
            @click="remove(c)"
          >
            Supprimer
          </button>
        </div>
      </li>
    </ul>

    <SidePanel
      v-if="creating || editing"
      :title="editing ? `Modifier « ${editing.name} »` : 'Nouveau critère'"
      @close="close"
    >
      <CriteriaEditor
        :key="editing?.id ?? 'new'"
        :criteria="editing"
        @saved="close"
      />
    </SidePanel>
  </section>
</template>
