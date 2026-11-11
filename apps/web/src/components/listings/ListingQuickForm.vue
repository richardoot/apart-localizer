<script setup lang="ts">
  import type { FieldProvenanceMap } from '@apart/contracts'
  import UiField from '@/components/ui/UiField.vue'
  import { SUGGESTED_COMMUNES } from '@/lib/labels'
  import type { ListingForm } from '@/lib/listing-form'
  import { provenanceOf } from '@/lib/provenance'

  /**
   * Lot 24 (ADR 0034) : la relecture courte d'une nouvelle annonce : titre,
   * prix, surface, commune et lien, puis « Enregistrer ». Le même modèle que
   * le formulaire complet (`ListingForm`) : ce qui part au serveur ne dépend
   * pas de la vue. Les champs lus par l'IA portent leur pastille (touchée,
   * elle montre l'extrait) ; le reste se complète dans la fiche.
   */
  const props = defineProps<{
    errors: Record<string, string>
    fieldSources?: FieldProvenanceMap | null
    missing?: readonly string[]
  }>()
  const form = defineModel<ListingForm>({ required: true })

  function meta(path: string, errorKey = path) {
    return {
      provenance: provenanceOf(props.fieldSources, path),
      missing: (props.missing ?? []).includes(path),
      error: props.errors[errorKey] ?? null,
    }
  }
  // Lot 22 : en constante (vue-tsc lit mal « https://… » écrit dans l'attribut d'un composant).
  const URL_PLACEHOLDER = 'https://…'
</script>

<template>
  <fieldset class="grid gap-3 sm:grid-cols-2" data-testid="quick-form">
    <legend class="mb-2 font-display text-base font-bold">L’essentiel</legend>
    <UiField
      id="f-title"
      v-model="form.title"
      label="Titre *"
      v-bind="meta('title')"
      full
      required
      placeholder="T2 Talence Forum, 3e étage avec balcon"
    />
    <UiField
      id="f-price"
      v-model="form.price"
      label="Prix FAI *"
      unit="€"
      v-bind="meta('price')"
      inputmode="numeric"
      required
    />
    <UiField
      id="f-surface"
      v-model="form.surface"
      label="Surface Carrez"
      unit="m²"
      v-bind="meta('surface')"
      inputmode="decimal"
    />
    <UiField
      id="f-commune"
      v-model="form.commune"
      label="Commune"
      v-bind="meta('commune', 'location.commune')"
      list="quick-communes"
      placeholder="Talence"
    />
    <datalist id="quick-communes">
      <option
        v-for="commune in SUGGESTED_COMMUNES"
        :key="commune"
        :value="commune"
      />
    </datalist>
    <UiField
      id="f-url"
      v-model="form.url"
      label="Lien de l’annonce"
      v-bind="meta('url')"
      full
      type="url"
      inputmode="url"
      align="left"
      :placeholder="URL_PLACEHOLDER"
    />
  </fieldset>
</template>
