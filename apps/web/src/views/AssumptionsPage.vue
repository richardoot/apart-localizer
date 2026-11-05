<script setup lang="ts">
  import { ref } from 'vue'
  import { useQuery } from '@tanstack/vue-query'
  import type { Assumptions, AssumptionsImpact } from '@apart/contracts'
  import AssumptionsForm from '@/components/assumptions/AssumptionsForm.vue'
  import AssumptionsHistory from '@/components/assumptions/AssumptionsHistory.vue'
  import { useAssumptions } from '@/composables/useWorkspace'
  import { ApiError, api } from '@/lib/api'
  import { savedMessage } from '@/lib/assumptions-summary'
  import { formatDate } from '@/lib/format'

  /**
   * Les hypothèses communes à toutes les annonces (lot 13) : en-tête avec la
   * version en vigueur, le formulaire en cinq sections, l'historique des
   * versions. Chaque enregistrement crée une version datée, avec le
   * garde-fou de la version lue à l'écran.
   */
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
      message.value = savedMessage(result.impact)
    } catch (err) {
      failure.value =
        err instanceof ApiError ? err.message : "L'enregistrement a échoué."
    }
  }

  async function preview(values: Assumptions): Promise<void> {
    failure.value = null
    message.value = null
    impact.value = null
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

  function discard(): void {
    failure.value = null
    impact.value = null
  }

  function goToHistory(event: MouseEvent): void {
    const target = document.getElementById('historique')
    if (!target) return
    event.preventDefault()
    target.scrollIntoView?.({ block: 'start' })
    document.getElementById('historique-title')?.focus({ preventScroll: true })
  }
</script>

<template>
  <div class="grid pt-4 lg:pt-6">
    <header
      class="mx-auto flex w-full max-w-6xl flex-wrap items-end justify-between gap-x-4 gap-y-1.5 px-4 pb-3 lg:pb-5"
    >
      <div class="grid gap-1">
        <h1 class="font-display text-2xl font-bold lg:text-[1.75rem]">
          Hypothèses
        </h1>
        <p class="hidden text-sm text-muted sm:block">
          Vos réglages communs à toutes les annonces. Une fiche peut en
          surcharger certains.
        </p>
      </div>
      <p
        v-if="data"
        class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted"
        data-testid="current-version"
      >
        <span class="sm:hidden">Communes à toutes les annonces.</span>
        <span
          class="rounded-full bg-accent-soft px-2.5 py-1 font-semibold text-fg"
          >Version en vigueur : {{ data.label ?? 'sans libellé' }}</span
        >
        <span
          >depuis le {{ formatDate(data.effectiveFrom) }} ·
          <a
            href="#historique"
            class="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-2 sm:min-h-0"
            @click="goToHistory"
            >Historique</a
          ></span
        >
      </p>
    </header>
    <p
      v-if="isPending"
      class="mx-auto w-full max-w-6xl px-4 text-sm text-muted"
    >
      Chargement…
    </p>
    <p
      v-else-if="error"
      role="alert"
      class="mx-auto w-full max-w-6xl px-4 text-sm text-bad"
    >
      <span class="block rounded-lg bg-bad-soft px-3 py-2">{{
        error.message
      }}</span>
    </p>
    <AssumptionsForm
      v-else-if="data"
      :values="data.values"
      :saving="update.isPending.value"
      :impact="impact"
      :previewing="previewing"
      :message="message"
      :failure="failure"
      @save="save"
      @preview="preview"
      @discard="discard"
    >
      <template #after>
        <AssumptionsHistory
          v-if="history.data.value?.length"
          :versions="history.data.value"
          :current-id="data.id"
        />
      </template>
    </AssumptionsForm>
  </div>
</template>
