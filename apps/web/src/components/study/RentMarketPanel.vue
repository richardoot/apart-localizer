<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { RENT_MARKET_MIN_COMPARABLES } from '@apart/contracts'
  import type { CheckLevel, RentComparableInputRaw } from '@apart/contracts'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiConfirm from '@/components/ui/UiConfirm.vue'
  import UiField from '@/components/ui/UiField.vue'
  import { useAction } from '@/composables/useAction'
  import {
    useRentComparableMutations,
    useRentComparables,
  } from '@/composables/useStudy'
  import {
    formatDate,
    formatEuros,
    formatEurosPerMonth,
    formatPercent,
    formatSurface,
    numberInputError,
    parseNumberInput,
    plural,
  } from '@/lib/format'
  import { CHECK_LEVEL_LABELS } from '@/lib/labels'
  import type { Tone } from '@/lib/ui'

  /**
   * Loyer de marché (besoin L4) : 5 à 10 annonces de location comparables
   * saisies à la main (jamais collectées sur les portails), leur médiane au
   * m², la position du loyer visé et du plafond d'encadrement. La synthèse
   * vient du serveur (`domain`) ; « Retenir » écrit le loyer de marché de la
   * phase 2.
   */
  const props = defineProps<{
    listingId: string
    /** L'annonce sera louée meublée : les comparables saisis le sont par défaut. */
    furnished: boolean
    currentMarketRent: number | null
    busy?: boolean
  }>()
  const emit = defineEmits<{ retain: [rent: number] }>()

  const id = computed(() => props.listingId)
  const comparablesQuery = useRentComparables(id)
  const { data } = comparablesQuery
  const mutations = useRentComparableMutations(id)
  // Lot 22 : l'échec d'un ajout ou d'une suppression se dit sous le
  // formulaire ; un nombre illisible, à son champ.
  const action = useAction('L’ajout a échoué.')
  const fieldErrors = ref<{ rent: string | null; surface: string | null }>({
    rent: null,
    surface: null,
  })
  const LEVEL_TONES: Record<CheckLevel, Tone> = {
    ok: 'good',
    warn: 'warn',
    bad: 'bad',
    unknown: 'neutral',
  }

  const blank = () => ({
    rent: '',
    surface: '',
    furnished: props.furnished,
    observedAt: '',
    url: '',
    note: '',
  })
  const draft = ref(blank())

  async function add(): Promise<void> {
    action.clear()
    const rent = parseNumberInput(draft.value.rent)
    const surface = parseNumberInput(draft.value.surface)
    fieldErrors.value = {
      rent:
        numberInputError(draft.value.rent) ??
        (rent === null ? 'Le loyer est nécessaire.' : null),
      surface:
        numberInputError(draft.value.surface) ??
        (surface === null ? 'La surface est nécessaire.' : null),
    }
    if (rent === null || surface === null || fieldErrors.value.rent) {
      document
        .getElementById(fieldErrors.value.rent ? 'rc-rent' : 'rc-surface')
        ?.focus()
      return
    }
    const input: RentComparableInputRaw = {
      rent,
      surface,
      furnished: draft.value.furnished,
      observedAt: draft.value.observedAt || null,
      url: draft.value.url.trim() || null,
      note: draft.value.note.trim() || null,
    }
    const added = await action.run(() => mutations.add.mutateAsync(input), {
      success: 'Comparable ajouté.',
    })
    if (added) draft.value = blank()
  }

  async function remove(comparableId: string): Promise<void> {
    await action.run(() => mutations.remove.mutateAsync(comparableId), {
      success: 'Comparable supprimé.',
      fallback: 'La suppression a échoué.',
    })
  }

  const market = computed(() => data.value?.market ?? null)
  const rounded = computed(() =>
    market.value?.estimatedRent == null
      ? null
      : Math.round(market.value.estimatedRent)
  )
</script>

