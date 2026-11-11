<script setup lang="ts">
  import { computed } from 'vue'
  import { useDrafts } from '@/composables/useDrafts'
  import { draftSourceLabel, draftWhen, pendingDuplicate } from '@/lib/drafts'
  import { formatEuros, plural } from '@/lib/format'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import { cardClasses } from '@/lib/ui'

  /**
   * La boîte « À valider » de la Synthèse : combien d'annonces attendent
   * (reçues par e-mail ou trouvées par Claude en explorant les portails), les
   * trois plus récentes, et un lien vers l'étape « À valider » de la page
   * Annonces, où se décide chacune (lot 16).
   */
  const { data } = useDrafts()
  const drafts = computed(() => data.value ?? [])
  const shown = computed(() => drafts.value.slice(0, 3))
</script>

<template>
  <section
    v-if="drafts.length"
    id="brouillons"
    class="grid gap-2"
    :class="cardClasses()"
    aria-labelledby="drafts-title"
    data-testid="drafts"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 id="drafts-title" class="font-display text-base font-bold">
        À valider
        <UiBadge tone="accent" variant="solid" class="ml-1">{{
          drafts.length
        }}</UiBadge>
      </h2>
      <UiButton
        :to="{ name: 'listings', query: { etape: 'a-valider' } }"
        variant="primary"
        icon-right="arrow-right"
        data-testid="drafts-open"
      >
        Voir dans Annonces, étape À valider
      </UiButton>
    </div>
    <!-- Lot 23 : au téléphone, le compte et le lien suffisent (« Ce qui t'attend » dit déjà « à trier »). -->
    <ul class="hidden gap-1.5 sm:grid">
      <li
        v-for="draft in shown"
        :key="draft.id"
        class="flex flex-wrap items-center gap-x-2 text-sm"
      >
        <strong>{{ draft.listing.title }}</strong>
        <span class="text-muted">
          ·
          {{
            draft.listing.price ? formatEuros(draft.listing.price) : 'prix ?'
          }}
          <template v-if="draft.listing.location.commune">
            · {{ draft.listing.location.commune }}</template
          >
          · {{ draftSourceLabel(draft) }} · {{ draftWhen(draft) }}
        </span>
        <UiBadge v-if="pendingDuplicate(draft)" tone="warn"
          >doublon probable</UiBadge
        >
      </li>
    </ul>
    <p
      v-if="drafts.length > shown.length"
      class="hidden text-sm text-muted sm:block"
    >
      Et {{ plural(drafts.length - shown.length, 'autre') }}.
    </p>
    <p class="hidden text-sm text-muted sm:block">
      Rien n’est ajouté à la liste sans ton choix : ajoute, écarte ou tranche un
      doublon depuis l’étape « À valider ».
    </p>
  </section>
</template>
