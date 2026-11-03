<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { RENT_MARKET_MIN_COMPARABLES } from '@apart/contracts'
  import type { RentComparableInputRaw } from '@apart/contracts'
  import FormField from '@/components/ui/FormField.vue'
  import {
    useRentComparableMutations,
    useRentComparables,
  } from '@/composables/useStudy'
  import { ApiError } from '@/lib/api'
  import {
    formatDate,
    formatEuros,
    formatEurosPerMonth,
    formatPercent,
    formatSurface,
    parseNumberInput,
  } from '@/lib/format'
  import { CHECK_LEVEL_CLASSES, CHECK_LEVEL_LABELS } from '@/lib/labels'

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
  const { data, isPending, error } = useRentComparables(id)
  const mutations = useRentComparableMutations(id)
  const failure = ref<string | null>(null)

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
    failure.value = null
    const rent = parseNumberInput(draft.value.rent)
    const surface = parseNumberInput(draft.value.surface)
    if (rent === null || surface === null) {
      failure.value = 'Loyer et surface sont nécessaires.'
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
    try {
      await mutations.add.mutateAsync(input)
      draft.value = blank()
    } catch (err) {
      failure.value =
        err instanceof ApiError ? err.message : "L'ajout a échoué."
    }
  }

  async function remove(comparableId: string): Promise<void> {
    failure.value = null
    try {
      await mutations.remove.mutateAsync(comparableId)
    } catch (err) {
      failure.value =
        err instanceof ApiError ? err.message : 'La suppression a échoué.'
    }
  }

  const market = computed(() => data.value?.market ?? null)
  const rounded = computed(() =>
    market.value?.estimatedRent == null
      ? null
      : Math.round(market.value.estimatedRent)
  )
  const inputClass =
    'rounded-lg border border-line bg-bg px-2 py-1 text-sm w-full'
</script>

<template>
  <div class="grid gap-3 text-sm" data-testid="rent-market">
    <p v-if="isPending" class="text-muted">Chargement des comparables…</p>
    <p v-else-if="error" role="alert" class="text-bad">{{ error.message }}</p>
    <template v-else-if="data && market">
      <div class="grid gap-1" data-testid="rent-market-summary">
        <p>
          <span
            class="rounded-full px-2 py-0.5 text-xs font-semibold"
            :class="CHECK_LEVEL_CLASSES[market.level]"
            >{{ CHECK_LEVEL_LABELS[market.level] }}</span
          >
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
            sur {{ market.stats.count }} comparable(s) ({{
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
            Aucun comparable {{ furnished ? 'meublé' : 'vide' }} : saisissez-en
            {{ RENT_MARKET_MIN_COMPARABLES }} à 10.
          </template>
        </p>
        <p
          v-if="market.gapToMarket !== null || market.rentCap !== null"
          class="text-xs text-muted"
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
              }}{{ formatPercent(Math.abs(market.capGapToMarket)) }} par rapport
              au marché)</template
            >.
          </template>
        </p>
        <ul class="grid gap-0.5 text-xs text-muted">
          <li v-for="m in market.messages" :key="m">{{ m }}</li>
        </ul>
        <button
          v-if="rounded !== null && market.enough"
          type="button"
          class="justify-self-start rounded-lg border border-accent px-2 py-1 text-xs disabled:opacity-60"
          :disabled="busy || rounded === currentMarketRent"
          data-action="retain-market-rent"
          @click="emit('retain', rounded)"
        >
          {{
            rounded === currentMarketRent
              ? `Loyer de marché retenu : ${formatEuros(rounded)}`
              : `Retenir ${formatEuros(rounded)} comme loyer de marché (phase 2)`
          }}
        </button>
      </div>

      <table
        v-if="market.comparables.length"
        class="w-full text-xs tabular-nums"
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
              <button
                v-if="c.id"
                type="button"
                class="rounded border border-line px-1.5 text-muted"
                :aria-label="`Supprimer le comparable à ${formatEuros(c.rent)}`"
                @click="remove(c.id)"
              >
                ✕
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <form class="grid gap-2 sm:grid-cols-3" @submit.prevent="add">
        <FormField label="Loyer HC (€/mois)" for-id="rc-rent">
          <input
            id="rc-rent"
            v-model="draft.rent"
            :class="inputClass"
            inputmode="numeric"
          />
        </FormField>
        <FormField label="Surface (m²)" for-id="rc-surface">
          <input
            id="rc-surface"
            v-model="draft.surface"
            :class="inputClass"
            inputmode="decimal"
          />
        </FormField>
        <FormField label="Date de l’annonce" for-id="rc-date">
          <input
            id="rc-date"
            v-model="draft.observedAt"
            type="date"
            :class="inputClass"
          />
        </FormField>
        <FormField label="Lien" for-id="rc-url">
          <input
            id="rc-url"
            v-model="draft.url"
            :class="inputClass"
            type="url"
          />
        </FormField>
        <FormField label="Note" for-id="rc-note">
          <input id="rc-note" v-model="draft.note" :class="inputClass" />
        </FormField>
        <div class="flex items-end gap-2">
          <label class="flex items-center gap-1.5 text-xs">
            <input
              v-model="draft.furnished"
              type="checkbox"
              class="size-4 accent-[var(--accent)]"
            />
            meublé
          </label>
          <button
            type="submit"
            class="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-60"
            :disabled="mutations.add.isPending.value"
          >
            Ajouter
          </button>
        </div>
      </form>
      <p class="text-xs text-muted">
        Relevez les annonces de location vous-même (portails, agences) : rien
        n’est collecté automatiquement.
      </p>
    </template>
    <p v-if="failure" role="alert" class="text-xs text-bad">{{ failure }}</p>
  </div>
</template>
