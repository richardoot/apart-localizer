<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { GettingStarted } from '@apart/contracts'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import { useFeedbackStore } from '@/stores/feedback'
  import { MCP_URL } from '@/lib/api'
  import { GETTING_STARTED_ACTIONS, GETTING_STARTED_TARGETS } from '@/lib/home'

  /**
   * Lot 23 (ADR 0033) : la mise en route. Pour un espace vide, la suite
   * ordonnée remplace les chiffres de l'accueil (`full`) ; ensuite, tant
   * qu'il reste une étape, seulement ce qui reste, en bas (`compact`).
   * Ce qui est fait se décide dans `domain` (`gettingStarted`). Claude : en
   * attendant la page du lot 26, l'adresse du connecteur et où la coller ;
   * l'étape se coche à sa première écriture dans l'espace, pas avant.
   */
  const props = defineProps<{ data: GettingStarted }>()
  const feedback = useFeedbackStore()

  const full = computed(() => props.data.mode === 'full')
  const steps = computed(() =>
    full.value ? props.data.steps : props.data.steps.filter(s => !s.done)
  )
  const showClaude = ref(false)
  async function copyAddress(): Promise<void> {
    showClaude.value = true
    try {
      await navigator.clipboard.writeText(MCP_URL)
      feedback.success('Adresse du connecteur copiée.')
    } catch {
      // Presse-papiers refusé : l'adresse reste affichée, à copier à la main.
      feedback.notify('Copie impossible : sélectionne l’adresse affichée.', {
        tone: 'info',
      })
    }
  }
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
            <template v-else>
              <UiButton
                size="sm"
                icon="copy"
                class="w-fit"
                data-testid="getting-started-claude"
                @click="copyAddress"
                >{{ GETTING_STARTED_ACTIONS[step.key] }}</UiButton
              >
              <div v-if="showClaude" class="grid gap-1 text-sm">
                <code
                  class="rounded-lg bg-surface-2 px-2 py-1 break-all select-all"
                  data-testid="getting-started-mcp-url"
                  >{{ MCP_URL }}</code
                >
                <p class="text-muted">
                  Dans claude.ai : Paramètres, Connecteurs, « Ajouter un
                  connecteur personnalisé », colle cette adresse, puis
                  connecte-toi avec ton compte de l’espace.
                </p>
              </div>
            </template>
          </template>
        </div>
      </li>
    </ol>
  </UiCard>
</template>
