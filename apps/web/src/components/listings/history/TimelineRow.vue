<script setup lang="ts">
  import {
    LISTING_CHECK_DISPOSITION_LABELS,
    LISTING_CHECK_OUTCOME_LABELS,
  } from '@apart/contracts'
  import type { ListingCheckOutcome } from '@apart/contracts'
  import { LISTING_STATUS_LABELS } from '@/lib/labels'
  import {
    TIMELINE_KIND_CLASSES,
    TIMELINE_KIND_LABELS,
    timelineDay,
  } from '@/lib/listing-timeline'
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

  const OUTCOME_TONES: Record<ListingCheckOutcome, string> = {
    unchanged: 'bg-good-soft text-good',
    changed: 'bg-accent-soft text-accent',
    offline: 'bg-bad-soft text-bad',
    republished: 'bg-warn-soft text-warn',
    inaccessible: 'border border-dashed border-muted text-muted',
    link_added: 'border border-accent text-accent',
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
      <span
        class="inline-block rounded-md px-2 py-0.5 text-xs font-semibold"
        :class="TIMELINE_KIND_CLASSES[entry.kind]"
        data-testid="timeline-kind"
        >{{ TIMELINE_KIND_LABELS[entry.kind] }}</span
      >
    </span>
    <div class="grid min-w-0 flex-[1_1_20rem] gap-1 text-sm leading-relaxed">
      <span class="break-words text-fg" data-testid="timeline-text">{{
        entry.text
      }}</span>
      <span v-if="entry.who" class="text-xs text-muted">
        <span
          v-if="entry.source === 'check'"
          class="mr-1.5 inline-block rounded-full px-2 py-px font-medium"
          :class="OUTCOME_TONES[entry.check.outcome]"
          >{{ LISTING_CHECK_OUTCOME_LABELS[entry.check.outcome] }}</span
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
            → <span>{{ change.after ?? '—' }}</span>
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
              class="text-[11px] font-medium tracking-wide uppercase"
              :class="DISPOSITION_TONES[change.disposition]"
              >{{ LISTING_CHECK_DISPOSITION_LABELS[change.disposition] }}</span
            >
          </li>
        </ul>
        <p
          v-else-if="entry.check.changes.length === 1"
          class="text-[11px] font-medium tracking-wide uppercase"
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
            class="inline-flex min-h-9 cursor-pointer items-center text-accent"
          >
            Extrait de la page
          </summary>
          <blockquote
            class="mt-1 border-l-2 border-accent-soft pl-2 break-words text-muted"
          >
            {{ entry.check.evidence }}
          </blockquote>
        </details>
        <a
          v-if="entry.check.checkedUrl"
          :href="entry.check.checkedUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="w-fit text-xs break-all text-muted underline hover:text-fg"
          >page consultée</a
        >
      </template>

      <p v-if="entry.source === 'fit' && entry.why" class="text-xs text-muted">
        {{ entry.why }}
      </p>
    </div>
  </li>
</template>
