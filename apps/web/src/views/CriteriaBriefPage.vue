<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import type { SearchPortal } from '@apart/contracts'
  import {
    useCriteriaMutations,
    useSearchCriteriaList,
  } from '@/composables/useSearchCriteria'
  import { useCriteriaBrief } from '@/composables/useExplorations'
  import { useAction } from '@/composables/useAction'
  import { formatDay, plural } from '@/lib/format'
  import { cardClasses } from '@/lib/ui'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import {
    criteriaHeadline,
    explorationCountsText,
    explorationWhen,
    portalLastRunText,
  } from '@/lib/exploration'

  /**
   * Lot 16 : « Ce que Claude cherche » pour un critère : le brief qu'il
   * reçoit avant d'explorer (marge comprise), les portails à cocher et leurs
   * liens de recherche fabriqués sans réseau (Claude les ouvre dans le
   * navigateur de l'utilisateur ; le membre peut aussi les ouvrir), la
   * demande à copier dans claude.ai et les dernières explorations.
   */
  const route = useRoute()
  const id = computed(() => String(route.params.id ?? ''))
  const briefQuery = useCriteriaBrief(id)
  const { data: brief } = briefQuery
  const { data: criteriaList } = useSearchCriteriaList(true)
  const mutations = useCriteriaMutations()

  const criteria = computed(() => brief.value?.criteria[0] ?? null)
  const summary = computed(
    () => criteriaList.value?.find(c => c.id === id.value) ?? null
  )
  const headline = computed(() =>
    criteria.value
      ? `${criteriaHeadline(criteria.value, criteria.value.perimeterLabel)} · ${plural(criteria.value.listingCount, 'annonce gardée', 'annonces gardées')}`
      : ''
  )
  const enabled = computed(
    () =>
      criteria.value?.portals.filter(p => p.enabled).map(p => p.portal) ?? []
  )
  const portalsAction = useAction()
  const copyFailure = ref<string | null>(null)
  const copied = ref(false)

  const GENERAL_REQUEST = 'Explore les nouvelles annonces pour nos critères.'

  async function toggle(portal: SearchPortal, on: boolean): Promise<void> {
    portalsAction.clear()
    const next = on
      ? [...enabled.value, portal]
      : enabled.value.filter(p => p !== portal)
    if (next.length === 0) {
      portalsAction.fail('Garde au moins un portail coché.')
      return
    }
    await portalsAction.run(
      () =>
        mutations.update.mutateAsync({
          id: id.value,
          patch: { portals: next },
        }),
      { fallback: 'Le portail n’a pas pu être enregistré.' }
    )
  }

  async function copy(): Promise<void> {
    copyFailure.value = null
    try {
      await navigator.clipboard.writeText(GENERAL_REQUEST)
      copied.value = true
    } catch {
      copyFailure.value = 'Copie impossible : sélectionne le texte à la main.'
    }
  }
</script>

