<script setup lang="ts">
  import { ref, useId } from 'vue'
  import { useMutation } from '@tanstack/vue-query'
  import type { GeocodeLookup } from '@apart/contracts'
  import { ApiError, api } from '@/lib/api'

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
      message.value = 'Saisissez au moins trois caractères.'
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
          ? 'Le géocodeur ne répond pas ; réessayez dans un instant.'
          : 'Adresse introuvable : précisez la commune.'
    } catch (err) {
      failed.value = true
      message.value =
        err instanceof ApiError ? err.message : 'La recherche a échoué.'
    }
  }
</script>

<template>
  <div role="search" class="grid gap-1" aria-label="Aller à une adresse">
    <div class="flex items-center gap-2">
      <label :for="id" class="sr-only">Adresse ou commune</label>
      <input
        :id="id"
        v-model="query"
        type="search"
        autocomplete="off"
        enterkeyhint="search"
        class="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm text-fg sm:min-h-8"
        placeholder="Adresse ou commune"
        data-testid="map-address"
        @keydown.enter.prevent="submit"
      />
      <button
        type="button"
        class="min-h-11 rounded-lg border border-accent px-3 text-sm text-fg hover:bg-accent-soft disabled:opacity-60 sm:min-h-8"
        :disabled="search.isPending.value"
        data-testid="map-address-go"
        @click="submit"
      >
        {{ search.isPending.value ? 'Recherche…' : 'Centrer' }}
      </button>
    </div>
    <p
      class="min-h-4 text-xs"
      :class="failed ? 'text-bad' : 'text-muted'"
      aria-live="polite"
      data-testid="map-address-message"
    >
      {{ message }}
    </p>
  </div>
</template>
