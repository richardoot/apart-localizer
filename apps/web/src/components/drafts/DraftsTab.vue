<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { EXPLORATION_PORTAL_LABELS } from '@apart/contracts'
  import type { ListingDraft } from '@apart/contracts'
  import { explorationHeading } from '@apart/domain'
  import { useDrafts } from '@/composables/useDrafts'
  import { useExplorationList } from '@/composables/useExplorations'
  import { errorMessage } from '@/lib/errors'
  import { plural } from '@/lib/format'
  import { useFeedbackStore } from '@/stores/feedback'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import { mergeDraftCards, pendingDuplicate } from '@/lib/drafts'
  import { draftRow, orderedRows } from '@/lib/workflow'
  import type { StageRowView } from '@/lib/workflow'
  import { isFoldedOut } from '@apart/domain'
  import { useWorkspace } from '@/composables/useWorkspace'
  import StageRows from '@/components/workflow/StageRows.vue'
  import AttachedLinks from './AttachedLinks.vue'
  import DraftCard from './DraftCard.vue'

  /**
   * Lot 16 : l'onglet « À valider » de la page Annonces : tous les
   * brouillons en attente (alertes e-mail et explorations de Claude), le
   * bandeau de la dernière exploration (résumé, compte rendu, « Ajouter
   * celles « dans les critères » »), et les décisions de la session gardées
   * à leur place (« Ajoutée », « Écartée… Annuler », « Fiche mise à jour »).
   * Lot 18 : en tête, les liens rattachés d'office (même agence, même
   * référence), avec « Ce n'est pas la même ». Lot 22 : une lecture échouée
   * dit l'erreur et « Réessayer », jamais « Rien à valider » ; le vide parle
   * des filtres quand il y en a.
   */
  const props = withDefaults(
    defineProps<{
      /** Lot 21 : les lignes de l'étape, ou les cartes complètes. */
      view?: 'list' | 'cards'
      /** Les brouillons après les filtres ; absent : tous. */
      drafts?: readonly ListingDraft[] | undefined
      /** L'espace décide à plusieurs : ajouter et écarter proposent. */
      agreement?: boolean
      /** Le brouillon déplié dans la liste. */
      expanded?: string | null
      /** Un tri est demandé : `drafts` est déjà dans l'ordre voulu. */
      keepOrder?: boolean
      /** Lot 22 : des filtres sont actifs (le vide le dit). */
      filtered?: boolean
    }>(),
    {
      view: 'cards',
      drafts: undefined,
      agreement: false,
      expanded: null,
      keepOrder: false,
      filtered: false,
    }
  )
  const emit = defineEmits<{
    'update:expanded': [id: string | null]
    clearFilters: []
  }>()
  const feedback = useFeedbackStore()

  const router = useRouter()
  const draftQueries = useDrafts()
  const { me } = useWorkspace()
  const { data: explorations } = useExplorationList(1)

  const latest = computed(() => explorations.value?.[0] ?? null)
  const decided = ref(new Map<string, ListingDraft>())
  const busy = ref<string | null>(null)
  const errors = ref<Record<string, string>>({})
  const batchMessage = ref<string | null>(null)
  const batchError = ref<string | null>(null)

  const cards = computed(() => {
    const merged = mergeDraftCards(
      props.drafts ? [...props.drafts] : (draftQueries.data.value ?? []),
      decided.value
    )
    if (!props.keepOrder || !props.drafts) return merged
    const rank = new Map(props.drafts.map((d, index) => [d.id, index]))
    const last = props.drafts.length
    return merged.sort(
      (a, b) => (rank.get(a.id) ?? last) - (rank.get(b.id) ?? last)
    )
  })
  /** Lot 21 : les hors critères sont repliés en bas de l'étape (lignes). */
  const listCards = computed(() =>
    cards.value.filter(d => !isFoldedOut(d.fit, d.decision))
  )
  const rows = computed(() => {
    const pending = listCards.value
      .filter(d => d.status === 'pending')
      .map(d => draftRow(d, { meId: me.value?.id ?? null }))
    return props.keepOrder ? pending : orderedRows('a-valider', pending)
  })
  const cardOf = (id: string): ListingDraft | undefined =>
    cards.value.find(d => d.id === id)
  const expandedIds = computed(() => (props.expanded ? [props.expanded] : []))

  /** Lot 21 : le titre d'un brouillon déplie sa carte (il n'a pas de fiche). */
  function toggleExpanded(row: StageRowView): void {
    emit('update:expanded', props.expanded === row.id ? null : row.id)
  }

  function onRowAction(row: StageRowView): void {
    if (row.action.kind === 'sort') {
      void router.push({
        name: 'triage',
        query: { etape: 'a-valider', carte: row.id },
      })
    } else if (row.action.kind === 'confirm') {
      void router.push({
        name: 'triage',
        query: { mode: 'confirmer', carte: row.decision?.id ?? row.id },
      })
    } else if (row.action.kind === 'settle') {
      void router.push({ name: 'settle' })
    } else {
      toggleExpanded(row)
    }
  }
  const pendingCount = computed(
    () =>
      (draftQueries.data.value ?? []).filter(d => d.status === 'pending').length
  )
  const waitingDuplicates = computed(
    () =>
      cards.value.filter(d => d.status === 'pending' && pendingDuplicate(d))
        .length
  )
  const latestPortals = computed(() =>
    (latest.value?.portals ?? [])
      .filter(p => p.status === 'read')
      .map(p => EXPLORATION_PORTAL_LABELS[p.portal])
      .join(', ')
  )

  /** Une décision gardée à sa place ; l'adéquation lue avant la décision reste affichée. */
  function remember(draft: ListingDraft): void {
    const before = cards.value.find(c => c.id === draft.id)
    const next = new Map(decided.value)
    next.set(draft.id, { ...draft, fit: draft.fit ?? before?.fit ?? null })
    decided.value = next
  }

  async function run(id: string, action: () => Promise<void>): Promise<void> {
    busy.value = id
    const { [id]: _drop, ...rest } = errors.value
    errors.value = rest
    try {
      await action()
    } catch (err) {
      errors.value = {
        ...errors.value,
        [id]: errorMessage(err),
      }
    } finally {
      busy.value = null
    }
  }

  const accept = (draft: ListingDraft) =>
    run(draft.id, async () => {
      const result = await draftQueries.accept.mutateAsync(draft.id)
      // Lot 21 : à plusieurs, l'annonce n'est pas créée : le brouillon reste.
      if (result.listingId) remember(result.draft)
    })
  const dismiss = (draft: ListingDraft, reason: string | null) =>
    run(draft.id, async () => {
      const saved = await draftQueries.decide.mutateAsync({
        id: draft.id,
        decision: reason
          ? { status: 'dismissed', reason }
          : { status: 'dismissed' },
      })
      if (saved.status !== 'pending') remember(saved)
    })
  const undo = (draft: ListingDraft) =>
    run(draft.id, async () => {
      remember(
        await draftQueries.decide.mutateAsync({
          id: draft.id,
          decision: { status: 'pending' },
        })
      )
    })
  const same = (draft: ListingDraft, listingId: string) =>
    run(draft.id, async () => {
      remember(
        await draftQueries.merge.mutateAsync({
          id: draft.id,
          request: { listingId },
        })
      )
    })
  const other = (draft: ListingDraft) =>
    run(draft.id, async () => {
      remember(await draftQueries.distinct.mutateAsync(draft.id))
    })
  function edit(draft: ListingDraft): void {
    void router.push({ name: 'listing-new', query: { brouillon: draft.id } })
  }

  async function addAllIn(): Promise<void> {
    batchMessage.value = null
    batchError.value = null
    try {
      const result = await draftQueries.acceptInCriteria.mutateAsync(
        latest.value ? { explorationId: latest.value.id } : {}
      )
      for (const added of result.accepted) {
        const card = cards.value.find(c => c.id === added.draftId)
        // Lot 21 : à plusieurs, le brouillon reste à valider (une proposition).
        if (card && added.listingId) {
          remember({ ...card, status: 'accepted', listingId: added.listingId })
        }
      }
      const text = result.proposed
        ? `${plural(result.proposed, 'proposition envoyée', 'propositions envoyées')} : l’annonce naît à l’accord complet.`
        : result.accepted.length
          ? `${plural(result.accepted.length, 'annonce ajoutée', 'annonces ajoutées')} à la liste.`
          : null
      if (text) feedback.success(text)
      else
        batchMessage.value =
          'Aucune annonce « dans les critères » sans doublon à trancher.'
    } catch (err) {
      batchError.value = errorMessage(err, 'L’ajout a échoué.')
    }
  }
