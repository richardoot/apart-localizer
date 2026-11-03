import { ListingInputSchema, ListingUpdateSchema } from '@apart/contracts'
import type {
  DpeClass,
  FeesPayer,
  LeaseType,
  Listing,
  ListingInput,
  ListingInputRaw,
  ListingSource,
  ListingStatus,
  ListingUpdate,
  RenovationLevel,
  RentControl,
  RentalDemand,
  TriState,
} from '@apart/contracts'
import { z } from 'zod'
import {
  fractionToPercentInput,
  parseNumberInput,
  percentToFraction,
} from './format'

/**
 * Le modèle du formulaire d'annonce : des chaînes pour les champs saisis
 * (un `<input>` parle en texte), des booléens et des énumérations ailleurs.
 * `formToInput` le traduit vers le contrat `ListingInput` (validé par Zod),
 * `formFromListing` fait l'inverse. Fonctions pures, testées à vide.
 */
export interface RenovationItemForm {
  key: string
  label: string
  amount: string
}

export interface ListingForm {
  title: string
  url: string
  source: ListingSource
  sourceLabel: string
  status: ListingStatus
  addressRaw: string
  commune: string
  district: string
  longitude: string
  latitude: string
  price: string
  feesAmount: string
  feesPayer: FeesPayer | ''
  surface: string
  rooms: string
  bedrooms: string
  floorLabel: string
  elevator: boolean | null
  constructionYear: string
  dpeClass: DpeClass | ''
  gesClass: DpeClass | ''
  dpeDate: string
  heatingType: string
  outdoor: string
  parking: string
  annualCharges: string
  nonRecoverableChargesMonthly: string
  propertyTax: string
  furnitureValue: string
  lotsCount: string
  syndic: string
  proceedings: string
  votedWorks: string
  description: string
  notes: string
  renovation: {
    active: boolean
    level: RenovationLevel | ''
    durationMonths: string
    items: RenovationItemForm[]
    notes: string
  }
  rentalPlan: {
    year: string
    leaseType: LeaseType
    rentControl: RentControl
    referenceRentPerM2: string
    targetRent: string
    marketRent: string
    demand: RentalDemand | ''
    coOwnershipAllowsRental: TriState
    decencyCompliant: TriState
    rentalPermitRequired: TriState
    notes: string
  }
  /** Surcharges d'hypothèses, en texte (taux en pourcentage). */
  overrides: {
    downPayment: string
    interestRatePercent: string
    durationYears: string
    notaryRatePercent: string
  }
}

let keyCounter = 0
export function itemKey(): string {
  keyCounter += 1
  return `item-${keyCounter}`
}

export function emptyForm(): ListingForm {
  return {
    title: '',
    url: '',
    source: 'autre',
    sourceLabel: '',
    status: 'to_study',
    addressRaw: '',
    commune: '',
    district: '',
    longitude: '',
    latitude: '',
    price: '',
    feesAmount: '',
    feesPayer: '',
    surface: '',
    rooms: '',
    bedrooms: '',
    floorLabel: '',
    elevator: null,
    constructionYear: '',
    dpeClass: '',
    gesClass: '',
    dpeDate: '',
    heatingType: '',
    outdoor: '',
    parking: '',
    annualCharges: '',
    nonRecoverableChargesMonthly: '',
    propertyTax: '',
    furnitureValue: '',
    lotsCount: '',
    syndic: '',
    proceedings: '',
    votedWorks: '',
    description: '',
    notes: '',
    renovation: {
      active: false,
      level: '',
      durationMonths: '',
      items: [],
      notes: '',
    },
    rentalPlan: {
      year: '',
      leaseType: 'unfurnished',
      rentControl: 'auto',
      referenceRentPerM2: '',
      targetRent: '',
      marketRent: '',
      demand: '',
      coOwnershipAllowsRental: 'unknown',
      decencyCompliant: 'unknown',
      rentalPermitRequired: 'unknown',
      notes: '',
    },
    overrides: {
      downPayment: '',
      interestRatePercent: '',
      durationYears: '',
      notaryRatePercent: '',
    },
  }
}

const text = (value: string | null | undefined): string => value ?? ''
const num = (value: number | null | undefined): string =>
  value == null ? '' : String(value)

