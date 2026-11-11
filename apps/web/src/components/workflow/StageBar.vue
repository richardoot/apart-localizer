<script setup lang="ts">
  import { WORKFLOW_STAGES, WORKFLOW_STAGE_LABELS } from '@apart/contracts'
  import type { WorkflowStage, WorkflowStageCount } from '@apart/contracts'
  import { computed, nextTick, onMounted, ref, watch } from 'vue'
  import UiIcon from '@/components/ui/UiIcon.vue'

  /**
   * Lot 21 (ADR 0031) : la barre des six étapes, à la place des onglets
   * d'adéquation et des pastilles de statut. Sur téléphone, des pastilles
   * qui défilent horizontalement (sans défilement de la page). Lot 23 :
   * l'étape courante est ramenée au milieu de la barre (au chargement, et
   * quand elle change d'ailleurs : « Ce qui t'attend », un lien).
   */
  const props = defineProps<{
    stages: readonly WorkflowStageCount[]
    current: WorkflowStage
  }>()
  const emit = defineEmits<{ select: [stage: WorkflowStage] }>()

  const items = computed(() =>
    WORKFLOW_STAGES.map(stage => {
      const found = props.stages.find(s => s.stage === stage)
      return {
        stage,
        label: WORKFLOW_STAGE_LABELS[stage],
        count: found?.count ?? 0,
        sub: found?.sub ?? '',
      }
    })
  )
  const lastIndex = WORKFLOW_STAGES.length - 1

  const bar = ref<HTMLElement | null>(null)
  /** Le décalage qui centre l'étape courante dans la barre qui défile. */
  function reveal(): void {
    const nav = bar.value
    const pill = nav?.querySelector<HTMLElement>('[aria-current="step"]')
    if (!nav || !pill || nav.scrollWidth <= nav.clientWidth) return
    const navBox = nav.getBoundingClientRect()
    const pillBox = pill.getBoundingClientRect()
    nav.scrollLeft +=
      pillBox.left - navBox.left - (navBox.width - pillBox.width) / 2
  }
  onMounted(reveal)
  watch(
    () => props.current,
    () => void nextTick(reveal)
  )
  defineExpose({ reveal })
</script>

<template>
  <nav
    ref="bar"
    aria-label="Étapes du suivi"
    class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    data-testid="stage-bar"
  >
    <ol
      class="m-0 flex w-max list-none items-stretch gap-1.5 p-0 sm:w-full sm:min-w-[900px] sm:gap-1"
    >
      <li
        v-for="(item, index) in items"
        :key="item.stage"
        class="flex items-center gap-1 sm:flex-[1_1_0]"
        :class="index === lastIndex ? 'sm:ml-3.5 sm:flex-[0_0_190px]' : ''"
      >
        <!-- Lot 22 : contrôle spécialisé (étape d'un parcours, `aria-current="step"`), sa recette n'est pas celle d'un bouton. -->
        <button
          type="button"
          class="flex min-h-11 flex-auto cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-left sm:min-h-[76px] sm:flex-col sm:items-stretch sm:justify-center sm:gap-0.5 sm:rounded-xl sm:px-3.5 sm:py-2"
          :class="
            current === item.stage
              ? 'border-accent bg-accent text-accent-fg'
              : 'border-line bg-surface text-fg hover:border-accent'
          "
          :aria-current="current === item.stage ? 'step' : undefined"
          :data-stage="item.stage"
          @click="emit('select', item.stage)"
        >
          <span
            class="flex items-baseline justify-between gap-2 font-semibold sm:font-semibold"
          >
            <span class="whitespace-nowrap">{{ item.label }}</span>
            <span
              class="font-display tabular-nums sm:text-2xl sm:font-bold"
              data-testid="stage-count"
              >{{ item.count }}</span
            >
          </span>
          <span
            class="hidden text-xs sm:block"
            :class="current === item.stage ? 'text-accent-fg/85' : 'text-muted'"
            >{{ item.sub }}</span
          >
        </button>
        <UiIcon
          v-if="index < lastIndex - 1"
          name="chevron-right"
          class="hidden size-4 text-muted sm:block"
        />
      </li>
    </ol>
  </nav>
</template>
