<script setup lang="ts">
  import { ref, useId } from 'vue'
  import { useMutation } from '@tanstack/vue-query'
  import type { GeocodeLookup } from '@apart/contracts'
  import { api } from '@/lib/api'
  import { errorMessage } from '@/lib/errors'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiInput from '@/components/ui/UiInput.vue'

  /**
   * Aller à une adresse avant de dessiner : le texte part vers l'API
   * (`GET /opendata/geocode`, géocodeur IGN mis en cache), jamais du
   * navigateur vers un service tiers. Seule la vue de la carte change ;
   * rien n'est enregistré. Pas de `<form>` : la recherche vit dans le
   * formulaire du critère, Entrée ne doit pas l'enregistrer.
   */
  const emit = defineEmits<{
    found: [result: NonNullable<GeocodeLookup['result']>]
  }>()

  const id = useId()
  const query = ref('')
  const message = ref<string | null>(null)
  const failed = ref(false)
  const search = useMutation({
    mutationFn: (q: string) => api.opendata.geocode(q),
  })

  async function submit(): Promise<void> {
    const q = query.value.trim()
    if (q.length < 3) {
      failed.value = true
      message.value = 'Écris au moins trois caractères.'
      return
    }
    try {
      const lookup = await search.mutateAsync(q)
      if (lookup.result) {
        failed.value = false
        message.value =
          lookup.result.precision === 'commune'
            ? `Centré sur la commune : ${lookup.result.label}`
            : `Centré sur : ${lookup.result.label}`
        emit('found', lookup.result)
        return
      }
      failed.value = true
      message.value =
        lookup.status === 'unavailable'
          ? 'La recherche d’adresse ne répond pas ; réessaie dans un instant.'
          : 'Adresse introuvable : précise la commune.'
    } catch (err) {
      failed.value = true
      message.value = errorMessage(err, 'La recherche a échoué.')
    }
  }
</script>

<template>
  <div role="search" class="grid gap-1" aria-label="Aller à une adresse">
    <div class="flex items-center gap-2">
      <label :for="id" class="sr-only">Adresse ou commune</label>
      <UiInput
        :id="id"
        v-model="query"
        class="flex-1"
        align="left"
        type="search"
        autocomplete="off"
        enterkeyhint="search"
        placeholder="Adresse ou commune"
        data-testid="map-address"
        @keydown.enter.prevent="submit"
      />
      <UiButton
        variant="outline"
        icon="search"
        :loading="search.isPending.value"
        loading-label="Recherche…"
        data-testid="map-address-go"
        @click="submit"
      >
        Centrer
      </UiButton>
    </div>
    <p
      class="min-h-5 text-sm"
      :class="failed ? 'text-bad' : 'text-muted'"
      aria-live="polite"
      data-testid="map-address-message"
    >
      {{ message }}
    </p>
  </div>
</template>
