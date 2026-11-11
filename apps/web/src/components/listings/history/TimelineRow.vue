<script setup lang="ts">
  import {
    LISTING_CHECK_DISPOSITION_LABELS,
    LISTING_CHECK_OUTCOME_LABELS,
  } from '@apart/contracts'
  import type { ListingCheckOutcome } from '@apart/contracts'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import { LISTING_STATUS_LABELS } from '@/lib/labels'
  import {
    TIMELINE_KIND_LABELS,
    TIMELINE_KIND_TONES,
    timelineDay,
  } from '@/lib/listing-timeline'
  import type { BadgeVariant, Tone } from '@/lib/ui'
  import type { TimelineEntry } from '@/lib/listing-timeline'

  /**
   * Lot 19 : une ligne de la chronologie de l'Historique : la date, le type
   * (Prix, Vérification, Échange, Fiche), ce qui s'est passé, qui ; puis le
   * détail selon la source : changements avant → après du journal, écarts
   * d'une vérification avec leur suite (appliqué, proposé, noté), extrait de
   * la page dépliable, annonce rattachée, page consultée, raison d'un
   * changement d'adéquation.
   */
  defineProps<{ entry: TimelineEntry; first?: boolean }>()

  const OUTCOME_TONES: Record<
    ListingCheckOutcome,
    { tone: Tone; variant: BadgeVariant }
  > = {
    unchanged: { tone: 'good', variant: 'soft' },
    changed: { tone: 'accent', variant: 'soft' },
    offline: { tone: 'bad', variant: 'soft' },
    republished: { tone: 'warn', variant: 'soft' },
    inaccessible: { tone: 'neutral', variant: 'outline' },
    link_added: { tone: 'accent', variant: 'outline' },
  }
  const DISPOSITION_TONES: Record<string, string> = {
    applied: 'text-good',
    proposed: 'text-warn',
    noted: 'text-muted',
  }
</script>

<template>
  <li
    class="flex flex-wrap gap-x-4 gap-y-1 py-3"
    :class="first ? '' : 'border-t border-line'"
    :data-kind="entry.kind"
    :data-source="entry.source"
    data-testid="timeline-entry"
  >
    <time
      :datetime="entry.at"
      class="w-24 flex-none text-sm text-muted tabular-nums"
      :title="new Date(entry.at).toLocaleString('fr-FR')"
      >{{ timelineDay(entry.at) }}</time
    >
    <!-- Colonne de largeur fixe : les textes s'alignent quelle que soit la sorte. -->
    <span class="w-24 flex-none self-start">
      <UiBadge
        :tone="TIMELINE_KIND_TONES[entry.kind]"
        data-testid="timeline-kind"
        >{{ TIMELINE_KIND_LABELS[entry.kind] }}</UiBadge
      >
    </span>
    <div class="grid min-w-0 flex-[1_1_20rem] gap-1 text-sm leading-relaxed">
      <span class="break-words text-fg" data-testid="timeline-text">{{
        entry.text
      }}</span>
      <span v-if="entry.who" class="text-xs text-muted">
        <UiBadge
          v-if="entry.source === 'check'"
          class="mr-1.5"
          :tone="OUTCOME_TONES[entry.check.outcome].tone"
          :variant="OUTCOME_TONES[entry.check.outcome].variant"
          >{{ LISTING_CHECK_OUTCOME_LABELS[entry.check.outcome] }}</UiBadge
        >{{ entry.who }}</span
      >

      <dl
        v-if="entry.source === 'journal' && entry.journal.changes.length"
        class="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs"
      >
        <template v-for="change in entry.journal.changes" :key="change.field">
          <dt class="text-muted">{{ change.label }}</dt>
          <dd class="break-words">
            <span class="text-muted line-through">{{
              change.before ?? '—'
            }}</span>
            <UiIcon name="arrow-right" class="mx-0.5 inline align-[-0.125em]" />
            <span class="sr-only">devient</span>
            <span>{{ change.after ?? '—' }}</span>
          </dd>
        </template>
      </dl>

      <template v-if="entry.source === 'check'">
        <ul v-if="entry.check.changes.length > 1" class="grid gap-0.5 text-xs">
          <li
            v-for="(change, i) in entry.check.changes"
            :key="i"
            class="flex flex-wrap items-baseline gap-x-2"
          >
            <span class="break-words">{{ change.text }}</span>
            <span
              class="text-xs font-medium tracking-wide uppercase"
              :class="DISPOSITION_TONES[change.disposition]"
              >{{ LISTING_CHECK_DISPOSITION_LABELS[change.disposition] }}</span
            >
          </li>
        </ul>
        <p
          v-else-if="entry.check.changes.length === 1"
          class="text-xs font-medium tracking-wide uppercase"
          :class="DISPOSITION_TONES[entry.check.changes[0]!.disposition]"
        >
          {{
            LISTING_CHECK_DISPOSITION_LABELS[
              entry.check.changes[0]!.disposition
            ]
          }}
        </p>
        <p v-if="entry.check.linkedListing" class="text-xs">
          <RouterLink
            :to="{
              name: 'listing',
              params: { id: entry.check.linkedListing.id },
              query: { onglet: 'historique' },
            }"
            class="text-accent underline"
            data-testid="check-linked"
            >{{
              entry.check.outcome === 'republished'
                ? 'Annonce rattachée : '
                : 'Voir : '
            }}« {{ entry.check.linkedListing.title }} »</RouterLink
          >
          <span class="text-muted">
            ({{
              LISTING_STATUS_LABELS[entry.check.linkedListing.status]
            }})</span
          >
        </p>
        <details v-if="entry.check.evidence" class="text-xs">
          <summary
            class="inline-flex min-h-11 cursor-pointer items-center text-accent sm:min-h-8"
          >
            Extrait de la page
          </summary>
          <blockquote
            class="mt-1 border-l-2 border-accent-soft pl-2 break-words text-muted"
          >
            {{ entry.check.evidence }}
          </blockquote>
        </details>
        <UiButton
          v-if="entry.check.checkedUrl"
          :href="entry.check.checkedUrl"
          variant="link"
          size="inline"
          target="_blank"
          rel="noopener noreferrer"
          icon-right="external"
          class="w-fit text-xs break-all"
          >page consultée</UiButton
        >
      </template>

      <p v-if="entry.source === 'fit' && entry.why" class="text-xs text-muted">
        {{ entry.why }}
      </p>
    </div>
  </li>
</template>
