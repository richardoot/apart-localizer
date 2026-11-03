<script setup lang="ts">
  import { computed } from 'vue'
  import type { WealthPoint } from '@apart/domain'
  import { formatEuros } from '@/lib/format'

  /**
   * Graphique de la projection, en SVG sans bibliothèque : une barre par
   * année (cash-flow, vert si positif, rouge sinon) et une ligne pour la
   * position latente (mise déduite, cash-flows cumulés, valeur − capital
   * restant dû). Seulement de la géométrie : les valeurs viennent de
   * `wealthSeries` (domain).
   */
  const props = defineProps<{ series: WealthPoint[] }>()

  const WIDTH = 600
  const HEIGHT = 220
  const PAD = { top: 12, right: 12, bottom: 24, left: 56 }

  const geometry = computed(() => {
    const values = props.series.flatMap(p => [p.cashFlow, p.position, 0])
    const max = Math.max(...values)
    const min = Math.min(...values)
    const span = max - min || 1
    const innerW = WIDTH - PAD.left - PAD.right
    const innerH = HEIGHT - PAD.top - PAD.bottom
    const y = (v: number): number => PAD.top + ((max - v) / span) * innerH
    const step = innerW / Math.max(1, props.series.length)
    const bars = props.series.map((p, i) => {
      const top = Math.min(y(p.cashFlow), y(0))
      return {
        year: p.year,
        x: PAD.left + i * step + step * 0.15,
        y: top,
        width: step * 0.7,
        height: Math.max(1, Math.abs(y(p.cashFlow) - y(0))),
        positive: p.cashFlow >= 0,
        label: `Année ${p.year} : cash-flow ${formatEuros(p.cashFlow)}${p.afterTax ? ' net d’impôt' : ' avant impôt'}, position ${formatEuros(p.position)}`,
      }
    })
    const line = props.series
      .map((p, i) => `${PAD.left + i * step + step / 2},${y(p.position)}`)
      .join(' ')
    return { bars, line, zero: y(0), max, min, step }
  })

  const summary = computed(() => {
    const last = props.series[props.series.length - 1]
    return last
      ? `Graphique : cash-flow annuel et position latente sur ${props.series.length} ans ; position en fin d’horizon ${formatEuros(last.position)} avant frais et impôt de revente.`
      : 'Graphique vide.'
  })
</script>

<template>
  <figure class="grid gap-1" data-testid="projection-chart">
    <svg
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      role="img"
      :aria-label="summary"
      class="h-auto w-full"
    >
      <title>{{ summary }}</title>
      <line
        :x1="PAD.left"
        :x2="WIDTH - PAD.right"
        :y1="geometry.zero"
        :y2="geometry.zero"
        stroke="var(--line)"
      />
      <text
        :x="PAD.left - 6"
        :y="PAD.top + 8"
        text-anchor="end"
        font-size="10"
        fill="var(--muted)"
      >
        {{ formatEuros(geometry.max) }}
      </text>
      <text
        :x="PAD.left - 6"
        :y="HEIGHT - PAD.bottom"
        text-anchor="end"
        font-size="10"
        fill="var(--muted)"
      >
        {{ formatEuros(geometry.min) }}
      </text>
      <rect
        v-for="bar in geometry.bars"
        :key="bar.year"
        :x="bar.x"
        :y="bar.y"
        :width="bar.width"
        :height="bar.height"
        :fill="bar.positive ? 'var(--good)' : 'var(--bad)'"
        opacity="0.75"
      >
        <title>{{ bar.label }}</title>
      </rect>
      <polyline
        :points="geometry.line"
        fill="none"
        stroke="var(--accent)"
        stroke-width="2"
      />
      <text
        v-for="bar in geometry.bars.filter(
          (_, i) => i % 5 === 0 || i === geometry.bars.length - 1
        )"
        :key="`t${bar.year}`"
        :x="bar.x + bar.width / 2"
        :y="HEIGHT - 8"
        text-anchor="middle"
        font-size="10"
        fill="var(--muted)"
      >
        {{ bar.year }}
      </text>
    </svg>
    <figcaption class="flex flex-wrap gap-3 text-xs text-muted">
      <span
        ><span class="inline-block size-2 rounded-sm bg-good" /> cash-flow
        positif</span
      >
      <span
        ><span class="inline-block size-2 rounded-sm bg-bad" /> cash-flow
        négatif</span
      >
      <span
        ><span class="inline-block h-0.5 w-3 bg-accent align-middle" /> position
        latente</span
      >
    </figcaption>
  </figure>
</template>
