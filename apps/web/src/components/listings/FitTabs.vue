<script setup lang="ts">
  import { computed } from 'vue'
  import { MAIN_TAB_FIT_LEVELS } from '@apart/contracts'
  import type { CriteriaFitLevel, ListingListFit } from '@apart/contracts'
  import { useMediaQuery } from '@/composables/useMediaQuery'
  import { useFiltersStore } from '@/stores/filters'
  import FitBadge from './FitBadge.vue'

  /**
   * Les onglets de la liste (lot 14) : « Dans les critères » (dans, à
   * confirmer, à la marge, et les hors critères gardées pour une offre en
   * cours ou une visite prévue) et « Hors critères » (rien n'est perdu) ;
   * lot 16 : « À valider » (brouillons reçus par e-mail ou trouvés par
   * Claude, `?vue=a-valider`), avec son compteur. Les compteurs ne dépendent
   * pas de l'onglet ouvert ; l'onglet et les pastilles « Adéquation » vivent
   * dans l'URL comme les autres filtres. Sans critère actif, ni onglet
   * d'adéquation ni pastille : tout est « dans les critères ».
   */
  const props = withDefaults(
    defineProps<{ fit: ListingListFit | null; drafts?: number }>(),
    { drafts: 0 }
  )
  const store = useFiltersStore()
  /** Sur téléphone, les libellés courts de la maquette (« Dans · 7 »). */
  const narrow = useMediaQuery('(max-width: 639px)')

  const active = computed(() => props.fit?.activeCriteria ?? [])
  const counts = computed(() => props.fit?.counts ?? null)
  const mainCount = computed(() =>
    counts.value
      ? counts.value.in +
        counts.value.to_confirm +
        counts.value.margin +
        (props.fit?.kept ?? 0)
      : 0
  )
  const allCount = computed(() =>
    counts.value
      ? counts.value.in +
        counts.value.to_confirm +
        counts.value.margin +
        counts.value.out
      : 0
  )
  /** L'onglet « À valider » : dès qu'un brouillon attend, ou s'il est ouvert. */
  const showDrafts = computed(
    () => props.drafts > 0 || store.fitTab === 'drafts'
  )
  const showTabs = computed(() => active.value.length > 0 || showDrafts.value)
  const selected = (level: CriteriaFitLevel): boolean =>
    store.filters.fit === undefined || store.filters.fit.includes(level)

  const tabClass = (on: boolean): string =>
    on
      ? 'border-accent bg-surface font-semibold text-accent sm:bg-transparent'
      : 'border-transparent text-muted hover:text-fg'
</script>

<template>
  <section v-if="fit || showDrafts" class="grid gap-3" data-testid="fit-tabs">
    <p
      v-if="fit && active.length === 0 && store.fitTab !== 'drafts'"
      class="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted"
      data-testid="fit-no-criteria"
    >
      Aucun critère actif : toutes les annonces sont « dans les critères ».
      <RouterLink
        :to="{ name: 'criteria' }"
        class="font-semibold text-accent underline-offset-2 hover:underline"
        >Créer un critère</RouterLink
      >
      pour les comparer à ce que vous cherchez.
    </p>
    <div
      v-if="showTabs"
      role="tablist"
      aria-label="Vues de la liste"
      class="grid gap-1 rounded-xl bg-surface-2 p-1 sm:flex sm:gap-2 sm:rounded-none sm:border-b sm:border-line sm:bg-transparent sm:p-0"
      :class="
        active.length > 0 && showDrafts
          ? 'grid-cols-3'
          : active.length > 0 || showDrafts
            ? 'grid-cols-2'
            : 'grid-cols-1'
      "
    >
      <button
        id="fit-tab-main"
        type="button"
        role="tab"
        class="min-h-11 rounded-lg border-b-2 px-2 text-sm whitespace-nowrap sm:-mb-px sm:rounded-none sm:px-4"
        :class="tabClass(store.fitTab === 'main')"
        :aria-selected="store.fitTab === 'main'"
        data-fit-tab="main"
        @click="store.setFitTab('main')"
      >
        {{
          active.length
            ? narrow
              ? 'Dans'
              : 'Dans les critères'
            : narrow
              ? 'Annonces'
              : 'Toutes les annonces'
        }}
        ·
        <span class="tabular-nums">{{
          active.length ? mainCount : allCount
        }}</span>
      </button>
      <button
        v-if="active.length"
        id="fit-tab-out"
        type="button"
        role="tab"
        class="min-h-11 rounded-lg border-b-2 px-2 text-sm whitespace-nowrap sm:-mb-px sm:rounded-none sm:px-4"
        :class="tabClass(store.fitTab === 'out')"
        :aria-selected="store.fitTab === 'out'"
        data-fit-tab="out"
        @click="store.setFitTab('out')"
      >
        {{ narrow ? 'Hors' : 'Hors critères' }}
        ·
        <span class="tabular-nums">{{ counts?.out ?? 0 }}</span>
      </button>
      <button
        v-if="showDrafts"
        id="fit-tab-drafts"
        type="button"
        role="tab"
        class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border-b-2 px-2 text-sm whitespace-nowrap sm:-mb-px sm:gap-2 sm:rounded-none sm:px-4"
        :class="tabClass(store.fitTab === 'drafts')"
        :aria-selected="store.fitTab === 'drafts'"
        data-fit-tab="drafts"
        @click="store.setFitTab('drafts')"
      >
        À valider
        <span
          class="rounded-full bg-accent px-2 py-px text-xs text-accent-fg tabular-nums"
          data-testid="drafts-count"
          >{{ drafts }}</span
        >
      </button>
    </div>

    <template v-if="active.length && store.fitTab !== 'drafts'">
      <div
        v-if="store.fitTab === 'main'"
        class="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Adéquation"
      >
        <span class="mr-1 text-xs font-medium text-muted">Adéquation</span>
        <button
          v-for="level in MAIN_TAB_FIT_LEVELS"
          :key="level"
          type="button"
          class="inline-flex min-h-9 items-center rounded-full border px-1 transition-opacity"
          :class="
            selected(level)
              ? 'border-accent opacity-100'
              : 'border-line opacity-50 hover:opacity-80'
          "
          :aria-pressed="selected(level)"
          :data-fit-level="level"
          @click="store.toggleFitLevel(level)"
        >
          <FitBadge :level="level" :count="counts?.[level] ?? 0" />
        </button>
        <span
          v-if="fit?.kept"
          class="text-xs text-muted"
          data-testid="fit-kept-count"
          >+ {{ fit.kept }} hors critères gardée(s) : offre en cours ou visite
          prévue</span
        >
      </div>
      <p
        v-else
        class="max-w-3xl rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-fg"
        data-testid="fit-out-explanation"
      >
        Ces annonces ne correspondent à aucun critère actif, même avec la marge.
        Elles gardent leur statut, leurs avis et leur historique. Elles
        reviennent d’elles-mêmes si un critère s’élargit, si le prix baisse ou
        si une adresse précisée les place dans le périmètre.
      </p>
    </template>
  </section>
</template>
