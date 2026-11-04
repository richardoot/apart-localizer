<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { SensitivityAxisSchema, VERDICT_LABELS } from '@apart/contracts'
  import type {
    SensitivityAxis,
    SensitivityGrid,
    SensitivityGridCell,
    SensitivityStep,
  } from '@apart/contracts'
  import {
    formatEuros,
    formatEurosPerMonth,
    formatRate,
    formatSignedEurosPerMonth,
  } from '@/lib/format'
  import {
    SENSITIVITY_AXIS_LABELS,
    VERDICT_CLASSES,
    VERDICT_SYMBOLS,
  } from '@/lib/labels'
  import CostBasisBadge from './CostBasisBadge.vue'

  /**
   * Tableau de sensibilité (lot 3, relu au lot 9) : deux axes au choix. Sur
   * l'axe du prix affiché, chaque prix porte le coût tout compris qu'il
   * entraîne et la ligne du prix cible est repérée. Chaque case dit son
   * verdict par un symbole (✓ ~ ✗) autant que par la couleur ; choisir une
   * case (clic, toucher ou clavier) en montre le détail sous la grille :
   * coût, mensualité, rendements, effort. Rien n'est réservé au survol.
   */
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
        return formatRate(step.value)
      case 'duration':
        return `${step.value} ans`
    }
  }

  /** Le repère d'un pas : prix cible, ou valeur actuelle de l'axe. */
  function stepTag(axis: SensitivityAxis, step: SensitivityStep): string {
    if (step.isTarget) return 'prix cible'
    if (step.isCurrent) return axis === 'price' ? 'affiché' : 'actuel'
    return ''
  }

  const AXIS_NOUNS: Record<SensitivityAxis, string> = {
    price: 'prix affiché',
    rent: 'loyer mensuel',
    rate: 'taux du crédit',
    downPayment: 'apport',
    duration: 'durée du crédit',
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

  /** La case dont le détail est montré : d'abord la situation actuelle. */
  const selected = ref<{ row: number; col: number }>({ row: 0, col: 0 })
  watch(
    () => props.grid,
    grid => {
      selected.value = grid?.current ?? { row: 0, col: 0 }
    },
    { immediate: true }
  )
  /** La case choisie avec ses deux pas ; null si la grille ne la contient plus. */
  const selection = computed<{
    cell: SensitivityGridCell
    row: SensitivityStep
    col: SensitivityStep
  } | null>(() => {
    const grid = props.grid
    const cell = grid?.cells[selected.value.row]?.[selected.value.col]
    const row = grid?.rows[selected.value.row]
    const col = grid?.cols[selected.value.col]
    return cell && row && col ? { cell, row, col } : null
  })

  function cellName(i: number, j: number): string {
    const grid = props.grid
    if (!grid) return ''
    const row = grid.rows[i]
    const col = grid.cols[j]
    const cell = grid.cells[i]?.[j]
    if (!row || !col || !cell) return ''
    return `${SENSITIVITY_AXIS_LABELS[grid.rowAxis]} ${stepLabel(grid.rowAxis, row)}, ${SENSITIVITY_AXIS_LABELS[grid.colAxis].toLowerCase()} ${stepLabel(grid.colAxis, col)} : rendement brut ${formatRate(cell.grossYield)}, effort ${formatSignedEurosPerMonth(cell.effort)}, ${VERDICT_LABELS[cell.verdict].toLowerCase()}`
  }

  const selectClass =
    'rounded-lg border border-line bg-bg px-2 py-1.5 text-xs text-fg'
</script>

<template>
  <section
    class="grid gap-3 rounded-2xl border border-line bg-surface p-4 text-sm sm:p-5"
    aria-labelledby="sensitivity-title"
  >
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="grid max-w-3xl gap-1">
        <h3 id="sensitivity-title" class="font-display text-lg font-bold">
          Sensibilité
        </h3>
        <p class="text-muted" data-testid="sensitivity-explanation">
          Lignes : <strong class="text-fg">{{ AXIS_NOUNS[rowAxis] }}</strong
          ><template v-if="rowAxis === 'price'"
            >, avec le coût tout compris qu’il entraîne</template
          >. Colonnes :
          <strong class="text-fg">{{ AXIS_NOUNS[colAxis] }}</strong
          ><template v-if="colAxis === 'price'"
            >, avec le coût tout compris qu’il entraîne</template
          >. Chaque case : rendement brut et effort, calculés sur le
          <strong class="text-fg">coût tout compris</strong>.
        </p>
      </div>
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
    <template v-else>
      <div class="max-w-full overflow-x-auto" data-testid="sensitivity-scroll">
        <table
          class="w-full min-w-[30rem] border-separate border-spacing-1 text-xs tabular-nums"
          data-testid="sensitivity-grid"
        >
          <caption class="sr-only">
            Rendement brut et effort selon
            {{
              AXIS_NOUNS[grid.rowAxis]
            }}
            et
            {{
              AXIS_NOUNS[grid.colAxis]
            }}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                class="w-px px-2 py-1 text-left font-medium whitespace-nowrap text-muted"
              >
                {{ SENSITIVITY_AXIS_LABELS[grid.rowAxis] }} ↓ ·
                {{ SENSITIVITY_AXIS_LABELS[grid.colAxis].toLowerCase() }} →
              </th>
              <th
                v-for="(col, j) in grid.cols"
                :key="j"
                scope="col"
                class="px-2 py-1 text-center font-medium"
                :class="
                  col.isCurrent || col.isTarget
                    ? 'font-bold text-accent'
                    : 'text-muted'
                "
                :data-target="col.isTarget ? 'true' : undefined"
              >
                <span class="block">{{ stepLabel(grid.colAxis, col) }}</span>
                <span
                  v-if="stepTag(grid.colAxis, col)"
                  class="block text-[11px] font-semibold"
                  >{{ stepTag(grid.colAxis, col) }}</span
                >
                <span
                  v-if="col.totalCost !== null"
                  class="block text-[11px] font-normal text-muted"
                  >→ {{ formatEuros(col.totalCost) }} tout compris</span
                >
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in grid.rows"
              :key="i"
              :data-target="row.isTarget ? 'true' : undefined"
            >
              <th
                scope="row"
                class="rounded-lg px-2 py-1 text-left whitespace-nowrap"
                :class="row.isTarget ? 'bg-accent-soft' : ''"
              >
                <span class="block font-semibold text-fg"
                  >{{ stepLabel(grid.rowAxis, row) }}
                  <span
                    v-if="stepTag(grid.rowAxis, row)"
                    class="text-[11px] text-accent"
                    data-testid="row-tag"
                    >· {{ stepTag(grid.rowAxis, row) }}</span
                  ></span
                >
                <span
                  v-if="row.totalCost !== null"
                  class="block text-[11px] font-normal text-muted"
                  data-testid="row-cost"
                  >→ {{ formatEuros(row.totalCost) }} tout compris</span
                >
              </th>
              <td v-for="(cell, j) in grid.cells[i] ?? []" :key="j" class="p-0">
                <button
                  type="button"
                  class="grid w-full justify-items-end gap-px rounded-lg px-2.5 py-1.5 text-right focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                  :class="[
                    VERDICT_CLASSES[cell.verdict],
                    cell.isCurrent ? 'ring-2 ring-accent font-semibold' : '',
                    selected.row === i && selected.col === j
                      ? 'outline-2 outline-offset-2 outline-fg'
                      : '',
                  ]"
                  :aria-pressed="selected.row === i && selected.col === j"
                  :aria-label="cellName(i, j)"
                  :data-verdict="cell.verdict"
                  :data-current="cell.isCurrent ? 'true' : undefined"
                  @click="selected = { row: i, col: j }"
                >
                  <span class="font-semibold"
                    >{{ formatRate(cell.grossYield) }}
                    <span aria-hidden="true">{{
                      VERDICT_SYMBOLS[cell.verdict]
                    }}</span></span
                  >
                  <span>{{ formatSignedEurosPerMonth(cell.effort) }}</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="selection"
        class="grid gap-1 rounded-xl bg-surface-2 px-3.5 py-2.5"
        aria-live="polite"
        data-testid="sensitivity-detail"
      >
        <p class="font-semibold">
          {{ SENSITIVITY_AXIS_LABELS[grid.rowAxis] }}
          {{ stepLabel(grid.rowAxis, selection.row) }} ·
          {{ SENSITIVITY_AXIS_LABELS[grid.colAxis].toLowerCase() }}
          {{ stepLabel(grid.colAxis, selection.col) }}
          <span v-if="selection.cell.isCurrent" class="font-normal text-muted"
            >(situation actuelle)</span
          >
          <span
            v-else-if="selection.row.isTarget || selection.col.isTarget"
            class="font-normal text-muted"
            >(prix cible)</span
          >
        </p>
        <dl
          class="grid grid-cols-1 gap-x-6 gap-y-0.5 text-xs tabular-nums sm:grid-cols-2 lg:grid-cols-3"
        >
          <div class="flex items-center justify-between gap-2">
            <dt class="inline-flex items-center gap-1 text-muted">
              Coût tout compris <CostBasisBadge basis="all_in" compact />
            </dt>
            <dd data-testid="detail-cost">
              {{ formatEuros(selection.cell.totalCost) }}
            </dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt class="text-muted">Mensualité</dt>
            <dd data-testid="detail-payment">
              {{ formatEurosPerMonth(selection.cell.monthlyPayment) }}
            </dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt class="text-muted">Rendement brut</dt>
            <dd>{{ formatRate(selection.cell.grossYield) }}</dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt class="text-muted">Rendement net</dt>
            <dd data-testid="detail-net">
              {{ formatRate(selection.cell.netYield) }}
            </dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt class="text-muted">Effort</dt>
            <dd>{{ formatSignedEurosPerMonth(selection.cell.effort) }}</dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt class="text-muted">Verdict</dt>
            <dd data-testid="detail-verdict">
              <span aria-hidden="true">{{
                VERDICT_SYMBOLS[selection.cell.verdict]
              }}</span>
              {{ VERDICT_LABELS[selection.cell.verdict] }}
            </dd>
          </div>
        </dl>
      </div>

      <div
        class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted"
      >
        <span
          class="rounded-md px-2 py-0.5 font-semibold"
          :class="VERDICT_CLASSES.target"
          >✓ dans la cible</span
        >
        <span
          class="rounded-md px-2 py-0.5 font-semibold"
          :class="VERDICT_CLASSES.to_dig"
          >~ à creuser</span
        >
        <span
          class="rounded-md px-2 py-0.5 font-semibold"
          :class="VERDICT_CLASSES.off_target"
          >✗ hors cible</span
        >
        <span
          >Case encadrée : la situation actuelle.<template
            v-if="
              grid.rows.some(r => r.isTarget) || grid.cols.some(c => c.isTarget)
            "
          >
            « Prix cible » : le prix affiché le plus haut qui satisfait les
            critères retenus.</template
          >
          Choisissez une case pour son détail.</span
        >
      </div>
    </template>
  </section>
</template>
