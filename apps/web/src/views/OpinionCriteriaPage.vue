<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { OPINION_CRITERIA_MAX, OPINION_SCORE_LABELS } from '@apart/contracts'
  import type { OpinionCriterionSetting } from '@apart/contracts'
  import { moveCriterion } from '@apart/domain'
  import { useOpinionSettings } from '@/composables/useOpinionSettings'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { ApiError } from '@/lib/api'

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

  const failure = ref<string | null>(null)
  const notice = ref<string | null>(null)
  async function run(action: Promise<unknown>, done: string): Promise<void> {
    failure.value = null
    try {
      await action
      notice.value = done
    } catch (error) {
      notice.value = null
      failure.value =
        error instanceof ApiError ? error.message : 'Le réglage a échoué.'
    }
  }

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
    void run(
      settings.update.mutateAsync({ key: criterion.key, update: { label } }),
      `« ${criterion.label} » renommé en « ${label} ».`
    )
  }
  function move(criterion: OpinionCriterionSetting, direction: 'up' | 'down') {
    const keys = criteria.value.map(c => c.key)
    const next = moveCriterion(keys, criterion.key, direction)
    if (!next) return
    void run(
      settings.reorder.mutateAsync(next),
      `« ${criterion.label} » ${direction === 'up' ? 'monté' : 'descendu'}.`
    )
  }
  function toggle(criterion: OpinionCriterionSetting): void {
    void run(
      settings.update.mutateAsync({
        key: criterion.key,
        update: { hidden: !criterion.hidden },
      }),
      criterion.hidden
        ? `« ${criterion.label} » réaffiché sur les fiches.`
        : `« ${criterion.label} » masqué : ses notes restent.`
    )
  }
  const confirmRemove = ref<string | null>(null)
  function remove(criterion: OpinionCriterionSetting): void {
    confirmRemove.value = null
    void run(
      settings.remove.mutateAsync(criterion.key),
      `« ${criterion.label} » retiré.`
    )
  }

  const newLabel = ref('')
  async function add(): Promise<void> {
    const label = newLabel.value.trim()
    if (!label || full.value) return
    await run(
      settings.add.mutateAsync({ label, hint: '' }),
      `« ${label} » ajouté.`
    )
    if (!failure.value) newLabel.value = ''
  }
  function setBlind(event: Event): void {
    const blind = (event.target as HTMLInputElement).checked
    void run(
      settings.setBlind.mutateAsync(blind),
      blind ? 'Avis à l’aveugle activé.' : 'Avis à l’aveugle désactivé.'
    )
  }

  const scale = Object.entries(OPINION_SCORE_LABELS)
    .map(([n, word]) => `${n} ${word}`)
    .join(', ')
  const iconButton =
    'inline-flex size-11 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-2 disabled:opacity-40'
  const button =
    'inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2 disabled:opacity-60'
</script>

