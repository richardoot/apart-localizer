<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { SimilarListing } from '@apart/contracts'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiField from '@/components/ui/UiField.vue'
  import { useSimilarListings } from '@/composables/useListingMerge'
  import type { SimilarTarget } from '@/composables/useListingMerge'
  import {
    similarFacts,
    similarLevelText,
    similarSeller,
    similarStatus,
    similarTone,
  } from '@/lib/merge'

  /**
   * Lot 27 (ADR 0037) : « Déjà vue ». Les annonces suivies (écartées
   * comprises) qui ressemblent à celle qu'on regarde, la plus ressemblante
   * d'abord, avec ce qui concorde et ce qui diffère ; un champ pour chercher
   * par titre, lieu, agence, référence ou prix, sans perdre le classement.
   * Le parent décide ce que « C'est la même » fait (rattacher un brouillon,
   * fusionner deux fiches). Aucune règle ici : le classement vient de l'API.
   */
  const props = withDefaults(
    defineProps<{
      target: SimilarTarget
      /** Le bouton de chaque annonce. */
      actionLabel?: string
      /** Une écriture est en cours : les boutons attendent. */
      busy?: boolean
      limit?: number
    }>(),
    { actionLabel: 'C’est la même', busy: false, limit: 8 }
  )
  const emit = defineEmits<{ pick: [item: SimilarListing] }>()

  const search = ref('')
  const similar = useSimilarListings(
    computed(() => props.target),
    search,
    { limit: props.limit }
  )
  const items = computed(() => similar.data.value?.items ?? [])
  const summary = computed(() => similar.data.value?.summary ?? '')
</script>

<template>
  <div class="grid gap-3" data-testid="similar-picker">
    <UiField
      id="similar-search"
      v-model="search"
      label="Chercher dans les annonces suivies"
      type="search"
      align="left"
      placeholder="Titre, quartier, agence, référence, prix…"
      hint="Sans rien écrire, les annonces les plus ressemblantes sont proposées d’abord."
      autocomplete="off"
      data-testid="similar-search"
    />
    <QueryState
      :query="similar"
      :empty="items.length === 0"
      skeleton="rows"
      loading-label="les annonces ressemblantes"
      error-fallback="Impossible de chercher les annonces ressemblantes."
    >
      <template #empty>
        <p
          class="rounded-xl border border-dashed border-line px-3.5 py-3 text-sm text-muted"
          data-testid="similar-empty"
        >
          {{ summary || 'Aucune annonce suivie ne lui ressemble' }}. Essaie un
          mot du titre, le quartier ou la référence de l’agence.
        </p>
      </template>
      <p class="sr-only" aria-live="polite">{{ summary }}</p>
      <ul class="m-0 grid list-none gap-2.5 p-0" data-testid="similar-list">
        <li
          v-for="item in items"
          :key="item.listingId"
          class="grid gap-2 rounded-xl border border-line bg-surface px-3.5 py-3"
          :data-similar="item.listingId"
          :data-level="item.level"
        >
          <div
            class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1"
          >
            <RouterLink
              :to="{ name: 'listing', params: { id: item.listingId } }"
              target="_blank"
              class="min-w-0 flex-[1_1_14rem] font-semibold text-fg underline-offset-2 hover:underline"
              >{{ item.title }}
              <span class="sr-only"
                >(ouvre la fiche dans un nouvel onglet)</span
              >
            </RouterLink>
            <UiBadge
              :tone="similarTone(item.level)"
              data-testid="similar-level"
            >
              {{ similarLevelText(item) }}
            </UiBadge>
          </div>
          <p class="text-sm text-muted">
            {{ similarFacts(item) }}
          </p>
          <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <UiBadge
              :tone="similarStatus(item).archived ? 'warn' : 'neutral'"
              data-testid="similar-status"
              >{{ similarStatus(item).label }}</UiBadge
            >
            <span v-if="similarSeller(item)" class="text-muted">{{
              similarSeller(item)
            }}</span>
          </p>
          <ul
            v-if="item.matches.length"
            class="m-0 ml-4.5 list-disc p-0 text-sm"
            aria-label="Ce qui concorde"
          >
            <li v-for="match in item.matches" :key="match.text">
              {{ match.text }}
            </li>
          </ul>
          <p
            v-if="item.differences.length"
            class="text-sm text-muted"
            data-testid="similar-differences"
          >
            Diffère : {{ item.differences.map(d => d.text).join(' ; ') }}
          </p>
          <div class="flex justify-end">
            <UiButton
              variant="primary"
              size="sm"
              :disabled="busy"
              data-action="pick-similar"
              @click="emit('pick', item)"
            >
              {{ actionLabel }}
            </UiButton>
          </div>
        </li>
      </ul>
    </QueryState>
  </div>
</template>
