<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { EXPLORATION_PORTAL_LABELS } from '@apart/contracts'
  import type { ListingDraft } from '@apart/contracts'
  import { explorationHeading } from '@apart/domain'
  import { useDrafts } from '@/composables/useDrafts'
  import { useExplorationList } from '@/composables/useExplorations'
  import { ApiError } from '@/lib/api'
  import { mergeDraftCards, pendingDuplicate } from '@/lib/drafts'
  import DraftCard from './DraftCard.vue'

  /**
   * Lot 16 : l'onglet « À valider » de la page Annonces : tous les
   * brouillons en attente (alertes e-mail et explorations de Claude), le
   * bandeau de la dernière exploration (résumé, compte rendu, « Ajouter
   * celles « dans les critères » »), et les décisions de la session gardées
   * à leur place (« Ajoutée », « Écartée… Annuler », « Fiche mise à jour »).
   */
  const router = useRouter()
  const drafts = useDrafts()
  const { data: explorations } = useExplorationList(1)

  const latest = computed(() => explorations.value?.[0] ?? null)
  const decided = ref(new Map<string, ListingDraft>())
  const busy = ref<string | null>(null)
  const errors = ref<Record<string, string>>({})
  const batchMessage = ref<string | null>(null)

  const cards = computed(() =>
    mergeDraftCards(drafts.data.value ?? [], decided.value)
  )
  const pendingCount = computed(
    () => (drafts.data.value ?? []).filter(d => d.status === 'pending').length
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
        [id]: err instanceof ApiError ? err.message : 'L’action a échoué.',
      }
    } finally {
      busy.value = null
    }
  }

  const accept = (draft: ListingDraft) =>
    run(draft.id, async () => {
      const result = await drafts.accept.mutateAsync(draft.id)
      remember(result.draft)
    })
  const dismiss = (draft: ListingDraft, reason: string | null) =>
    run(draft.id, async () => {
      remember(
        await drafts.decide.mutateAsync({
          id: draft.id,
          decision: reason
            ? { status: 'dismissed', reason }
            : { status: 'dismissed' },
        })
      )
    })
  const undo = (draft: ListingDraft) =>
    run(draft.id, async () => {
      remember(
        await drafts.decide.mutateAsync({
          id: draft.id,
          decision: { status: 'pending' },
        })
      )
    })
  const same = (draft: ListingDraft, listingId: string) =>
    run(draft.id, async () => {
      remember(
        await drafts.merge.mutateAsync({ id: draft.id, request: { listingId } })
      )
    })
  const other = (draft: ListingDraft) =>
    run(draft.id, async () => {
      remember(await drafts.distinct.mutateAsync(draft.id))
    })
  function edit(draft: ListingDraft): void {
    void router.push({ name: 'listing-new', query: { brouillon: draft.id } })
  }

  async function addAllIn(): Promise<void> {
    batchMessage.value = null
    try {
      const result = await drafts.acceptInCriteria.mutateAsync(
        latest.value ? { explorationId: latest.value.id } : {}
      )
      for (const added of result.accepted) {
        const card = cards.value.find(c => c.id === added.draftId)
        if (card) {
          remember({ ...card, status: 'accepted', listingId: added.listingId })
        }
      }
      batchMessage.value = result.accepted.length
        ? `${result.accepted.length} annonce(s) ajoutée(s) à la liste.`
        : 'Aucune annonce « dans les critères » sans doublon à trancher.'
    } catch (err) {
      batchMessage.value =
        err instanceof ApiError ? err.message : 'L’ajout a échoué.'
    }
  }
</script>

<template>
  <section class="grid gap-4" data-testid="drafts-tab">
    <section
      v-if="latest"
      aria-labelledby="run-title"
      class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-line bg-surface p-4 sm:px-5"
      data-testid="exploration-banner"
    >
      <div class="grid min-w-0 flex-[1_1_26rem] gap-1">
        <h2 id="run-title" class="text-[15px] font-semibold">
          {{ explorationHeading(latest) }}
        </h2>
        <p class="text-[13px] leading-normal text-muted">
          <template v-if="latest.criteria.length"
            >{{ latest.criteria.length }} critère(s) ·
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
        <button
          type="button"
          class="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-60"
          :disabled="
            drafts.acceptInCriteria.isPending.value || pendingCount === 0
          "
          data-action="add-all-in"
          @click="addAllIn"
        >
          Ajouter celles « dans les critères »
        </button>
        <span
          v-if="waitingDuplicates"
          class="text-xs text-muted"
          data-testid="waiting-duplicates"
          >{{
            waitingDuplicates > 1
              ? `${waitingDuplicates} doublons probables attendent toujours votre choix.`
              : 'Un doublon probable attend toujours votre choix.'
          }}</span
        >
        <span
          v-if="batchMessage"
          class="text-xs text-muted"
          role="status"
          data-testid="batch-message"
          >{{ batchMessage }}</span
        >
      </div>
    </section>

    <p class="max-w-3xl text-[13px] leading-normal text-muted">
      Claude n’ajoute rien de lui-même : chaque annonce trouvée attend votre
      choix. Ajoutée, elle rejoint la liste avec sa fiche pré-remplie ; écartée,
      Claude ne la proposera plus.
    </p>

    <p v-if="drafts.isPending.value" class="text-sm text-muted">
      Chargement des annonces à valider…
    </p>
    <p
      v-else-if="cards.length === 0"
      class="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted"
      data-testid="drafts-empty"
    >
      Rien à valider. Les annonces reçues par e-mail et celles que Claude trouve
      en explorant les portails arrivent ici.
      <RouterLink
        :to="{ name: 'criteria' }"
        class="font-semibold text-accent underline-offset-2 hover:underline"
        >Lancer une exploration</RouterLink
      >
      depuis la page Critères.
    </p>
    <div v-else class="grid gap-3">
      <DraftCard
        v-for="draft in cards"
        :key="draft.id"
        :draft="draft"
        :busy="busy === draft.id"
        :error="errors[draft.id] ?? null"
        @accept="accept(draft)"
        @edit="edit(draft)"
        @dismiss="reason => dismiss(draft, reason)"
        @undo="undo(draft)"
        @same="listingId => same(draft, listingId)"
        @other="other(draft)"
      />
    </div>

    <p
      v-if="latest && latest.counts.out > 0"
      class="rounded-xl border border-dashed border-line px-4 py-3.5 text-[13px] leading-normal text-muted"
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