/** Une annonce enregistrée vers le formulaire qui l'édite. */
export function formFromListing(listing: Listing): ListingForm {
  const form = emptyForm()
  form.title = listing.title
  form.url = text(listing.url)
  form.source = listing.source
  form.sourceLabel = text(listing.sourceLabel)
  form.status = listing.status
  form.addressRaw = text(listing.location.addressRaw)
  form.commune = text(listing.location.commune)
  form.district = text(listing.location.district)
  form.longitude = num(listing.location.point?.coordinates[0])
  form.latitude = num(listing.location.point?.coordinates[1])
  form.price = num(listing.price)
  form.feesAmount = num(listing.feesAmount)
  form.feesPayer = listing.feesPayer ?? ''
  form.surface = num(listing.surface)
  form.rooms = num(listing.rooms)
  form.bedrooms = num(listing.bedrooms)
  form.floorLabel = text(listing.floorLabel)
  form.elevator = listing.elevator
  form.constructionYear = num(listing.constructionYear)
  form.dpeClass = listing.dpeClass ?? ''
  form.gesClass = listing.gesClass ?? ''
  form.dpeDate = text(listing.dpeDate)
  form.heatingType = text(listing.heatingType)
  form.outdoor = text(listing.outdoor)
  form.parking = text(listing.parking)
  form.annualCharges = num(listing.annualCharges)
  form.nonRecoverableChargesMonthly = num(listing.nonRecoverableChargesMonthly)
  form.propertyTax = num(listing.propertyTax)
  form.furnitureValue = num(listing.furnitureValue)
  form.lotsCount = num(listing.lotsCount)
  form.syndic = text(listing.syndic)
  form.proceedings = text(listing.proceedings)
  form.votedWorks = text(listing.votedWorks)
  form.description = text(listing.description)
  form.notes = text(listing.notes)
  if (listing.renovation) {
    form.renovation = {
      active: listing.renovation.active,
      level: listing.renovation.level ?? '',
      durationMonths: num(listing.renovation.durationMonths),
      items: listing.renovation.items.map(item => ({
        key: item.id,
        label: item.label,
        amount: num(item.amount),
      })),
      notes: text(listing.renovation.notes),
    }
  }
  if (listing.rentalPlan) {
    const plan = listing.rentalPlan
    form.rentalPlan = {
      year: num(plan.year),
      leaseType: plan.leaseType,
      rentControl: plan.rentControl,
      referenceRentPerM2: num(plan.referenceRentPerM2),
      targetRent: num(plan.targetRent),
      marketRent: num(plan.marketRent),
      demand: plan.demand ?? '',
      coOwnershipAllowsRental: plan.coOwnershipAllowsRental,
      decencyCompliant: plan.decencyCompliant,
      rentalPermitRequired: plan.rentalPermitRequired,
      notes: text(plan.notes),
    }
  }
  const o = listing.assumptionsOverride
  if (o) {
    form.overrides = {
      downPayment: num(o.downPayment),
      interestRatePercent: fractionToPercentInput(o.interestRate),
      durationYears: num(o.durationYears),
      notaryRatePercent: fractionToPercentInput(o.notaryRate),
    }
  }
  return form
}

const orNull = (value: string): string | null =>
  value.trim() === '' ? null : value.trim()
const enumOrNull = <T extends string>(value: T | ''): T | null =>
  value === '' ? null : value

