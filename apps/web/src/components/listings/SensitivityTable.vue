<script setup lang="ts">
  import { SensitivityAxisSchema } from '@apart/contracts'
  import type {
    SensitivityAxis,
    SensitivityGrid,
    SensitivityStep,
  } from '@apart/contracts'
  import { formatEuros, formatEurosPerMonth, formatPercent } from '@/lib/format'
  import { SENSITIVITY_AXIS_LABELS, VERDICT_CLASSES } from '@/lib/labels'

  const props = defineProps<{
    grid: SensitivityGrid | null
    rowAxis: SensitivityAxis
    colAxis: SensitivityAxis
    loading?: boolean
  }>()
  const emit = defineEmits<{
    'update:rowAxis': [axis: SensitivityAxis]
    'update:colAxis': [axis: SensitivityAxis]
  }>()

  const axes = SensitivityAxisSchema.options

  /** La valeur d'un pas dans l'unité de son axe. */
  function stepLabel(axis: SensitivityAxis, step: SensitivityStep): string {
    switch (axis) {
      case 'price':
      case 'downPayment':
        return formatEuros(step.value)
      case 'rent':
        return formatEurosPerMonth(step.value)
      case 'rate':
        return formatPercent(step.value)
      case 'duration':
        return `${step.value} ans`
    }
  }

  /** Choisir pour un axe la même grandeur que l'autre les échange. */
  function pickRow(event: Event): void {
    const next = (event.target as HTMLSelectElement).value as SensitivityAxis
    if (next === props.colAxis) emit('update:colAxis', props.rowAxis)
    emit('update:rowAxis', next)
  }
  function pickCol(event: Event): void {
    const next = (event.target as HTMLSelectElement).value as SensitivityAxis
    if (next === props.rowAxis) emit('update:rowAxis', props.colAxis)
    emit('update:colAxis', next)
  }

  const selectClass = 'rounded-lg border border-line bg-bg px-2 py-1 text-xs'
</script>

<template>
  <section
    class="grid gap-2 rounded-xl border border-line bg-surface p-4 text-sm"
    aria-labelledby="sensitivity-title"
  >
    <header class="flex flex-wrap items-center justify-between gap-2">
      <h3 id="sensitivity-title" class="font-display text-base font-semibold">
        Sensibilité
      </h3>
      <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
        <label class="flex items-center gap-1">
          Lignes
          <select
            :class="selectClass"
            :value="rowAxis"
            aria-label="Axe des lignes"
            @change="pickRow"
          >
            <option v-for="axis in axes" :key="axis" :value="axis">
              {{ SENSITIVITY_AXIS_LABELS[axis] }}
            </option>
          </select>
        </label>
        <label class="flex items-center gap-1">
          Colonnes
          <select
            :class="selectClass"
            :value="colAxis"
            aria-label="Axe des colonnes"
            @change="pickCol"
          >
            <option v-for="axis in axes" :key="axis" :value="axis">
              {{ SENSITIVITY_AXIS_LABELS[axis] }}
            </option>
          </select>
        </label>
        <span v-if="loading" aria-live="polite">calcul…</span>
      </div>
    </header>
    <p v-if="!grid" class="text-muted">
      Le tableau se calcule dès que le prix et le loyer visé sont connus.
    </p>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-xs tabular-nums" data-testid="sensitivity-grid">
        <thead>
          <tr>
            <th scope="col" class="px-2 py-1 text-left font-medium text-muted">
              {{ SENSITIVITY_AXIS_LABELS[grid.rowAxis] }} ↓ ·
              {{ SENSITIVITY_AXIS_LABELS[grid.colAxis] }} →
            </th>
            <th
              v-for="(col, j) in grid.cols"
              :key="j"
              scope="col"
              class="px-2 py-1 text-right font-medium"
              :class="col.isCurrent ? 'text-accent' : 'text-muted'"
            >
              {{ stepLabel(grid.colAxis, col) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in grid.rows" :key="i">
            <th
              scope="row"
              class="px-2 py-1 text-left font-medium whitespace-nowrap"
              :class="row.isCurrent ? 'text-accent' : 'text-muted'"
            >
              {{ stepLabel(grid.rowAxis, row) }}
            </th>
            <td
              v-for="(cell, j) in grid.cells[i] ?? []"
              :key="j"
              class="px-1 py-0.5"
            >
              <div
                class="grid rounded-lg px-2 py-1 text-right"
                :class="[
                  VERDICT_CLASSES[cell.verdict],
                  cell.isCurrent ? 'ring-2 ring-accent font-semibold' : '',
                ]"
                :data-verdict="cell.verdict"
                :data-current="cell.isCurrent ? 'true' : undefined"
                :title="`Coût ${formatEuros(cell.totalCost)} · mensualité ${formatEurosPerMonth(cell.monthlyPayment)} · net ${formatPercent(cell.netYield)}`"
              >
                <span>{{ formatPercent(cell.grossYield) }}</span>
                <span class="opacity-80">{{
                  formatEurosPerMonth(cell.effort)
                }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="mt-1 text-xs text-muted">
        Chaque cellule : rendement brut puis effort mensuel, colorée par verdict
        ; la cellule encadrée est la situation actuelle.
      </p>
    </div>
  </section>
</template>
