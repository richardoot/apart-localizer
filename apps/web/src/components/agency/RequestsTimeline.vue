<script setup lang="ts">
  import { computed } from 'vue'
  import {
    AGENCY_ANSWER_DISPOSITION_LABELS,
    AGENCY_APPROVAL_VIA_LABELS,
    AGENCY_CHANNEL_LABELS,
    AGENCY_REQUEST_STATUS_LABELS,
  } from '@apart/contracts'
  import type {
    AgencyAnswerChange,
    AgencyAnswerValueKey,
    AgencyRequest,
    AgencyRequestStatus,
    Member,
  } from '@apart/contracts'
  import { activityActorName, formatShortParisDay } from '@apart/domain'

  /**
   * Lot 17 : la chronologie des demandes à l'annonceur, de la plus récente à
   * la plus ancienne : état, canal, validation, envoi, questions (cochées
   * quand la réponse les a remplies), réponses dépliables avec ce qu'elles
   * ont fait à la fiche (« appliqué », « proposé » avec « Appliquer »,
   * « inchangé »), relance due signalée.
   */
  const props = defineProps<{
    requests: AgencyRequest[]
    members: Member[]
    busy?: boolean
  }>()
  const emit = defineEmits<{
    'no-answer': [requestId: string]
    'follow-up': [requestId: string]
    apply: [requestId: string, keys: AgencyAnswerValueKey[]]
  }>()

  const names = computed(
    () =>
      new Map(props.members.map(m => [m.id, { displayName: m.displayName }]))
  )
  const nameOf = (id: string | null): string =>
    id ? (names.value.get(id)?.displayName ?? 'un membre') : 'un membre'
  function answeredBy(channel: 'web' | 'mcp', authorId: string | null) {
    return activityActorName({ channel, actorMemberId: authorId }, names.value)
  }

  const day = (iso: string | null) => (iso ? formatShortParisDay(iso) : '—')

  const STATUS_TONES: Record<AgencyRequestStatus, string> = {
    draft: 'bg-warn-soft text-warn',
    approved: 'bg-accent-soft text-accent',
    sent: 'bg-accent-soft text-accent',
    answered: 'bg-good-soft text-good',
    no_answer: 'border border-dashed border-muted text-muted',
    cancelled: 'border border-dashed border-muted text-muted',
  }
  const DISPOSITION_TONES: Record<AgencyAnswerChange['disposition'], string> = {
    applied: 'text-good',
    proposed: 'text-warn',
    unchanged: 'text-muted',
  }

  const isUrl = (ref: string) => /^https?:\/\//.test(ref)
</script>

