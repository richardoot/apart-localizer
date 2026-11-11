<script setup lang="ts">
  import { computed } from 'vue'
  import {
    RenovationLevelSchema,
    SUGGESTED_RENOVATION_ITEMS,
  } from '@apart/contracts'
  import type { Listing } from '@apart/contracts'
  import { renovationTotal } from '@apart/domain'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiChip from '@/components/ui/UiChip.vue'
  import UiField from '@/components/ui/UiField.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'
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

  const LEVEL_OPTIONS = [
    { value: '', label: 'À préciser' },
    ...RenovationLevelSchema.options.map(level => ({
      value: level,
      label: RENOVATION_LEVEL_LABELS[level],
    })),
  ]
  const errorOf = (key: string): string | null =>
    editor.errors.value[key] ?? null
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
      <UiBadge
        v-if="changed"
        tone="accent"
        variant="solid"
        title="Modifié depuis ta dernière ouverture de la fiche"
        >modifié</UiBadge
      >
      <UiButton
        variant="link"
        data-testid="works-to-budget"
        @click="emit('go', 'budget')"
      >
        compté dans le coût tout compris
      </UiButton>
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
      <p v-if="renovation && !renovation.active" class="text-sm text-warn">
        Travaux décochés : les postes ne comptent pas dans le coût tout compris.
      </p>
    </template>

    <template #edit>
      <UiCheckbox
        v-model="form.renovation.active"
        label="Prévoir des travaux avant d’y habiter"
        data-testid="works-active"
      />
      <div class="grid gap-3 sm:grid-cols-2">
        <UiField
          id="f-ren-level"
          v-model="form.renovation.level"
          as="select"
          label="Ampleur"
          :options="LEVEL_OPTIONS"
          :error="errorOf('renovation.level')"
        />
        <UiField
          id="f-ren-duration"
          v-model="form.renovation.durationMonths"
          label="Durée estimée"
          unit="mois"
          inputmode="numeric"
          :error="errorOf('renovation.durationMonths')"
        />
      </div>

      <ul class="grid gap-2" aria-label="Postes de travaux">
        <li
          v-for="(item, index) in form.renovation.items"
          :key="item.key"
          class="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end"
          data-testid="works-item"
        >
          <UiField
            :id="`f-ren-item-${item.key}`"
            v-model="item.label"
            label="Poste"
            quiet
            :aria-label="`Poste ${index + 1}`"
            :error="errorOf(`renovation.items.${index}.label`)"
          />
          <UiField
            :id="`f-ren-amount-${item.key}`"
            v-model="item.amount"
            label="Montant"
            quiet
            unit="€"
            inputmode="numeric"
            aria-label="Montant du poste"
            :error="errorOf(`renovation.items.${index}.amount`)"
          />
          <UiButton
            variant="danger-soft"
            icon="trash"
            aria-label="Supprimer le poste"
            @click="removeItem(item.key)"
          >
            Supprimer le poste
          </UiButton>
        </li>
      </ul>
      <p v-if="form.renovation.items.length === 0" class="text-sm text-muted">
        Aucun poste : ajoutes-en un ci-dessous.
      </p>
      <div
        class="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Postes fréquents"
      >
        <span class="text-sm text-muted">Ajouter :</span>
        <UiChip
          v-for="suggestion in SUGGESTED_RENOVATION_ITEMS"
          :key="suggestion"
          :toggle="false"
          @click="addItem(suggestion)"
        >
          <UiIcon name="plus" />{{ suggestion }}
        </UiChip>
        <UiChip :toggle="false" class="text-accent" @click="addItem()">
          <UiIcon name="plus" />Autre poste
        </UiChip>
      </div>
      <p class="text-sm tabular-nums">
        Total des travaux :
        <strong data-testid="renovation-total">{{
          formatEuros(draftTotal)
        }}</strong>
        <span v-if="!form.renovation.active" class="text-sm text-muted">
          (non compté tant que « Prévoir des travaux » n’est pas coché)</span
        >
      </p>
      <UiField
        id="f-ren-notes"
        v-model="form.renovation.notes"
        label="Notes travaux (devis, artisans, contraintes copro)"
        :error="errorOf('renovation.notes')"
      />
    </template>
  </EditableSection>
</template>