<template>
  <div class="grid gap-3 text-sm" data-testid="rent-market">
    <QueryState
      :query="comparablesQuery"
      loading-label="des comparables"
      error-fallback="La lecture des comparables a échoué."
    >
      <template v-if="data && market">
        <div class="grid gap-1" data-testid="rent-market-summary">
          <p>
            <UiBadge :tone="LEVEL_TONES[market.level]">{{
              CHECK_LEVEL_LABELS[market.level]
            }}</UiBadge>
            <template v-if="market.stats">
              Médiane
              <strong
                >{{
                  market.stats.medianRentPerM2.toLocaleString('fr-FR', {
                    maximumFractionDigits: 2,
                  })
                }}
                €/m²</strong
              >
              sur {{ plural(market.stats.count, 'comparable') }} ({{
                market.stats.p25RentPerM2.toLocaleString('fr-FR', {
                  maximumFractionDigits: 2,
                })
              }}
              à
              {{
                market.stats.p75RentPerM2.toLocaleString('fr-FR', {
                  maximumFractionDigits: 2,
                })
              }}
              €/m² pour la moitié centrale)
              <template v-if="market.estimatedRent !== null">
                · loyer estimé ≈
                <strong>{{ formatEurosPerMonth(market.estimatedRent) }}</strong>
              </template>
            </template>
            <template v-else>
              Aucun comparable {{ furnished ? 'meublé' : 'vide' }} : saisis-en
              {{ RENT_MARKET_MIN_COMPARABLES }} à 10.
            </template>
          </p>
          <p
            v-if="market.gapToMarket !== null || market.rentCap !== null"
            class="text-sm text-muted"
          >
            <template v-if="market.gapToMarket !== null">
              Loyer visé {{ market.gapToMarket >= 0 ? '+' : '−'
              }}{{ formatPercent(Math.abs(market.gapToMarket)) }} par rapport au
              marché estimé
              <template v-if="market.targetPercentile !== null">
                (au-dessus de {{ Math.round(market.targetPercentile * 100) }} %
                des comparables au m²)</template
              >.
            </template>
            <template v-if="market.rentCap !== null">
              Plafond d’encadrement {{ formatEurosPerMonth(market.rentCap) }}
              <template v-if="market.capGapToMarket !== null">
                ({{ market.capGapToMarket >= 0 ? '+' : '−'
                }}{{ formatPercent(Math.abs(market.capGapToMarket)) }} par
                rapport au marché)</template
              >.
            </template>
          </p>
          <ul class="grid gap-0.5 text-sm text-muted">
            <li v-for="m in market.messages" :key="m">{{ m }}</li>
          </ul>
          <UiButton
            v-if="rounded !== null && market.enough"
            variant="outline"
            size="sm"
            class="justify-self-start"
            :disabled="busy || rounded === currentMarketRent"
            data-action="retain-market-rent"
            @click="emit('retain', rounded)"
          >
            {{
              rounded === currentMarketRent
                ? `Loyer de marché retenu : ${formatEuros(rounded)}`
                : `Retenir ${formatEuros(rounded)} comme loyer de marché (phase 2)`
            }}
          </UiButton>
        </div>

        <table
          v-if="market.comparables.length"
          class="w-full text-sm tabular-nums"
        >
          <thead class="text-left text-muted">
            <tr>
              <th class="py-1">Loyer</th>
              <th>Surface</th>
              <th>€/m²</th>
              <th>Type</th>
              <th>Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in market.comparables"
              :key="c.id ?? c.rent"
              class="border-t border-line"
              :class="c.included ? '' : 'text-muted line-through'"
              :title="c.reason ?? undefined"
            >
              <td class="py-0.5">{{ formatEurosPerMonth(c.rent) }}</td>
              <td>{{ formatSurface(c.surface) }}</td>
              <td>
                {{
                  c.rentPerM2.toLocaleString('fr-FR', {
                    maximumFractionDigits: 2,
                  })
                }}
              </td>
              <td>{{ c.furnished ? 'meublé' : 'vide' }}</td>
              <td :class="c.stale ? 'text-warn' : ''">
                {{ formatDate(c.observedAt) }}
              </td>
              <td class="text-right">
                <UiConfirm
                  v-if="c.id"
                  label="Supprimer"
                  variant="ghost"
                  icon="trash"
                  question="Supprimer ce comparable ?"
                  :aria-label="`Supprimer le comparable à ${formatEuros(c.rent)}`"
                  :busy="mutations.remove.isPending.value"
                  @confirm="remove(c.id)"
                />
              </td>
            </tr>
          </tbody>
        </table>

        <form
          class="grid gap-2 sm:grid-cols-3"
          novalidate
          @submit.prevent="add"
        >
          <UiField
            id="rc-rent"
            v-model="draft.rent"
            label="Loyer HC"
            unit="€/mois"
            inputmode="numeric"
            :error="fieldErrors.rent"
          />
          <UiField
            id="rc-surface"
            v-model="draft.surface"
            label="Surface"
            unit="m²"
            inputmode="decimal"
            :error="fieldErrors.surface"
          />
          <UiField
            id="rc-date"
            v-model="draft.observedAt"
            label="Date de l’annonce"
            type="date"
            align="left"
          />
          <UiField id="rc-url" v-model="draft.url" label="Lien" type="url" />
          <UiField id="rc-note" v-model="draft.note" label="Note" />
          <div class="flex items-end gap-2">
            <UiCheckbox v-model="draft.furnished" label="meublé" />
            <UiButton
              type="submit"
              variant="primary"
              :loading="mutations.add.isPending.value"
            >
              Ajouter
            </UiButton>
          </div>
        </form>
        <UiAlert v-if="action.error.value">{{ action.error.value }}</UiAlert>
        <p class="text-sm text-muted">
          Relève les annonces de location toi-même (portails, agences) : rien
          n’est collecté automatiquement.
        </p>
      </template>
    </QueryState>
  </div>
</template>
