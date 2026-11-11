<script setup lang="ts">
  import {
    DpeClassSchema,
    ListingSourceSchema,
    ListingStatusSchema,
    RenovationLevelSchema,
    SUGGESTED_RENOVATION_ITEMS,
  } from '@apart/contracts'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiChip from '@/components/ui/UiChip.vue'
  import UiField from '@/components/ui/UiField.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import UiInput from '@/components/ui/UiInput.vue'
  import { formatEuros, parseNumberInput } from '@/lib/format'
  import {
    LISTING_STATUS_LABELS,
    RENOVATION_LEVEL_LABELS,
    SUGGESTED_COMMUNES,
  } from '@/lib/labels'
  import { itemKey } from '@/lib/listing-form'
  import type { ListingForm } from '@/lib/listing-form'
  import { provenanceOf } from '@/lib/provenance'
  import type { FieldProvenanceMap, Provenance } from '@apart/contracts'

  /**
   * Le formulaire complet d'une annonce, pour « Nouvelle annonce » (lot 19 :
   * la fiche se modifie par section). Lot 22 : chaque champ par `UiField`
   * (unité dans la case, 16 px), relié à son erreur de `validateForm` ; un
   * nombre illisible y est refusé, jamais vidé.
   */
  const props = defineProps<{
    errors: Record<string, string>
    /** Le statut se change par le menu dédié sur une fiche existante. */
    hideStatus?: boolean
    /** Provenance par champ : pastilles IA (avec confiance), annonce, toi, open data. */
    fieldSources?: FieldProvenanceMap | null
    /** Chemins du formulaire (`surface`, `rentalPlan.targetRent`) à mettre en évidence. */
    missing?: readonly string[]
    /** Champs modifiés depuis la dernière ouverture (`price`, `location.commune`, `rentalPlan.targetRent`). */
    changed?: readonly string[]
  }>()
  const form = defineModel<ListingForm>({ required: true })

  /** Du `for-id` d'un champ au chemin du formulaire, pour la provenance. */
  const FIELD_PATHS: Record<string, string> = {
    'f-title': 'title',
    'f-url': 'url',
    'f-source': 'source',
    'f-status': 'status',
    'f-address': 'addressRaw',
    'f-commune': 'commune',
    'f-district': 'district',
    'f-lng': 'longitude',
    'f-lat': 'latitude',
    'f-price': 'price',
    'f-surface': 'surface',
    'f-rooms': 'rooms',
    'f-bedrooms': 'bedrooms',
    'f-floor': 'floorLabel',
    'f-year': 'constructionYear',
    'f-dpe': 'dpeClass',
    'f-ges': 'gesClass',
    'f-dpe-date': 'dpeDate',
    'f-heating': 'heatingType',
    'f-outdoor': 'outdoor',
    'f-parking': 'parking',
    'f-rent': 'rentalPlan.targetRent',
    'f-charges': 'annualCharges',
    'f-nonrec': 'nonRecoverableChargesMonthly',
    'f-tax': 'propertyTax',
    'f-furniture': 'furnitureValue',
    'f-fees': 'feesAmount',
    'f-fees-payer': 'feesPayer',
    'f-lots': 'lotsCount',
    'f-syndic': 'syndic',
    'f-proceedings': 'proceedings',
    'f-voted': 'votedWorks',
    'f-ren-level': 'renovation.level',
    'f-ren-duration': 'renovation.durationMonths',
    'f-ren-notes': 'renovation.notes',
    'f-p2-control': 'rentalPlan.rentControl',
    'f-p2-ref': 'rentalPlan.referenceRentPerM2',
    'f-p2-market': 'rentalPlan.marketRent',
    'f-p2-demand': 'rentalPlan.demand',
    'f-p2-coown': 'rentalPlan.coOwnershipAllowsRental',
    'f-p2-decency': 'rentalPlan.decencyCompliant',
    'f-p2-permit': 'rentalPlan.rentalPermitRequired',
    'f-p2-notes': 'rentalPlan.notes',
    'f-notes': 'notes',
    'f-description': 'description',
  }

  /** La pastille et la mise en évidence d'un champ, par son identifiant. */
  /** Les noms d'un champ dans le journal : le sien, et celui de la localisation. */
  function changedKeys(path: string): string[] {
    if (path === 'floorLabel') return ['floor', 'floorLabel']
    if (path === 'longitude' || path === 'latitude')
      return ['location.point', 'location']
    if (['addressRaw', 'commune', 'district'].includes(path))
      return [`location.${path}`]
    return [path]
  }

  /** La clé d'erreur de `validateForm` d'un chemin du formulaire. */
  function errorKey(path: string): string {
    if (path === 'longitude' || path === 'latitude') return 'location.point'
    if (['addressRaw', 'commune', 'district'].includes(path))
      return `location.${path}`
    return path
  }

  function meta(id: string): {
    provenance: Provenance | null
    missing: boolean
    changed: boolean
    error: string | null
  } {
    const path = FIELD_PATHS[id] ?? id
    // L'étage est saisi en libellé ; sa provenance est celle de l'étage lu.
    const key = path === 'floorLabel' ? 'floor' : path
    return {
      provenance:
        provenanceOf(props.fieldSources, key) ??
        (path === 'floorLabel'
          ? provenanceOf(props.fieldSources, 'floorLabel')
          : null),
      missing: (props.missing ?? []).includes(
        path === 'floorLabel' ? 'floor' : path
      ),
      changed: changedKeys(path).some(key =>
        (props.changed ?? []).includes(key)
      ),
      error: props.errors[errorKey(path)] ?? null,
    }
  }
  const statuses = ListingStatusSchema.options
  const sources = ListingSourceSchema.options
  const dpeClasses = DpeClassSchema.options
  const renovationLevels = RenovationLevelSchema.options
  const SOURCE_LABELS: Record<(typeof sources)[number], string> = {
    seloger: 'SeLoger',
    leboncoin: 'Leboncoin',
    pap: 'PAP',
    bienici: 'Bien’ici',
    agence: 'Agence',
    autre: 'Autre',
  }

  const opt = <T extends string>(
    values: readonly T[],
    label: (value: T) => string,
    empty?: string
  ) => [
    ...(empty !== undefined ? [{ value: '', label: empty }] : []),
    ...values.map(value => ({ value, label: label(value) })),
  ]
  const SOURCE_OPTIONS = opt(sources, source => SOURCE_LABELS[source])
  const STATUS_OPTIONS = opt(statuses, status => LISTING_STATUS_LABELS[status])
  const DPE_OPTIONS = opt(dpeClasses, dpe => dpe, 'Inconnu')
  const LEVEL_OPTIONS = opt(
    renovationLevels,
    level => RENOVATION_LEVEL_LABELS[level],
    'À préciser'
  )
  const FEES_PAYER_OPTIONS = [
    { value: '', label: 'Non précisé' },
    { value: 'buyer', label: 'L’acquéreur' },
    { value: 'seller', label: 'Le vendeur' },
  ]
  const RENT_CONTROL_OPTIONS = [
    { value: 'auto', label: 'Automatique (commune)' },
    { value: 'yes', label: 'Oui, loyer plafonné' },
    { value: 'no', label: 'Non' },
  ]
  const DEMAND_OPTIONS = [
    { value: '', label: 'À évaluer' },
    { value: 'strong', label: 'Forte (tram, campus, CHU, emplois)' },
    { value: 'medium', label: 'Moyenne' },
    { value: 'weak', label: 'Faible' },
  ]
  const CHECK_OPTIONS = [
    { value: 'unknown', label: 'À vérifier' },
    { value: 'yes', label: 'Oui' },
    { value: 'no', label: 'Non' },
  ]
  const PERMIT_OPTIONS = [
    { value: 'unknown', label: 'À vérifier' },
    { value: 'no', label: 'Non' },
    { value: 'yes', label: 'Oui (demande à faire)' },
  ]

  function addItem(label = ''): void {
    form.value.renovation.items.push({ key: itemKey(), label, amount: '' })
  }

  function removeItem(key: string): void {
    form.value.renovation.items = form.value.renovation.items.filter(
      item => item.key !== key
    )
  }

  const renovationTotal = (): number =>
    form.value.renovation.items.reduce(
      (sum, item) => sum + (parseNumberInput(item.amount) ?? 0),
      0
    )
