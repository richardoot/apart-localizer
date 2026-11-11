<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type {
    CriteriaFitLevel,
    SearchCriteriaSummary,
  } from '@apart/contracts'
  import { toleranceSummary } from '@apart/domain'
  import SidePanel from '@/components/ui/SidePanel.vue'
  import CriteriaEditor from '@/components/criteria/CriteriaEditor.vue'
  import FitBadge from '@/components/listings/FitBadge.vue'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiConfirm from '@/components/ui/UiConfirm.vue'
  import { useAction } from '@/composables/useAction'
  import { useLeaveGuard } from '@/composables/useLeaveGuard'
  import {
    useCriteriaMutations,
    useSearchCriteriaList,
  } from '@/composables/useSearchCriteria'
  import { formatEuros, plural } from '@/lib/format'
  import { cardClasses } from '@/lib/ui'
  import { VERDICT_LABELS } from '@/lib/labels'
  import { describePerimeter } from '@/lib/perimeter'

  /**
   * Critères de recherche enregistrés et partagés (besoins G3 à G6) : la
   * liste avec les compteurs (annonces gardées, nouveautés pour moi, et
   * lot 14 : annonces par niveau d'adéquation et marge de tolérance),
   * création, modification, archivage, suppression ; « Voir les annonces »
   * ouvre la liste filtrée par le critère ; lot 16 : « Ce que Claude
   * cherche » ouvre le brief de l'exploration des portails.
   *
   * Lot 22 : la suppression se confirme sur place (plus de
   * `window.confirm`) ; fermer le panneau d'un critère modifié ou dessiné,
   * ou revenir en arrière, passe par la garde des modifications.
   */
  const showArchived = ref(false)
  const list = useSearchCriteriaList(showArchived)
  const { data } = list
  const mutations = useCriteriaMutations()
  const editing = ref<SearchCriteriaSummary | null>(null)
  const creating = ref(false)
  const criteria = computed(() => data.value ?? [])
  /** L'action de chaque carte (archiver, supprimer) : l'erreur dans sa carte. */
  const actionOf = new Map<string, ReturnType<typeof useAction>>()
  const action = (id: string) => {
    let found = actionOf.get(id)
    if (!found) {
      found = useAction()
      actionOf.set(id, found)
    }
    return found
  }

  const LEVELS: readonly CriteriaFitLevel[] = [
    'in',
    'to_confirm',
    'margin',
    'out',
  ]
  /** Lot 14 : les marges appliquées par le critère, en une phrase. */
  function margins(c: SearchCriteriaSummary): string {
    return toleranceSummary({
      perimeterType: c.perimeterType,
      filters: c.filters,
      tolerance: c.tolerance,
    })
  }

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

  function archive(c: SearchCriteriaSummary): void {
    void action(c.id).run(
      () =>
        mutations.update.mutateAsync({
          id: c.id,
          patch: { active: !c.active, expectedUpdatedAt: c.updatedAt },
        }),
      {
        success: c.active
          ? `Critère « ${c.name} » archivé.`
          : `Critère « ${c.name} » réactivé.`,
        fallback: c.active
          ? 'L’archivage a échoué.'
          : 'La réactivation a échoué.',
      }
    )
  }

  function remove(c: SearchCriteriaSummary): void {
    void action(c.id).run(() => mutations.remove.mutateAsync(c.id), {
      success: `Critère « ${c.name} » supprimé.`,
      fallback: 'La suppression a échoué.',
    })
  }

  // Le panneau du critère : sa fermeture passe par la garde.
  const editor = ref<{ isDirty: () => boolean } | null>(null)
  function closeNow(): void {
    editing.value = null
    creating.value = false
  }
  const { guard } = useLeaveGuard({
    title: () =>
      editing.value ? `Critère « ${editing.value.name} »` : 'Nouveau critère',
    isDirty: () =>
      (creating.value || editing.value !== null) &&
      (editor.value?.isDirty() ?? false),
    discard: closeNow,
  })
  function close(): void {
    guard(closeNow)
  }
</script>

