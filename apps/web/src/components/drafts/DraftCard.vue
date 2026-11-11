<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { ListingDraft } from '@apart/contracts'
  import {
    decisionDetail,
    judgementsOfDraft,
    waitingLabel,
  } from '@apart/domain'
  import JudgementPills from '@/components/listings/JudgementPills.vue'
  import {
    draftFitReason,
    draftSellerLabel,
    duplicateLead,
    draftPlace,
    draftReadLabel,
    draftSourceLabel,
    draftWhen,
    duplicateWhy,
    pendingDuplicate,
  } from '@/lib/drafts'
  import { formatEuros, formatSurface } from '@/lib/format'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiField from '@/components/ui/UiField.vue'
  import { cardClasses } from '@/lib/ui'

  /**
   * Lot 16 : une annonce à valider (reçue par e-mail ou trouvée par Claude
   * sur un portail). Rien n'est ajouté sans le membre : « Ajouter à la
   * liste » (fiche pré-remplie), « Modifier avant d'ajouter » (formulaire),
   * « Écarter » (raison facultative, jamais reproposée, Annuler), « Ouvrir
   * sur le portail » ; un doublon probable se tranche : « C'est la même :
   * mettre à jour la fiche » ou « C'en est une autre ». Lisible sans la
   * couleur, boutons de 44 px.
   *
   * Lot 18 : le vendeur lu (agence et référence) est affiché ; « C'est la
   * même : ajouter ce lien à la fiche » ajoute le lien du brouillon à
   * l'annonce suivie ; un doublon certain (même agence, même référence) est
   * mis en avant, une même référence avec une autre agence est dite.
   */
  const props = withDefaults(
    defineProps<{
      draft: ListingDraft
      busy?: boolean
      error?: string | null
      /** Lot 21 : l'espace décide à plusieurs : ajouter et écarter proposent. */
      agreement?: boolean
    }>(),
    { busy: false, error: null, agreement: false }
  )
  const emit = defineEmits<{
    accept: []
    edit: []
    dismiss: [reason: string | null]
    undo: []
    same: [listingId: string]
    other: []
  }>()

  const dismissing = ref(false)
  const reason = ref('')

  const d = computed(() => props.draft)
  const duplicate = computed(() => pendingDuplicate(d.value))
  const fitReason = computed(() => draftFitReason(d.value))
  const portalLabel = computed(() => draftSourceLabel(d.value))
  const sellerLabel = computed(() => draftSellerLabel(d.value))
  const rooms = computed(() =>
    d.value.listing.rooms === null
      ? 'pièces ?'
      : `${d.value.listing.rooms} pièce${d.value.listing.rooms > 1 ? 's' : ''}`
  )

  /** Lot 21 : à plusieurs, écarter demande une raison (c'est une proposition). */
  const reasonRequired = computed(() => props.agreement)
  const canConfirm = computed(
    () => !reasonRequired.value || reason.value.trim().length > 0
  )

  function confirmDismiss(): void {
    if (!canConfirm.value) return
    emit('dismiss', reason.value.trim() || null)
    dismissing.value = false
    reason.value = ''
  }
</script>

