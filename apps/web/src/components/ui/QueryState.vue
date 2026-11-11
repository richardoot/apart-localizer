<script setup lang="ts">
  import { computed, unref } from 'vue'
  import type { MaybeRef } from 'vue'
  import { errorMessage } from '@/lib/errors'
  import UiAlert from './UiAlert.vue'
  import UiButton from './UiButton.vue'
  import UiSkeleton from './UiSkeleton.vue'

  /**
   * Lot 22 (ADR 0032) : les trois états d'une lecture, partout pareils.
   * Pendant le premier chargement, un squelette (annoncé « Chargement… »
   * aux lecteurs d'écran) ; à l'échec, le message et « Réessayer », jamais
   * un écran vide qui ressemble à « rien à faire » ; vide, ce qu'il faut
   * faire (et, s'il y a des filtres, qu'ils cachent peut-être des lignes,
   * avec « Effacer les filtres »). Les données déjà là restent affichées si
   * une relecture échoue, sous un message.
   *
   * `query` prend un résultat de TanStack Query (ou plusieurs) ; à défaut,
   * `pending` et `error` disent l'état, et `retry` est émis.
   */
  interface QueryLike {
    isPending: MaybeRef<boolean>
    isError: MaybeRef<boolean>
    error: MaybeRef<unknown>
    isFetching?: MaybeRef<boolean>
    data?: MaybeRef<unknown>
    refetch?: () => unknown
  }

  const props = withDefaults(
    defineProps<{
      query?: QueryLike | readonly QueryLike[] | undefined
      pending?: boolean | undefined
      error?: Error | null | undefined
      empty?: boolean | undefined
      emptyTitle?: string | undefined
      emptyText?: string | undefined
      /** Des filtres sont actifs : le vide le dit et propose de les effacer. */
      filtered?: boolean | undefined
      skeleton?: 'lines' | 'cards' | 'rows' | 'block' | undefined
      skeletonCount?: number | undefined
      /** Ce qui se charge (« les annonces »), pour les lecteurs d'écran. */
      loadingLabel?: string | undefined
      /** Le message si l'échec ne dit rien de lisible. */
      errorFallback?: string | undefined
    }>(),
    {
      query: () => [],
      error: null,
      emptyTitle: undefined,
      emptyText: undefined,
      loadingLabel: undefined,
      pending: false,
      empty: false,
      filtered: false,
      skeleton: 'lines',
      skeletonCount: 3,
      errorFallback: 'La lecture a échoué.',
    }
  )
  const emit = defineEmits<{ retry: []; clearFilters: [] }>()

  const queries = computed<readonly QueryLike[]>(() =>
    props.query === undefined
      ? []
      : Array.isArray(props.query)
        ? (props.query as readonly QueryLike[])
        : [props.query as QueryLike]
  )
  const hasData = (query: QueryLike) => unref(query.data) !== undefined
  const failed = computed(() => queries.value.filter(q => unref(q.isError)))
  const firstError = computed(() =>
    props.error
      ? props.error
      : (failed.value.map(q => unref(q.error))[0] ?? null)
  )
  const loading = computed(
    () =>
      props.pending ||
      queries.value.some(q => unref(q.isPending) && !unref(q.isError))
  )
  /** Échec sans données : à la place du contenu. */
  const blocking = computed(
    () => !!props.error || failed.value.some(query => !hasData(query))
  )
  /** Échec d'une relecture, données gardées : au-dessus du contenu. */
  const stale = computed(() => !blocking.value && failed.value.length > 0)
  const retrying = computed(() =>
    queries.value.some(q => unref(q.isFetching ?? false))
  )
  const message = computed(() =>
    errorMessage(firstError.value, props.errorFallback)
  )

  function retry(): void {
    for (const query of failed.value) void query.refetch?.()
    emit('retry')
  }
</script>

<template>
  <div v-if="blocking" data-state="error">
    <UiAlert retry :retrying="retrying" @retry="retry">
      {{ message }}
    </UiAlert>
  </div>
  <div v-else-if="loading" role="status" aria-busy="true" data-state="loading">
    <span class="sr-only">{{
      loadingLabel ? `Chargement de ${loadingLabel}…` : 'Chargement…'
    }}</span>
    <slot name="loading">
      <UiSkeleton :variant="skeleton" :count="skeletonCount" />
    </slot>
  </div>
  <div v-else-if="empty" data-state="empty">
    <slot name="empty">
      <div
        class="grid justify-items-start gap-2 rounded-2xl border border-dashed border-line bg-surface px-4 py-5 text-sm"
      >
        <p v-if="emptyTitle" class="font-semibold">{{ emptyTitle }}</p>
        <p v-if="emptyText" class="text-muted">{{ emptyText }}</p>
        <template v-if="filtered">
          <p class="text-muted">
            Des filtres sont actifs : ils cachent peut-être ce que tu cherches.
          </p>
          <UiButton
            size="sm"
            data-testid="clear-filters"
            @click="emit('clearFilters')"
            >Effacer les filtres</UiButton
          >
        </template>
        <slot name="empty-actions" />
      </div>
    </slot>
  </div>
  <template v-else>
    <UiAlert
      v-if="stale"
      tone="warn"
      class="mb-3"
      retry
      :retrying="retrying"
      data-state="stale"
      @retry="retry"
    >
      {{ message }} Ce qui est affiché date peut-être un peu.
    </UiAlert>
    <slot />
  </template>
</template>