</script>

<template>
  <div class="grid gap-6">
    <fieldset class="grid gap-3 sm:grid-cols-2">
      <legend class="mb-2 font-display text-base font-bold">Annonce</legend>
      <UiField
        id="f-title"
        v-model="form.title"
        label="Titre *"
        v-bind="meta('f-title')"
        full
        required
        placeholder="T2 Talence Forum, 3e étage avec balcon"
      />
      <UiField
        id="f-url"
        v-model="form.url"
        label="Lien de l’annonce"
        v-bind="meta('f-url')"
        full
        type="url"
        inputmode="url"
        align="left"
        placeholder="https://…"
      />
      <UiField
        id="f-source"
        v-model="form.source"
        as="select"
        label="Source"
        :options="SOURCE_OPTIONS"
        v-bind="meta('f-source')"
      />
      <UiField
        v-if="!hideStatus"
        id="f-status"
        v-model="form.status"
        as="select"
        label="Statut"
        :options="STATUS_OPTIONS"
        v-bind="meta('f-status')"
      />
      <UiField
        id="f-address"
        v-model="form.addressRaw"
        label="Adresse exacte"
        v-bind="meta('f-address')"
        full
        placeholder="12 rue …, 33400 Talence (à demander à l’agence)"
      />
      <UiField
        id="f-commune"
        v-model="form.commune"
        label="Commune"
        v-bind="meta('f-commune')"
        list="communes"
        placeholder="Talence"
      />
      <datalist id="communes">
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
        v-bind="meta('f-district')"
        hint="Sans numéro, le repère va au centre du quartier reconnu (« Bordeaux Sud, Victoire »), sinon de la commune"
        placeholder="Bordeaux Sud, Victoire"
      />
      <UiField
        id="f-lng"
        v-model="form.longitude"
        label="Longitude"
        v-bind="meta('f-lng')"
        hint="Coordonnées WGS 84 ; vide = pas de point sur la carte"
        inputmode="decimal"
        placeholder="-0.5906"
      />
      <UiField
        id="f-lat"
        v-model="form.latitude"
        label="Latitude"
        v-bind="meta('f-lat')"
        inputmode="decimal"
        placeholder="44.8083"
      />
    </fieldset>

    <fieldset class="grid gap-3 sm:grid-cols-2">
      <legend class="mb-2 font-display text-base font-bold">Bien</legend>
      <UiField
        id="f-price"
        v-model="form.price"
        label="Prix FAI *"
        unit="€"
        v-bind="meta('f-price')"
        inputmode="numeric"
        required
      />
      <UiField
        id="f-surface"
        v-model="form.surface"
        label="Surface Carrez"
        unit="m²"
        v-bind="meta('f-surface')"
        inputmode="decimal"
      />
      <UiField
        id="f-rooms"
        v-model="form.rooms"
        label="Pièces"
        v-bind="meta('f-rooms')"
        inputmode="numeric"
      />
      <UiField
        id="f-bedrooms"
        v-model="form.bedrooms"
        label="Chambres"
        v-bind="meta('f-bedrooms')"
        inputmode="numeric"
      />
      <UiField
        id="f-floor"
        v-model="form.floorLabel"
        label="Étage"
        v-bind="meta('f-floor')"
        placeholder="3e avec ascenseur"
      />
      <UiField
        id="f-year"
        v-model="form.constructionYear"
        label="Année de construction"
        v-bind="meta('f-year')"
        inputmode="numeric"
      />
      <UiField
        id="f-dpe"
        v-model="form.dpeClass"
        as="select"
        label="DPE"
        :options="DPE_OPTIONS"
        v-bind="meta('f-dpe')"
      />
      <UiField
        id="f-ges"
        v-model="form.gesClass"
        as="select"
        label="GES"
        :options="DPE_OPTIONS"
        v-bind="meta('f-ges')"
      />
      <UiField
        id="f-dpe-date"
        v-model="form.dpeDate"
        label="Date du DPE"
        v-bind="meta('f-dpe-date')"
        type="date"
        align="left"
      />
      <UiField
        id="f-heating"
        v-model="form.heatingType"
        label="Chauffage"
        v-bind="meta('f-heating')"
        placeholder="Gaz individuel"
      />
      <UiField
        id="f-outdoor"
        v-model="form.outdoor"
        label="Extérieur"
        v-bind="meta('f-outdoor')"
        placeholder="Balcon 6 m²"
      />
      <UiField
        id="f-parking"
        v-model="form.parking"
        label="Stationnement"
        v-bind="meta('f-parking')"
        placeholder="Place en sous-sol"
      />
    </fieldset>

    <fieldset class="grid gap-3 sm:grid-cols-2">
      <legend class="mb-2 font-display text-base font-bold">
        Charges et budget
      </legend>
      <UiField
        id="f-rent"
        v-model="form.rentalPlan.targetRent"
        label="Loyer visé HC"
        unit="€/mois"
        v-bind="meta('f-rent')"
        inputmode="numeric"
      />
      <UiField
        id="f-charges"
        v-model="form.annualCharges"
        label="Charges de copropriété (total)"
        unit="€/an"
        v-bind="meta('f-charges')"
        hint="Budget prévisionnel"
        inputmode="numeric"
      />
      <UiField
        id="f-nonrec"
        v-model="form.nonRecoverableChargesMonthly"
        label="dont non récupérables"
        unit="€/mois"
        v-bind="meta('f-nonrec')"
        hint="Vide = 25 % des charges"
        inputmode="numeric"
      />
      <UiField
        id="f-tax"
        v-model="form.propertyTax"
        label="Taxe foncière"
        unit="€/an"
        v-bind="meta('f-tax')"
        hint="Vide = un mois de loyer"
        inputmode="numeric"
      />
      <UiField
        id="f-furniture"
        v-model="form.furnitureValue"
        label="Mobilier"
        unit="€"
        v-bind="meta('f-furniture')"
        inputmode="numeric"
      />
      <UiField
        id="f-fees"
        v-model="form.feesAmount"
        label="Honoraires acquéreur"
        unit="€"
        v-bind="meta('f-fees')"
        hint="Vide = inclus ou à charge vendeur"
        inputmode="numeric"
      />
      <UiField
        id="f-fees-payer"
        v-model="form.feesPayer"
        as="select"
        label="Honoraires à charge de"
        :options="FEES_PAYER_OPTIONS"
        v-bind="meta('f-fees-payer')"
      />
      <UiField
        id="f-lots"
        v-model="form.lotsCount"
        label="Nombre de lots"
        v-bind="meta('f-lots')"
        inputmode="numeric"
      />
      <UiField
        id="f-syndic"
        v-model="form.syndic"
        label="Syndic"
        v-bind="meta('f-syndic')"
      />
      <UiField
        id="f-proceedings"
        v-model="form.proceedings"
        label="Procédures en cours"
        v-bind="meta('f-proceedings')"
        full
      />
      <UiField
        id="f-voted"
        v-model="form.votedWorks"
        label="Travaux votés"
        v-bind="meta('f-voted')"
        full
      />
    </fieldset>

    <fieldset class="grid gap-3">
      <legend class="mb-2 font-display text-base font-bold">
        Travaux avant d’emménager
      </legend>
      <UiCheckbox
        v-model="form.renovation.active"
        label="Prévoir des travaux avant d’y habiter"
      />
      <p v-if="!form.renovation.active" class="text-sm text-muted">
        Aucun travaux prévus : le bien est considéré comme habitable en l’état.
      </p>
      <div v-else class="grid gap-3">
        <div class="grid gap-3 sm:grid-cols-2">
          <UiField
            id="f-ren-level"
            v-model="form.renovation.level"
            as="select"
            label="Ampleur"
            :options="LEVEL_OPTIONS"
            v-bind="meta('f-ren-level')"
          />
          <UiField
            id="f-ren-duration"
            v-model="form.renovation.durationMonths"
            label="Durée estimée"
            unit="mois"
            v-bind="meta('f-ren-duration')"
            inputmode="numeric"
          />
        </div>
        <table class="w-full text-sm" aria-label="Postes de travaux">
          <thead class="text-left text-xs text-muted">
            <tr>
              <th class="py-1 font-medium">Poste</th>
              <th class="py-1 font-medium">Montant</th>
              <th class="py-1"><span class="sr-only">Supprimer</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(item, index) in form.renovation.items"
              :key="item.key"
              class="align-top"
            >
              <td class="py-1 pr-2">
                <UiInput v-model="item.label" align="left" aria-label="Poste" />
              </td>
              <td class="py-1 pr-2">
                <UiInput
                  :id="`f-ren-item-${index}`"
                  v-model="item.amount"
                  unit="€"
                  inputmode="numeric"
                  :invalid="!!errors[`renovation.items.${index}.amount`]"
                  :described-by="
                    errors[`renovation.items.${index}.amount`]
                      ? `f-ren-item-${index}-error`
                      : undefined
                  "
                  aria-label="Montant du poste"
                />
                <p
                  v-if="errors[`renovation.items.${index}.amount`]"
                  :id="`f-ren-item-${index}-error`"
                  class="mt-1 text-sm font-medium text-bad"
                  data-testid="field-error"
                >
                  {{ errors[`renovation.items.${index}.amount`] }}
                </p>
              </td>
              <td class="py-1">
                <UiButton
                  variant="ghost"
                  size="icon"
                  class="hover:text-bad"
                  aria-label="Supprimer le poste"
                  @click="removeItem(item.key)"
                >
                  <UiIcon name="close" />
                </UiButton>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th class="py-1 text-left text-xs text-muted">Total travaux</th>
              <th
                class="py-1 text-left font-mono text-sm"
                data-testid="renovation-total"
              >
                {{ formatEuros(renovationTotal()) }}
              </th>
              <th />
            </tr>
          </tfoot>
        </table>
        <div class="flex flex-wrap gap-1.5" aria-label="Postes fréquents">
          <UiChip
            v-for="suggestion in SUGGESTED_RENOVATION_ITEMS"
            :key="suggestion"
            :toggle="false"
            @click="addItem(suggestion)"
          >
            <UiIcon name="plus" />{{ suggestion }}
          </UiChip>
          <UiChip :toggle="false" class="text-accent" @click="addItem()">
            <UiIcon name="plus" />Poste libre
          </UiChip>
        </div>
        <UiField
          id="f-ren-notes"
          v-model="form.renovation.notes"
          label="Notes travaux (devis, artisans, contraintes copro)"
          v-bind="meta('f-ren-notes')"
        />
      </div>
    </fieldset>

    <fieldset class="grid gap-3 sm:grid-cols-2">
      <legend class="mb-2 font-display text-base font-bold">
        Phase 2 : mise en location
      </legend>
      <p class="text-sm text-muted sm:col-span-2">
        L’année et le type de location se règlent pour tout l’espace, dans la
        page Hypothèses.
      </p>
      <UiField
        id="f-p2-control"
        v-model="form.rentalPlan.rentControl"
        as="select"
        label="Encadrement des loyers"
        :options="RENT_CONTROL_OPTIONS"
        v-bind="meta('f-p2-control')"
      />
      <UiField
        id="f-p2-ref"
        v-model="form.rentalPlan.referenceRentPerM2"
        label="Loyer de référence majoré"
        unit="€/m²"
        v-bind="meta('f-p2-ref')"
        hint="Simulateur Bordeaux Métropole"
        inputmode="decimal"
      />
      <UiField
        id="f-p2-market"
        v-model="form.rentalPlan.marketRent"
        label="Loyer de marché constaté HC"
        unit="€/mois"
        v-bind="meta('f-p2-market')"
        hint="Médiane de 5 à 10 annonces"
        inputmode="numeric"
      />
      <UiField
        id="f-p2-demand"
        v-model="form.rentalPlan.demand"
        as="select"
        label="Demande locative"
        :options="DEMAND_OPTIONS"
        v-bind="meta('f-p2-demand')"
      />
      <UiField
        id="f-p2-coown"
        v-model="form.rentalPlan.coOwnershipAllowsRental"
        as="select"
        label="Règlement de copro autorise la location visée"
        :options="CHECK_OPTIONS"
        v-bind="meta('f-p2-coown')"
      />
      <UiField
        id="f-p2-decency"
        v-model="form.rentalPlan.decencyCompliant"
        as="select"
        label="Critères de décence respectés"
        :options="CHECK_OPTIONS"
        v-bind="meta('f-p2-decency')"
      />
      <UiField
        id="f-p2-permit"
        v-model="form.rentalPlan.rentalPermitRequired"
        as="select"
        label="Permis de louer exigé dans le secteur"
        :options="PERMIT_OPTIONS"
        v-bind="meta('f-p2-permit')"
      />
      <UiField
        id="f-p2-notes"
        v-model="form.rentalPlan.notes"
        label="Notes location"
        v-bind="meta('f-p2-notes')"
        full
        placeholder="Profil de locataire visé, atouts, points faibles…"
      />
    </fieldset>

    <fieldset class="grid gap-3">
      <legend class="mb-2 font-display text-base font-bold">Notes</legend>
      <UiField
        id="f-notes"
        v-model="form.notes"
        as="textarea"
        label="Notes (visite, copro, points d’attention)"
        v-bind="meta('f-notes')"
        :rows="3"
        placeholder="PV d’AG à demander, ravalement prévu ?"
      />
      <UiField
        id="f-description"
        v-model="form.description"
        as="textarea"
        label="Description brute de l’annonce"
        v-bind="meta('f-description')"
        :rows="3"
      />
    </fieldset>
  </div>
</template>
