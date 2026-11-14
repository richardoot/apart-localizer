<script setup lang="ts">
  import { computed } from 'vue'
  import type { ListingDraft } from '@apart/contracts'
  import { judgementsOfDraft } from '@apart/domain'
  import { useAssumptions } from '@/composables/useWorkspace'
  import { draftFactGroups } from '@/lib/draft-details'
  import {
    draftFitReason,
    draftPlace,
    draftSellerLabel,
    draftSourceLabel,
    draftWhen,
  } from '@/lib/drafts'
  import { keyFigures } from '@/lib/synthesis'
  import JudgementPills from '@/components/listings/JudgementPills.vue'
  import PortalPhotos from '@/components/listings/PortalPhotos.vue'
  import SidePanel from '@/components/ui/SidePanel.vue'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'

  /**
   * Lot 32 (ADR 0047) : un brouillon « À valider » lu comme une fiche, pour
   * le juger sans retourner sur le portail : photos du portail, les quatre
   * chiffres (avec les hypothèses de l'espace), l'adéquation, les faits par
   * thème (« non indiqué » pour ce qui manque), la description entière, le
   * vendeur et le lien. Les données de quartier (tram, ventes, équipements)
   * ne sont calculées qu'à la création de la fiche. Lecture seule : ajouter
   * se fait ici ou sur la carte, écarter (avec sa raison) sur la carte.
   */
  const props = withDefaults(
    defineProps<{
      draft: ListingDraft
      busy?: boolean
      error?: string | null
      /** Lot 21 : l'espace décide à plusieurs : ajouter propose. */
      agreement?: boolean
    }>(),
    { busy: false, error: null, agreement: false }
  )
  const emit = defineEmits<{ close: []; accept: [] }>()

  const { values: assumptions } = useAssumptions()

  const d = computed(() => props.draft)
  const listing = computed(() => d.value.listing)
  const portalLabel = computed(() => draftSourceLabel(d.value))
  const sellerLabel = computed(() => draftSellerLabel(d.value))
  const fitReason = computed(() => draftFitReason(d.value))
  const groups = computed(() => draftFactGroups(listing.value))
  const figures = computed(() =>
    d.value.evaluation
      ? keyFigures({
          metrics: d.value.evaluation.metrics,
          targetPrice: d.value.evaluation.targetPrice,
          assumptions: assumptions.value,
          medianPricePerM2: null,
        })
      : []
  )
  const canAccept = computed(
    () => d.value.status === 'pending' && !d.value.decision
  )
</script>

<template>
  <SidePanel :title="listing.title" wide @close="emit('close')">
    <div class="grid gap-5" :data-draft="d.id" data-testid="draft-detail">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <UiBadge variant="outline">{{ portalLabel }}</UiBadge>
        <UiBadge v-if="sellerLabel" variant="outline">{{
          sellerLabel
        }}</UiBadge>
        <span class="text-sm text-muted">{{ draftPlace(d) }}</span>
        <span class="text-xs text-muted">{{ draftWhen(d) }}</span>
      </div>

      <PortalPhotos
        :photos="listing.portalPhotos"
        :portal-label="portalLabel"
        compact
      />

      <div class="grid gap-2">
        <JudgementPills :judgements="judgementsOfDraft(d)" />
        <p
          v-if="fitReason && d.fit && d.fit.activeCriteria > 0"
          class="text-sm text-muted"
        >
          {{ fitReason }}
        </p>
      </div>

      <section
        v-if="figures.length"
        aria-labelledby="draft-figures-title"
        data-testid="draft-figures"
      >
        <h3 id="draft-figures-title" class="sr-only">Les chiffres</h3>
        <div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <div
            v-for="figure in figures"
            :key="figure.key"
            class="grid content-start gap-0.5 rounded-xl px-3 py-2.5"
            :class="figure.accent ? 'bg-accent-soft' : 'bg-bg'"
            :data-figure="figure.key"
          >
            <span class="text-sm text-muted">{{ figure.label }}</span>
            <strong
              class="font-display text-xl leading-tight font-bold tabular-nums"
              >{{ figure.value }}</strong
            >
            <span v-if="figure.sub" class="text-xs text-muted">{{
              figure.sub
            }}</span>
          </div>
        </div>
        <p class="mt-1.5 text-xs text-muted">
          Avec les hypothèses de l’espace ; les ventes du quartier sont lues à
          la création de la fiche.
        </p>
      </section>

      <div class="grid gap-4 sm:grid-cols-2">
        <section
          v-for="group in groups"
          :key="group.key"
          :aria-labelledby="`draft-group-${group.key}`"
          :data-group="group.key"
        >
          <h3
            :id="`draft-group-${group.key}`"
            class="mb-1.5 text-sm font-semibold"
          >
            {{ group.title }}
          </h3>
          <dl class="grid gap-1 text-sm">
            <div
              v-for="fact in group.facts"
              :key="fact.key"
              class="flex justify-between gap-3 border-b border-line pb-1"
              :data-fact="fact.key"
            >
              <dt class="text-muted">{{ fact.label }}</dt>
              <dd
                class="m-0 text-right tabular-nums"
                :class="fact.value === null ? 'text-warn' : ''"
              >
                {{ fact.value ?? 'non indiqué' }}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <ul
        v-if="d.warnings.length"
        class="m-0 grid list-none gap-0.5 p-0 text-sm text-muted"
        data-testid="draft-detail-warnings"
      >
        <li v-for="warning in d.warnings" :key="warning">{{ warning }}</li>
      </ul>

      <section
        v-if="listing.description"
        aria-labelledby="draft-description-title"
      >
        <h3 id="draft-description-title" class="mb-1.5 text-sm font-semibold">
          Description
        </h3>
        <p
          class="max-w-prose text-sm leading-relaxed whitespace-pre-line"
          data-testid="draft-description"
        >
          {{ listing.description }}
        </p>
      </section>
    </div>

    <template #footer>
      <UiAlert v-if="error" class="mb-2">{{ error }}</UiAlert>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <UiButton
          v-if="d.url"
          :href="d.url"
          variant="link"
          icon-right="external"
          target="_blank"
          rel="noopener noreferrer"
          class="mr-auto"
          >{{
            d.portal ? `Ouvrir sur ${portalLabel}` : 'Ouvrir l’annonce'
          }}</UiButton
        >
        <UiButton @click="emit('close')">Fermer</UiButton>
        <UiButton
          v-if="canAccept"
          variant="primary"
          :loading="busy"
          data-action="detail-accept"
          @click="emit('accept')"
        >
          {{ agreement ? 'Proposer de la garder' : 'Ajouter à la liste' }}
        </UiButton>
      </div>
    </template>
  </SidePanel>
</template>
