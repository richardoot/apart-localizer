<script setup lang="ts">
  import { computed } from 'vue'
  import {
    RenovationLevelSchema,
    SUGGESTED_RENOVATION_ITEMS,
  } from '@apart/contracts'
  import type { Listing } from '@apart/contracts'
  import { renovationTotal } from '@apart/domain'
  import FormField from '@/components/ui/FormField.vue'
  import { useListingEditor } from '@/composables/useListingEditor'
  import { formatEuros, parseNumberInput } from '@/lib/format'
  import { RENOVATION_LEVEL_LABELS } from '@/lib/labels'
  import { itemKey } from '@/lib/listing-form'
  import type { ListingTab } from '@/lib/listing-tabs'
  import { provenanceOf } from '@/lib/provenance'
  import AiMark from '../sections/AiMark.vue'
  import EditableSection from '../sections/EditableSection.vue'

  /**
   * Lot 19 : « Travaux avant d'emménager », en tête du bien et mis en avant.
   * Lecture : total, ampleur, durée, postes et notes ; le total compte dans le
   * coût tout compris (onglet Budget). « Modifier les travaux » ouvre
   * l'édition sur place (postes, montants, postes fréquents) avec l'aperçu en
   * direct du coût, de la mensualité et du verdict.
   */
  const props = defineProps<{ listing: Listing }>()
  const emit = defineEmits<{ go: [tab: ListingTab] }>()

  const editor = useListingEditor()
  const form = computed(() => editor.draft.value)
  const renovationLevels = RenovationLevelSchema.options

  const renovation = computed(() => props.listing.renovation)
  const total = computed(() => renovationTotal(renovation.value))
  const planned = computed(
    () =>
      renovation.value !== null &&
      (renovation.value.active || renovation.value.items.length > 0)
  )
  const facts = computed(() => {
    const r = renovation.value
    if (!r) return []
    return [
      r.level ? RENOVATION_LEVEL_LABELS[r.level] : null,
      r.durationMonths !== null
        ? `${r.durationMonths} mois estimé${r.durationMonths > 1 ? 's' : ''}`
        : null,
    ].filter((v): v is string => v !== null)
  })
  const provenance = computed(() =>
    provenanceOf(editor.fieldSources.value, 'renovation')
  )
  const changed = computed(() =>
    editor.changedFields.value.some(
      k => k === 'renovation' || k.startsWith('renovation.')
    )
  )

  /** Le total du brouillon, par la règle de `domain`. */
  const draftTotal = computed(() =>
    renovationTotal({
      active: form.value.renovation.active,
      items: form.value.renovation.items.map(item => ({
        amount: parseNumberInput(item.amount),
      })),
    })
  )

  function addItem(label = ''): void {
    form.value.renovation.active = true
    form.value.renovation.items.push({ key: itemKey(), label, amount: '' })
  }

  function removeItem(key: string): void {
    form.value.renovation.items = form.value.renovation.items.filter(
      item => item.key !== key
    )
  }

  const inputClass =
    'min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg sm:min-h-10'
  const chip =
    'inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-3 text-sm hover:bg-surface-2 sm:min-h-10'
</script>

