<script setup lang="ts">
  import { computed } from 'vue'
  import type { Listing } from '@apart/contracts'
  import { precisionBadge } from '@apart/domain'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiField from '@/components/ui/UiField.vue'
  import { useListingEditor } from '@/composables/useListingEditor'
  import { formatSurface } from '@/lib/format'
  import { ADDRESS_FIELD_ID } from '@/lib/listing-sections'
  import PrecisionBadge from '../PrecisionBadge.vue'
  import EditableSection from '../sections/EditableSection.vue'
  import ReadItem from '../sections/ReadItem.vue'
  import { changedKeysOf, fieldMeta } from './field-meta'

  /**
   * Lot 19 : « Caractéristiques » du bien (surface, pièces, étage,
   * construction, extérieur, stationnement, chauffage), chaque valeur avec
   * sa marque « IA » quand l'IA l'a lue. L'adresse dit la précision du
   * repère ; « préciser » ouvre la section de l'adresse sur son champ.
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

  const l = computed(() => props.listing)
  const rooms = computed(() => {
    if (l.value.rooms === null) return null
    const bedrooms =
      l.value.bedrooms !== null
        ? `, dont ${l.value.bedrooms} chambre${l.value.bedrooms > 1 ? 's' : ''}`
        : ''
    return `${l.value.rooms}${bedrooms}`
  })
  const floor = computed(() => {
    const listing = l.value
    const elevator =
      listing.elevator === true
        ? 'avec ascenseur'
        : listing.elevator === false
          ? 'sans ascenseur'
          : null
    if (listing.floorLabel) {
      const label = listing.floorLabel
      return elevator && !/ascenseur/i.test(label)
        ? `${label}, ${elevator}`
        : label
    }
    if (listing.floor === null) return elevator
    const level = listing.floor === 0 ? 'Rez-de-chaussée' : `${listing.floor}e`
    const total =
      listing.floorsTotal !== null ? ` sur ${listing.floorsTotal}` : ''
    return [`${level}${total}`, elevator].filter(Boolean).join(', ')
  })
  const construction = computed(
    () =>
      (l.value.constructionYear !== null
        ? String(l.value.constructionYear)
        : null) ?? l.value.constructionPeriod
  )
  const parking = computed(() => {
    const parts = [
      l.value.parking,
      // La cave déjà dite dans le stationnement n'est pas répétée.
      l.value.cellar === true && !/\bcave\b/i.test(l.value.parking ?? '')
        ? 'cave'
        : null,
    ].filter(Boolean)
    return parts.length ? parts.join(', ') : null
  })
  const heating = computed(() => {
    const listing = l.value
    if (!listing.heatingType) return null
    return listing.heatingCollective === true
      ? `${listing.heatingType} (collectif)`
      : listing.heatingType
  })
  const precise = computed(
    () => precisionBadge(l.value.location).tone !== 'exact'
  )
  const addressKeys = [
    'location',
    'location.addressRaw',
    'location.point',
    'location.commune',
    'location.district',
  ]

  /** L'ascenseur : oui, non, inconnu. */
  const elevator = computed<'' | 'yes' | 'no'>({
    get: () =>
      form.value.elevator === true
        ? 'yes'
        : form.value.elevator === false
          ? 'no'
          : '',
    set: value => {
      form.value.elevator =
        value === 'yes' ? true : value === 'no' ? false : null
    },
  })

  const ELEVATOR_OPTIONS = [
    { value: '', label: 'Inconnu' },
    { value: 'yes', label: 'Oui' },
    { value: 'no', label: 'Non' },
  ]
</script>

<template>
  <EditableSection section="features" title="Caractéristiques">
    <dl
      class="@container grid grid-cols-2 gap-x-5 gap-y-3 @xl:grid-cols-4"
      data-testid="features"
    >
      <ReadItem
        label="Surface Carrez"
        :value="
          listing.surface === null ? null : formatSurface(listing.surface)
        "
        source="surface"
        :changed-keys="changedKeysOf('surface')"
      />
      <ReadItem
        label="Pièces"
        :value="rooms"
        source="rooms"
        :changed-keys="[...changedKeysOf('rooms'), 'bedrooms']"
      />
      <ReadItem
        label="Étage"
        :value="floor"
        source="floor"
        :changed-keys="changedKeysOf('floorLabel')"
      />
      <ReadItem
        label="Construction"
        :value="construction"
        source="constructionYear"
        :changed-keys="changedKeysOf('constructionYear')"
      />
      <ReadItem
        label="Extérieur"
        :value="listing.outdoor"
        source="outdoor"
        :changed-keys="changedKeysOf('outdoor')"
      />
      <ReadItem
        label="Stationnement"
        :value="parking"
        source="parking"
        :changed-keys="changedKeysOf('parking')"
      />
      <ReadItem
        label="Chauffage"
        :value="heating"
        source="heatingType"
        :changed-keys="changedKeysOf('heatingType')"
      />
      <ReadItem label="Adresse" source="addressRaw" :changed-keys="addressKeys">
        <span class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <PrecisionBadge :location="listing.location" compact />
          <UiButton
            v-if="precise"
            variant="link"
            class="font-normal"
            data-testid="features-precise"
            @click="editor.start('listing', ADDRESS_FIELD_ID)"
          >
            préciser
          </UiButton>
        </span>
      </ReadItem>
    </dl>

    <template #edit>
      <div class="grid gap-3 sm:grid-cols-2">
        <UiField
          id="f-surface"
          v-model="form.surface"
          label="Surface Carrez"
          unit="m²"
          inputmode="decimal"
          v-bind="meta('surface')"
        />
        <UiField
          id="f-rooms"
          v-model="form.rooms"
          label="Pièces"
          inputmode="numeric"
          v-bind="meta('rooms')"
        />
        <UiField
          id="f-bedrooms"
          v-model="form.bedrooms"
          label="Chambres"
          inputmode="numeric"
          v-bind="meta('bedrooms')"
        />
        <UiField
          id="f-floor"
          v-model="form.floorLabel"
          label="Étage"
          placeholder="3e sur 5"
          v-bind="meta('floorLabel')"
        />
        <UiField
          id="f-elevator"
          v-model="elevator"
          as="select"
          label="Ascenseur"
          :options="ELEVATOR_OPTIONS"
          v-bind="meta('elevator')"
        />
        <UiField
          id="f-year"
          v-model="form.constructionYear"
          label="Année de construction"
          inputmode="numeric"
          v-bind="meta('constructionYear')"
        />
        <UiField
          id="f-outdoor"
          v-model="form.outdoor"
          label="Extérieur"
          placeholder="Balcon 6 m²"
          v-bind="meta('outdoor')"
        />
        <UiField
          id="f-parking"
          v-model="form.parking"
          label="Stationnement"
          placeholder="Place en sous-sol"
          v-bind="meta('parking')"
        />
        <UiField
          id="f-heating"
          v-model="form.heatingType"
          label="Chauffage"
          placeholder="Gaz individuel"
          full
          v-bind="meta('heatingType')"
        />
      </div>
    </template>
  </EditableSection>
</template>
