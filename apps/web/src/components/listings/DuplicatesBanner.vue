<script setup lang="ts">
  import { computed } from 'vue'
  import { DUPLICATE_REASON_LABELS } from '@apart/contracts'
  import type { DuplicateCandidate } from '@apart/contracts'
  import UiButton from '@/components/ui/UiButton.vue'
  import { formatEuros, formatSurface } from '@/lib/format'
  import { cardClasses } from '@/lib/ui'
  import { LISTING_STATUS_LABELS } from '@/lib/labels'

  /**
   * Les annonces déjà suivies qui ressemblent à celle qu'on crée. Lot 18 :
   * une annonce publiée sur plusieurs portails ne se crée pas deux fois :
   * « C'est la même : ajouter ce lien » ajoute le lien collé (ou partagé
   * depuis le téléphone) à la fiche existante. Un même lien est déjà sur
   * une fiche : « Créer quand même » n'est pas proposé (une URL ne va pas
   * sur deux fiches) ; une même agence et une même référence est un doublon
   * certain, mis en avant. ADR 0041 : ce qui diffère malgré les motifs
   * (DPE voisin, prix éloigné) est dit sous les motifs.
   */
  const props = withDefaults(
    defineProps<{
      duplicates: DuplicateCandidate[]
      /** Le lien de l'annonce saisie : sans lui, rien à ajouter. */
      linkUrl?: string | null
      /** Un ajout de lien est en cours. */
      busy?: boolean
    }>(),
    { linkUrl: null, busy: false }
  )
  const emit = defineEmits<{
    open: [id: string]
    ignore: []
    attach: [id: string]
  }>()

  const sameLink = (candidate: DuplicateCandidate): boolean =>
    candidate.reasons.some(r => r.kind === 'same_url')
  /** Une URL déjà suivie : la créer quand même est refusé par le serveur. */
  const linkTaken = computed(() => props.duplicates.some(sameLink))
  const anyCertain = computed(() => props.duplicates.some(d => d.certain))
</script>

<template>
  <section
    v-if="duplicates.length > 0"
    role="alert"
    class="grid gap-2 text-sm"
    :class="cardClasses('warn')"
    data-testid="duplicates-banner"
  >
    <h3 class="font-display text-base font-bold text-warn">
      {{
        anyCertain
          ? 'C’est une annonce déjà suivie, publiée sur un autre portail'
          : duplicates.length === 1
            ? 'Cette annonce ressemble à une annonce déjà suivie'
            : `Cette annonce ressemble à ${duplicates.length} annonces déjà suivies`
      }}
    </h3>
    <ul class="grid gap-2">
      <li
        v-for="candidate in duplicates"
        :key="candidate.listingId"
        class="flex flex-wrap items-center justify-between gap-2"
        :data-certain="candidate.certain"
      >
        <span class="min-w-0 flex-[1_1_16rem]">
          <RouterLink
            :to="{ name: 'listing', params: { id: candidate.listingId } }"
            class="font-medium underline"
            >{{ candidate.title }}</RouterLink
          >
          <span class="text-muted">
            · {{ LISTING_STATUS_LABELS[candidate.status] }} ·
            {{ formatEuros(candidate.price) }} ·
            {{ formatSurface(candidate.surface) }}
            <template v-if="candidate.sellerReference">
              · réf. {{ candidate.sellerReference }}</template
            >
          </span>
          <span class="block text-sm text-muted">
            <strong v-if="candidate.certain" class="text-fg"
              >Même annonce :</strong
            >
            {{
              candidate.reasons
                .map(reason => DUPLICATE_REASON_LABELS[reason.kind])
                .join(', ')
            }}
            (score {{ Math.round(candidate.score * 100) }} %)
          </span>
          <span
            v-if="candidate.differences.length"
            class="block text-sm text-muted"
            data-testid="duplicate-differences"
          >
            Diffère : {{ candidate.differences.join(', ') }}
          </span>
        </span>
        <span class="flex flex-wrap gap-2">
          <UiButton
            v-if="linkUrl && !sameLink(candidate)"
            variant="outline"
            size="sm"
            :loading="busy"
            data-action="attach-link"
            @click="emit('attach', candidate.listingId)"
          >
            C’est la même : ajouter ce lien
          </UiButton>
          <UiButton size="sm" @click="emit('open', candidate.listingId)">
            {{
              sameLink(candidate)
                ? 'Ouvrir l’annonce qui a ce lien'
                : 'C’est un doublon, ouvrir l’existante'
            }}
          </UiButton>
        </span>
      </li>
    </ul>
    <p v-if="linkTaken" class="text-sm text-warn" data-testid="link-taken">
      Ce lien est déjà sur une fiche suivie : une même URL ne peut pas être sur
      deux fiches.
    </p>
    <div v-else class="flex justify-end">
      <UiButton size="sm" class="text-warn" @click="emit('ignore')">
        {{
          anyCertain
            ? 'C’en est une autre : créer quand même'
            : 'Créer quand même'
        }}
      </UiButton>
    </div>
  </section>
</template>
