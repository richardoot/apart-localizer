<script setup lang="ts">
  import { ref } from 'vue'
  import SidePanel from '@/components/ui/SidePanel.vue'
  import { useListingMutations } from '@/composables/useListings'
  import { useLivePreview } from '@/composables/useLivePreview'
  import { useAssumptions } from '@/composables/useWorkspace'
  import { ApiError } from '@/lib/api'
  import { emptyForm, validateForm } from '@/lib/listing-form'
  import ListingForm from './ListingForm.vue'
  import MetricsPreview from './MetricsPreview.vue'
  import RentalChecksList from './RentalChecksList.vue'

  const emit = defineEmits<{ close: []; created: [id: string] }>()

  const form = ref(emptyForm())
  const errors = ref<Record<string, string>>({})
  const failure = ref<string | null>(null)
  const { values: assumptions } = useAssumptions()
  const preview = useLivePreview(form, assumptions)
  const { create } = useListingMutations()

  async function save(): Promise<void> {
    const { input, errors: issues } = validateForm(form.value)
    errors.value = issues
    if (!input) return
    failure.value = null
    try {
      const created = await create.mutateAsync(input)
      emit('created', created.listing.id)
    } catch (err) {
      failure.value =
        err instanceof ApiError ? err.message : "L'enregistrement a échoué."
    }
  }
</script>

<template>
  <SidePanel title="Nouvelle annonce" @close="emit('close')">
    <div class="grid gap-6">
      <MetricsPreview :evaluation="preview.evaluation" />
      <RentalChecksList
        v-if="preview.evaluation"
        :rental="preview.evaluation.rental"
      />
      <ListingForm v-model="form" :errors="errors" />
      <p
        v-if="failure"
        role="alert"
        class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
      >
        {{ failure }}
      </p>
    </div>
    <template #footer>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-line px-3 py-1.5 text-sm"
          @click="emit('close')"
        >
          Annuler
        </button>
        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-60"
          :disabled="create.isPending.value"
          @click="save"
        >
          {{ create.isPending.value ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </template>
  </SidePanel>
</template>
