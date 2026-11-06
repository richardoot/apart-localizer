<script setup lang="ts">
  import { computed } from 'vue'
  import type { Listing, ListingQuestionField, Task } from '@apart/contracts'
  import FormField from '@/components/ui/FormField.vue'
  import { useListingEditor } from '@/composables/useListingEditor'
  import { formatEuros } from '@/lib/format'
  import type { ListingTab } from '@/lib/listing-tabs'
  import EditableSection from '../sections/EditableSection.vue'
  import ReadItem from '../sections/ReadItem.vue'
  import { changedKeysOf, fieldMeta } from './field-meta'

  /**
   * Lot 19 : « Copropriété et charges » : lots et syndic, charges (et part
   * non récupérable, estimée à 25 % faute de saisie), taxe foncière (si elle
   * manque et qu'une tâche la demande à l'annonceur, le dire et mener à
   * « À faire »), travaux votés, procédures, honoraires.
   */
  const props = defineProps<{ listing: Listing; tasks: Task[] }>()
  const emit = defineEmits<{ go: [tab: ListingTab] }>()

  const editor = useListingEditor()
  const form = computed(() => editor.draft.value)
  const meta = (path: string) =>
    fieldMeta(editor.fieldSources.value, editor.changedFields.value, path)

  const l = computed(() => props.listing)

  /** La tâche ouverte qui demande ce champ à l'annonceur, s'il y en a une. */
  function askingTask(field: ListingQuestionField): Task | null {
    return props.tasks.find(t => t.field === field && !t.done) ?? null
  }
  type Asked = 'requested' | 'open' | null
  function askedState(field: ListingQuestionField): Asked {
    const task = askingTask(field)
    if (!task) return null
    return task.requestedAt !== null || task.requestId !== null
      ? 'requested'
      : 'open'
  }
  const taxAsked = computed(() => askedState('propertyTax'))
  const chargesAsked = computed(() => askedState('annualCharges'))

  const lots = computed(() => {
    const parts = [
      l.value.lotsCount !== null ? `${l.value.lotsCount} lots` : null,
      // « Syndic professionnel » se lit tel quel ; « Foncia » devient « syndic Foncia ».
      l.value.syndic
        ? /^syndic\b/i.test(l.value.syndic.trim())
          ? l.value.syndic.trim()
          : `syndic ${l.value.syndic.trim()}`
        : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : null
  })
  const nonRecoverable = computed(() =>
    l.value.nonRecoverableChargesMonthly !== null
      ? `dont ${formatEuros(l.value.nonRecoverableChargesMonthly)}/mois non récupérables`
      : l.value.annualCharges !== null && l.value.annualCharges > 0
        ? 'part non récupérable estimée à 25 %'
        : null
  )
  const fees = computed(() => {
    const payer =
      l.value.feesPayer === 'buyer'
        ? 'à charge de l’acquéreur'
        : l.value.feesPayer === 'seller'
          ? 'à charge du vendeur'
          : null
    if (l.value.feesAmount !== null) {
      return [formatEuros(l.value.feesAmount), payer].filter(Boolean).join(', ')
    }
    return payer
      ? `${payer.charAt(0).toUpperCase()}${payer.slice(1)}`
      : 'Inclus ou à charge du vendeur'
  })

  const inputClass =
    'min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg sm:min-h-10'
  const linkClass =
    'inline-flex min-h-11 items-center font-normal text-accent underline-offset-2 hover:underline sm:min-h-0'
</script>

<template>
  <EditableSection section="copro" title="Copropriété et charges">
    <dl
      class="@container grid grid-cols-2 gap-x-5 gap-y-3 @xl:grid-cols-3"
      data-testid="copro"
    >
      <ReadItem
        label="Lots"
        :value="lots"
        source="lotsCount"
        :changed-keys="['lotsCount', 'syndic']"
      />
      <ReadItem
        label="Charges"
        source="annualCharges"
        :changed-keys="['annualCharges', 'nonRecoverableChargesMonthly']"
        :tone="listing.annualCharges === null ? 'warn' : 'default'"
      >
        <template v-if="listing.annualCharges !== null"
          >{{ formatEuros(listing.annualCharges) }}/an<span
            v-if="nonRecoverable"
            class="block text-xs font-normal text-muted"
            >{{ nonRecoverable }}</span
          ></template
        >
        <template v-else-if="chargesAsked"
          >{{
            chargesAsked === 'requested'
              ? 'Demandées à l’annonceur'
              : 'Inconnues, à demander'
          }}
          ·
          <button
            type="button"
            :class="linkClass"
            data-testid="charges-to-todo"
            @click="emit('go', 'a-faire')"
          >
            {{ chargesAsked === 'requested' ? 'suivre' : 'À faire' }}
          </button></template
        >
        <template v-else>Inconnues</template>
      </ReadItem>
      <ReadItem
        label="Taxe foncière"
        source="propertyTax"
        :changed-keys="changedKeysOf('propertyTax')"
        :tone="listing.propertyTax === null ? 'warn' : 'default'"
      >
        <span data-testid="property-tax">
          <template v-if="listing.propertyTax !== null"
            >{{ formatEuros(listing.propertyTax) }}/an</template
          >
          <template v-else-if="taxAsked"
            >{{
              taxAsked === 'requested'
                ? 'Demandée à l’annonceur'
                : 'Inconnue, à demander'
            }}
            ·
            <button
              type="button"
              :class="linkClass"
              data-testid="tax-to-todo"
              @click="emit('go', 'a-faire')"
            >
              {{ taxAsked === 'requested' ? 'suivre' : 'À faire' }}
            </button></template
          >
          <template v-else>Inconnue, estimée à un mois de loyer</template>
        </span>
      </ReadItem>
      <ReadItem
        label="Travaux votés"
        :value="listing.votedWorks"
        source="votedWorks"
        :changed-keys="changedKeysOf('votedWorks')"
        :tone="listing.votedWorks ? 'warn' : 'default'"
      />
      <ReadItem
        label="Procédures"
        :value="listing.proceedings"
        source="proceedings"
        :changed-keys="changedKeysOf('proceedings')"
      />
      <ReadItem
        label="Honoraires"
        :value="fees"
        source="feesAmount"
        :changed-keys="['feesAmount', 'feesPayer']"
      />
    </dl>

    <template #edit>
      <div class="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Nombre de lots"
          for-id="f-lots"
          v-bind="meta('lotsCount')"
        >
          <input
            id="f-lots"
            v-model="form.lotsCount"
            :class="inputClass"
            inputmode="numeric"
          />
        </FormField>
        <FormField label="Syndic" for-id="f-syndic" v-bind="meta('syndic')">
          <input id="f-syndic" v-model="form.syndic" :class="inputClass" />
        </FormField>
        <FormField
          label="Charges de copropriété (€/an, total)"
          for-id="f-charges"
          v-bind="meta('annualCharges')"
          hint="Budget prévisionnel"
        >
          <input
            id="f-charges"
            v-model="form.annualCharges"
            :class="inputClass"
            inputmode="numeric"
          />
        </FormField>
        <FormField
          label="dont non récupérables (€/mois)"
          for-id="f-nonrec"
          v-bind="meta('nonRecoverableChargesMonthly')"
          hint="Vide = 25 % des charges"
        >
          <input
            id="f-nonrec"
            v-model="form.nonRecoverableChargesMonthly"
            :class="inputClass"
            inputmode="numeric"
          />
        </FormField>
        <FormField
          label="Taxe foncière (€/an)"
          for-id="f-tax"
          v-bind="meta('propertyTax')"
          hint="Vide = un mois de loyer"
        >
          <input
            id="f-tax"
            v-model="form.propertyTax"
            :class="inputClass"
            inputmode="numeric"
          />
        </FormField>
        <FormField
          label="Honoraires acquéreur (€)"
          for-id="f-fees"
          v-bind="meta('feesAmount')"
          hint="Vide = inclus ou à charge vendeur"
        >
          <input
            id="f-fees"
            v-model="form.feesAmount"
            :class="inputClass"
            inputmode="numeric"
          />
        </FormField>
        <FormField
          label="Honoraires à charge de"
          for-id="f-fees-payer"
          v-bind="meta('feesPayer')"
        >
          <select
            id="f-fees-payer"
            v-model="form.feesPayer"
            :class="inputClass"
          >
            <option value="">Non précisé</option>
            <option value="buyer">L’acquéreur</option>
            <option value="seller">Le vendeur</option>
          </select>
        </FormField>
        <FormField
          label="Procédures en cours"
          for-id="f-proceedings"
          v-bind="meta('proceedings')"
          full
        >
          <input
            id="f-proceedings"
            v-model="form.proceedings"
            :class="inputClass"
          />
        </FormField>
        <FormField
          label="Travaux votés"
          for-id="f-voted"
          v-bind="meta('votedWorks')"
          full
        >
          <input id="f-voted" v-model="form.votedWorks" :class="inputClass" />
        </FormField>
      </div>
    </template>
  </EditableSection>
</template>
