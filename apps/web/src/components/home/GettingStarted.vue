<script setup lang="ts">
  import { computed } from 'vue'
  import type { GettingStarted } from '@apart/contracts'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import { GETTING_STARTED_ACTIONS, GETTING_STARTED_TARGETS } from '@/lib/home'

  /**
   * Lot 23 (ADR 0033) : la mise en route. Pour un espace vide, la suite
   * ordonnée remplace les chiffres de l'accueil (`full`) ; ensuite, tant
   * qu'il reste une étape, seulement ce qui reste, en bas (`compact`).
   * Ce qui est fait se décide dans `domain` (`gettingStarted`). Claude
   * (lot 26) : l'étape mène à la page « Claude » (adresse, étapes, demandes) ;
   * elle se coche à sa première écriture dans l'espace, pas avant.
   */
  const props = defineProps<{ data: GettingStarted }>()

  const full = computed(() => props.data.mode === 'full')
  const steps = computed(() =>
    full.value ? props.data.steps : props.data.steps.filter(s => !s.done)
  )
</script>

<template>
  <UiCard
    :title="full ? 'Par où commencer' : 'Pour finir la mise en route'"
    :tone="full ? 'accent' : 'default'"
    data-testid="getting-started"
    :data-mode="data.mode"
  >
    <template #actions>
      <span class="text-sm text-muted"
        >{{ data.doneCount }} sur {{ data.steps.length }} faites</span
      >
    </template>
    <p v-if="full" class="mb-3 text-sm text-muted">
      Ton espace est vide. Dans cet ordre, chaque étape rend la suivante plus
      utile.
    </p>
    <ol class="m-0 grid list-none gap-3 p-0">
      <li
        v-for="(step, index) in steps"
        :key="step.key"
        class="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2"
        :data-step="step.key"
        :data-done="step.done ? 'true' : undefined"
      >
        <span
          class="flex size-8 items-center justify-center rounded-full text-sm font-bold"
          :class="
            step.done
              ? 'bg-good text-good-fg'
              : 'border border-line bg-surface text-fg'
          "
          aria-hidden="true"
        >
          <UiIcon v-if="step.done" name="check" class="size-4" />
          <template v-else>{{ full ? index + 1 : '' }}</template>
        </span>
        <div class="grid min-w-0 gap-1">
          <p class="flex flex-wrap items-center gap-2 font-semibold">
            {{ step.title }}
            <UiBadge v-if="step.done" tone="good">fait</UiBadge>
          </p>
          <p class="text-sm text-muted">{{ step.text }}</p>
          <template v-if="!step.done">
            <UiButton
              v-if="GETTING_STARTED_TARGETS[step.key]"
              :to="GETTING_STARTED_TARGETS[step.key]!"
              :variant="
                index === steps.findIndex(s => !s.done)
                  ? 'primary'
                  : 'secondary'
              "
              size="sm"
              icon-right="arrow-right"
              class="w-fit"
              :data-testid="`getting-started-${step.key}`"
              >{{ GETTING_STARTED_ACTIONS[step.key] }}</UiButton
            >
          </template>
        </div>
      </li>
    </ol>
  </UiCard>
</template>
