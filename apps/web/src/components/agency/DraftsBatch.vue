<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { AGENCY_CHANNEL_LABELS } from '@apart/contracts'
  import type { AgencyRequest, Member } from '@apart/contracts'
  import { activityActorName, formatShortParisDay } from '@apart/domain'

  /**
   * Lot 17 : les messages à valider, par lot. Chaque message se relit (et,
   * dans la fiche, se corrige) avant l'envoi ; « Valider l'envoi » valide
   * ceux qui sont cochés, ensemble. Rien ne part de l'application : Claude
   * envoie ensuite les messages validés depuis le Gmail de l'utilisateur ou
   * la messagerie du portail.
   */
  const props = defineProps<{
    requests: AgencyRequest[]
    members: Member[]
    /** Dans la fiche : l'objet et le texte se modifient. Dans la Synthèse : lecture. */
    editable?: boolean
    /** Dans la Synthèse : le titre de l'annonce et un lien vers la fiche. */
    showListing?: boolean
    /** Dans la Synthèse : l'annulation se fait depuis la fiche. */
    hideCancel?: boolean
    busy?: boolean
  }>()
  const emit = defineEmits<{
    approve: [requestIds: string[]]
    cancel: [requestId: string]
    save: [requestId: string, update: { subject: string; body: string }]
  }>()

  /** Cochés par défaut : un nouveau message entre dans le lot. */
  const selected = ref<Set<string>>(new Set())
  const texts = ref<Record<string, { subject: string; body: string }>>({})
  watch(
    () => props.requests,
    requests => {
      const known = new Set(Object.keys(texts.value))
      for (const r of requests) {
        if (!known.has(r.id)) selected.value.add(r.id)
        texts.value[r.id] = known.has(r.id)
          ? (texts.value[r.id] as { subject: string; body: string })
          : { subject: r.subject, body: r.body }
      }
    },
    { immediate: true, deep: false }
  )

  function toggle(id: string, on: boolean): void {
    const next = new Set(selected.value)
    if (on) next.add(id)
    else next.delete(id)
    selected.value = next
  }

  const chosen = computed(() =>
    props.requests.filter(r => selected.value.has(r.id)).map(r => r.id)
  )

  function changed(request: AgencyRequest): boolean {
    const t = texts.value[request.id]
    return Boolean(
      t && (t.subject !== request.subject || t.body !== request.body)
    )
  }

  /** Le message se lit en entier : une ligne de plus par ligne du texte (plafonné). */
  function rowsFor(body: string): number {
    return Math.min(28, Math.max(10, body.split('\n').length + 4))
  }

  function reset(request: AgencyRequest): void {
    texts.value[request.id] = { subject: request.subject, body: request.body }
  }

  const names = computed(
    () =>
      new Map(props.members.map(m => [m.id, { displayName: m.displayName }]))
  )
  function author(request: AgencyRequest): string {
    return activityActorName(
      { channel: request.createdChannel, actorMemberId: request.createdById },
      names.value
    )
  }

  const buttonClass =
    'inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm hover:bg-surface-2 disabled:opacity-60 sm:min-h-9'
</script>

<template>
  <div class="grid gap-3" data-testid="drafts-batch">
    <article
      v-for="request in requests"
      :key="request.id"
      class="grid gap-2 rounded-lg border border-line bg-surface p-3"
      :data-request="request.id"
    >
      <header class="flex items-start gap-2">
        <input
          :id="`draft-${request.id}`"
          type="checkbox"
          class="mt-1 size-4 accent-accent"
          :checked="selected.has(request.id)"
          :aria-label="`Inclure le message pour « ${request.listing.title} » dans le lot`"
          data-testid="draft-select"
          @change="
            toggle(request.id, ($event.target as HTMLInputElement).checked)
          "
        />
        <div class="grid min-w-0 flex-1 gap-0.5">
          <label
            :for="`draft-${request.id}`"
            class="text-sm font-medium break-words"
          >
            <template v-if="showListing">
              <RouterLink
                :to="{
                  name: 'listing',
                  params: { id: request.listingId },
                  query: { onglet: 'a-faire' },
                }"
                class="text-accent underline"
                >{{ request.listing.title }}</RouterLink
              >
              ·
            </template>
            {{ request.recipientName ?? 'Destinataire à préciser' }}
          </label>
          <p class="text-xs text-muted">
            {{ AGENCY_CHANNEL_LABELS[request.channel] }} ·
            {{ request.questions.length }} question{{
              request.questions.length > 1 ? 's' : ''
            }}
            <template v-if="request.followUpOfId"> · relance</template>
            · préparé par {{ author(request) }} le
            {{ formatShortParisDay(request.createdAt) }}
          </p>
        </div>
      </header>

      <template v-if="editable && texts[request.id]">
        <label class="grid gap-1 text-xs font-medium text-muted">
          Objet
          <input
            v-model="texts[request.id]!.subject"
            maxlength="200"
            class="min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg sm:min-h-9"
            data-testid="draft-subject"
          />
        </label>
        <label class="grid gap-1 text-xs font-medium text-muted">
          Message
          <textarea
            v-model="texts[request.id]!.body"
            :rows="rowsFor(texts[request.id]!.body)"
            maxlength="8000"
            class="field-sizing-content max-h-[70vh] min-h-40 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm leading-relaxed text-fg"
            data-testid="draft-body"
          />
        </label>
        <div
          v-if="changed(request)"
          class="flex flex-wrap items-center justify-end gap-2"
        >
          <span class="text-xs text-warn"
            >Texte modifié : enregistrez-le avant de valider.</span
          >
          <button type="button" :class="buttonClass" @click="reset(request)">
            Revenir au texte
          </button>
          <button
            type="button"
            class="inline-flex min-h-11 items-center rounded-lg border border-accent px-3 text-sm text-accent disabled:opacity-60 sm:min-h-9"
            :disabled="busy"
            data-testid="draft-save"
            @click="emit('save', request.id, texts[request.id]!)"
          >
            Enregistrer le texte
          </button>
        </div>
      </template>
      <template v-else>
        <ul class="grid gap-0.5 text-sm">
          <li
            v-for="q in request.questions"
            :key="q.taskId"
            class="before:mr-1 before:text-muted before:content-['–']"
          >
            {{ q.question }}
          </li>
        </ul>
        <details class="text-sm">
          <summary class="cursor-pointer text-xs text-accent">
            Voir le message
          </summary>
          <p class="mt-1 text-xs font-medium">{{ request.subject }}</p>
          <pre
            class="mt-1 rounded-lg bg-surface-2 p-2 font-sans text-[13px] break-words whitespace-pre-wrap"
            >{{ request.body }}</pre>
        </details>
      </template>

      <div v-if="!hideCancel" class="flex justify-end">
        <button
          type="button"
          class="text-xs text-muted underline hover:text-bad"
          :disabled="busy"
          data-testid="draft-cancel"
          @click="emit('cancel', request.id)"
        >
          Annuler ce message
        </button>
      </div>
    </article>

    <div
      class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent-soft px-3 py-2"
    >
      <p class="max-w-prose text-xs">
        Valider ne fait partir aucun message : Claude enverra ceux que vous
        validez depuis votre Gmail ou la messagerie du portail, puis notera
        l’envoi ici.
      </p>
      <button
        type="button"
        class="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-60 sm:min-h-9 sm:w-auto"
        :disabled="busy || chosen.length === 0 || requests.some(changed)"
        data-testid="drafts-approve"
        @click="emit('approve', chosen)"
      >
        Valider l’envoi{{ chosen.length > 1 ? ` (${chosen.length})` : '' }}
      </button>
    </div>
  </div>
</template>
