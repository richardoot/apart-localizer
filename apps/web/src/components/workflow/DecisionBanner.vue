<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { DecisionProposal } from '@apart/contracts'
  import { counterChoice, decisionBannerText } from '@apart/domain'
  import { formatRelativeDays } from '@/lib/format'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import DiscardReasons from './DiscardReasons.vue'

  /**
   * Lot 21 (ADR 0031) : les bandeaux de la fiche. « Tu proposes… » : Retirer
   * ma proposition, Décider sans attendre. « <Nom> propose… » : D'accord, Pas
   * d'accord. À trancher : un lien vers « À trancher ensemble ». Le statut
   * affiché reste le statut réel.
   */
  const props = defineProps<{
    decision: DecisionProposal
    busy?: boolean
    /** Lot 22 : l'échec de la dernière réponse, dit dans le bandeau. */
    error?: string | null
  }>()
  const emit = defineEmits<{
    withdraw: []
    decideNow: []
    agree: []
    disagree: [choice: DecisionProposal['choice'], reason: string | null]
  }>()

  const text = computed(() =>
    decisionBannerText(
      props.decision,
      formatRelativeDays(props.decision.createdAt).replace('il y a ', '')
    )
  )
  const asking = ref(false)
  const counter = computed(() =>
    counterChoice(
      props.decision.target,
      props.decision.choice,
      props.decision.fromStatus
    )
  )

  function refuse(): void {
    if (counter.value === 'discard') {
      asking.value = true
      return
    }
    emit('disagree', counter.value, null)
  }

  function reasonPicked(reason: string): void {
    asking.value = false
    emit('disagree', 'discard', reason)
  }
</script>

<template>
  <section
    class="mb-4 grid gap-2 rounded-2xl px-4 py-3"
    :class="
      decision.state === 'to_settle'
        ? 'bg-ai-soft text-ai'
        : decision.viewer.isAuthor
          ? 'bg-info-soft text-info'
          : 'bg-warn-soft text-warn'
    "
    data-testid="decision-banner"
    role="status"
    aria-live="polite"
  >
    <template v-if="decision.state === 'to_settle'">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="min-w-0 flex-[1_1_20rem]"
          ><strong>Les choix diffèrent sur cette annonce.</strong> Elle reste où
          elle est tant que ce n’est pas tranché.</span
        >
        <UiButton
          :to="{ name: 'settle' }"
          variant="outline"
          class="border-ai text-ai"
          data-action="go-settle"
          >À trancher ensemble</UiButton
        >
      </div>
    </template>
    <template v-else>
      <div
        class="flex flex-wrap items-center justify-between gap-x-3.5 gap-y-2"
      >
        <span class="min-w-0 flex-[1_1_20rem]">
          <strong>{{ text.head }}</strong>
          {{ text.body }}
        </span>
        <span v-if="decision.viewer.isAuthor" class="flex flex-wrap gap-2">
          <UiButton
            :disabled="busy"
            data-action="withdraw"
            @click="emit('withdraw')"
          >
            Retirer ma proposition
          </UiButton>
          <UiButton
            v-if="decision.viewer.canDecideNow"
            :disabled="busy"
            data-action="decide-now"
            @click="emit('decideNow')"
          >
            Décider sans attendre
          </UiButton>
        </span>
        <span
          v-else-if="decision.viewer.canRespond && !asking"
          class="flex flex-wrap gap-2"
        >
          <UiButton :disabled="busy" data-action="disagree" @click="refuse">
            Pas d’accord
          </UiButton>
          <UiButton
            variant="primary"
            :disabled="busy"
            data-action="agree"
            @click="emit('agree')"
          >
            D’accord
          </UiButton>
        </span>
      </div>
      <DiscardReasons
        v-if="asking"
        class="text-fg"
        title="Pas d’accord : pourquoi l’écarter ?"
        :busy="busy"
        @pick="reasonPicked"
        @cancel="asking = false"
      />
    </template>
    <UiAlert v-if="error" class="text-fg">{{ error }}</UiAlert>
  </section>
</template>
