<script setup lang="ts">
  import { computed } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { EXPLORATION_PORTAL_LABELS } from '@apart/contracts'
  import type { ExplorationLineFilter } from '@apart/contracts'
  import {
    explorationLineFilterCounts,
    filterExplorationLines,
  } from '@apart/domain'
  import { useExploration } from '@/composables/useExplorations'
  import {
    EXPLORATION_LINE_FILTER_LABELS,
    LINE_FILTERS,
    OUTCOME_BADGE,
    explorationDuration,
    explorationTitle,
    lineFilterFromQuery,
  } from '@/lib/exploration'
  import { formatEuros } from '@/lib/format'

  /**
   * Lot 16 : le compte rendu d'une exploration des portails par Claude :
   * bilan par portail (bloqué compris, jamais contourné), une ligne par
   * annonce lue (à valider, déjà suivie, déjà écartée, hors critères) avec
   * la raison, filtre par résultat dans l'URL (`?resultat=`). Une annonce
   * hors critères n'existe qu'ici : si un critère s'élargit, la prochaine
   * exploration la remontera.
   */
  const route = useRoute()
  const router = useRouter()
  const id = computed(() => String(route.params.id ?? ''))
  const { data: exploration, isPending, error } = useExploration(id)

  const filter = computed(() => lineFilterFromQuery(route.query.resultat))
  const counts = computed(() =>
    explorationLineFilterCounts(exploration.value?.lines ?? [])
  )
  const lines = computed(() =>
    filterExplorationLines(exploration.value?.lines ?? [], filter.value)
  )

  function pick(next: ExplorationLineFilter): void {
    const { resultat: _drop, ...rest } = route.query
    void router.replace({
      name: 'exploration',
      params: route.params,
      query: next === 'all' ? rest : { ...rest, resultat: next },
    })
  }

  const subtitle = computed(() => {
    const e = exploration.value
    if (!e) return ''
    const who =
      e.channel === 'mcp'
        ? `Par Claude${e.author ? ` pour ${e.author.displayName} · connecteur, navigateur de ${e.author.displayName}` : ' · connecteur'}`
        : e.author
          ? `Par ${e.author.displayName}`
          : 'Exploration'
    const criteria = e.criteria.length
      ? `${e.criteria.length} critère(s) : ${e.criteria.map(c => `« ${c.name} »`).join(', ')}`
      : 'aucun critère actif'
    return `${who} · ${criteria} · ${explorationDuration(e.startedAt, e.finishedAt)}`
  })
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
    <p v-else-if="isPending" class="text-sm text-muted">
      Chargement du compte rendu…
    </p>
    <template v-else-if="exploration">
      <header class="grid gap-1">
        <h1 class="font-display text-2xl font-bold sm:text-[28px]">
          {{ explorationTitle(exploration.finishedAt) }}
        </h1>
        <p class="text-sm text-muted" data-testid="exploration-subtitle">
          {{ subtitle }}
        </p>
        <p class="text-sm">{{ exploration.summary }}.</p>
        <p v-if="exploration.notes" class="text-sm text-muted">
          Note de Claude : {{ exploration.notes }}
        </p>
      </header>

      <div
        class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5"
        data-testid="portal-bilan"
      >
        <div
          v-for="b in exploration.bilan"
          :key="b.portal"
          class="grid gap-1 rounded-xl border bg-surface p-3"
          :class="b.blocked ? 'border-bad' : 'border-line'"
          :data-portal="b.portal"
        >
          <strong class="text-sm">{{ b.label }}</strong>
          <span class="text-sm tabular-nums">{{ b.count }}</span>
          <span
            class="text-xs leading-snug"
            :class="b.blocked ? 'text-bad' : 'text-muted'"
            >{{ b.note }}</span
          >
        </div>
      </div>

      <div
        role="group"
        aria-label="Filtrer par résultat"
        class="flex flex-wrap gap-2"
      >
        <button
          v-for="f in LINE_FILTERS"
          :key="f"
          type="button"
          class="min-h-10 rounded-full border px-3.5 text-[13px]"
          :class="
            filter === f
              ? 'border-accent bg-accent-soft font-semibold text-accent'
              : 'border-line bg-surface text-fg'
          "
          :aria-pressed="filter === f"
          :data-filter="f"
          @click="pick(f)"
        >
          {{ EXPLORATION_LINE_FILTER_LABELS[f] }} · {{ counts[f] }}
        </button>
      </div>

      <p
        v-if="exploration.outDigest && (filter === 'all' || filter === 'out')"
        class="text-sm text-muted"
        data-testid="out-digest"
      >
        Hors critères : {{ exploration.outDigest }}.
      </p>

      <p v-if="lines.length === 0" class="text-sm text-muted">
        Aucune annonce pour ce résultat.
      </p>
      <div
        v-else
        class="overflow-hidden rounded-2xl border border-line bg-surface"
      >
        <table class="hidden w-full text-sm md:table" data-testid="lines-table">
          <thead class="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th scope="col" class="px-4 py-2.5 font-medium">Annonce vue</th>
              <th scope="col" class="px-3 py-2.5 font-medium">Portail</th>
              <th scope="col" class="px-3 py-2.5 text-right font-medium">
                Prix
              </th>
              <th scope="col" class="px-3 py-2.5 font-medium">Résultat</th>
              <th scope="col" class="px-4 py-2.5 font-medium">Pourquoi</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="line in lines"
              :key="line.id"
              class="border-t border-line align-top"
              :data-outcome="line.outcome"
            >
              <td class="px-4 py-2.5">
                <a
                  :href="line.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="font-medium text-accent underline-offset-2 hover:underline"
                  >{{ line.title }}</a
                >
                <div class="text-xs text-muted">
                  {{
                    [line.commune, line.district].filter(Boolean).join(' · ') ||
                    '—'
                  }}
                </div>
              </td>
              <td class="px-3 py-2.5">
                {{ EXPLORATION_PORTAL_LABELS[line.portal] }}
              </td>
              <td class="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                {{ line.price !== null ? formatEuros(line.price) : '—' }}
              </td>
              <td class="px-3 py-2.5">
                <span
                  class="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap"
                  :class="OUTCOME_BADGE[line.outcome].tone"
                  >{{ OUTCOME_BADGE[line.outcome].label }}</span
                >
              </td>
              <td class="px-4 py-2.5 leading-normal text-muted">
                {{ line.why }}
                <RouterLink
                  v-if="line.listing"
                  :to="{ name: 'listing', params: { id: line.listing.id } }"
                  class="ml-1 text-accent underline-offset-2 hover:underline"
                  >Ouvrir la fiche</RouterLink
                >
              </td>
            </tr>
          </tbody>
        </table>
        <ul class="grid md:hidden" data-testid="lines-cards">
          <li
            v-for="line in lines"
            :key="line.id"
            class="grid gap-1.5 border-t border-line p-3.5 first:border-t-0"
            :data-outcome="line.outcome"
          >
            <div class="flex items-baseline justify-between gap-3">
              <a
                :href="line.url"
                target="_blank"
                rel="noopener noreferrer"
                class="font-medium text-accent underline-offset-2"
                >{{ line.title }}</a
              >
              <strong class="text-sm whitespace-nowrap tabular-nums">{{
                line.price !== null ? formatEuros(line.price) : '—'
              }}</strong>
            </div>
            <span class="text-xs text-muted"
              >{{
                [line.commune, line.district].filter(Boolean).join(' · ') || '—'
              }}
              · {{ EXPLORATION_PORTAL_LABELS[line.portal] }}</span
            >
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
                :class="OUTCOME_BADGE[line.outcome].tone"
                >{{ OUTCOME_BADGE[line.outcome].label }}</span
              >
              <span class="text-sm leading-snug text-muted">{{
                line.why
              }}</span>
            </div>
          </li>
        </ul>
      </div>

      <p
        class="rounded-xl border border-dashed border-line px-4 py-3.5 text-[13px] leading-normal text-muted"
      >
        Une annonce hors critères n’est ni proposée ni enregistrée comme annonce
        : seule cette ligne garde sa trace (lien, prix, raison). Si un critère
        s’élargit, la prochaine exploration la remontera.
        <RouterLink
          :to="{ name: 'listings', query: { vue: 'a-valider' } }"
          class="text-accent underline-offset-2 hover:underline"
          >Voir les annonces à valider</RouterLink
        >
      </p>
    </template>
  </section>
</template>
