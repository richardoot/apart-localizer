<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import type { SearchPortal } from '@apart/contracts'
  import {
    useCriteriaMutations,
    useSearchCriteriaList,
  } from '@/composables/useSearchCriteria'
  import { useCriteriaBrief } from '@/composables/useExplorations'
  import { ApiError } from '@/lib/api'
  import { formatDay } from '@/lib/format'
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
  const { data: brief, isPending, error } = useCriteriaBrief(id)
  const { data: criteriaList } = useSearchCriteriaList(true)
  const mutations = useCriteriaMutations()

  const criteria = computed(() => brief.value?.criteria[0] ?? null)
  const summary = computed(
    () => criteriaList.value?.find(c => c.id === id.value) ?? null
  )
  const headline = computed(() =>
    criteria.value
      ? `${criteriaHeadline(criteria.value, criteria.value.perimeterLabel)} · ${criteria.value.listingCount} annonce(s) gardée(s)`
      : ''
  )
  const enabled = computed(
    () =>
      criteria.value?.portals.filter(p => p.enabled).map(p => p.portal) ?? []
  )
  const failure = ref<string | null>(null)
  const copied = ref(false)

  const GENERAL_REQUEST = 'Explore les nouvelles annonces pour nos critères.'

  async function toggle(portal: SearchPortal, on: boolean): Promise<void> {
    failure.value = null
    const next = on
      ? [...enabled.value, portal]
      : enabled.value.filter(p => p !== portal)
    if (next.length === 0) {
      failure.value = 'Gardez au moins un portail coché.'
      return
    }
    try {
      await mutations.update.mutateAsync({
        id: id.value,
        patch: { portals: next },
      })
    } catch (err) {
      failure.value = err instanceof ApiError ? err.message : 'Échec.'
    }
  }

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(GENERAL_REQUEST)
      copied.value = true
    } catch {
      failure.value = 'Copie impossible : sélectionnez le texte à la main.'
    }
  }
</script>

<template>
  <section class="mx-auto grid max-w-6xl gap-5 px-4 py-6">
    <RouterLink
      :to="{ name: 'criteria' }"
      class="w-fit text-sm text-accent underline-offset-2 hover:underline"
      >← Critères</RouterLink
    >
    <p
      v-if="error"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ error.message }}
    </p>
    <p v-else-if="isPending" class="text-sm text-muted">Chargement du brief…</p>
    <template v-else-if="brief && criteria">
      <header class="grid gap-1">
        <h1 class="font-display text-2xl font-bold sm:text-[28px]">
          {{ criteria.name }}
          <span v-if="!criteria.active" class="text-sm font-normal text-muted"
            >(archivé)</span
          >
        </h1>
        <p class="text-sm text-muted" data-testid="brief-headline">
          {{ headline }}
        </p>
      </header>
      <p
        v-if="failure"
        role="alert"
        class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
      >
        {{ failure }}
      </p>

      <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section
          aria-labelledby="brief-title"
          class="grid gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-5"
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
                {{ brief.known.tracked }} annonce(s) suivie(s) et
                {{ brief.known.dismissed }} écartée(s). Une annonce suivie revue
                sur un portail devient une vérification : ses nouveaux faits
                vont dans l’Historique de la fiche.
              </dd>
            </div>
          </dl>

          <div class="grid gap-2">
            <h3 class="text-sm font-semibold">Portails à parcourir</h3>
            <p class="text-sm leading-normal text-muted">
              L’appli prépare l’adresse de chaque recherche, sans rien
              télécharger ; Claude l’ouvre dans votre navigateur. Vous pouvez
              aussi l’ouvrir vous-même.
            </p>
            <ul class="grid rounded-xl border border-line">
              <li
                v-for="portal in criteria.portals"
                :key="portal.portal"
                class="grid items-center gap-x-4 gap-y-1 border-t border-line px-3 py-2.5 first:border-t-0 sm:grid-cols-[9rem_minmax(0,1fr)_auto]"
                :data-portal="portal.portal"
              >
                <label class="flex min-h-11 items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    class="size-5 accent-accent"
                    :checked="portal.enabled"
                    :disabled="mutations.update.isPending.value"
                    @change="
                      toggle(
                        portal.portal,
                        ($event.target as HTMLInputElement).checked
                      )
                    "
                  />
                  {{ portal.label }}
                </label>
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
                <a
                  :href="portal.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex min-h-11 items-center text-sm text-accent underline-offset-2 hover:underline"
                  data-action="open-search"
                  >Ouvrir la recherche</a
                >
              </li>
            </ul>
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
            class="grid gap-2.5 rounded-2xl border border-line bg-surface p-4"
          >
            <h2 id="run-title" class="text-base font-semibold">
              Lancer une exploration
            </h2>
            <p class="text-sm leading-normal text-muted">
              Dans claude.ai, connecteur apart-localizer actif, choisissez le
              prompt <strong class="text-fg">« Explorer les portails »</strong>,
              ou écrivez simplement :
            </p>
            <p
              class="rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm"
              data-testid="request"
            >
              {{ GENERAL_REQUEST }}
            </p>
            <button
              type="button"
              class="min-h-11 rounded-xl border border-accent px-4 text-sm font-semibold text-accent"
              data-action="copy"
              @click="copy"
            >
              {{ copied ? 'Copié' : 'Copier la demande' }}
            </button>
            <p class="text-xs leading-normal text-muted">
              Tous les critères actifs sont explorés ensemble ; pour celui-ci
              seul : « Explore pour {{ criteria.name }} ». Claude n’ajoute rien
              à la liste : ce qu’il trouve attend dans « À valider ».
            </p>
          </section>
          <section
            aria-labelledby="last-title"
            class="grid gap-2 rounded-2xl border border-line bg-surface p-4"
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
                <RouterLink
                  :to="{ name: 'exploration', params: { id: e.id } }"
                  class="text-accent underline-offset-2 hover:underline"
                  >{{ explorationWhen(e.finishedAt) }}</RouterLink
                >
                <span class="text-xs text-muted tabular-nums">{{
                  explorationCountsText(e.counts)
                }}</span>
              </li>
            </ul>
          </section>
          <p v-if="summary" class="text-xs text-muted">
            <RouterLink
              :to="{ name: 'listings', query: { criteriaId: summary.id } }"
              class="text-accent underline-offset-2 hover:underline"
              >Voir les annonces de ce critère</RouterLink
            >
          </p>
        </aside>
      </div>
    </template>
  </section>
</template>