<template>
  <EditableSection
    section="works"
    title="Travaux avant d’emménager"
    edit-label="Modifier les travaux"
    highlight
    preview
  >
    <div class="flex flex-wrap items-baseline gap-x-6 gap-y-1">
      <strong
        class="font-display text-[28px] leading-none font-bold tabular-nums"
        data-testid="works-total"
        >{{ formatEuros(total) }}</strong
      >
      <span v-if="facts.length" class="text-sm">{{ facts.join(' · ') }}</span>
      <AiMark :provenance="provenance" />
      <span
        v-if="changed"
        class="rounded-md bg-accent px-1.5 text-[11px] leading-[18px] font-semibold text-accent-fg"
        title="Modifié depuis votre dernière ouverture de la fiche"
        >modifié</span
      >
      <button
        type="button"
        class="inline-flex min-h-11 items-center text-sm text-accent underline-offset-2 hover:underline sm:min-h-9"
        data-testid="works-to-budget"
        @click="emit('go', 'budget')"
      >
        compté dans le coût tout compris
      </button>
    </div>
    <p v-if="!planned" class="text-sm text-muted" data-testid="works-none">
      Aucuns travaux prévus : le bien est considéré comme habitable en l’état.
    </p>
    <template v-else>
      <table
        v-if="renovation && renovation.items.length"
        class="w-full text-sm tabular-nums"
        data-testid="works-items"
      >
        <caption class="sr-only">
          Postes de travaux
        </caption>
        <tbody>
          <tr
            v-for="item in renovation.items"
            :key="item.id"
            class="border-t border-line first:border-t-0"
          >
            <th scope="row" class="py-2 pr-3 text-left font-normal">
              {{ item.label }}
            </th>
            <td class="py-2 text-right whitespace-nowrap">
              {{
                item.amount === null ? 'à chiffrer' : formatEuros(item.amount)
              }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="text-sm text-muted">Aucun poste chiffré.</p>
      <p
        v-if="renovation?.notes"
        class="text-sm text-muted"
        data-testid="works-notes"
      >
        {{ renovation.notes }}
      </p>
      <p v-if="renovation && !renovation.active" class="text-xs text-warn">
        Travaux décochés : les postes ne comptent pas dans le coût tout compris.
      </p>
    </template>

    <template #edit>
      <label class="flex min-h-11 items-center gap-2 text-sm sm:min-h-9">
        <input
          v-model="form.renovation.active"
          type="checkbox"
          class="size-4 accent-accent"
          data-testid="works-active"
        />
        Prévoir des travaux avant d’y habiter
      </label>
      <div class="grid gap-3 sm:grid-cols-2">
        <FormField label="Ampleur" for-id="f-ren-level">
          <select
            id="f-ren-level"
            v-model="form.renovation.level"
            :class="inputClass"
          >
            <option value="">À préciser</option>
            <option
              v-for="level in renovationLevels"
              :key="level"
              :value="level"
            >
              {{ RENOVATION_LEVEL_LABELS[level] }}
            </option>
          </select>
        </FormField>
        <FormField label="Durée estimée (mois)" for-id="f-ren-duration">
          <input
            id="f-ren-duration"
            v-model="form.renovation.durationMonths"
            :class="inputClass"
            inputmode="numeric"
          />
        </FormField>
      </div>

      <ul class="grid gap-2" aria-label="Postes de travaux">
        <li
          v-for="(item, index) in form.renovation.items"
          :key="item.key"
          class="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end"
          data-testid="works-item"
        >
          <label class="grid gap-1 text-xs font-medium text-muted">
            Poste
            <input
              v-model="item.label"
              :class="inputClass"
              :aria-label="`Poste ${index + 1}`"
            />
          </label>
          <label class="grid gap-1 text-xs font-medium text-muted">
            Montant (€)
            <input
              v-model="item.amount"
              :class="inputClass"
              inputmode="numeric"
              aria-label="Montant du poste"
            />
          </label>
          <button
            type="button"
            class="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm hover:text-bad sm:min-h-10"
            aria-label="Supprimer le poste"
            @click="removeItem(item.key)"
          >
            Supprimer le poste
          </button>
        </li>
      </ul>
      <p v-if="form.renovation.items.length === 0" class="text-sm text-muted">
        Aucun poste : ajoutez-en un ci-dessous.
      </p>
      <div
        class="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Postes fréquents"
      >
        <span class="text-sm text-muted">Ajouter :</span>
        <button
          v-for="suggestion in SUGGESTED_RENOVATION_ITEMS"
          :key="suggestion"
          type="button"
          :class="chip"
          @click="addItem(suggestion)"
        >
          {{ suggestion }}
        </button>
        <button
          type="button"
          :class="chip"
          class="border-accent text-accent"
          @click="addItem()"
        >
          Autre poste
        </button>
      </div>
      <p class="text-sm tabular-nums">
        Total des travaux :
        <strong data-testid="renovation-total">{{
          formatEuros(draftTotal)
        }}</strong>
        <span v-if="!form.renovation.active" class="text-xs text-muted">
          (non compté tant que « Prévoir des travaux » n’est pas coché)</span
        >
      </p>
      <FormField
        label="Notes travaux (devis, artisans, contraintes copro)"
        for-id="f-ren-notes"
      >
        <input
          id="f-ren-notes"
          v-model="form.renovation.notes"
          :class="inputClass"
        />
      </FormField>
    </template>
  </EditableSection>
</template>