<template>
  <section class="mx-auto grid max-w-6xl gap-5 px-4 py-6">
    <UiButton
      :to="{ name: 'criteria' }"
      variant="link"
      icon="arrow-left"
      class="w-fit"
      >Critères</UiButton
    >
    <QueryState
      :query="briefQuery"
      skeleton="cards"
      :skeleton-count="2"
      loading-label="du brief"
    >
      <template v-if="brief && criteria">
        <header class="grid gap-1">
          <h1 class="font-display text-2xl font-bold sm:text-[28px]">
            {{ criteria.name }}
            <UiBadge v-if="!criteria.active" class="align-middle"
              >archivé</UiBadge
            >
          </h1>
          <p class="text-sm text-muted" data-testid="brief-headline">
            {{ headline }}
          </p>
        </header>

        <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section
            aria-labelledby="brief-title"
            class="grid gap-4"
            :class="cardClasses()"
            data-testid="search-brief"
          >
            <div class="grid gap-1">
              <h2 id="brief-title" class="text-base font-semibold">
                Ce que Claude cherche
              </h2>
              <p class="text-sm leading-normal text-muted">
                Le brief qu’il reçoit avant d’explorer, tiré de ce critère : la
                marge est comprise, pour ne pas manquer une annonce un peu
                au-dessus.
              </p>
            </div>
            <dl class="grid gap-0 text-sm">
              <div
                v-for="line in criteria.lines"
                :key="line.key"
                class="grid gap-1 border-t border-line py-2.5 first:border-t-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4"
                :data-brief-line="line.key"
              >
                <dt class="font-medium text-muted">{{ line.label }}</dt>
                <dd class="leading-normal">{{ line.text }}</dd>
              </div>
              <div
                class="grid gap-1 border-t border-line py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4"
                data-brief-line="known"
              >
                <dt class="font-medium text-muted">
                  Déjà connues, à ne pas reproposer
                </dt>
                <dd class="leading-normal">
                  {{
                    plural(
                      brief.known.tracked,
                      'annonce suivie',
                      'annonces suivies'
                    )
                  }}
                  et
                  {{ plural(brief.known.dismissed, 'écartée', 'écartées') }}.
                  Une annonce suivie revue sur un portail devient une
                  vérification : ses nouveaux faits vont dans l’Historique de la
                  fiche.
                </dd>
              </div>
            </dl>

            <div class="grid gap-2">
              <h3 class="text-sm font-semibold">Portails à parcourir</h3>
              <p class="text-sm leading-normal text-muted">
                L’appli prépare l’adresse de chaque recherche, sans rien
                télécharger ; Claude l’ouvre dans ton navigateur. Tu peux aussi
                l’ouvrir toi-même.
              </p>
              <ul class="grid rounded-xl border border-line">
                <li
                  v-for="portal in criteria.portals"
                  :key="portal.portal"
                  class="grid items-center gap-x-4 gap-y-1 border-t border-line px-3 py-2.5 first:border-t-0 sm:grid-cols-[9rem_minmax(0,1fr)_auto]"
                  :data-portal="portal.portal"
                >
                  <UiCheckbox
                    :model-value="portal.enabled"
                    :disabled="mutations.update.isPending.value"
                    class="font-medium"
                    @update:model-value="
                      value => toggle(portal.portal, value === true)
                    "
                  >
                    {{ portal.label }}
                  </UiCheckbox>
                  <div class="grid min-w-0 gap-0.5 text-sm">
                    <span class="text-fg">{{ portal.filtersText }}</span>
                    <span
                      v-if="portal.mode === 'manual'"
                      class="text-xs text-warn"
                      data-testid="manual-filters"
                      >Filtres à saisir : {{ portal.toEnter.join(' · ') }}</span
                    >
                    <span
                      v-else-if="portal.toEnter.length"
                      class="text-xs text-muted"
                      >À saisir : {{ portal.toEnter.join(' · ') }}</span
                    >
                    <span
                      v-if="portalLastRunText(portal.lastRun)"
                      class="text-xs"
                      :class="
                        portal.lastRun?.status === 'blocked'
                          ? 'text-bad'
                          : 'text-muted'
                      "
                      data-testid="portal-last-run"
                      >{{ portalLastRunText(portal.lastRun) }}</span
                    >
                  </div>
                  <UiButton
                    :href="portal.url"
                    variant="link"
                    icon-right="external"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-action="open-search"
                    >Ouvrir la recherche</UiButton
                  >
                </li>
              </ul>
              <UiAlert v-if="portalsAction.error.value">
                {{ portalsAction.error.value }}
              </UiAlert>
              <p class="text-xs text-muted">
                Modèles de recherche datés du
                {{ formatDay(brief.templatesAsOf) }} ; un portail qui change de
                forme d’adresse ouvre sa page de recherche, filtres à saisir.
              </p>
            </div>
          </section>

          <aside class="grid gap-4">
            <section
              aria-labelledby="run-title"
              class="grid gap-2.5"
              :class="cardClasses()"
            >
              <h2 id="run-title" class="text-base font-semibold">
                Lancer une exploration
              </h2>
              <p class="text-sm leading-normal text-muted">
                Dans claude.ai, connecteur apart-localizer actif, choisis la
                demande
                <strong class="text-fg">« Explorer les portails »</strong>, ou
                écris simplement :
              </p>
              <p
                class="rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm"
                data-testid="request"
              >
                {{ GENERAL_REQUEST }}
              </p>
              <UiButton
                variant="outline"
                :icon="copied ? 'check' : undefined"
                data-action="copy"
                @click="copy"
              >
                {{ copied ? 'Copié' : 'Copier la demande' }}
              </UiButton>
              <UiAlert v-if="copyFailure">{{ copyFailure }}</UiAlert>
              <p class="text-sm leading-normal text-muted">
                Tous les critères actifs sont explorés ensemble ; pour celui-ci
                seul : « Explore pour {{ criteria.name }} ». Claude n’ajoute
                rien à la liste : ce qu’il trouve attend dans « À valider ».
              </p>
            </section>
            <section
              aria-labelledby="last-title"
              class="grid gap-2"
              :class="cardClasses()"
            >
              <h2 id="last-title" class="text-base font-semibold">
                Dernières explorations
              </h2>
              <p
                v-if="brief.recentExplorations.length === 0"
                class="text-sm text-muted"
              >
                Aucune pour l’instant.
              </p>
              <ul v-else class="grid gap-1 text-sm">
                <li
                  v-for="e in brief.recentExplorations"
                  :key="e.id"
                  class="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line py-1.5 first:border-t-0"
                >
                  <UiButton
                    :to="{ name: 'exploration', params: { id: e.id } }"
                    variant="link"
                    >{{ explorationWhen(e.finishedAt) }}</UiButton
                  >
                  <span class="text-xs text-muted tabular-nums">{{
                    explorationCountsText(e.counts)
                  }}</span>
                </li>
              </ul>
            </section>
            <UiButton
              v-if="summary"
              :to="{ name: 'listings', query: { criteriaId: summary.id } }"
              variant="link"
              class="w-fit"
              >Voir les annonces de ce critère</UiButton
            >
          </aside>
        </div>
      </template>
    </QueryState>
  </section>
</template>