<template>
  <article
    class="flex flex-wrap items-start gap-x-6 gap-y-3.5"
    :class="cardClasses()"
    :data-draft="d.id"
    :data-status="d.status"
    data-testid="draft-card"
  >
    <div class="grid min-w-0 flex-[999_1_32rem] gap-2">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <h3 class="text-base font-semibold">{{ d.listing.title }}</h3>
        <UiBadge variant="outline" data-testid="draft-portal">{{
          portalLabel
        }}</UiBadge>
        <UiBadge
          v-if="sellerLabel"
          variant="outline"
          data-testid="draft-seller"
          >{{ sellerLabel }}</UiBadge
        >
        <span class="text-xs text-muted">{{ draftWhen(d) }}</span>
      </div>
      <div
        class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted tabular-nums"
      >
        <strong class="text-fg">{{
          d.listing.price ? formatEuros(d.listing.price) : 'prix ?'
        }}</strong>
        <span>{{ formatSurface(d.listing.surface) }}</span>
        <span>{{ rooms }}</span>
        <span>DPE {{ d.listing.dpeClass ?? '?' }}</span>
        <span>{{ draftPlace(d) }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <!-- Lot 25 : les trois jugements étiquetés (rentabilité à confirmer sans loyer visé). -->
        <JudgementPills :judgements="judgementsOfDraft(d)" />
        <span
          v-if="fitReason && d.fit && d.fit.activeCriteria > 0"
          class="text-sm text-muted"
          data-testid="draft-fit-reason"
          >{{ fitReason }}</span
        >
      </div>
      <div
        v-if="duplicate"
        class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2.5"
        :class="duplicate.certain ? 'bg-accent-soft' : 'bg-warn-soft'"
        data-testid="draft-duplicate"
        :data-certain="duplicate.certain"
      >
        <span
          class="min-w-0 flex-[1_1_20rem] text-sm leading-normal"
          :class="duplicate.certain ? 'text-accent' : 'text-warn'"
        >
          {{ duplicateLead(duplicate) }}
          <RouterLink
            :to="{ name: 'listing', params: { id: duplicate.listingId } }"
            class="font-semibold underline underline-offset-2"
            >{{ duplicate.title }}</RouterLink
          >, déjà suivie : {{ duplicateWhy(duplicate) }}
        </span>
        <UiButton
          :variant="duplicate.certain ? 'outline' : 'secondary'"
          :class="
            duplicate.certain ? '' : 'border-warn! font-semibold text-warn'
          "
          :disabled="busy"
          data-action="same"
          @click="emit('same', duplicate.listingId)"
        >
          {{
            d.url
              ? 'C’est la même : ajouter ce lien à la fiche'
              : 'C’est la même : mettre à jour la fiche'
          }}
        </UiButton>
        <UiButton :disabled="busy" data-action="other" @click="emit('other')">
          C’en est une autre
        </UiButton>
      </div>
      <ul
        v-if="d.status === 'pending' && d.warnings.length"
        class="flex flex-wrap gap-x-3 text-xs text-muted"
      >
        <li v-for="warning in d.warnings" :key="warning">{{ warning }}</li>
      </ul>
      <details
        v-if="d.excerpt || d.emailSubject"
        class="text-sm text-muted"
        data-testid="draft-excerpt"
      >
        <summary
          class="flex min-h-11 cursor-pointer items-center text-accent sm:min-h-8"
        >
          {{ draftReadLabel(d) }}
        </summary>
        <p class="mt-1.5 max-w-prose leading-normal">
          {{ d.excerpt ?? `« ${d.emailSubject} »` }}
        </p>
      </details>
      <UiAlert v-if="error">{{ error }}</UiAlert>
    </div>

    <div class="grid flex-[1_1_14rem] gap-2" data-testid="draft-actions">
      <p
        v-if="d.decision && d.status === 'pending'"
        class="rounded-xl bg-surface-2 p-3 text-sm leading-normal"
        data-testid="draft-decision"
      >
        <strong>{{ waitingLabel(d.decision) }}</strong> :
        {{ decisionDetail(d.decision, null) }}
      </p>
      <template v-if="d.status === 'pending' && !dismissing && !d.decision">
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-1">
          <UiButton
            variant="primary"
            class="order-2 sm:order-1"
            :loading="busy"
            data-action="accept"
            @click="emit('accept')"
          >
            {{ agreement ? 'Proposer de la garder' : 'Ajouter à la liste' }}
          </UiButton>
          <UiButton
            class="order-1 sm:order-2"
            :disabled="busy"
            data-action="dismiss"
            @click="dismissing = true"
          >
            {{ agreement ? 'Proposer de l’écarter' : 'Écarter' }}
          </UiButton>
        </div>
        <div class="grid grid-cols-2 gap-x-2 sm:grid-cols-1">
          <UiButton
            v-if="!agreement"
            variant="link"
            data-action="edit"
            @click="emit('edit')"
          >
            Modifier avant d’ajouter
          </UiButton>
          <UiButton
            v-if="d.url"
            :href="d.url"
            variant="link"
            icon-right="external"
            target="_blank"
            rel="noopener noreferrer"
            data-action="open"
            >{{
              d.portal ? `Ouvrir sur ${portalLabel}` : 'Ouvrir l’annonce'
            }}</UiButton
          >
        </div>
      </template>
      <form
        v-else-if="d.status === 'pending' && !d.decision"
        class="grid gap-2"
        data-testid="dismiss-form"
        @submit.prevent="confirmDismiss"
      >
        <UiField
          :id="`draft-${d.id}-reason`"
          v-model="reason"
          label="Pourquoi l’écarter ?"
          :hint="reasonRequired ? null : 'Facultatif.'"
          maxlength="500"
          align="left"
          placeholder="rez-de-chaussée sur rue"
        />
        <div class="grid grid-cols-2 gap-2">
          <UiButton @click="dismissing = false"> Annuler </UiButton>
          <UiButton
            type="submit"
            variant="danger"
            :disabled="busy || !canConfirm"
            data-action="confirm-dismiss"
          >
            {{ agreement ? 'Proposer' : 'Écarter' }}
          </UiButton>
        </div>
      </form>
      <p
        v-else-if="d.status === 'accepted'"
        class="rounded-xl bg-accent-soft p-3 text-sm font-semibold text-accent"
        data-testid="draft-added"
      >
        {{
          d.fit && d.fit.activeCriteria > 0 && d.fit.level === 'out'
            ? 'Ajoutée à l’étape « À étudier », repliée parmi les hors critères.'
            : 'Ajoutée à l’étape « À étudier ».'
        }}
        <RouterLink
          v-if="d.listingId"
          :to="{ name: 'listing', params: { id: d.listingId } }"
          class="underline underline-offset-2"
          >Ouvrir la fiche</RouterLink
        >
      </p>
      <p
        v-else-if="d.status === 'dismissed'"
        class="rounded-xl bg-surface-2 p-3 text-sm leading-normal"
        data-testid="draft-dismissed"
      >
        Écartée : Claude ne la proposera plus<template v-if="d.dismissReason">
          (« {{ d.dismissReason }} »)</template
        >.
        <UiButton
          variant="link"
          size="inline"
          data-action="undo"
          @click="emit('undo')"
        >
          Annuler
        </UiButton>
      </p>
      <p
        v-else-if="d.status === 'merged'"
        class="rounded-xl bg-accent-soft p-3 text-sm leading-normal text-accent"
        data-testid="draft-merged"
      >
        <strong>Fiche mise à jour</strong> :
        {{ d.merge?.summary ?? 'faits appliqués' }}, noté dans l’Historique.
        <RouterLink
          v-if="d.listingId"
          :to="{
            name: 'listing',
            params: { id: d.listingId },
            query: { onglet: 'historique' },
          }"
          class="underline underline-offset-2"
          >Voir la fiche</RouterLink
        >
      </p>
    </div>
  </article>
</template>