<template>
  <ol class="grid gap-4" data-testid="requests-timeline">
    <li
      v-for="request in requests"
      :key="request.id"
      class="grid gap-1.5 border-l-2 border-line pl-3"
      :data-status="request.status"
    >
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span
          class="rounded-full px-2 py-px font-medium"
          :class="STATUS_TONES[request.status]"
          >{{ AGENCY_REQUEST_STATUS_LABELS[request.status] }}</span
        >
        <span class="text-muted">
          {{ AGENCY_CHANNEL_LABELS[request.channel] }}
          <template v-if="request.recipientName">
            · {{ request.recipientName }}</template
          >
          <template v-if="request.followUpOfId"> · relance</template>
        </span>
      </div>

      <p class="text-xs text-muted">
        <template v-if="request.sentAt"
          >Envoyée le {{ day(request.sentAt) }}</template
        ><template v-else>Préparée le {{ day(request.createdAt) }}</template>
        <template v-if="request.approvedVia">
          · validée {{ AGENCY_APPROVAL_VIA_LABELS[request.approvedVia] }} par
          {{ nameOf(request.approvedById) }}</template
        >
        <template v-if="request.closedAt && request.status !== 'answered'">
          · close le {{ day(request.closedAt) }}</template
        >
        <template v-if="request.threadRef">
          ·
          <a
            v-if="isUrl(request.threadRef)"
            :href="request.threadRef"
            target="_blank"
            rel="noopener noreferrer"
            class="underline hover:text-fg"
            >conversation</a
          ><span v-else class="break-all"
            >fil {{ request.threadRef }}</span
          ></template
        >
      </p>

      <p
        v-if="request.followUpDue"
        class="w-fit rounded-lg bg-warn-soft px-2 py-1 text-xs font-medium text-warn"
        data-testid="follow-up-due"
      >
        Relance due depuis le
        {{
          request.followUpDueOn
            ? day(`${request.followUpDueOn}T12:00:00Z`)
            : '—'
        }}
        : pas de réponse en 5 jours ouvrés.
      </p>

      <ul class="grid gap-0.5 text-sm">
        <li
          v-for="q in request.questions"
          :key="q.taskId"
          class="flex items-baseline gap-1.5"
        >
          <span
            :class="q.done ? 'text-good' : 'text-muted'"
            :aria-label="q.done ? 'répondue' : 'en attente'"
            >{{ q.done ? '✓' : '○' }}</span
          >
          <span :class="q.done ? 'text-muted' : ''">{{ q.label }}</span>
        </li>
      </ul>

      <details
        v-for="(answer, i) in request.answers"
        :key="i"
        class="rounded-lg bg-surface-2 px-3 py-2 text-sm"
        :open="i === request.answers.length - 1"
        data-testid="request-answer"
      >
        <summary class="cursor-pointer text-xs font-medium">
          Réponse du {{ day(answer.receivedAt) }}
          <span class="font-normal text-muted"
            >· notée par {{ answeredBy(answer.channel, answer.authorId) }}</span
          >
        </summary>
        <ul v-if="answer.changes.length" class="mt-1.5 grid gap-1">
          <li
            v-for="change in answer.changes"
            :key="change.key"
            class="flex flex-wrap items-baseline gap-x-2 gap-y-1"
            :data-disposition="change.disposition"
          >
            <span class="break-words">{{ change.text }}</span>
            <span
              class="text-[11px] tracking-wide uppercase"
              :class="DISPOSITION_TONES[change.disposition]"
              >{{ AGENCY_ANSWER_DISPOSITION_LABELS[change.disposition] }}</span
            >
            <button
              v-if="change.disposition === 'proposed'"
              type="button"
              class="inline-flex min-h-9 items-center rounded-lg bg-accent px-2.5 text-xs font-medium text-accent-fg disabled:opacity-60"
              :disabled="busy"
              data-testid="apply-proposed"
              @click="emit('apply', request.id, [change.key])"
            >
              Appliquer
            </button>
          </li>
        </ul>
        <p v-else class="mt-1 text-xs text-muted">{{ answer.summary }}</p>
        <blockquote
          v-if="answer.excerpt"
          class="mt-2 border-l-2 border-accent-soft pl-2 text-xs break-words text-muted"
        >
          {{ answer.excerpt }}
        </blockquote>
      </details>

      <div
        v-if="request.status === 'sent' || request.followUpDue"
        class="flex flex-wrap gap-2"
      >
        <button
          v-if="request.followUpDue"
          type="button"
          class="inline-flex min-h-11 items-center rounded-lg border border-accent px-3 text-sm text-accent disabled:opacity-60 sm:min-h-9"
          :disabled="busy"
          data-testid="prepare-follow-up"
          @click="emit('follow-up', request.id)"
        >
          Préparer une relance
        </button>
        <button
          v-if="request.status === 'sent'"
          type="button"
          class="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm hover:bg-surface-2 disabled:opacity-60 sm:min-h-9"
          :disabled="busy"
          data-testid="no-answer"
          @click="emit('no-answer', request.id)"
        >
          Pas de réponse
        </button>
      </div>
    </li>
  </ol>
</template>
