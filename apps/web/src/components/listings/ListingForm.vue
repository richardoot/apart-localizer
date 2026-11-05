<script setup lang="ts">
  import {
    DpeClassSchema,
    LeaseTypeSchema,
    ListingSourceSchema,
    ListingStatusSchema,
    RenovationLevelSchema,
    SUGGESTED_RENOVATION_ITEMS,
  } from '@apart/contracts'
  import FormField from '@/components/ui/FormField.vue'
  import { formatEuros, parseNumberInput } from '@/lib/format'
  import {
    LEASE_TYPE_LABELS,
    LISTING_STATUS_LABELS,
    RENOVATION_LEVEL_LABELS,
    SUGGESTED_COMMUNES,
  } from '@/lib/labels'
  import { itemKey } from '@/lib/listing-form'
  import type { ListingForm } from '@/lib/listing-form'
  import { provenanceOf } from '@/lib/provenance'
  import type { FieldProvenanceMap, Provenance } from '@apart/contracts'

  const props = defineProps<{
    errors: Record<string, string>
    /** Le statut se change par le menu dédié sur une fiche existante. */
    hideStatus?: boolean
    /** Provenance par champ : pastilles IA (avec confiance), annonce, vous, open data. */
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
    'f-p2-year': 'rentalPlan.year',
    'f-p2-lease': 'rentalPlan.leaseType',
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

  function meta(id: string): {
    provenance: Provenance | null
    missing: boolean
    changed: boolean
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
    }
  }
  const statuses = ListingStatusSchema.options
  const sources = ListingSourceSchema.options
  const dpeClasses = DpeClassSchema.options
  const leaseTypes = LeaseTypeSchema.options
  const renovationLevels = RenovationLevelSchema.options
  const SOURCE_LABELS: Record<(typeof sources)[number], string> = {
    seloger: 'SeLoger',
    leboncoin: 'Leboncoin',
    pap: 'PAP',
    bienici: 'Bien’ici',
    agence: 'Agence',
    autre: 'Autre',
  }

  const inputClass =
    'rounded-lg border border-line bg-bg px-3 py-1.5 text-sm w-full'

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
      <legend class="mb-2 font-display text-base font-semibold">Annonce</legend>
      <FormField
        label="Titre *"
        for-id="f-title"
        v-bind="meta('f-title')"
        :error="errors.title"
        full
      >
        <input
          id="f-title"
          v-model="form.title"
          :class="inputClass"
          required
          placeholder="T2 Talence Forum, 3e étage avec balcon"
        />
      </FormField>
      <FormField
        label="Lien de l'annonce"
        for-id="f-url"
        v-bind="meta('f-url')"
        :error="errors.url"
        full
      >
        <input
          id="f-url"
          v-model="form.url"
          type="url"
          :class="inputClass"
          placeholder="https://…"
        />
      </FormField>
      <FormField label="Source" for-id="f-source" v-bind="meta('f-source')">
        <select id="f-source" v-model="form.source" :class="inputClass">
          <option v-for="source in sources" :key="source" :value="source">
            {{ SOURCE_LABELS[source] }}
          </option>
        </select>
      </FormField>
      <FormField
        v-if="!hideStatus"
        label="Statut"
        for-id="f-status"
        v-bind="meta('f-status')"
      >
        <select id="f-status" v-model="form.status" :class="inputClass">
          <option v-for="status in statuses" :key="status" :value="status">
            {{ LISTING_STATUS_LABELS[status] }}
          </option>
        </select>
      </FormField>
      <FormField
        label="Adresse exacte"
        for-id="f-address"
        v-bind="meta('f-address')"
        full
      >
        <input
          id="f-address"
          v-model="form.addressRaw"
          :class="inputClass"
          placeholder="12 rue …, 33400 Talence (à demander à l'agence)"
        />
      </FormField>
      <FormField label="Commune" for-id="f-commune" v-bind="meta('f-commune')">
        <input
          id="f-commune"
          v-model="form.commune"
          :class="inputClass"
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
      </FormField>
      <FormField
        label="Quartier ou secteur"
        for-id="f-district"
        v-bind="meta('f-district')"
        hint="Sans numéro, le repère va au centre du quartier reconnu (« Bordeaux Sud, Victoire »), sinon de la commune"
      >
        <input
          id="f-district"
          v-model="form.district"
          :class="inputClass"
          placeholder="Bordeaux Sud, Victoire"
        />
      </FormField>
      <FormField
        label="Longitude"
        for-id="f-lng"
        v-bind="meta('f-lng')"
        :error="errors['location.point']"
        hint="Coordonnées WGS 84 ; vide = pas de point sur la carte"
      >
        <input
          id="f-lng"
          v-model="form.longitude"
          :class="inputClass"
          inputmode="decimal"
          placeholder="-0.5906"
        />
      </FormField>
      <FormField label="Latitude" for-id="f-lat" v-bind="meta('f-lat')">
        <input
          id="f-lat"
          v-model="form.latitude"
          :class="inputClass"
          inputmode="decimal"
          placeholder="44.8083"
        />
      </FormField>
    </fieldset>

    <fieldset class="grid gap-3 sm:grid-cols-2">
      <legend class="mb-2 font-display text-base font-semibold">Bien</legend>
      <FormField
        label="Prix FAI (€) *"
        for-id="f-price"
        v-bind="meta('f-price')"
        :error="errors.price"
      >
        <input
          id="f-price"
          v-model="form.price"
          :class="inputClass"
          inputmode="numeric"
          required
        />
      </FormField>
      <FormField
        label="Surface Carrez (m²)"
        for-id="f-surface"
        v-bind="meta('f-surface')"
      >
        <input
          id="f-surface"
          v-model="form.surface"
          :class="inputClass"
          inputmode="decimal"
        />
      </FormField>
      <FormField label="Pièces" for-id="f-rooms" v-bind="meta('f-rooms')">
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
        v-bind="meta('f-bedrooms')"
      >
        <input
          id="f-bedrooms"
          v-model="form.bedrooms"
          :class="inputClass"
          inputmode="numeric"
        />
      </FormField>
      <FormField label="Étage" for-id="f-floor" v-bind="meta('f-floor')">
        <input
          id="f-floor"
          v-model="form.floorLabel"
          :class="inputClass"
          placeholder="3e avec ascenseur"
        />
      </FormField>
      <FormField
        label="Année de construction"
        for-id="f-year"
        v-bind="meta('f-year')"
      >
        <input
          id="f-year"
          v-model="form.constructionYear"
          :class="inputClass"
          inputmode="numeric"
        />
      </FormField>
      <FormField label="DPE" for-id="f-dpe" v-bind="meta('f-dpe')">
        <select id="f-dpe" v-model="form.dpeClass" :class="inputClass">
          <option value="">Inconnu</option>
          <option v-for="dpe in dpeClasses" :key="dpe" :value="dpe">
            {{ dpe }}
          </option>
        </select>
      </FormField>
      <FormField label="GES" for-id="f-ges" v-bind="meta('f-ges')">
        <select id="f-ges" v-model="form.gesClass" :class="inputClass">
          <option value="">Inconnu</option>
          <option v-for="dpe in dpeClasses" :key="dpe" :value="dpe">
            {{ dpe }}
          </option>
        </select>
      </FormField>
      <FormField
        label="Date du DPE"
        for-id="f-dpe-date"
        v-bind="meta('f-dpe-date')"
        :error="errors.dpeDate"
      >
        <input
          id="f-dpe-date"
          v-model="form.dpeDate"
          type="date"
          :class="inputClass"
        />
      </FormField>
      <FormField
        label="Chauffage"
        for-id="f-heating"
        v-bind="meta('f-heating')"
      >
        <input
          id="f-heating"
          v-model="form.heatingType"
          :class="inputClass"
          placeholder="Gaz individuel"
        />
      </FormField>
      <FormField
        label="Extérieur"
        for-id="f-outdoor"
        v-bind="meta('f-outdoor')"
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
        v-bind="meta('f-parking')"
      >
        <input
          id="f-parking"
          v-model="form.parking"
          :class="inputClass"
          placeholder="Place en sous-sol"
        />
      </FormField>
    </fieldset>

    <fieldset class="grid gap-3 sm:grid-cols-2">
      <legend class="mb-2 font-display text-base font-semibold">
        Charges et budget
      </legend>
      <FormField
        label="Loyer visé HC (€/mois)"
        for-id="f-rent"
        v-bind="meta('f-rent')"
      >
        <input
          id="f-rent"
          v-model="form.rentalPlan.targetRent"
          :class="inputClass"
          inputmode="numeric"
        />
      </FormField>
      <FormField
        label="Charges de copropriété (€/an, total)"
        for-id="f-charges"
        v-bind="meta('f-charges')"
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
        v-bind="meta('f-nonrec')"
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
        v-bind="meta('f-tax')"
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
        label="Mobilier (€)"
        for-id="f-furniture"
        v-bind="meta('f-furniture')"
      >
        <input
          id="f-furniture"
          v-model="form.furnitureValue"
          :class="inputClass"
          inputmode="numeric"
        />
      </FormField>
      <FormField
        label="Honoraires acquéreur (€)"
        for-id="f-fees"
        v-bind="meta('f-fees')"
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
        v-bind="meta('f-fees-payer')"
      >
        <select id="f-fees-payer" v-model="form.feesPayer" :class="inputClass">
          <option value="">Non précisé</option>
          <option value="buyer">L'acquéreur</option>
          <option value="seller">Le vendeur</option>
        </select>
      </FormField>
      <FormField label="Nombre de lots" for-id="f-lots" v-bind="meta('f-lots')">
        <input
          id="f-lots"
          v-model="form.lotsCount"
          :class="inputClass"
          inputmode="numeric"
        />
      </FormField>
      <FormField label="Syndic" for-id="f-syndic" v-bind="meta('f-syndic')">
        <input id="f-syndic" v-model="form.syndic" :class="inputClass" />
      </FormField>
      <FormField
        label="Procédures en cours"
        for-id="f-proceedings"
        v-bind="meta('f-proceedings')"
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
        v-bind="meta('f-voted')"
        full
      >
        <input id="f-voted" v-model="form.votedWorks" :class="inputClass" />
      </FormField>
    </fieldset>

    <fieldset class="grid gap-3">
      <legend class="mb-2 font-display text-base font-semibold">
        Travaux avant d'emménager
      </legend>
      <label class="flex items-center gap-2 text-sm">
        <input
          v-model="form.renovation.active"
          type="checkbox"
          class="accent-accent"
        />
        Prévoir des travaux avant d'y habiter
      </label>
      <p v-if="!form.renovation.active" class="text-xs text-muted">
        Aucun travaux prévus : le bien est considéré comme habitable en l'état.
      </p>
      <div v-else class="grid gap-3">
        <div class="grid gap-3 sm:grid-cols-2">
          <FormField
            label="Ampleur"
            for-id="f-ren-level"
            v-bind="meta('f-ren-level')"
          >
            <select
              id="f-ren-level"
              v-model="form.renovation.level"
              :class="inputClass"
            >
              <option value="">À préciser</option>
              <option
                v-for="level in renovationLevels"
                :key="level"
                :value="level"
              >
                {{ RENOVATION_LEVEL_LABELS[level] }}
              </option>
            </select>
          </FormField>
          <FormField
            label="Durée estimée (mois)"
            for-id="f-ren-duration"
            v-bind="meta('f-ren-duration')"
          >
            <input
              id="f-ren-duration"
              v-model="form.renovation.durationMonths"
              :class="inputClass"
              inputmode="numeric"
            />
          </FormField>
        </div>
        <table class="w-full text-sm" aria-label="Postes de travaux">
          <thead class="text-left text-xs text-muted">
            <tr>
              <th class="py-1 font-medium">Poste</th>
              <th class="py-1 font-medium">Montant (€)</th>
              <th class="py-1"><span class="sr-only">Supprimer</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in form.renovation.items" :key="item.key">
              <td class="py-1 pr-2">
                <input
                  v-model="item.label"
                  :class="inputClass"
                  aria-label="Poste"
                />
              </td>
              <td class="py-1 pr-2">
                <input
                  v-model="item.amount"
                  :class="inputClass"
                  inputmode="numeric"
                  aria-label="Montant du poste"
                />
              </td>
              <td class="py-1">
                <button
                  type="button"
                  class="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:text-bad"
                  aria-label="Supprimer le poste"
                  @click="removeItem(item.key)"
                >
                  ✕
                </button>
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
          <button
            v-for="suggestion in SUGGESTED_RENOVATION_ITEMS"
            :key="suggestion"
            type="button"
            class="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:text-fg"
            @click="addItem(suggestion)"
          >
            + {{ suggestion }}
          </button>
          <button
            type="button"
            class="rounded-full border border-accent px-2.5 py-0.5 text-xs text-accent"
            @click="addItem()"
          >
            + Poste libre
          </button>
        </div>
        <FormField
          label="Notes travaux (devis, artisans, contraintes copro)"
          for-id="f-ren-notes"
          v-bind="meta('f-ren-notes')"
        >
          <input
            id="f-ren-notes"
            v-model="form.renovation.notes"
            :class="inputClass"
          />
        </FormField>
      </div>
    </fieldset>

    <fieldset class="grid gap-3 sm:grid-cols-2">
      <legend class="mb-2 font-display text-base font-semibold">
        Phase 2 : mise en location
      </legend>
      <FormField
        label="Année de mise en location"
        for-id="f-p2-year"
        v-bind="meta('f-p2-year')"
        hint="Vide = année des hypothèses"
      >
        <input
          id="f-p2-year"
          v-model="form.rentalPlan.year"
          :class="inputClass"
          inputmode="numeric"
          placeholder="2028"
        />
      </FormField>
      <FormField
        label="Type de location"
        for-id="f-p2-lease"
        v-bind="meta('f-p2-lease')"
      >
        <select
          id="f-p2-lease"
          v-model="form.rentalPlan.leaseType"
          :class="inputClass"
        >
          <option v-for="lease in leaseTypes" :key="lease" :value="lease">
            {{ LEASE_TYPE_LABELS[lease] }}
          </option>
        </select>
      </FormField>
      <FormField
        label="Encadrement des loyers"
        for-id="f-p2-control"
        v-bind="meta('f-p2-control')"
      >
        <select
          id="f-p2-control"
          v-model="form.rentalPlan.rentControl"
          :class="inputClass"
        >
          <option value="auto">Automatique (commune)</option>
          <option value="yes">Oui, loyer plafonné</option>
          <option value="no">Non</option>
        </select>
      </FormField>
      <FormField
        label="Loyer de référence majoré (€/m²)"
        for-id="f-p2-ref"
        v-bind="meta('f-p2-ref')"
        hint="Simulateur Bordeaux Métropole"
      >
        <input
          id="f-p2-ref"
          v-model="form.rentalPlan.referenceRentPerM2"
          :class="inputClass"
          inputmode="decimal"
        />
      </FormField>
      <FormField
        label="Loyer de marché constaté (€/mois HC)"
        for-id="f-p2-market"
        v-bind="meta('f-p2-market')"
        hint="Médiane de 5 à 10 annonces"
      >
        <input
          id="f-p2-market"
          v-model="form.rentalPlan.marketRent"
          :class="inputClass"
          inputmode="numeric"
        />
      </FormField>
      <FormField
        label="Demande locative"
        for-id="f-p2-demand"
        v-bind="meta('f-p2-demand')"
      >
        <select
          id="f-p2-demand"
          v-model="form.rentalPlan.demand"
          :class="inputClass"
        >
          <option value="">À évaluer</option>
          <option value="strong">Forte (tram, campus, CHU, emplois)</option>
          <option value="medium">Moyenne</option>
          <option value="weak">Faible</option>
        </select>
      </FormField>
      <FormField
        label="Règlement de copro autorise la location visée"
        for-id="f-p2-coown"
        v-bind="meta('f-p2-coown')"
      >
        <select
          id="f-p2-coown"
          v-model="form.rentalPlan.coOwnershipAllowsRental"
          :class="inputClass"
        >
          <option value="unknown">À vérifier</option>
          <option value="yes">Oui</option>
          <option value="no">Non</option>
        </select>
      </FormField>
      <FormField
        label="Critères de décence respectés"
        for-id="f-p2-decency"
        v-bind="meta('f-p2-decency')"
      >
        <select
          id="f-p2-decency"
          v-model="form.rentalPlan.decencyCompliant"
          :class="inputClass"
        >
          <option value="unknown">À vérifier</option>
          <option value="yes">Oui</option>
          <option value="no">Non</option>
        </select>
      </FormField>
      <FormField
        label="Permis de louer exigé dans le secteur"
        for-id="f-p2-permit"
        v-bind="meta('f-p2-permit')"
      >
        <select
          id="f-p2-permit"
          v-model="form.rentalPlan.rentalPermitRequired"
          :class="inputClass"
        >
          <option value="unknown">À vérifier</option>
          <option value="no">Non</option>
          <option value="yes">Oui (demande à faire)</option>
        </select>
      </FormField>
      <FormField
        label="Notes location"
        for-id="f-p2-notes"
        v-bind="meta('f-p2-notes')"
        full
      >
        <input
          id="f-p2-notes"
          v-model="form.rentalPlan.notes"
          :class="inputClass"
          placeholder="Profil de locataire visé, atouts, points faibles…"
        />
      </FormField>
    </fieldset>

    <fieldset class="grid gap-3 sm:grid-cols-2">
      <legend class="mb-2 font-display text-base font-semibold">
        Hypothèses surchargées pour cette annonce
      </legend>
      <p class="text-xs text-muted sm:col-span-2">
        Vide = hypothèses de l'espace. Un apport différent, un taux négocié, une
        durée ou des frais de notaire propres à ce bien.
      </p>
      <FormField label="Apport (€)" for-id="f-o-dp" v-bind="meta('f-o-dp')">
        <input
          id="f-o-dp"
          v-model="form.overrides.downPayment"
          :class="inputClass"
          inputmode="numeric"
        />
      </FormField>
      <FormField
        label="Taux nominal (%)"
        for-id="f-o-rate"
        v-bind="meta('f-o-rate')"
      >
        <input
          id="f-o-rate"
          v-model="form.overrides.interestRatePercent"
          :class="inputClass"
          inputmode="decimal"
          placeholder="3,65"
        />
      </FormField>
      <FormField
        label="Durée (ans)"
        for-id="f-o-years"
        v-bind="meta('f-o-years')"
      >
        <input
          id="f-o-years"
          v-model="form.overrides.durationYears"
          :class="inputClass"
          inputmode="numeric"
        />
      </FormField>
      <FormField
        label="Frais de notaire (%)"
        for-id="f-o-notary"
        v-bind="meta('f-o-notary')"
      >
        <input
          id="f-o-notary"
          v-model="form.overrides.notaryRatePercent"
          :class="inputClass"
          inputmode="decimal"
          placeholder="7,5"
        />
      </FormField>
    </fieldset>

    <fieldset class="grid gap-3">
      <legend class="mb-2 font-display text-base font-semibold">Notes</legend>
      <FormField
        label="Notes (visite, copro, points d'attention)"
        for-id="f-notes"
        v-bind="meta('f-notes')"
      >
        <textarea
          id="f-notes"
          v-model="form.notes"
          :class="inputClass"
          rows="3"
          placeholder="PV d'AG à demander, ravalement prévu ?"
        />
      </FormField>
      <FormField
        label="Description brute de l'annonce"
        for-id="f-description"
        v-bind="meta('f-description')"
      >
        <textarea
          id="f-description"
          v-model="form.description"
          :class="inputClass"
          rows="3"
        />
      </FormField>
    </fieldset>
  </div>
</template>
