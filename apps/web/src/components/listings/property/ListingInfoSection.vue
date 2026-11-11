<script setup lang="ts">
  import { computed } from 'vue'
  import { ListingSourceSchema } from '@apart/contracts'
  import type { Listing, ListingSource } from '@apart/contracts'
  import UiField from '@/components/ui/UiField.vue'
  import { useListingEditor } from '@/composables/useListingEditor'
  import { formatEuros } from '@/lib/format'
  import { SUGGESTED_COMMUNES } from '@/lib/labels'
  import { ADDRESS_FIELD_ID } from '@/lib/listing-sections'
  import PrecisionBadge from '../PrecisionBadge.vue'
  import EditableSection from '../sections/EditableSection.vue'
  import ReadItem from '../sections/ReadItem.vue'
  import { changedKeysOf, fieldMeta } from './field-meta'

  /**
   * Lot 19 : « L'annonce et son adresse » : le titre, le prix affiché, le
   * lien principal (« voir l'annonce », parti de l'en-tête), la source,
   * l'adresse, la commune, le quartier, la précision du repère et les
   * coordonnées. « Préciser l'adresse » ouvre cette section sur l'adresse ;
   * à l'enregistrement, le serveur replace le repère.
   */
  const props = defineProps<{ listing: Listing }>()

  const editor = useListingEditor()
  const form = computed(() => editor.draft.value)
  const meta = (path: string) =>
    fieldMeta(
      editor.fieldSources.value,
      editor.changedFields.value,
      path,
      editor.errors.value
    )

  const SOURCE_LABELS: Record<ListingSource, string> = {
    seloger: 'SeLoger',
    leboncoin: 'Leboncoin',
    pap: 'PAP',
    bienici: 'Bien’ici',
    agence: 'Agence',
    autre: 'Autre',
  }
  const SOURCE_OPTIONS = ListingSourceSchema.options.map(value => ({
    value,
    label: SOURCE_LABELS[value],
  }))

  const source = computed(() =>
    [SOURCE_LABELS[props.listing.source], props.listing.sourceLabel]
      .filter(Boolean)
      .join(' · ')
  )
  const address = computed(
    () =>
      props.listing.location.addressNormalized ??
      props.listing.location.addressRaw
  )
  const coordinates = computed(() => {
    const point = props.listing.location.point
    if (!point) return null
    const [lng, lat] = point.coordinates
    return `${lat.toLocaleString('fr-FR', { maximumFractionDigits: 5 })}, ${lng.toLocaleString('fr-FR', { maximumFractionDigits: 5 })}`
  })
</script>

<template>
  <EditableSection section="listing" title="L’annonce et son adresse">
    <dl
      class="@container grid grid-cols-1 gap-x-5 gap-y-3 @md:grid-cols-2 @3xl:grid-cols-3"
      data-testid="listing-info"
    >
      <ReadItem
        label="Titre"
        :value="listing.title"
        source="title"
        :changed-keys="['title']"
      />
      <ReadItem
        label="Prix affiché"
        :value="formatEuros(listing.price)"
        source="price"
        :changed-keys="['price']"
      />
      <ReadItem label="Lien principal" source="url" :changed-keys="['url']">
        <a
          v-if="listing.url"
          :href="listing.url"
          target="_blank"
          rel="noopener noreferrer"
          class="font-normal text-accent underline underline-offset-2"
          data-testid="listing-url"
          >voir l’annonce</a
        >
        <template v-else>—</template>
      </ReadItem>
      <ReadItem
        label="Source"
        :value="source"
        source="source"
        :changed-keys="['source', 'sourceLabel']"
      />
      <ReadItem
        label="Adresse"
        :value="address"
        source="addressRaw"
        :changed-keys="changedKeysOf('addressRaw')"
      />
      <ReadItem
        label="Commune"
        :value="listing.location.commune"
        source="commune"
        :changed-keys="changedKeysOf('commune')"
      />
      <ReadItem
        label="Quartier ou secteur"
        :value="listing.location.district"
        source="district"
        :changed-keys="changedKeysOf('district')"
      />
      <ReadItem label="Repère">
        <PrecisionBadge :location="listing.location" />
      </ReadItem>
      <ReadItem
        label="Coordonnées"
        :value="coordinates"
        source="point"
        :changed-keys="changedKeysOf('longitude')"
      />
    </dl>

    <template #edit>
      <div class="grid gap-3 sm:grid-cols-2">
        <UiField
          id="f-title"
          v-model="form.title"
          label="Titre *"
          v-bind="meta('title')"
          full
        />
        <UiField
          id="f-price"
          v-model="form.price"
          label="Prix FAI *"
          unit="€"
          v-bind="meta('price')"
          inputmode="numeric"
        />
        <UiField
          id="f-source"
          v-model="form.source"
          as="select"
          label="Source"
          :options="SOURCE_OPTIONS"
          v-bind="meta('source')"
        />
        <UiField
          id="f-url"
          v-model="form.url"
          label="Lien de l'annonce"
          v-bind="meta('url')"
          full
          type="url"
          placeholder="https://…"
        />
        <UiField
          :id="ADDRESS_FIELD_ID"
          v-model="form.addressRaw"
          label="Adresse exacte"
          placeholder="12 rue …, 33400 Talence (à demander à l'agence)"
          full
          v-bind="meta('addressRaw')"
        />
        <UiField
          id="f-commune"
          v-model="form.commune"
          label="Commune"
          list="property-communes"
          v-bind="meta('commune')"
        />
        <datalist id="property-communes">
          <option
            v-for="commune in SUGGESTED_COMMUNES"
            :key="commune"
            :value="commune"
          />
        </datalist>
        <UiField
          id="f-district"
          v-model="form.district"
          label="Quartier ou secteur"
          v-bind="meta('district')"
          hint="Sans numéro, le repère va au centre du quartier reconnu, sinon de la commune"
          placeholder="Bordeaux Sud, Victoire"
        />
        <UiField
          id="f-lng"
          v-model="form.longitude"
          label="Longitude"
          v-bind="meta('longitude')"
          hint="WGS 84 ; vide = pas de point sur la carte"
          inputmode="decimal"
          placeholder="-0.5906"
        />
        <UiField
          id="f-lat"
          v-model="form.latitude"
          label="Latitude"
          v-bind="meta('latitude')"
          inputmode="decimal"
          placeholder="44.8083"
        />
      </div>
    </template>
  </EditableSection>
</template>