<template>
  <section class="mx-auto grid max-w-5xl gap-4 px-4 py-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl font-bold">Critères de recherche</h1>
        <p class="text-sm text-muted">
          Partagés dans l'espace ; une annonce qui entre dans un critère est
          signalée à sa création, y compris quand Claude l’ajoute.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <UiCheckbox v-model="showArchived" label="Archivés" />
        <UiButton variant="primary" icon="plus" @click="creating = true">
          Nouveau critère
        </UiButton>
      </div>
    </header>

    <QueryState
      :query="list"
      :empty="criteria.length === 0"
      empty-title="Aucun critère."
      empty-text="Crée-en un pour suivre un quartier, un trajet à pied ou un budget."
      skeleton="cards"
      :skeleton-count="2"
      loading-label="des critères"
    >
      <ul class="grid gap-3">
        <li
          v-for="c in criteria"
          :key="c.id"
          class="grid gap-2"
          :class="cardClasses(c.active ? 'default' : 'muted')"
          :data-criteria="c.id"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="font-display text-lg font-bold">
              {{ c.name }}
              <UiBadge v-if="!c.active" class="ml-1 align-middle"
                >archivé</UiBadge
              >
            </h2>
            <p class="text-sm">
              <strong data-testid="count">{{ c.listingCount }}</strong>
              {{ c.listingCount >= 2 ? 'annonces gardées' : 'annonce gardée' }}
              <UiBadge v-if="c.newCount" tone="accent" class="ml-1">{{
                plural(c.newCount, 'nouvelle')
              }}</UiBadge>
              <span v-if="c.approximateCount" class="ml-1 text-xs text-muted"
                >dont {{ c.approximateCount }} à confirmer faute d’adresse</span
              >
            </p>
          </div>
          <div
            class="flex flex-wrap items-center gap-1.5"
            role="group"
            :aria-label="`Annonces par niveau d’adéquation au critère « ${c.name} »`"
            data-testid="fit-counts"
          >
            <FitBadge
              v-for="level in LEVELS"
              :key="level"
              :level="level"
              :count="c.fitCounts[level]"
            />
          </div>
          <p class="text-sm text-muted" data-testid="tolerance-summary">
            {{ margins(c) }}
          </p>
          <p class="text-sm text-muted">
            {{ describePerimeter(c.perimeter)
            }}<template v-if="summary(c)"> · {{ summary(c) }}</template>
          </p>
          <div class="flex flex-wrap gap-2 text-sm">
            <UiButton
              :to="{ name: 'listings', query: { criteriaId: c.id } }"
              variant="outline"
              size="sm"
            >
              Voir les annonces
            </UiButton>
            <UiButton
              :to="{ name: 'criteria-brief', params: { id: c.id } }"
              size="sm"
              data-action="brief"
            >
              Ce que Claude cherche
            </UiButton>
            <UiButton size="sm" icon="edit" @click="editing = c">
              Modifier
            </UiButton>
            <UiButton
              size="sm"
              :loading="action(c.id).pending.value"
              data-action="archive"
              @click="archive(c)"
            >
              {{ c.active ? 'Archiver' : 'Réactiver' }}
            </UiButton>
            <UiConfirm
              label="Supprimer"
              icon="trash"
              :question="`Supprimer définitivement le critère « ${c.name} » ?`"
              confirm-label="Supprimer"
              :busy="action(c.id).pending.value"
              data-action="delete"
              :confirm-attrs="{ 'data-action': 'confirm-delete' }"
              @confirm="remove(c)"
            />
          </div>
          <UiAlert v-if="action(c.id).error.value">
            {{ action(c.id).error.value }}
          </UiAlert>
        </li>
      </ul>
    </QueryState>

    <SidePanel
      v-if="creating || editing"
      :title="editing ? `Modifier « ${editing.name} »` : 'Nouveau critère'"
      @close="close"
    >
      <CriteriaEditor
        ref="editor"
        :key="editing?.id ?? 'new'"
        :criteria="editing"
        @saved="closeNow"
      />
    </SidePanel>
  </section>
</template>
