<script setup lang="ts">
  import type { AssumptionsVersion } from '@apart/contracts'
  import { formatDate, formatEuros, formatRate } from '@/lib/format'

  /**
   * L'historique des versions des hypothèses (lot 13) : un tableau qui
   * défile horizontalement sur mobile (date, libellé, apport, taux, durée,
   * notaire), la version en vigueur mise en avant.
   */
  defineProps<{
    versions: AssumptionsVersion[]
    currentId: string | null
  }>()
</script>

<template>
  <section
    id="historique"
    aria-labelledby="historique-title"
    class="grid scroll-mt-20 gap-2.5"
    data-testid="history"
  >
    <h2
      id="historique-title"
      tabindex="-1"
      class="font-display text-base font-bold focus:outline-none lg:text-lg"
    >
      Historique des versions
      <span class="font-sans text-sm font-normal text-muted"
        >({{ versions.length }})</span
      >
    </h2>
    <div
      class="overflow-x-auto rounded-xl border border-line bg-surface focus-visible:outline-2 focus-visible:outline-accent"
      tabindex="0"
    >
      <table class="w-full min-w-[35rem] border-collapse text-sm tabular-nums">
        <caption class="sr-only">
          Versions des hypothèses, la plus récente en premier
        </caption>
        <thead>
          <tr class="text-left text-xs text-muted">
            <th scope="col" class="px-3 py-2.5 font-medium">Depuis le</th>
            <th scope="col" class="px-3 py-2.5 font-medium">Libellé</th>
            <th scope="col" class="px-3 py-2.5 text-right font-medium">
              Apport
            </th>
            <th scope="col" class="px-3 py-2.5 text-right font-medium">Taux</th>
            <th scope="col" class="px-3 py-2.5 text-right font-medium">
              Durée
            </th>
            <th scope="col" class="px-3 py-2.5 font-medium">Notaire</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="version in versions"
            :key="version.id"
            class="border-t border-line"
            :class="version.id === currentId ? 'bg-accent-soft/60' : ''"
            :aria-current="version.id === currentId ? 'true' : undefined"
            :data-current="version.id === currentId ? 'true' : undefined"
          >
            <td class="px-3 py-2.5 whitespace-nowrap">
              {{ formatDate(version.effectiveFrom) }}
            </td>
            <td
              class="px-3 py-2.5"
              :class="version.id === currentId ? 'font-semibold' : ''"
            >
              {{ version.label ?? 'sans libellé'
              }}<span v-if="version.id === currentId"> · en vigueur</span>
            </td>
            <td class="px-3 py-2.5 text-right whitespace-nowrap">
              {{ formatEuros(version.values.downPayment) }}
            </td>
            <td class="px-3 py-2.5 text-right whitespace-nowrap">
              {{ formatRate(version.values.interestRate) }}
            </td>
            <td class="px-3 py-2.5 text-right whitespace-nowrap">
              {{ version.values.durationYears }} ans
            </td>
            <td class="px-3 py-2.5 whitespace-nowrap">
              {{
                version.values.notaryMode === 'scale'
                  ? 'barème'
                  : formatRate(version.values.notaryRate)
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
