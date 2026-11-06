<script setup lang="ts">
  import { computed } from 'vue'
  import type { Listing } from '@apart/contracts'
  import { precisionBadge } from '@apart/domain'
  import FormField from '@/components/ui/FormField.vue'
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
    fieldMeta(editor.fieldSources.value, editor.changedFields.value, path)

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

  const inputClass =
    'min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg sm:min-h-10'
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
          <button
            v-if="precise"
            type="button"
            class="inline-flex min-h-11 items-center text-sm font-normal text-accent underline-offset-2 hover:underline sm:min-h-0"
            data-testid="features-precise"
            @click="editor.start('listing', ADDRESS_FIELD_ID)"
          >
            préciser
          </button>
        </span>
      </ReadItem>
    </dl>

    <template #edit>
      <div class="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Surface Carrez (m²)"
          for-id="f-surface"
          v-bind="meta('surface')"
          :error="editor.errors.value.surface"
        >
          <input
            id="f-surface"
            v-model="form.surface"
            :class="inputClass"
            inputmode="decimal"
          />
        </FormField>
        <FormField label="Pièces" for-id="f-rooms" v-bind="meta('rooms')">
          <input
            id="f-rooms"
            v-model="form.rooms"
            :class="inputClass"
            inputmode="numeric"
          />
        </FormField>
        <FormField
          label="Chambres"
          for-id="f-bedrooms"
          v-bind="meta('bedrooms')"
        >
          <input
            id="f-bedrooms"
            v-model="form.bedrooms"
            :class="inputClass"
            inputmode="numeric"
          />
        </FormField>
        <FormField label="Étage" for-id="f-floor" v-bind="meta('floorLabel')">
          <input
            id="f-floor"
            v-model="form.floorLabel"
            :class="inputClass"
            placeholder="3e sur 5"
          />
        </FormField>
        <FormField
          label="Ascenseur"
          for-id="f-elevator"
          v-bind="meta('elevator')"
        >
          <select id="f-elevator" v-model="elevator" :class="inputClass">
            <option value="">Inconnu</option>
            <option value="yes">Oui</option>
            <option value="no">Non</option>
          </select>
        </FormField>
        <FormField
          label="Année de construction"
          for-id="f-year"
          v-bind="meta('constructionYear')"
          :error="editor.errors.value.constructionYear"
        >
          <input
            id="f-year"
            v-model="form.constructionYear"
            :class="inputClass"
            inputmode="numeric"
          />
        </FormField>
        <FormField
          label="Extérieur"
          for-id="f-outdoor"
          v-bind="meta('outdoor')"
        >
          <input
            id="f-outdoor"
            v-model="form.outdoor"
            :class="inputClass"
            placeholder="Balcon 6 m²"
          />
        </FormField>
        <FormField
          label="Stationnement"
          for-id="f-parking"
          v-bind="meta('parking')"
        >
          <input
            id="f-parking"
            v-model="form.parking"
            :class="inputClass"
            placeholder="Place en sous-sol"
          />
        </FormField>
        <FormField
          label="Chauffage"
          for-id="f-heating"
          v-bind="meta('heatingType')"
          full
        >
          <input
            id="f-heating"
            v-model="form.heatingType"
            :class="inputClass"
            placeholder="Gaz individuel"
          />
        </FormField>
      </div>
    </template>
  </EditableSection>
</template>
