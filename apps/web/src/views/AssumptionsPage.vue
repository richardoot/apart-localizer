<script setup lang="ts">
  import { ref } from 'vue'
  import { useQuery } from '@tanstack/vue-query'
  import type { Assumptions, AssumptionsImpact } from '@apart/contracts'
  import AssumptionsForm from '@/components/assumptions/AssumptionsForm.vue'
  import { useAssumptions } from '@/composables/useWorkspace'
  import { ApiError, api } from '@/lib/api'
  import { formatDate, formatEuros, formatPercent } from '@/lib/format'

  const { data, isPending, error, update } = useAssumptions()
  const history = useQuery({
    queryKey: ['assumptions', 'history'],
    queryFn: api.assumptions.history,
  })
  const message = ref<string | null>(null)
  const failure = ref<string | null>(null)
  const impact = ref<AssumptionsImpact | null>(null)
  const previewing = ref(false)

  async function save(input: {
    label: string | undefined
    values: Assumptions
  }): Promise<void> {
    failure.value = null
    message.value = null
    try {
      // Garde-fou : la version lue à l'écran doit encore être en vigueur.
      const result = await update.mutateAsync({
        ...input,
        ...(data.value ? { expectedVersion: data.value.id } : {}),
      })
      impact.value = null
      await history.refetch()
      message.value =
        result.impact.changedVerdicts === 0
          ? `Hypothèses enregistrées : aucun verdict ne change sur ${result.impact.total} annonce(s) active(s).`
          : `Hypothèses enregistrées : ${result.impact.changedVerdicts} annonce(s) sur ${result.impact.total} changent de verdict.`
    } catch (err) {
      failure.value =
        err instanceof ApiError ? err.message : "L'enregistrement a échoué."
    }
  }

  async function preview(values: Assumptions): Promise<void> {
    failure.value = null
    previewing.value = true
    try {
      impact.value = await api.assumptions.preview(values)
    } catch (err) {
      failure.value =
        err instanceof ApiError
          ? err.message
          : "Le calcul de l'impact a échoué."
    } finally {
      previewing.value = false
    }
  }
</script>

<template>
  <section class="mx-auto grid max-w-5xl gap-6 px-4 py-6">
    <header>
      <h1 class="font-display text-2xl font-bold">
        Hypothèses de financement et de charges
      </h1>
      <p class="text-sm text-muted">
        Les taux se saisissent en pourcentage ; ils s'appliquent à toutes les
        annonces, sauf surcharge dans une fiche.
      </p>
    </header>
    <p v-if="isPending" class="text-sm text-muted">Chargement…</p>
    <p
      v-else-if="error"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ error.message }}
    </p>
    <div
      v-else-if="data"
      class="grid gap-4 rounded-xl border border-line bg-surface p-4"
    >
      <p class="text-xs text-muted">
        Version en vigueur : {{ data.label ?? 'sans libellé' }}, depuis le
        {{ formatDate(data.effectiveFrom) }}.
      </p>
      <AssumptionsForm
        :values="data.values"
        :saving="update.isPending.value"
        :impact="impact"
        :previewing="previewing"
        @save="save"
        @preview="preview"
      />
      <p v-if="failure" role="alert" class="text-sm text-bad">{{ failure }}</p>
      <p v-else-if="message" class="text-sm text-good" aria-live="polite">
        {{ message }}
      </p>
    </div>
    <section v-if="history.data.value?.length" class="grid gap-2">
      <h2 class="font-display text-base font-semibold">Versions</h2>
      <ul class="grid gap-1 text-sm">
        <li
          v-for="version in history.data.value"
          :key="version.id"
          class="flex flex-wrap justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2"
        >
          <span>{{ version.label ?? 'sans libellé' }}</span>
          <span class="text-xs text-muted">
            {{ formatDate(version.effectiveFrom) }} · apport
            {{ formatEuros(version.values.downPayment) }} · taux
            {{ formatPercent(version.values.interestRate) }} ·
            {{ version.values.durationYears }} ans · notaire
            {{
              version.values.notaryMode === 'scale'
                ? 'barème'
                : formatPercent(version.values.notaryRate)
            }}
          </span>
        </li>
      </ul>
    </section>
  </section>
</template>
