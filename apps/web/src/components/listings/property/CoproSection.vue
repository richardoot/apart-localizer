<script setup lang="ts">
  import { computed } from 'vue'
  import type { Listing, ListingQuestionField, Task } from '@apart/contracts'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiField from '@/components/ui/UiField.vue'
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
    fieldMeta(
      editor.fieldSources.value,
      editor.changedFields.value,
      path,
      editor.errors.value
    )

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

  const FEES_PAYER_OPTIONS = [
    { value: '', label: 'Non précisé' },
    { value: 'buyer', label: 'L’acquéreur' },
    { value: 'seller', label: 'Le vendeur' },
  ]
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
          <UiButton
            variant="link"
            class="font-normal"
            data-testid="charges-to-todo"
            @click="emit('go', 'a-faire')"
          >
            {{ chargesAsked === 'requested' ? 'suivre' : 'À faire' }}
          </UiButton></template
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
            <UiButton
              variant="link"
              class="font-normal"
              data-testid="tax-to-todo"
              @click="emit('go', 'a-faire')"
            >
              {{ taxAsked === 'requested' ? 'suivre' : 'À faire' }}
            </UiButton></template
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
        <UiField
          id="f-lots"
          v-model="form.lotsCount"
          label="Nombre de lots"
          v-bind="meta('lotsCount')"
          inputmode="numeric"
        />
        <UiField
          id="f-syndic"
          v-model="form.syndic"
          label="Syndic"
          v-bind="meta('syndic')"
        />
        <UiField
          id="f-charges"
          v-model="form.annualCharges"
          label="Charges de copropriété (total)"
          v-bind="meta('annualCharges')"
          hint="Budget prévisionnel"
          unit="€/an"
          inputmode="numeric"
        />
        <UiField
          id="f-nonrec"
          v-model="form.nonRecoverableChargesMonthly"
          label="dont non récupérables"
          v-bind="meta('nonRecoverableChargesMonthly')"
          hint="Vide = 25 % des charges"
          unit="€/mois"
          inputmode="numeric"
        />
        <UiField
          id="f-tax"
          v-model="form.propertyTax"
          label="Taxe foncière"
          v-bind="meta('propertyTax')"
          hint="Vide = un mois de loyer"
          unit="€/an"
          inputmode="numeric"
        />
        <UiField
          id="f-fees"
          v-model="form.feesAmount"
          label="Honoraires acquéreur"
          v-bind="meta('feesAmount')"
          hint="Vide = inclus ou à charge vendeur"
          unit="€"
          inputmode="numeric"
        />
        <UiField
          id="f-fees-payer"
          v-model="form.feesPayer"
          as="select"
          label="Honoraires à charge de"
          v-bind="meta('feesPayer')"
          :options="FEES_PAYER_OPTIONS"
        />
        <UiField
          id="f-proceedings"
          v-model="form.proceedings"
          label="Procédures en cours"
          v-bind="meta('proceedings')"
          full
        />
        <UiField
          id="f-voted"
          v-model="form.votedWorks"
          label="Travaux votés"
          v-bind="meta('votedWorks')"
          full
        />
      </div>
    </template>
  </EditableSection>
</template>
