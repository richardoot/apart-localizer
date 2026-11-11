import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { ListingStatus } from '@apart/contracts'

/**
 * Lot 21 (ADR 0031) : l'état d'une session de tri, gardé dans
 * `sessionStorage` sous son identifiant (qui est dans l'URL) : recharger la
 * page ne perd ni la position, ni les choix, ni le bilan. La file est figée
 * au début de la session ; chaque choix avance d'une carte.
 */

/** Un choix de la session. */
export interface TriagePick {
  id: string
  title: string
  /** Ce qui s'affiche au bilan et sur « Annuler ». */
  label: string
  /** Le résultat au bilan (« Passée en À visiter », « À trancher ensemble »). */
  result: string
  action:
    | 'keep'
    | 'to_visit'
    | 'discard'
    | 'skip'
    | 'agree'
    | 'refuse'
    | 'later'
    /** Lot 27 : « Déjà vue », rattachée ou fusionnée à une annonce suivie. */
    | 'seen'
  /** La proposition écrite, à retirer si on annule. */
  proposalId: string | null
  /** Comment annuler : retirer la proposition, remettre le statut, le brouillon, défaire une fusion (lot 27), rien. */
  undo: 'proposal' | 'listing' | 'draft' | 'skip' | 'merge' | null
  /** Lot 27 : la fusion faite par « Déjà vue », à annuler. */
  mergeId?: string
  /** Le statut à remettre d'une annonce changée tout de suite. */
  statusBefore: ListingStatus | null
  /** Vrai si un brouillon vient de devenir une annonce : Annuler n'est pas offert. */
  createdListing: boolean
  /** La fiche créée, pour l'ouvrir et l'écarter. */
  listingId: string | null
  /** Le choix a mis l'annonce « À trancher ensemble ». */
  toSettle?: boolean
  /** Lot 24 : affiché tout de suite, la réponse du serveur n'est pas encore là. */
  pending?: boolean
}

export interface TriageSnapshot {
  order: string[]
  picks: TriagePick[]
  /** « Terminer et prévenir » ou « Décider sans attendre » fait. */
  outcome: 'sent' | 'solo' | null
  outcomeText: string | null
}

const keyOf = (sessionId: string): string => `apart.tri.${sessionId}`

/** Lit une session gardée ; illisible ou absente : null. */
export function loadTriage(sessionId: string): TriageSnapshot | null {
  try {
    const raw = sessionStorage.getItem(keyOf(sessionId))
    return raw ? (JSON.parse(raw) as TriageSnapshot) : null
  } catch {
    return null
  }
}

function saveTriage(sessionId: string, snapshot: TriageSnapshot): void {
  try {
    sessionStorage.setItem(keyOf(sessionId), JSON.stringify(snapshot))
  } catch {
    // Sans stockage (navigation privée), la session vit tant que la page reste ouverte.
  }
}

export function useTriageSession<T extends { id: string }>(input: {
  sessionId: Ref<string>
  /** Les cartes disponibles, dans leur ordre ; `queue` = celles à traiter. */
  queue: ComputedRef<T[]>
  byId: ComputedRef<Map<string, T>>
  loaded: ComputedRef<boolean>
  /** La carte par laquelle commencer (bouton « Trier » d'une ligne). */
  startAt?: string | null
}) {
  const snapshot = ref<TriageSnapshot | null>(null)

  /** Ouvre la session : celle gardée, ou la file du moment. */
  function ensureSnapshot(): void {
    if (snapshot.value || !input.loaded.value) return
    const stored = loadTriage(input.sessionId.value)
    const ids = input.queue.value.map(item => item.id)
    const start = input.startAt ? ids.indexOf(input.startAt) : -1
    snapshot.value = stored ?? {
      order:
        start > 0
          ? [ids[start] as string, ...ids.filter((_, i) => i !== start)]
          : ids,
      picks: [],
      outcome: null,
      outcomeText: null,
    }
  }
  watch(input.loaded, ensureSnapshot, { immediate: true })

  watch(
    snapshot,
    value => {
      if (value) saveTriage(input.sessionId.value, value)
    },
    { deep: true }
  )

  const order = computed(() => snapshot.value?.order ?? [])
  const picks = computed(() => snapshot.value?.picks ?? [])
  const position = computed(() => picks.value.length)
  const total = computed(() => order.value.length)
  const finished = computed(
    () => snapshot.value !== null && position.value >= total.value
  )
  const current = computed<T | null>(() => {
    const id = order.value[position.value]
    return id ? (input.byId.value.get(id) ?? null) : null
  })
  const lastPick = computed(() => picks.value[picks.value.length - 1] ?? null)

  /**
   * Une carte qui n'est plus là (décidée ailleurs entre-temps) est passée
   * sans bruit : la file continue.
   */
  watch(
    [current, () => snapshot.value, input.loaded],
    ([item, snap, loaded]) => {
      if (!loaded || !snap || item || finished.value) return
      const id = snap.order[snap.picks.length]
      if (id && !input.byId.value.has(id)) {
        snap.order.splice(snap.picks.length, 1)
      }
    }
  )

  function push(pick: TriagePick): void {
    snapshot.value?.picks.push(pick)
  }

  function pop(): TriagePick | null {
    return snapshot.value?.picks.pop() ?? null
  }

  /** Lot 24 : la réponse du serveur complète un choix affiché d'avance. */
  function patch(id: string, value: Partial<TriagePick>): void {
    const pick = snapshot.value?.picks.find(p => p.id === id && p.pending)
    if (pick) Object.assign(pick, value, { pending: false })
  }

  /**
   * Lot 24 : le serveur a refusé un choix affiché d'avance. Le choix sort du
   * bilan et la carte revient tout de suite, à la place de la carte
   * courante (celle-ci passe juste après) : rien n'est perdu ni décalé.
   */
  function rollback(id: string): TriagePick | null {
    const snap = snapshot.value
    if (!snap) return null
    const index = snap.picks.findIndex(p => p.id === id && p.pending)
    if (index < 0) return null
    const [pick] = snap.picks.splice(index, 1)
    const at = snap.order.indexOf(id)
    if (at >= 0) snap.order.splice(at, 1)
    snap.order.splice(snap.picks.length, 0, id)
    return pick ?? null
  }

  function setOutcome(outcome: 'sent' | 'solo', text: string): void {
    if (!snapshot.value) return
    snapshot.value.outcome = outcome
    snapshot.value.outcomeText = text
  }

  return {
    snapshot,
    order,
    picks,
    position,
    total,
    finished,
    current,
    lastPick,
    ensureSnapshot,
    push,
    pop,
    patch,
    rollback,
    setOutcome,
  }
}
