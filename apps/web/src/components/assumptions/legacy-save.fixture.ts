/**
 * Ce qu'émettait le formulaire des hypothèses d'avant le lot 13 pour des
 * saisies données, enregistré en le faisant tourner avant la refonte : les
 * champs des hypothèses qui diffèrent de la base, au flottant près (les
 * allers-retours fraction → pourcentage → fraction compris). Le nouveau
 * formulaire doit émettre exactement les mêmes valeurs.
 */
export const LEGACY_SAVES = {
  financing: {
    label: 'Taux négocié',
    diff: {
      downPayment: 50000,
      interestRate: 0.032,
      durationYears: 20,
      insuranceRate: 0.003,
      notaryScale: {
        departmentalRate: 0.05,
        communalRate: 0.012,
        collectionFeeRate: 0.023700000000000002,
        emolumentBands: [
          {
            upTo: 6500,
            rate: 0.0387,
          },
          {
            upTo: 17000,
            rate: 0.015960000000000002,
          },
          {
            upTo: 60000,
            rate: 0.01064,
          },
          {
            upTo: null,
            rate: 0.00799,
          },
        ],
        emolumentVatRate: 0.2,
        securityContributionRate: 0.001,
        securityContributionMinimum: 15,
        disbursements: 800,
        label:
          'Gironde (droit départemental 5 % depuis le 1er mai 2025), relevé le 3 novembre 2026',
      },
      rentIndexationRate: 0.015700000000000002,
    },
    missing: [],
  },
  notary: {
    label: null,
    diff: {
      notaryMode: 'scale',
      notaryScale: {
        departmentalRate: 0.045,
        communalRate: 0.012,
        collectionFeeRate: 0.023700000000000002,
        emolumentBands: [
          {
            upTo: 6500,
            rate: 0.0387,
          },
          {
            upTo: 17000,
            rate: 0.016,
          },
          {
            upTo: 61000,
            rate: 0.01064,
          },
          {
            upTo: null,
            rate: 0.00799,
          },
        ],
        emolumentVatRate: 0.2,
        securityContributionRate: 0.001,
        securityContributionMinimum: 20,
        disbursements: 1000,
        label: 'Mon barème',
      },
      rentIndexationRate: 0.015700000000000002,
    },
    missing: [],
  },
  criteria: {
    label: null,
    diff: {
      notaryScale: {
        departmentalRate: 0.05,
        communalRate: 0.012,
        collectionFeeRate: 0.023700000000000002,
        emolumentBands: [
          {
            upTo: 6500,
            rate: 0.0387,
          },
          {
            upTo: 17000,
            rate: 0.015960000000000002,
          },
          {
            upTo: 60000,
            rate: 0.01064,
          },
          {
            upTo: null,
            rate: 0.00799,
          },
        ],
        emolumentVatRate: 0.2,
        securityContributionRate: 0.001,
        securityContributionMinimum: 15,
        disbursements: 800,
        label:
          'Gironde (droit départemental 5 % depuis le 1er mai 2025), relevé le 3 novembre 2026',
      },
      grossYieldThreshold: 0.05,
      netYieldThreshold: 0.035,
      maxMonthlyEffort: 200,
      negotiableDiscount: 0.06,
      tightDiscount: 0.12,
      targetCriteria: ['gross_yield', 'net_yield', 'rent_x220'],
      rentIndexationRate: 0.015700000000000002,
    },
    missing: [],
  },
  calendarTax: {
    label: null,
    diff: {
      notaryScale: {
        departmentalRate: 0.05,
        communalRate: 0.012,
        collectionFeeRate: 0.023700000000000002,
        emolumentBands: [
          {
            upTo: 6500,
            rate: 0.0387,
          },
          {
            upTo: 17000,
            rate: 0.015960000000000002,
          },
          {
            upTo: 60000,
            rate: 0.01064,
          },
          {
            upTo: null,
            rate: 0.00799,
          },
        ],
        emolumentVatRate: 0.2,
        securityContributionRate: 0.001,
        securityContributionMinimum: 15,
        disbursements: 800,
        label:
          'Gironde (droit départemental 5 % depuis le 1er mai 2025), relevé le 3 novembre 2026',
      },
      vacancyMonths: 1,
      fixedCostsAnnual: 600,
      rentalYear: 2029,
      currentRent: 850,
      maintenanceAnnual: 600,
      purchaseDate: '2026-12-01',
      rentalStartDate: '2028-09-01',
      marginalTaxRate: 0.3,
      taxRegime: 'lmnp_reel',
      furnishedRentalKind: 'tourism_classified',
      horizonYears: 20,
      appreciationRate: 0.015,
      rentIndexationRate: 0.02,
      resaleCostsRate: 0.04,
      discountRate: 0.03,
    },
    missing: [],
  },
  optionalCleared: {
    label: null,
    diff: {
      notaryScale: {
        departmentalRate: 0.055,
        communalRate: 0.012,
        collectionFeeRate: 0.023700000000000002,
        emolumentBands: [
          {
            upTo: 6500,
            rate: 0.0387,
          },
          {
            upTo: 17000,
            rate: 0.015960000000000002,
          },
          {
            upTo: 60000,
            rate: 0.01064,
          },
          {
            upTo: null,
            rate: 0.00799,
          },
        ],
        emolumentVatRate: 0.2,
        securityContributionRate: 0.001,
        securityContributionMinimum: 15,
        disbursements: 800,
        label:
          'Gironde (droit départemental 5 % depuis le 1er mai 2025), relevé le 3 novembre 2026',
      },
      currentRent: null,
      maintenanceAnnual: null,
      purchaseDate: null,
      rentalStartDate: null,
      marginalTaxRate: null,
      taxRegime: null,
      rentIndexationRate: 0.015700000000000002,
      discountRate: null,
    },
    missing: [],
  },
} as const