</script>

<template>
  <section class="grid gap-4" data-testid="drafts-tab">
    <p
      v-if="view === 'cards'"
      class="max-w-3xl text-sm leading-normal text-muted"
    >
      Claude n’ajoute aucune annonce de lui-même : chaque annonce trouvée attend
      ton choix. Ajoutée, elle rejoint la liste avec sa fiche pré-remplie ;
      écartée, Claude ne la proposera plus. Seul le lien d’une annonce déjà
      suivie (même agence, même référence) rejoint sa fiche d’office.
    </p>

    <QueryState
      :query="draftQueries"
      :empty="cards.length === 0"
      :filtered="filtered && (draftQueries.data.value?.length ?? 0) > 0"
      skeleton="rows"
      loading-label="les annonces à valider"
      error-fallback="Impossible de lire les annonces à valider."
      @clear-filters="emit('clearFilters')"
    >
      <template #empty>
        <UiCard data-testid="drafts-empty" class="grid gap-2 text-sm">
          <p class="font-semibold">Rien à valider.</p>
          <p class="text-muted">
            Les annonces reçues par e-mail et celles que Claude trouve en
            explorant les portails arrivent ici.
            <RouterLink
              :to="{ name: 'criteria' }"
              class="font-semibold text-accent underline-offset-2 hover:underline"
              >Lancer une exploration</RouterLink
            >
            depuis la page Critères.
          </p>
          <template
            v-if="filtered && (draftQueries.data.value?.length ?? 0) > 0"
          >
            <p class="text-muted">
              Des filtres sont actifs : ils cachent
              {{
                plural(
                  draftQueries.data.value?.length ?? 0,
                  'annonce en attente',
                  'annonces en attente'
                )
              }}.
            </p>
            <UiButton
              size="sm"
              class="w-fit"
              data-testid="clear-filters"
              @click="emit('clearFilters')"
              >Effacer les filtres</UiButton
            >
          </template>
        </UiCard>
      </template>
      <StageRows
        v-if="view === 'list'"
        :rows="rows"
        :expanded="expandedIds"
        @open="toggleExpanded"
        @action="onRowAction"
      >
        <template #expanded="{ row }">
          <DraftCard
            v-if="cardOf(row.id)"
            :draft="cardOf(row.id)!"
            :busy="busy === row.id"
            :error="errors[row.id] ?? null"
            :agreement="agreement"
            @accept="accept(cardOf(row.id)!)"
            @edit="edit(cardOf(row.id)!)"
            @dismiss="reason => dismiss(cardOf(row.id)!, reason)"
            @undo="undo(cardOf(row.id)!)"
            @same="listingId => same(cardOf(row.id)!, listingId)"
            @other="other(cardOf(row.id)!)"
          />
        </template>
      </StageRows>
      <div v-else class="grid gap-3">
        <DraftCard
          v-for="draft in cards"
          :key="draft.id"
          :draft="draft"
          :busy="busy === draft.id"
          :error="errors[draft.id] ?? null"
          :agreement="agreement"
          @accept="accept(draft)"
          @edit="edit(draft)"
          @dismiss="reason => dismiss(draft, reason)"
          @undo="undo(draft)"
          @same="listingId => same(draft, listingId)"
          @other="other(draft)"
        />
      </div>
    </QueryState>

    <UiCard
      v-if="latest"
      aria-labelledby="run-title"
      class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3"
      data-testid="exploration-banner"
    >
      <div class="grid min-w-0 flex-[1_1_26rem] gap-1">
        <h2 id="run-title" class="text-base font-semibold">
          {{ explorationHeading(latest) }}
        </h2>
        <p class="text-sm leading-normal text-muted">
          <template v-if="latest.criteria.length"
            >{{ plural(latest.criteria.length, 'critère') }} ·
          </template>
          <template v-if="latestPortals">{{ latestPortals }} · </template>
          {{ latest.summary }}.
          <RouterLink
            :to="{ name: 'exploration', params: { id: latest.id } }"
            class="text-accent underline-offset-2 hover:underline"
            >Voir le compte rendu</RouterLink
          >
        </p>
      </div>
      <div class="grid justify-items-stretch gap-1 sm:justify-items-end">
        <UiButton
          variant="primary"
          :loading="draftQueries.acceptInCriteria.isPending.value"
          :disabled="pendingCount === 0"
          data-action="add-all-in"
          @click="addAllIn"
        >
          {{
            agreement
              ? 'Proposer celles « dans les critères »'
              : 'Ajouter celles « dans les critères »'
          }}
        </UiButton>
        <span
          v-if="waitingDuplicates"
          class="text-sm text-muted"
          data-testid="waiting-duplicates"
          >{{
            waitingDuplicates > 1
              ? `${waitingDuplicates} doublons probables attendent toujours ton choix.`
              : 'Un doublon probable attend toujours ton choix.'
          }}</span
        >
        <span
          v-if="batchMessage"
          class="text-sm text-muted"
          role="status"
          data-testid="batch-message"
          >{{ batchMessage }}</span
        >
        <UiAlert v-if="batchError" data-testid="batch-message">{{
          batchError
        }}</UiAlert>
      </div>
    </UiCard>

    <AttachedLinks />

    <p
      v-if="latest && latest.counts.out > 0"
      class="rounded-xl border border-dashed border-line px-4 py-3.5 text-sm leading-normal text-muted"
      data-testid="out-note"
    >
      {{
        latest.counts.out > 1
          ? `Les ${latest.counts.out} annonces vues hors critères`
          : 'L’annonce vue hors critères'
      }}, même avec la marge, ne sont pas proposées ici. Elles restent dans le
      <RouterLink
        :to="{ name: 'exploration', params: { id: latest.id } }"
        class="text-accent underline-offset-2 hover:underline"
        >compte rendu</RouterLink
      >, avec la raison : si un critère s’élargit, Claude les retrouvera.
    </p>
  </section>
</template>
