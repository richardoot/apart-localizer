<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { OPINION_CRITERIA_MAX, OPINION_SCORE_LABELS } from '@apart/contracts'
  import type { OpinionCriterionSetting } from '@apart/contracts'
  import { moveCriterion } from '@apart/domain'
  import { useOpinionSettings } from '@/composables/useOpinionSettings'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { useAction } from '@/composables/useAction'
  import { cardClasses } from '@/lib/ui'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiConfirm from '@/components/ui/UiConfirm.vue'
  import UiField from '@/components/ui/UiField.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import UiInput from '@/components/ui/UiInput.vue'

  /**
   * Lot 20 (ADR 0030) : « Critères des avis », un réglage de l'espace. Les
   * critères que chaque membre note sur une annonce, les mêmes pour tout
   * l'espace : renommer (les notes restent), masquer ou afficher (masqué, il
   * quitte les fiches et les calculs, ses notes restent), monter ou
   * descendre, ajouter (dix au plus, masqués compris), retirer un critère
   * ajouté jamais noté ; et l'avis à l'aveugle. Seuls les propriétaires
   * règlent ; chaque changement entre au journal.
   */
  const { data: workspace } = useWorkspace()
  const settings = useOpinionSettings()
  const data = computed(() => settings.data.value ?? null)
  const criteria = computed(() => data.value?.criteria ?? [])
  const canEdit = computed(() => data.value?.canEdit ?? false)
  const shown = computed(() => criteria.value.filter(c => !c.hidden).length)
  const full = computed(() => criteria.value.length >= OPINION_CRITERIA_MAX)
  const busy = computed(
    () =>
      settings.setBlind.isPending.value ||
      settings.add.isPending.value ||
      settings.update.isPending.value ||
      settings.reorder.isPending.value ||
      settings.remove.isPending.value
  )

  /** Lot 22 : l'erreur dans le bloc où l'on a agi, la réussite dans la zone commune. */
  const listAction = useAction('Le réglage a échoué.')
  const addAction = useAction('Le réglage a échoué.')
  const blindAction = useAction('Le réglage a échoué.')

  // Les libellés en saisie, recalés sur le serveur après chaque écriture.
  const labels = ref<Record<string, string>>({})
  watch(
    criteria,
    list => {
      labels.value = Object.fromEntries(list.map(c => [c.key, c.label]))
    },
    { immediate: true }
  )
  function rename(criterion: OpinionCriterionSetting): void {
    const label = (labels.value[criterion.key] ?? '').trim()
    if (!label || label === criterion.label) {
      labels.value[criterion.key] = criterion.label
      return
    }
    void listAction.run(
      () =>
        settings.update.mutateAsync({ key: criterion.key, update: { label } }),
      { success: `« ${criterion.label} » renommé en « ${label} ».` }
    )
  }
  function move(criterion: OpinionCriterionSetting, direction: 'up' | 'down') {
    const keys = criteria.value.map(c => c.key)
    const next = moveCriterion(keys, criterion.key, direction)
    if (!next) return
    void listAction.run(() => settings.reorder.mutateAsync(next), {
      success: `« ${criterion.label} » ${direction === 'up' ? 'monté' : 'descendu'}.`,
    })
  }
  function toggle(criterion: OpinionCriterionSetting): void {
    void listAction.run(
      () =>
        settings.update.mutateAsync({
          key: criterion.key,
          update: { hidden: !criterion.hidden },
        }),
      {
        success: criterion.hidden
          ? `« ${criterion.label} » réaffiché sur les fiches.`
          : `« ${criterion.label} » masqué : ses notes restent.`,
        // Masquer se défait : on réaffiche (et inversement).
        undo: () =>
          settings.update.mutateAsync({
            key: criterion.key,
            update: { hidden: criterion.hidden },
          }),
      }
    )
  }
  function remove(criterion: OpinionCriterionSetting): void {
    void listAction.run(() => settings.remove.mutateAsync(criterion.key), {
      success: `« ${criterion.label} » retiré.`,
    })
  }

  const newLabel = ref('')
  async function add(): Promise<void> {
    const label = newLabel.value.trim()
    if (!label || full.value) return
    const added = await addAction.run(
      () => settings.add.mutateAsync({ label, hint: '' }),
      { success: `« ${label} » ajouté.` }
    )
    if (added !== undefined) newLabel.value = ''
  }
  function setBlind(blind: boolean): void {
    void blindAction.run(() => settings.setBlind.mutateAsync(blind), {
      success: blind
        ? 'Avis à l’aveugle activé.'
        : 'Avis à l’aveugle désactivé.',
    })
  }

  const scale = Object.entries(OPINION_SCORE_LABELS)
    .map(([n, word]) => `${n} ${word}`)
    .join(', ')
</script>