/** Le formulaire vers la forme brute du contrat (avant validation). */
export function formToRawInput(form: ListingForm): ListingInputRaw {
  const lng = parseNumberInput(form.longitude)
  const lat = parseNumberInput(form.latitude)
  const hasRental = Object.entries(form.rentalPlan).some(([key, value]) =>
    key === 'leaseType' || key === 'rentControl'
      ? false
      : typeof value === 'string'
        ? value.trim() !== '' && value !== 'unknown'
        : false
  )
  const overrides: Record<string, number> = {}
  const dp = parseNumberInput(form.overrides.downPayment)
  if (dp !== null) overrides.downPayment = dp
  const rate = percentToFraction(form.overrides.interestRatePercent)
  if (rate !== null) overrides.interestRate = rate
  const years = parseNumberInput(form.overrides.durationYears)
  if (years !== null) overrides.durationYears = years
  const notary = percentToFraction(form.overrides.notaryRatePercent)
  if (notary !== null) overrides.notaryRate = notary

  return {
    title: form.title.trim(),
    url: orNull(form.url),
    source: form.source,
    sourceLabel: orNull(form.sourceLabel),
    status: form.status,
    location: {
      addressRaw: orNull(form.addressRaw),
      commune: orNull(form.commune),
      district: orNull(form.district),
      point:
        lng !== null && lat !== null
          ? { type: 'Point', coordinates: [lng, lat] }
          : null,
      precision:
        lng !== null && lat !== null
          ? orNull(form.addressRaw)
            ? 'exact'
            : 'district'
          : null,
    },
    price: parseNumberInput(form.price) ?? Number.NaN,
    feesAmount: parseNumberInput(form.feesAmount),
    feesPayer: enumOrNull(form.feesPayer),
    surface: parseNumberInput(form.surface),
    rooms: parseNumberInput(form.rooms),
    bedrooms: parseNumberInput(form.bedrooms),
    floorLabel: orNull(form.floorLabel),
    elevator: form.elevator,
    constructionYear: parseNumberInput(form.constructionYear),
    dpeClass: enumOrNull(form.dpeClass),
    gesClass: enumOrNull(form.gesClass),
    dpeDate: orNull(form.dpeDate),
    heatingType: orNull(form.heatingType),
    outdoor: orNull(form.outdoor),
    parking: orNull(form.parking),
    annualCharges: parseNumberInput(form.annualCharges),
    nonRecoverableChargesMonthly: parseNumberInput(
      form.nonRecoverableChargesMonthly
    ),
    propertyTax: parseNumberInput(form.propertyTax),
    furnitureValue: parseNumberInput(form.furnitureValue),
    lotsCount: parseNumberInput(form.lotsCount),
    syndic: orNull(form.syndic),
    proceedings: orNull(form.proceedings),
    votedWorks: orNull(form.votedWorks),
    description: orNull(form.description),
    notes: orNull(form.notes),
    renovation:
      form.renovation.active || form.renovation.items.length > 0
        ? {
            active: form.renovation.active,
            level: enumOrNull(form.renovation.level),
            durationMonths: parseNumberInput(form.renovation.durationMonths),
            items: form.renovation.items
              .filter(item => item.label.trim() !== '')
              .map(item => ({
                label: item.label.trim(),
                amount: parseNumberInput(item.amount),
              })),
            notes: orNull(form.renovation.notes),
          }
        : null,
    rentalPlan: hasRental
      ? {
          year: parseNumberInput(form.rentalPlan.year),
          leaseType: form.rentalPlan.leaseType,
          rentControl: form.rentalPlan.rentControl,
          referenceRentPerM2: parseNumberInput(
            form.rentalPlan.referenceRentPerM2
          ),
          targetRent: parseNumberInput(form.rentalPlan.targetRent),
          marketRent: parseNumberInput(form.rentalPlan.marketRent),
          demand: enumOrNull(form.rentalPlan.demand),
          coOwnershipAllowsRental: form.rentalPlan.coOwnershipAllowsRental,
          decencyCompliant: form.rentalPlan.decencyCompliant,
          rentalPermitRequired: form.rentalPlan.rentalPermitRequired,
          notes: orNull(form.rentalPlan.notes),
        }
      : null,
    assumptionsOverride: Object.keys(overrides).length > 0 ? overrides : null,
  }
}

export interface FormValidation {
  input: ListingInput | null
  /** Messages d'erreur par champ (chemin Zod → message). */
  errors: Record<string, string>
}

const FIELD_MESSAGES: Record<string, string> = {
  title: 'Le titre est obligatoire.',
  price: 'Le prix FAI est obligatoire (en euros).',
  url: 'Le lien doit être une URL complète (https://…).',
  'location.point':
    'Longitude et latitude doivent être des coordonnées valides.',
  dpeDate: 'La date du DPE doit être au format AAAA-MM-JJ.',
}

/** Valide le formulaire par le schéma du contrat et rend des messages lisibles. */
export function validateForm(form: ListingForm): FormValidation {
  const raw = formToRawInput(form)
  const result = ListingInputSchema.safeParse(raw)
  if (result.success) return { input: result.data, errors: {} }
  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const path = issue.path.join('.')
    const key = path.startsWith('location.point') ? 'location.point' : path
    errors[key] ??= FIELD_MESSAGES[key] ?? `${path} : ${issue.message}`
  }
  return { input: null, errors }
}

/** Le patch d'une mise à jour : la forme complète du formulaire, acceptée par `ListingUpdateSchema`. */
export function formToPatch(form: ListingForm): ListingUpdate {
  const raw = formToRawInput(form)
  const { fieldSources: _fieldSources, sourceText: _sourceText, ...rest } = raw
  return ListingUpdateSchema.parse(rest)
}

/** Le schéma complet d'une annonce hypothétique pour l'aperçu en direct : les erreurs n'empêchent pas le calcul partiel. */
export const PreviewInputSchema = ListingInputSchema.extend({
  title: z.string().default('Aperçu'),
  price: z.number().min(0).catch(0),
})