<template>
  <section
    class="mx-auto grid w-full max-w-[56.25rem] gap-4 px-4 py-6"
    data-testid="opinion-criteria-page"
  >
    <RouterLink
      :to="{ name: 'workspace' }"
      class="text-sm text-accent no-underline hover:underline"
      >← Espace{{
        workspace?.workspace.name ? ` « ${workspace.workspace.name} »` : ''
      }}</RouterLink
    >
    <h1 class="font-display text-2xl font-bold">Critères des avis</h1>
    <p class="leading-normal text-muted">
      Les critères que chaque membre note sur une annonce, les mêmes pour tout
      l’espace. Renommer un critère garde les notes déjà données ; masqué, il
      disparaît des fiches mais ses notes restent.
    </p>
    <p
      v-if="data && !canEdit"
      class="rounded-lg bg-info-soft px-3 py-2 text-sm text-info"
      data-testid="read-only"
    >
      Seuls les propriétaires de l’espace changent ces réglages : tu les vois en
      lecture seule.
    </p>
    <p
      v-if="failure"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ failure }}
    </p>
    <p
      v-else-if="notice"
      class="text-sm text-good"
      aria-live="polite"
      data-testid="criteria-notice"
    >
      {{ notice }}
    </p>
    <p v-if="settings.isPending.value" class="text-sm text-muted">
      Chargement des critères…
    </p>
    <p
      v-else-if="settings.error.value"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ settings.error.value.message }}
    </p>

    <template v-if="data">
      <section
        aria-labelledby="criteria-list-title"
        class="grid rounded-2xl border border-line bg-surface px-4 pt-2 pb-3.5 sm:px-5"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
          <h2 id="criteria-list-title" class="text-base font-semibold">
            Dans l’ordre des fiches
          </h2>
          <span class="text-sm text-muted" data-testid="criteria-count"
            >{{ shown }} affiché{{ shown > 1 ? 's' : '' }} ·
            {{ criteria.length }} sur {{ data.max }} au plus</span
          >
        </div>
        <ol class="grid">
          <li
            v-for="(criterion, index) in criteria"
            :key="criterion.key"
            class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-2.5"
            :class="criterion.hidden ? 'opacity-70' : ''"
            :data-criterion="criterion.key"
          >
            <div class="flex gap-0.5">
              <button
                type="button"
                :class="iconButton"
                :aria-label="`Monter ${criterion.label}`"
                :disabled="!canEdit || busy || index === 0"
                data-testid="criterion-up"
                @click="move(criterion, 'up')"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  class="text-fg"
                >
                  <path
                    d="M4 10l4-4 4 4"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                :class="iconButton"
                :aria-label="`Descendre ${criterion.label}`"
                :disabled="!canEdit || busy || index === criteria.length - 1"
                data-testid="criterion-down"
                @click="move(criterion, 'down')"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  class="text-fg"
                >
                  <path
                    d="M4 6l4 4 4-4"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
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
              <input
                :id="`criterion-${criterion.key}`"
                v-model="labels[criterion.key]"
                :aria-label="`Nom du critère ${index + 1}`"
                :aria-describedby="`criterion-${criterion.key}-origin`"
                class="min-h-10 rounded-lg border border-line bg-bg px-3 text-sm text-fg disabled:opacity-70"
                maxlength="40"
                :disabled="!canEdit"
                data-testid="criterion-label"
                @blur="rename(criterion)"
                @keydown.enter.prevent="
                  ($event.target as HTMLInputElement).blur()
                "
              />
            </div>
            <span class="min-w-0 flex-[1_1_12rem] text-xs text-muted">{{
              criterion.hint || '—'
            }}</span>
            <button
              type="button"
              :class="button"
              :aria-pressed="criterion.hidden"
              :disabled="!canEdit || busy"
              data-testid="criterion-toggle"
              @click="toggle(criterion)"
            >
              {{ criterion.hidden ? 'Afficher' : 'Masquer' }}
            </button>
            <template v-if="canEdit && criterion.removable">
              <button
                v-if="confirmRemove !== criterion.key"
                type="button"
                :class="button"
                :disabled="busy"
                data-testid="criterion-remove"
                @click="confirmRemove = criterion.key"
              >
                Retirer
              </button>
              <span
                v-else
                class="flex flex-wrap items-center gap-2 rounded-lg bg-bad-soft px-2.5 py-1.5 text-sm"
                role="alert"
              >
                Retirer « {{ criterion.label }} » ? Il n’a aucune note.
                <button
                  type="button"
                  :class="button"
                  @click="confirmRemove = null"
                >
                  Garder
                </button>
                <button
                  type="button"
                  class="inline-flex min-h-11 items-center rounded-lg bg-bad px-3 text-sm font-semibold text-surface"
                  data-testid="criterion-remove-yes"
                  @click="remove(criterion)"
                >
                  Retirer
                </button>
              </span>
            </template>
          </li>
        </ol>
        <form
          class="flex flex-wrap items-end gap-2 border-t border-line pt-3"
          aria-label="Ajouter un critère"
          @submit.prevent="add"
        >
          <div class="grid min-w-0 flex-[1_1_20rem] gap-1">
            <label for="criterion-new" class="text-sm text-muted"
              >Ajouter un critère</label
            >
            <input
              id="criterion-new"
              v-model="newLabel"
              class="min-h-11 rounded-lg border border-line bg-bg px-3 text-sm text-fg disabled:opacity-70"
              maxlength="40"
              placeholder="ex. Cuisine, Proximité de l’école"
              :disabled="!canEdit || full"
              data-testid="criterion-new"
            />
          </div>
          <button
            type="submit"
            class="inline-flex min-h-11 items-center rounded-lg px-4 font-semibold disabled:opacity-60"
            :class="
              full ? 'bg-surface-2 text-muted' : 'bg-accent text-accent-fg'
            "
            :disabled="!canEdit || full || busy || !newLabel.trim()"
            data-testid="criterion-add"
          >
            {{ full ? `${data.max} critères au plus` : 'Ajouter' }}
          </button>
        </form>
      </section>

      <section
        aria-labelledby="criteria-rules-title"
        class="grid gap-2 rounded-2xl border border-line bg-surface p-4 sm:px-5"
      >
        <h2 id="criteria-rules-title" class="text-base font-semibold">
          Règles de l’espace
        </h2>
        <label
          class="flex min-h-11 cursor-pointer items-center gap-2.5"
          :class="canEdit ? '' : 'cursor-default'"
        >
          <input
            type="checkbox"
            class="size-[18px] accent-accent"
            :checked="data.blind"
            :disabled="!canEdit || busy"
            data-testid="criteria-blind"
            @change="setBlind"
          />
          Avis à l’aveugle : masquer l’avis des autres tant qu’on n’a pas noté
        </label>
        <p class="text-xs leading-normal text-muted">
          Désaccord à partir de {{ data.disagreementGap }} points d’écart.
          Échelle : {{ scale }}. Seuls les propriétaires de l’espace changent
          ces réglages ; chaque changement entre au journal.
        </p>
      </section>
    </template>
  </section>
</template>