<template>
  <section
    class="mx-auto grid w-full max-w-[56.25rem] gap-4 px-4 py-6"
    data-testid="opinion-criteria-page"
  >
    <UiButton
      :to="{ name: 'workspace' }"
      variant="link"
      icon="arrow-left"
      class="w-fit no-underline hover:underline"
      >Espace{{
        workspace?.workspace.name ? ` « ${workspace.workspace.name} »` : ''
      }}</UiButton
    >
    <h1 class="font-display text-2xl font-bold">Critères des avis</h1>
    <p class="leading-normal text-muted">
      Les critères que chaque membre note sur une annonce, les mêmes pour tout
      l’espace. Renommer un critère garde les notes déjà données ; masqué, il
      disparaît des fiches mais ses notes restent.
    </p>
    <UiAlert v-if="data && !canEdit" tone="info" data-testid="read-only">
      Seuls les propriétaires de l’espace changent ces réglages : tu les vois en
      lecture seule.
    </UiAlert>

    <QueryState
      :query="settings"
      skeleton="rows"
      :skeleton-count="4"
      loading-label="des critères"
    >
      <template v-if="data">
        <section
          aria-labelledby="criteria-list-title"
          class="grid"
          :class="cardClasses('default', 'none')"
        >
          <div
            class="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 sm:px-5"
          >
            <h2 id="criteria-list-title" class="text-base font-semibold">
              Dans l’ordre des fiches
            </h2>
            <span class="text-sm text-muted" data-testid="criteria-count"
              >{{ shown }} affiché{{ shown > 1 ? 's' : '' }} ·
              {{ criteria.length }} sur {{ data.max }} au plus</span
            >
          </div>
          <ol class="grid px-4 sm:px-5">
            <li
              v-for="(criterion, index) in criteria"
              :key="criterion.key"
              class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-2.5"
              :class="criterion.hidden ? 'text-muted' : ''"
              :data-criterion="criterion.key"
            >
              <div class="flex gap-0.5">
                <UiButton
                  size="icon"
                  :aria-label="`Monter ${criterion.label}`"
                  :disabled="!canEdit || busy || index === 0"
                  data-testid="criterion-up"
                  @click="move(criterion, 'up')"
                >
                  <UiIcon name="chevron-up" class="size-4" />
                </UiButton>
                <UiButton
                  size="icon"
                  :aria-label="`Descendre ${criterion.label}`"
                  :disabled="!canEdit || busy || index === criteria.length - 1"
                  data-testid="criterion-down"
                  @click="move(criterion, 'down')"
                >
                  <UiIcon name="chevron-down" class="size-4" />
                </UiButton>
              </div>
              <div class="grid min-w-0 flex-[1_1_16rem] gap-0.5">
                <span
                  :id="`criterion-${criterion.key}-origin`"
                  class="text-xs text-muted"
                  >{{
                    criterion.origin === 'default'
                      ? 'par défaut'
                      : 'ajouté par l’espace'
                  }}{{ criterion.hidden ? ' · masqué' : '' }}</span
                >
                <UiInput
                  :id="`criterion-${criterion.key}`"
                  v-model="labels[criterion.key]"
                  align="left"
                  :aria-label="`Nom du critère ${index + 1}`"
                  :described-by="`criterion-${criterion.key}-origin`"
                  maxlength="40"
                  :disabled="!canEdit"
                  data-testid="criterion-label"
                  @blur="rename(criterion)"
                  @keydown.enter.prevent="
                    ($event.target as HTMLInputElement).blur()
                  "
                />
              </div>
              <span class="min-w-0 flex-[1_1_12rem] text-sm text-muted">{{
                criterion.hint || '—'
              }}</span>
              <UiButton
                :aria-pressed="criterion.hidden"
                :disabled="!canEdit || busy"
                data-testid="criterion-toggle"
                @click="toggle(criterion)"
              >
                {{ criterion.hidden ? 'Afficher' : 'Masquer' }}
              </UiButton>
              <UiConfirm
                v-if="canEdit && criterion.removable"
                label="Retirer"
                size="md"
                :question="`Retirer « ${criterion.label} » ? Il n’a aucune note.`"
                confirm-label="Retirer"
                cancel-label="Garder"
                :disabled="busy"
                data-testid="criterion-remove"
                :confirm-attrs="{ 'data-testid': 'criterion-remove-yes' }"
                @confirm="remove(criterion)"
              />
            </li>
          </ol>
          <UiAlert v-if="listAction.error.value" class="mx-4 mb-3 sm:mx-5">
            {{ listAction.error.value }}
          </UiAlert>
          <form
            class="flex flex-wrap items-end gap-2 border-t border-line px-4 pt-3 pb-4 sm:px-5"
            aria-label="Ajouter un critère"
            @submit.prevent="add"
          >
            <UiField
              id="criterion-new"
              v-model="newLabel"
              label="Ajouter un critère"
              quiet
              class="min-w-0 flex-[1_1_20rem]"
              maxlength="40"
              placeholder="ex. Cuisine, Proximité de l’école"
              :disabled="!canEdit || full"
              data-testid="criterion-new"
            />
            <UiButton
              type="submit"
              :variant="full ? 'secondary' : 'primary'"
              :disabled="!canEdit || full || busy || !newLabel.trim()"
              data-testid="criterion-add"
            >
              {{ full ? `${data.max} critères au plus` : 'Ajouter' }}
            </UiButton>
            <UiAlert v-if="addAction.error.value" class="basis-full">
              {{ addAction.error.value }}
            </UiAlert>
          </form>
        </section>

        <section
          aria-labelledby="criteria-rules-title"
          class="grid gap-2"
          :class="cardClasses()"
        >
          <h2 id="criteria-rules-title" class="text-base font-semibold">
            Règles de l’espace
          </h2>
          <UiCheckbox
            :model-value="data.blind"
            :disabled="!canEdit || busy"
            data-testid="criteria-blind"
            @update:model-value="value => setBlind(value === true)"
          >
            Avis à l’aveugle : masquer l’avis des autres tant qu’on n’a pas noté
          </UiCheckbox>
          <p class="text-sm leading-normal text-muted">
            Désaccord à partir de {{ data.disagreementGap }} points d’écart.
            Échelle : {{ scale }}. Seuls les propriétaires de l’espace changent
            ces réglages ; chaque changement entre au journal.
          </p>
          <UiAlert v-if="blindAction.error.value">
            {{ blindAction.error.value }}
          </UiAlert>
        </section>
      </template>
    </QueryState>
  </section>
</template>
