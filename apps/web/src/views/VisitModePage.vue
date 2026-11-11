<script setup lang="ts">
  import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    watch,
  } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { useQueryClient } from '@tanstack/vue-query'
  import type {
    EvaluatedListing,
    ListingStatus,
    Member,
    Opinion,
    Task,
    Visit,
  } from '@apart/contracts'
  import { VISIT_REMARK_MAX } from '@apart/contracts'
  import {
    VISIT_EDIT_REFUSAL,
    canEditVisit,
    effectiveOpinionCriteria,
    visibleCriterionKeys,
    visitDayLabel,
    visitModeVisit,
    visitPoints,
    visitPointsProgress,
  } from '@apart/domain'
  import ScoreRadioGroup from '@/components/listings/opinions/ScoreRadioGroup.vue'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiField from '@/components/ui/UiField.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import VisitPendingList from '@/components/visit-mode/VisitPendingList.vue'
  import { useListing, useListingMutations } from '@/composables/useListings'
  import { useOutbox } from '@/composables/useOutbox'
  import { useVisits } from '@/composables/useVisits'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { errorMessage, isNetworkError } from '@/lib/errors'
  import { LISTING_STATUS_LABELS } from '@/lib/labels'
  import { GLOBAL_CHOICES, SCORE_CHOICES } from '@/lib/opinions'
  import { TEXT_HOLD_MS } from '@/lib/outbox'
  import type { OutboxEntry, OutboxOp } from '@/lib/outbox'
  import { PhotoRejectedError, preparePhoto } from '@/lib/photos'
  import { buttonClasses, cardClasses } from '@/lib/ui'
  import {
    localVisits,
    myScoresOf,
    pendingPhotos,
    projectScores,
    projectTaskDone,
    projectVisit,
    visitFinishLabel,
    visitViewOf,
  } from '@/lib/visit-mode'
  import type { VisitView } from '@/lib/visit-mode'
  import { useAuthStore } from '@/stores/auth'
  import { useFeedbackStore } from '@/stores/feedback'

  /**
   * Lot 24 (ADR 0034) : le mode visite, un seul écran plein écran (sans la
   * barre du bas) pour la visite sur place, d'une main : les points à
   * vérifier (cochables), la photo (appareil ou photothèque), une remarque
   * rapide, mes notes par critère (la saisie du lot 20 : notes fusionnées par
   * clé, garde-fou, à l'aveugle : les notes des autres ne s'affichent pas
   * ici) et le compte rendu. Tout passe par la file des écritures en attente
   * (`useOutbox`) : gardé sur l'appareil d'abord, envoyé dans l'ordre, et
   * l'écran dit ce qui n'est pas encore parti. Les actions principales sont
   * en bas.
   */
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()
  const feedback = useFeedbackStore()
  const outbox = useOutbox()
  outbox.setQueryClient(useQueryClient())

  const listingId = computed(() => String(route.params.id ?? ''))
  const listingQuery = useListing(listingId)
  const visitsQuery = useVisits(listingId)
  const { me, members } = useWorkspace()
  const mutations = useListingMutations()
  const meId = computed(() => me.value?.id ?? null)

  // -------------------------------------------------------------------------
  // Le dernier état lu, gardé sur l'appareil (rouvrir l'écran sans réseau)
  // -------------------------------------------------------------------------

  interface Snapshot {
    listing: {
      id: string
      title: string
      status: ListingStatus
      commune: string | null
    }
    tasks: Task[]
    mine: Opinion | null
    criteria: { key: string; label: string; hint: string }[]
    visits: Visit[]
    members: Pick<Member, 'id' | 'displayName' | 'status'>[]
    savedAt: string
  }
  const snapshot = ref<Snapshot | null>(null)
  const snapshotKey = computed(
    () => `visit-mode:${auth.user?.id ?? 'anonyme'}:${listingId.value}`
  )

  function criteriaOf(item: EvaluatedListing) {
    const rows = item.opinionSummary?.rows
    if (rows?.length) {
      return rows.map(r => ({ key: r.key, label: r.label, hint: r.hint }))
    }
    const all = effectiveOpinionCriteria(null)
    const keys = visibleCriterionKeys(all)
    return all
      .filter(c => keys.has(c.key))
      .map(c => ({ key: c.key, label: c.label, hint: c.hint ?? '' }))
  }

  const live = computed<Snapshot | null>(() => {
    const item = listingQuery.data.value
    const visits = visitsQuery.data.value
    if (!item || !visits) return null
    return {
      listing: {
        id: item.listing.id,
        title: item.listing.title,
        status: item.listing.status,
        commune: item.listing.location.commune ?? null,
      },
      tasks: item.tasks,
      mine: item.opinions.find(o => o.memberId === meId.value) ?? null,
      criteria: criteriaOf(item),
      visits,
      members: members.value.map(m => ({
        id: m.id,
        displayName: m.displayName,
        status: m.status,
      })),
      savedAt: new Date().toISOString(),
    }
  })
  watch(live, value => {
    if (!value) return
    // Sans les photos : leurs liens signés ne se gardent pas sur l'appareil.
    void outbox.saveSnapshot(snapshotKey.value, {
      ...value,
      visits: value.visits.map(v => ({ ...v, photos: [] })),
    })
  })
  const context = computed(() => live.value ?? snapshot.value)
  const fromSnapshot = computed(() => !live.value && snapshot.value !== null)
  const failed = computed(
    () =>
      (listingQuery.isError.value || visitsQuery.isError.value) &&
      !snapshot.value
  )

  onMounted(async () => {
    if (auth.user) await outbox.start(auth.user.id, meId.value)
    snapshot.value = await outbox.readSnapshot<Snapshot>(snapshotKey.value)
  })
  watch(meId, id => {
    if (auth.user && id) void outbox.start(auth.user.id, id)
  })

  // -------------------------------------------------------------------------
  // La visite
  // -------------------------------------------------------------------------

  /**
   * Ce que l'écran superpose à la lecture du serveur : les écritures passées
   * que la lecture ne contient pas encore (réponse reçue, relecture en
   * route), puis celles qui attendent.
   */
  const outboxData = computed(() => {
    const data = outbox.data.value
    const listingRead = listingQuery.dataUpdatedAt?.value ?? 0
    const visitsRead = visitsQuery.dataUpdatedAt?.value ?? 0
    const recent = outbox.confirmed.value
      .filter(({ entry, at }) => {
        if (entry.op.listingId !== listingId.value) return false
        const read =
          entry.op.kind === 'task' || entry.op.kind === 'opinion'
            ? listingRead
            : visitsRead
        return at > read
      })
      .map(c => c.entry)
      // Une visite créée est déjà dans la lecture ou le sera : pas de doublon local.
      .filter(e => e.op.kind !== 'visit-create' && e.op.kind !== 'photo')
    return { ...data, entries: [...recent, ...data.entries] }
  })
  const now = ref(new Date())
  const visitViews = computed<VisitView[]>(() => {
    const server = (context.value?.visits ?? []).map(visitViewOf)
    return [
      ...server,
      ...localVisits(outboxData.value, listingId.value, meId.value),
    ]
  })
  const chosenRef = ref<string | null>(
    typeof route.query.visite === 'string' ? route.query.visite : null
  )
  const baseVisit = computed<VisitView | null>(() => {
    const list = visitViews.value
    const chosen = chosenRef.value
      ? list.find(v => v.ref === chosenRef.value)
      : null
    if (chosen) return chosen
    const picked = visitModeVisit(
      list.map(v => ({ ...v, id: v.ref })),
      now.value
    )
    return picked ? (list.find(v => v.ref === picked.id) ?? null) : null
  })
  const visit = computed(() =>
    baseVisit.value ? projectVisit(baseVisit.value, outboxData.value) : null
  )
  const serverVisit = computed(
    () => context.value?.visits.find(v => v.id === baseVisit.value?.ref) ?? null
  )
  const canEdit = computed(
    () =>
      visit.value !== null &&
      meId.value !== null &&
      canEditVisit(visit.value, meId.value)
  )
  const whenText = computed(() =>
    visit.value ? visitDayLabel(visit.value.visitedAt, now.value) : null
  )

  function startVisit(): void {
    const localId = crypto.randomUUID()
    const at = new Date().toISOString()
    void outbox.add({
      kind: 'visit-create',
      listingId: listingId.value,
      localId,
      input: {
        visitedAt: at,
        status: 'planned',
        participantIds: meId.value ? [meId.value] : [],
      },
    })
    chosenRef.value = `local:${localId}`
  }

  // -------------------------------------------------------------------------
  // Les points à vérifier
  // -------------------------------------------------------------------------

  const points = computed(() =>
    visitPoints(
      (context.value?.tasks ?? []).map(t => ({
        ...t,
        done: projectTaskDone(t.id, t.done, outboxData.value),
      }))
    )
  )
  const progress = computed(() => visitPointsProgress(points.value))
  function tick(id: string, label: string, done: boolean): void {
    void outbox.add({
      kind: 'task',
      listingId: listingId.value,
      taskId: id,
      done,
      label,
    })
  }

  // -------------------------------------------------------------------------
  // Les photos
  // -------------------------------------------------------------------------

  const photoError = ref<string | null>(null)
  const preparing = ref(0)
  async function onPhotos(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const files = [...(input.files ?? [])]
    input.value = ''
    const target = visit.value
    if (!target || files.length === 0) return
    photoError.value = null
    for (const file of files) {
      preparing.value += 1
      try {
        const prepared = await preparePhoto(file)
        await outbox.add(
          {
            kind: 'photo',
            listingId: listingId.value,
            visitRef: target.ref,
            name: file.name || 'Photo',
            meta: {
              contentType: prepared.photoType,
              sizeBytes: prepared.photo.size,
              width: prepared.width,
              height: prepared.height,
              thumbnail: {
                contentType: prepared.thumbnailType,
                sizeBytes: prepared.thumbnail.size,
              },
            },
            progress: null,
          },
          { blobs: { photo: prepared.photo, thumbnail: prepared.thumbnail } }
        )
      } catch (error) {
        photoError.value =
          error instanceof PhotoRejectedError
            ? error.message
            : errorMessage(error, 'La photo n’a pas pu être préparée.')
      } finally {
        preparing.value -= 1
      }
    }
  }
  const waitingPhotos = computed(() =>
    visit.value ? pendingPhotos(outboxData.value, visit.value) : []
  )
  /** Les aperçus des photos qui attendent, lus sur l'appareil. */
  const previews = ref<Record<string, string>>({})
  watch(
    waitingPhotos,
    async entries => {
      const ids = new Set(entries.map(e => e.id))
      for (const [id, url] of Object.entries(previews.value)) {
        if (!ids.has(id)) {
          URL.revokeObjectURL(url)
          const { [id]: _gone, ...rest } = previews.value
          previews.value = rest
        }
      }
      for (const entry of entries) {
        if (previews.value[entry.id]) continue
        const blobs = await outbox.blobsOf(entry.id)
        if (blobs && typeof URL.createObjectURL === 'function') {
          previews.value = {
            ...previews.value,
            [entry.id]: URL.createObjectURL(blobs.thumbnail),
          }
        }
      }
    },
    { immediate: true }
  )
  onBeforeUnmount(() => {
    for (const url of Object.values(previews.value)) URL.revokeObjectURL(url)
  })
  const serverPhotos = computed(() => serverVisit.value?.photos ?? [])
  const fileButton = buttonClasses({ variant: 'secondary', block: true })

  // -------------------------------------------------------------------------
  // La remarque rapide
  // -------------------------------------------------------------------------

  const remark = ref('')
  const remarkError = ref<string | null>(null)
  function addRemark(): void {
    const text = remark.value.trim()
    if (!text) {
      remarkError.value = 'Écris la remarque.'
      return
    }
    if (!visit.value) return
    remarkError.value = null
    void outbox.add({
      kind: 'remark',
      listingId: listingId.value,
      visitRef: visit.value.ref,
      text,
      at: new Date().toISOString(),
    })
    remark.value = ''
    feedback.success('Remarque ajoutée au compte rendu.')
  }

  // -------------------------------------------------------------------------
  // Mes notes
  // -------------------------------------------------------------------------

  const criteria = computed(() => context.value?.criteria ?? [])
  const mine = computed(() =>
    projectScores(
      myScoresOf(context.value?.mine ?? null),
      listingId.value,
      outboxData.value
    )
  )
  const ratedCount = computed(
    () =>
      criteria.value.filter(
        c => (mine.value.scores[c.key]?.score ?? null) !== null
      ).length
  )
  const serverBase = computed(() => context.value?.mine?.updatedAt ?? null)
  function opinionOp(
    patch: Partial<
      Pick<Extract<OutboxOp, { kind: 'opinion' }>, 'scores' | 'labels'>
    > & {
      rating?: number
    }
  ): OutboxOp {
    return {
      kind: 'opinion',
      listingId: listingId.value,
      rating: patch.rating ?? mine.value.rating,
      text: mine.value.text,
      ratingChanged: patch.rating !== undefined,
      scores: patch.scores ?? {},
      labels: patch.labels ?? {},
      base: serverBase.value,
    }
  }
  function setScore(key: string, label: string, score: number | null): void {
    const word = mine.value.scores[key]?.word ?? null
    void outbox.add(
      opinionOp({
        scores: { [key]: score === null && !word ? null : { score, word } },
        labels: { [key]: label },
      })
    )
  }
  function setRating(value: number | null): void {
    void outbox.add(opinionOp({ rating: value ?? 0 }))
  }

  // -------------------------------------------------------------------------
  // Le compte rendu
  // -------------------------------------------------------------------------

  type TextField = 'report' | 'pros' | 'cons'
  const drafts = ref<Record<TextField, string>>({
    report: '',
    pros: '',
    cons: '',
  })
  const focused = ref<TextField | null>(null)
  watch(
    visit,
    value => {
      for (const field of ['report', 'pros', 'cons'] as const) {
        if (focused.value !== field) drafts.value[field] = value?.[field] ?? ''
      }
    },
    { immediate: true }
  )
  function visitOp(
    changes: Extract<OutboxOp, { kind: 'visit' }>['changes'],
    holdMs = 0
  ) {
    if (!visit.value) return Promise.resolve('')
    return outbox.add(
      {
        kind: 'visit',
        listingId: listingId.value,
        visitRef: visit.value.ref,
        changes,
        base: baseVisit.value?.updatedAt ?? null,
      },
      { holdMs }
    )
  }
  /** Le texte saisi entre dans la file (regroupé tant qu'on tape). */
  function commitText(field: TextField): Promise<string> {
    const value = drafts.value[field].trim() || null
    if (!visit.value || value === (visit.value[field] ?? null)) {
      return Promise.resolve('')
    }
    return visitOp({ [field]: value }, TEXT_HOLD_MS)
  }
  function onText(field: TextField, value: string): void {
    drafts.value[field] = value
    void commitText(field)
  }
  function setVisitRating(value: number | null): void {
    void visitOp({ rating: value ?? 0 })
  }
  function toggleParticipant(id: string, on: boolean): void {
    if (!visit.value) return
    const current = new Set(visit.value.participantIds)
    if (on) current.add(id)
    else current.delete(id)
    void visitOp({ participantIds: [...current] })
  }
  const participantChoices = computed(() =>
    (context.value?.members ?? []).filter(
      m => m.status === 'active' || visit.value?.participantIds.includes(m.id)
    )
  )

  // -------------------------------------------------------------------------
  // Terminer, fermer
  // -------------------------------------------------------------------------

  const finished = ref(false)
  const statusError = ref<string | null>(null)
  const statusBusy = ref(false)
  const suggested = computed<ListingStatus | null>(() => {
    const status = context.value?.listing.status
    return finished.value && (status === 'to_study' || status === 'to_visit')
      ? 'visited'
      : null
  })

  async function commitAll(): Promise<void> {
    for (const field of ['report', 'pros', 'cons'] as const) {
      await commitText(field)
    }
    await outbox.flush()
  }

  async function finish(): Promise<void> {
    if (!visit.value) return
    await commitAll()
    if (visit.value.status === 'planned') {
      await visitOp({ status: 'done' })
      await outbox.flush()
      finished.value = true
      feedback.success(
        outbox.isOnline.value
          ? 'Visite marquée faite.'
          : 'Visite marquée faite : elle partira avec le reste quand le réseau reviendra.'
      )
      await nextTick()
      const card = document.getElementById('visit-finished')
      card?.focus({ preventScroll: true })
      card?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      return
    }
    await close()
  }

  async function applySuggested(): Promise<void> {
    const status = suggested.value
    const item = listingQuery.data.value
    if (!status || !item) return
    statusBusy.value = true
    statusError.value = null
    try {
      const result = await mutations.setStatus.mutateAsync({
        id: item.listing.id,
        change: { status, reason: null, expectedStatus: item.listing.status },
      })
      feedback.success(
        result.listing.status === status
          ? `Annonce passée en « ${LISTING_STATUS_LABELS[status]} ».`
          : 'C’est proposé en ton nom : l’autre membre confirme.'
      )
      finished.value = false
      await close()
    } catch (error) {
      statusError.value = isNetworkError(error)
        ? 'Pas de réseau : change le statut depuis la fiche quand il reviendra.'
        : errorMessage(error, 'Le statut n’a pas pu être changé.')
    } finally {
      statusBusy.value = false
    }
  }

  async function close(): Promise<void> {
    await commitAll()
    const left = outbox.summary.value
    if (!left.clear) {
      feedback.notify(
        `${left.text} : ils partiront tout seuls, même depuis une autre page.`,
        { tone: left.tone === 'bad' ? 'bad' : 'info' }
      )
    }
    if (window.history.state?.back) router.back()
    else
      await router.push({
        name: 'listing',
        params: { id: listingId.value },
        query: { onglet: 'a-faire' },
      })
  }

  onBeforeUnmount(() => {
    void commitAll()
  })

  // La zone de messages se pose au-dessus de la barre d'actions du bas.
  onMounted(() => {
    document.documentElement.style.setProperty('--bottom-nav', '5.25rem')
  })
  onBeforeUnmount(() => {
    document.documentElement.style.removeProperty('--bottom-nav')
  })

  // -------------------------------------------------------------------------
  // Ce qui attend
  // -------------------------------------------------------------------------

  const pendingOpen = ref(false)
  const listingEntries = computed<OutboxEntry[]>(() =>
    outbox.entries.value.filter(e => e.op.listingId === listingId.value)
  )
  const otherEntries = computed(
    () => outbox.entries.value.length - listingEntries.value.length
  )
  const summary = computed(() => outbox.summary.value)

  const card = cardClasses('default', 'sm')
  const memberName = (id: string) =>
    context.value?.members.find(m => m.id === id)?.displayName ??
    'Ancien membre'
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-bg text-fg" data-testid="visit-mode">
    <header
      class="sticky top-0 z-20 border-b border-line bg-surface pt-[env(safe-area-inset-top)]"
    >
      <div
        class="mx-auto flex w-full max-w-[40rem] items-center gap-2 px-4 py-2"
      >
        <UiButton
          variant="ghost"
          size="icon"
          icon="arrow-left"
          aria-label="Fermer le mode visite"
          data-testid="visit-mode-close"
          @click="close"
        />
        <div class="grid min-w-0 flex-1 leading-tight">
          <h1 class="truncate font-display text-base font-bold">
            {{ context?.listing.title ?? 'Mode visite' }}
          </h1>
          <span class="truncate text-sm text-muted">
            Visite<template v-if="whenText"> · {{ whenText }}</template
            ><template v-if="context?.listing.commune">
              · {{ context.listing.commune }}</template
            >
          </span>
        </div>
        <UiButton
          size="sm"
          :aria-expanded="pendingOpen"
          aria-controls="visit-pending"
          data-testid="visit-sync"
          :data-tone="summary.tone"
          :class="
            summary.tone === 'good'
              ? 'text-good'
              : summary.tone === 'bad'
                ? 'text-bad'
                : summary.tone === 'warn'
                  ? 'text-warn'
                  : 'text-info'
          "
          @click="pendingOpen = !pendingOpen"
        >
          <UiIcon
            :name="
              summary.clear
                ? 'check'
                : summary.tone === 'bad'
                  ? 'alert'
                  : 'clock'
            "
          />
          <span class="max-w-[9rem] truncate">{{
            summary.clear ? 'Envoyé' : summary.pending + summary.blocked
          }}</span>
        </UiButton>
      </div>
      <div
        v-if="pendingOpen || summary.blocked > 0"
        id="visit-pending"
        class="mx-auto max-h-[50dvh] w-full max-w-[40rem] overflow-y-auto px-4 pb-3"
      >
        <VisitPendingList
          :entries="listingEntries"
          :others="otherEntries"
          :summary="summary"
          :persistent="outbox.persistent.value"
          @retry="id => outbox.retry(id)"
          @discard="id => outbox.discard(id)"
        />
      </div>
    </header>

    <main
      class="mx-auto grid w-full max-w-[40rem] flex-1 content-start gap-4 px-4 pt-4 pb-32"
    >
      <p
        v-if="fromSnapshot"
        class="rounded-xl bg-warn-soft px-3 py-2 text-sm"
        data-testid="visit-snapshot"
      >
        Pas de réseau : l’écran montre ce qui a été lu le
        {{ new Date(snapshot?.savedAt ?? '').toLocaleString('fr-FR') }}. Ce que
        tu fais est gardé sur l’appareil et partira au retour du réseau.
      </p>

      <QueryState
        :query="failed ? [listingQuery, visitsQuery] : []"
        :pending="!context && !failed"
        loading-label="la visite"
        skeleton="rows"
      >
        <template v-if="context">
          <section
            v-if="!visit"
            :class="card"
            class="grid gap-3"
            data-testid="visit-none"
          >
            <h2 class="font-display text-base font-bold">
              Pas de visite prévue
            </h2>
            <p class="text-sm text-muted">
              Commence-la maintenant : tes photos, remarques et notes s’y
              rangent.
            </p>
            <UiButton
              variant="primary"
              block
              data-testid="visit-start"
              @click="startVisit"
            >
              Commencer la visite maintenant
            </UiButton>
          </section>

          <template v-else>
            <!-- Les points à vérifier -->
            <section
              :class="card"
              class="grid gap-2"
              aria-labelledby="vm-points"
            >
              <div class="flex items-baseline justify-between gap-2">
                <h2 id="vm-points" class="font-display text-base font-bold">
                  À vérifier
                </h2>
                <span
                  v-if="progress.total"
                  class="text-sm text-muted"
                  data-testid="visit-points-progress"
                  >{{ progress.done }} sur {{ progress.total }}</span
                >
              </div>
              <ul
                v-if="points.length"
                class="grid gap-1"
                data-testid="visit-points"
              >
                <li
                  v-for="point in points"
                  :key="point.id"
                  class="flex items-start gap-2"
                  :data-point="point.id"
                >
                  <UiCheckbox
                    :model-value="point.done"
                    :label="point.label"
                    class="flex-1"
                    :data-testid="`visit-point-${point.id}`"
                    @update:model-value="
                      value => tick(point.id, point.label, Boolean(value))
                    "
                  />
                  <UiBadge v-if="point.kind === 'counter_visit'" tone="opinion"
                    >Contre-visite</UiBadge
                  >
                </li>
              </ul>
              <p
                v-else
                class="text-sm text-muted"
                data-testid="visit-points-empty"
              >
                Rien à vérifier : les tâches « Vérifier … », « Évaluer … » et
                les points à revoir à la contre-visite s’affichent ici.
              </p>
            </section>

            <!-- Les photos -->
            <section
              :class="card"
              class="grid gap-3"
              aria-labelledby="vm-photos"
            >
              <h2 id="vm-photos" class="font-display text-base font-bold">
                Photos
              </h2>
              <div class="grid grid-cols-2 gap-2">
                <label :class="fileButton" class="cursor-pointer">
                  <UiIcon name="camera" />
                  Prendre une photo
                  <!-- Lot 24 : l'appareil photo (capture) ; Lot 22 : champ de fichier caché derrière le bouton. -->
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    class="sr-only"
                    data-testid="visit-camera"
                    @change="onPhotos"
                  />
                </label>
                <label :class="fileButton" class="cursor-pointer">
                  <UiIcon name="image" />
                  Photothèque
                  <!-- Lot 22 : le sélecteur de fichiers du système, caché derrière le bouton. -->
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    class="sr-only"
                    data-testid="visit-library"
                    @change="onPhotos"
                  />
                </label>
              </div>
              <p v-if="preparing" class="text-sm text-muted" aria-live="polite">
                Réduction de la photo…
              </p>
              <UiAlert v-if="photoError">{{ photoError }}</UiAlert>
              <ul
                v-if="serverPhotos.length || waitingPhotos.length"
                class="grid grid-cols-3 gap-2"
                data-testid="visit-photos"
              >
                <li v-for="photo in serverPhotos" :key="photo.id">
                  <img
                    v-if="photo.thumbnailUrl ?? photo.url"
                    :src="photo.thumbnailUrl ?? photo.url ?? ''"
                    :alt="photo.caption ?? 'Photo de visite'"
                    class="aspect-square w-full rounded-lg object-cover"
                    loading="lazy"
                  />
                </li>
                <li
                  v-for="entry in waitingPhotos"
                  :key="entry.id"
                  class="relative"
                  data-testid="visit-photo-pending"
                >
                  <img
                    v-if="previews[entry.id]"
                    :src="previews[entry.id]"
                    alt="Photo en attente d’envoi"
                    class="aspect-square w-full rounded-lg object-cover opacity-80"
                  />
                  <span
                    v-else
                    class="grid aspect-square place-items-center rounded-lg bg-surface-2 text-sm text-muted"
                    >Photo</span
                  >
                  <UiBadge
                    :tone="entry.state === 'blocked' ? 'bad' : 'warn'"
                    class="absolute bottom-1 left-1"
                    >{{
                      entry.state === 'blocked' ? 'à revoir' : 'en attente'
                    }}</UiBadge
                  >
                </li>
              </ul>
              <p class="text-sm text-muted">
                Réduites sur l’appareil, sans position GPS ; gardées sur
                l’appareil jusqu’à leur envoi, puis rangées dans le stockage
                privé.
              </p>
            </section>

            <!-- La remarque rapide -->
            <section
              :class="card"
              class="grid gap-2"
              aria-labelledby="vm-remark"
            >
              <h2 id="vm-remark" class="font-display text-base font-bold">
                Remarque
              </h2>
              <form class="grid gap-2" novalidate @submit.prevent="addRemark">
                <UiField
                  id="vm-remark-text"
                  v-model="remark"
                  as="textarea"
                  label="Une remarque, ajoutée au compte rendu avec l’heure"
                  quiet
                  :rows="2"
                  :maxlength="VISIT_REMARK_MAX"
                  :disabled="!canEdit"
                  :error="remarkError"
                  placeholder="ex. fenêtres en simple vitrage"
                  data-testid="visit-remark"
                />
                <UiButton
                  type="submit"
                  :disabled="!canEdit"
                  block
                  data-testid="visit-remark-add"
                >
                  Ajouter la remarque
                </UiButton>
              </form>
            </section>

            <!-- Mes notes -->
            <section
              :class="card"
              class="grid gap-3"
              aria-labelledby="vm-scores"
            >
              <div class="flex items-baseline justify-between gap-2">
                <h2 id="vm-scores" class="font-display text-base font-bold">
                  Mes notes
                </h2>
                <span class="text-sm text-muted" aria-live="polite"
                  >{{ ratedCount }} sur {{ criteria.length }}</span
                >
              </div>
              <p class="text-sm text-muted">
                Ce que tu ne sais pas, laisse « — ». Les notes des autres ne
                s’affichent pas ici ; tes notes partent ensemble, quelques
                secondes après la dernière.
              </p>
              <ul class="grid gap-3" data-testid="visit-scores">
                <li
                  v-for="row in criteria"
                  :key="row.key"
                  class="grid gap-2"
                  :data-criterion="row.key"
                >
                  <span :id="`vm-crit-${row.key}`" class="font-semibold">{{
                    row.label
                  }}</span>
                  <ScoreRadioGroup
                    :choices="SCORE_CHOICES"
                    :model-value="mine.scores[row.key]?.score ?? null"
                    :labelledby="`vm-crit-${row.key}`"
                    compact
                    @update:model-value="
                      value => setScore(row.key, row.label, value)
                    "
                  />
                </li>
              </ul>
              <div class="grid gap-2 border-t border-line pt-3">
                <span id="vm-global" class="font-semibold">Note globale</span>
                <ScoreRadioGroup
                  :choices="GLOBAL_CHOICES"
                  :model-value="mine.rating > 0 ? mine.rating : null"
                  labelledby="vm-global"
                  variant="global"
                  compact
                  clearable
                  @update:model-value="setRating"
                />
              </div>
            </section>

            <!-- Le compte rendu -->
            <section
              :class="card"
              class="grid gap-3"
              aria-labelledby="vm-report"
            >
              <h2 id="vm-report" class="font-display text-base font-bold">
                Compte rendu
              </h2>
              <UiAlert
                v-if="!canEdit"
                tone="info"
                data-testid="visit-readonly"
                >{{ VISIT_EDIT_REFUSAL }}</UiAlert
              >
              <UiField
                id="vm-report-text"
                :model-value="drafts.report"
                as="textarea"
                label="Compte rendu"
                quiet
                :rows="5"
                maxlength="10000"
                :disabled="!canEdit"
                data-testid="visit-report"
                @focus="focused = 'report'"
                @blur="focused = null"
                @update:model-value="
                  value => onText('report', String(value ?? ''))
                "
              />
              <UiField
                id="vm-pros"
                :model-value="drafts.pros"
                as="textarea"
                label="Points forts"
                quiet
                :rows="2"
                maxlength="5000"
                :disabled="!canEdit"
                data-testid="visit-pros"
                @focus="focused = 'pros'"
                @blur="focused = null"
                @update:model-value="
                  value => onText('pros', String(value ?? ''))
                "
              />
              <UiField
                id="vm-cons"
                :model-value="drafts.cons"
                as="textarea"
                label="Points faibles"
                quiet
                :rows="2"
                maxlength="5000"
                :disabled="!canEdit"
                data-testid="visit-cons"
                @focus="focused = 'cons'"
                @blur="focused = null"
                @update:model-value="
                  value => onText('cons', String(value ?? ''))
                "
              />
              <div class="grid gap-2">
                <span id="vm-visit-rating" class="font-semibold"
                  >Note de la visite</span
                >
                <ScoreRadioGroup
                  :choices="GLOBAL_CHOICES"
                  :model-value="visit.rating > 0 ? visit.rating : null"
                  labelledby="vm-visit-rating"
                  variant="global"
                  compact
                  clearable
                  :disabled="!canEdit"
                  @update:model-value="setVisitRating"
                />
              </div>
              <fieldset class="grid gap-1">
                <legend class="mb-1 font-semibold">Participants</legend>
                <UiCheckbox
                  v-for="member in participantChoices"
                  :key="member.id"
                  :model-value="visit.participantIds.includes(member.id)"
                  :label="member.displayName"
                  :disabled="!canEdit"
                  @update:model-value="
                    value => toggleParticipant(member.id, Boolean(value))
                  "
                />
                <span
                  v-if="!participantChoices.length"
                  class="text-sm text-muted"
                >
                  {{
                    visit.participantIds.map(memberName).join(', ') ||
                    'Personne'
                  }}
                </span>
              </fieldset>
            </section>

            <section
              v-if="finished"
              id="visit-finished"
              tabindex="-1"
              :class="cardClasses('accent', 'sm')"
              class="grid gap-2 outline-none"
              data-testid="visit-finished"
            >
              <strong>Visite terminée.</strong>
              <template v-if="suggested">
                <p class="text-sm">
                  Passer l’annonce à « {{ LISTING_STATUS_LABELS[suggested] }} »
                  ?
                </p>
                <div class="grid grid-cols-2 gap-2">
                  <UiButton
                    variant="primary"
                    :loading="statusBusy"
                    data-testid="visit-status-yes"
                    @click="applySuggested"
                  >
                    Oui
                  </UiButton>
                  <UiButton @click="close">Plus tard</UiButton>
                </div>
                <UiAlert v-if="statusError">{{ statusError }}</UiAlert>
              </template>
            </section>
          </template>
        </template>
      </QueryState>
    </main>

    <footer
      v-if="visit && context"
      class="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div class="mx-auto flex w-full max-w-[40rem] items-center gap-2">
        <span class="min-w-0 flex-1 text-sm text-muted" aria-live="polite">{{
          summary.clear
            ? 'Tout est envoyé.'
            : `${summary.text}${outbox.persistent.value ? ', gardé sur l’appareil' : ''}.`
        }}</span>
        <UiButton
          variant="primary"
          class="min-h-12 px-5"
          data-testid="visit-finish"
          @click="finish"
        >
          {{ finished ? 'Fermer' : visitFinishLabel(visit.status) }}
        </UiButton>
      </div>
    </footer>
  </div>
</template>
