<script setup lang="ts">
  import { computed } from 'vue'
  import type { ComplianceCategory, ComplianceItem } from '@apart/contracts'
  import { useCompliance } from '@/composables/useStudy'
  import { formatDate } from '@/lib/format'
  import {
    CHECK_LEVEL_CLASSES,
    CHECK_LEVEL_LABELS,
    CHECK_LEVEL_SYMBOLS,
    COMPLIANCE_CATEGORY_LABELS,
  } from '@/lib/labels'
  import RentalPill from '@/components/listings/RentalPill.vue'

  /**
   * Conformité (besoins L5, D6) : la checklist réglementaire datée, évaluée
   * à la date de mise en location prévue, et les risques Géorisques à
   * l'adresse. Calculée par le serveur (table de référence datée, données
   * ouvertes) ; chaque point porte sa date et sa source.
   */
  const props = defineProps<{ listingId: string }>()
  const {
    data: report,
    isPending,
    error,
  } = useCompliance(computed(() => props.listingId))

  const groups = computed(() => {
    const byCategory = new Map<ComplianceCategory, ComplianceItem[]>()
    for (const item of report.value?.items ?? []) {
      byCategory.set(item.category, [
        ...(byCategory.get(item.category) ?? []),
        item,
      ])
    }
    return [...byCategory.entries()]
  })
</script>

<template>
  <div class="grid gap-3 text-sm" data-testid="compliance">
    <p v-if="isPending" class="text-muted">Évaluation de la conformité…</p>
    <p v-else-if="error" role="alert" class="text-bad">{{ error.message }}</p>
    <template v-else-if="report">
      <header class="flex flex-wrap items-center gap-2">
        <RentalPill :verdict="report.verdict" />
        <span>
          pour une mise en location le
          <strong>{{ formatDate(report.rentalStartDate) }}</strong> :
          {{ report.counts.bad }} bloquant(s), {{ report.counts.warn }} point(s)
          d’attention, {{ report.counts.unknown }} à vérifier
        </span>
      </header>
      <section
        v-for="[category, items] in groups"
        :key="category"
        class="grid gap-1"
        :aria-label="COMPLIANCE_CATEGORY_LABELS[category]"
      >
        <h4 class="text-xs font-medium text-muted">
          {{ COMPLIANCE_CATEGORY_LABELS[category] }}
        </h4>
        <ul class="grid gap-1">
          <li
            v-for="item in items"
            :key="item.key"
            class="grid grid-cols-[18px_1fr] gap-1.5"
            :data-key="item.key"
            :data-level="item.level"
          >
            <span
              class="font-mono text-xs font-bold"
              :class="CHECK_LEVEL_CLASSES[item.level]"
              :aria-label="CHECK_LEVEL_LABELS[item.level]"
              >{{ CHECK_LEVEL_SYMBOLS[item.level] }}</span
            >
            <span>
              <strong>{{ item.title }}</strong> — {{ item.message }}
              <span class="text-xs text-muted">
                <template v-if="item.date">
                  · {{ formatDate(item.date) }}</template
                >
                <template v-if="item.source">
                  ·
                  <a
                    v-if="item.source.url"
                    :href="item.source.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="underline"
                    >{{ item.source.label }}</a
                  >
                  <template v-else>{{ item.source.label }}</template>
                  (consulté le {{ formatDate(item.source.consultedAt) }})
                </template>
              </span>
            </span>
          </li>
        </ul>
      </section>
      <p class="text-xs text-muted" data-testid="georisques">
        <template v-if="report.georisques?.status === 'ok'">
          Géorisques : {{ report.georisques.address ?? 'adresse' }}, relevé le
          {{ formatDate(report.georisques.fetchedAt) }}
          <a
            v-if="report.georisques.reportUrl"
            :href="report.georisques.reportUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="underline"
            >rapport complet</a
          >
          (BRGM, ministère de la Transition écologique, licence Etalab 2.0).
        </template>
        <template v-else>{{ report.georisques?.message }}</template>
      </p>
      <p class="text-xs text-muted">
        {{ report.rules.label }} (version {{ report.rules.version }}).
        {{ report.disclaimer }}
      </p>
    </template>
  </div>
</template>
