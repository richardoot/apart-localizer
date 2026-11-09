<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { OPINION_WORD_MAX } from '@apart/contracts'
  import type { OpinionRow, OpinionVisitRef } from '@apart/contracts'
  import { formatOpinionAverage } from '@apart/domain'
  import type { OpinionDraftState } from '@/composables/useOpinionDraft'
  import { GLOBAL_CHOICES, SCORE_CHOICES, shortDay } from '@/lib/opinions'
  import ScoreRadioGroup from './ScoreRadioGroup.vue'

  /**
   * Lot 20 : « Mon avis », critère par critère (maquettes « Donner son
   * avis » et « Téléphone »). Pour chaque critère affiché de l'espace, six
   * choix (« — » puis 1 à 5 avec leur mot) et un mot facultatif ; la note
   * globale à part (« ton ressenti d'ensemble, pas une moyenne ») ; la
   * moyenne des critères recalculée en direct, à titre indicatif ; la phrase.
   * Au téléphone (`compact`), une grille de six boutons par critère, le mot
   * choisi à droite du libellé ; les mots et la phrase se déplient. Les
   * notes ne touchent pas au verdict.
   */
  const props = withDefaults(
    defineProps<{
      state: OpinionDraftState
      /** Les critères affichés de l'espace, dans l'ordre (libellé, aide). */
      rows: readonly Pick<OpinionRow, 'key' | 'label' | 'hint'>[]
      meName: string
      /** Les autres membres actifs, prévenus de mon avis. */
      otherNames: readonly string[]
      /** La visite faite à laquelle je participais : « après visite ». */
      visit: OpinionVisitRef | null
      saving?: boolean
      error?: string | null
      compact?: boolean
    }>(),
    { saving: false, error: null, compact: false }
  )
  const emit = defineEmits<{ submit: []; cancel: [] }>()

  const draft = computed(() => props.state.draft.value)
  const average = computed(() => props.state.average.value)

  /** Les mots ouverts, par critère (un mot déjà donné s'ouvre d'office). */
  const openWords = ref<Record<string, boolean>>(
    Object.fromEntries(
      props.rows.map(r => [r.key, Boolean(draft.value.scores[r.key]?.word)])
    )
  )
  /** Au téléphone, les mots et la phrase se déplient d'un bouton. */
  const detailsOpen = ref(!props.compact)
  const showDetails = computed(() => !props.compact || detailsOpen.value)

  const wordLabel = (key: string): string => {
    const score = draft.value.scores[key]?.score ?? null
    return SCORE_CHOICES.find(c => c.value === score)?.word ?? ''
  }
  const otherText = computed(() => {
    const names = props.otherNames
    if (names.length === 0) return null
    const list =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
    return `Une notification prévient ${list} quand ton avis change.`
  })

  const button =
    'inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm'
</script>

<template>
  <form
    id="my-opinion"
    class="grid gap-4"
    aria-labelledby="my-opinion-title"
    novalidate
    data-testid="my-opinion-form"
    @submit.prevent="emit('submit')"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id="my-opinion-title" class="text-lg font-semibold">
        Mon avis : {{ meName }}
      </h2>
      <span
        v-if="visit && !compact"
        class="text-sm text-muted"
        data-testid="my-opinion-visit"
        >Tu étais à la visite du {{ shortDay(visit.visitedAt) }} : ces notes
        seront marquées « après visite ».</span
      >
    </div>

    <div
      v-if="visit && compact"
      class="grid gap-1 rounded-2xl bg-accent-soft px-3.5 py-3 text-fg"
      data-testid="my-opinion-visit"
    >
      <strong>Visite marquée faite</strong>
      <span class="text-sm leading-snug"
        >Notez pendant que c’est frais. Ce que vous ne savez pas, laissez « —
        ».</span
      >
    </div>
    <p v-if="compact" class="text-sm text-muted" aria-live="polite">
      {{ average.count }} critère{{ average.count > 1 ? 's' : '' }} noté{{
        average.count > 1 ? 's' : ''
      }}
      sur {{ average.total }}
    </p>

    <ul class="grid" :class="compact ? 'gap-3' : ''">
      <li
        v-for="row in rows"
        :key="row.key"
        class="grid gap-2"
        :class="
          compact
            ? 'rounded-2xl border border-line bg-surface px-3.5 py-3'
            : 'border-t border-line py-3'
        "
        :data-criterion="row.key"
      >
        <div
          :class="
            compact
              ? 'grid gap-2'
              : 'flex flex-wrap items-center gap-x-4 gap-y-2'
          "
        >
          <div
            :class="
              compact
                ? 'flex items-baseline justify-between gap-2'
                : 'grid min-w-0 flex-[1_1_14rem] gap-0.5'
            "
          >
            <span
              :id="`crit-${row.key}-label`"
              class="font-semibold"
              :class="compact ? 'text-base' : ''"
              >{{ row.label }}</span
            >
            <span
              v-if="compact"
              class="text-sm font-semibold"
              :class="
                draft.scores[row.key]?.score == null ? 'text-muted' : 'text-fg'
              "
              aria-hidden="true"
              >{{ wordLabel(row.key) }}</span
            >
            <span v-else-if="row.hint" class="text-xs text-muted">{{
              row.hint
            }}</span>
          </div>
          <ScoreRadioGroup
            :choices="SCORE_CHOICES"
            :model-value="draft.scores[row.key]?.score ?? null"
            :labelledby="`crit-${row.key}-label`"
            :compact="compact"
            :disabled="saving"
            @update:model-value="value => state.setScore(row.key, value)"
          />
          <button
            v-if="showDetails"
            type="button"
            class="inline-flex min-h-11 items-center px-1 text-sm text-accent underline underline-offset-2"
            :aria-expanded="openWords[row.key] ?? false"
            :aria-controls="`crit-${row.key}-word`"
            :data-testid="`word-toggle-${row.key}`"
            @click="openWords[row.key] = !openWords[row.key]"
          >
            {{
              openWords[row.key]
                ? 'Masquer le mot'
                : draft.scores[row.key]?.word
                  ? 'Voir le mot'
                  : 'Ajouter un mot'
            }}
          </button>
        </div>
        <div
          v-if="showDetails && openWords[row.key]"
          :id="`crit-${row.key}-word`"
          class="grid gap-1"
        >
          <label :for="`crit-${row.key}-word-input`" class="text-xs text-muted"
            >Un mot sur « {{ row.label }} » (facultatif)</label
          >
          <input
            :id="`crit-${row.key}-word-input`"
            :value="draft.scores[row.key]?.word ?? ''"
            :maxlength="OPINION_WORD_MAX"
            class="min-h-11 rounded-lg border border-line bg-bg px-3 text-sm text-fg"
            placeholder="ex. chambre 2 un peu sombre"
            :data-testid="`word-${row.key}`"
            @input="
              state.setWord(row.key, ($event.target as HTMLInputElement).value)
            "
          />
        </div>
      </li>
    </ul>

    <div
      class="grid gap-4 border-t border-line pt-3.5"
      :class="compact ? '' : 'sm:grid-cols-2 sm:items-start'"
    >
      <div class="grid gap-2">
        <span id="global-rating-label" class="font-semibold">Note globale</span>
        <span class="text-xs text-muted"
          >Ton ressenti d’ensemble, pas une moyenne{{
            compact
              ? `. Moyenne des critères : ${formatOpinionAverage(average.average)}.`
              : '.'
          }}
          Un second clic enlève la note.</span
        >
        <ScoreRadioGroup
          :choices="GLOBAL_CHOICES"
          :model-value="draft.rating > 0 ? draft.rating : null"
          labelledby="global-rating-label"
          variant="global"
          :compact="compact"
          clearable
          :disabled="saving"
          @update:model-value="value => state.setRating(value ?? 0)"
        />
      </div>
      <div
        v-if="!compact"
        class="grid gap-1 rounded-xl bg-bg px-3.5 py-3"
        data-testid="my-opinion-average"
        aria-live="polite"
      >
        <span class="text-xs text-muted"
          >Moyenne de tes critères, à titre indicatif</span
        >
        <strong class="font-display text-2xl font-bold tabular-nums">{{
          formatOpinionAverage(average.average)
        }}</strong>
        <span class="text-xs text-muted"
          >{{ average.count }} critère{{ average.count > 1 ? 's' : '' }} noté{{
            average.count > 1 ? 's' : ''
          }}
          sur {{ average.total }}</span
        >
      </div>
    </div>

    <button
      v-if="compact && !detailsOpen"
      type="button"
      class="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2"
      :aria-expanded="false"
      data-testid="opinion-details-toggle"
      @click="detailsOpen = true"
    >
      Ajouter des mots et une phrase
    </button>
    <div v-if="showDetails" class="grid gap-1">
      <label for="opinion-text" class="text-sm text-muted">En une phrase</label>
      <textarea
        id="opinion-text"
        :value="draft.text"
        rows="2"
        maxlength="5000"
        class="rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg"
        placeholder="Ce qui vous plaît ou vous gêne"
        @input="state.setText(($event.target as HTMLTextAreaElement).value)"
      />
    </div>

    <p
      v-if="error"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ error }}
    </p>
    <div class="flex flex-wrap items-center gap-2.5">
      <button
        type="submit"
        :class="[
          button,
          'bg-accent font-semibold text-accent-fg disabled:opacity-60',
          compact ? 'min-h-[52px] w-full rounded-xl' : '',
        ]"
        :disabled="saving"
        data-testid="opinion-save"
      >
        {{ saving ? 'Enregistrement…' : 'Enregistrer mon avis' }}
      </button>
      <button
        type="button"
        :class="[
          button,
          'border border-line bg-surface hover:bg-surface-2',
          compact ? 'w-full' : '',
        ]"
        data-testid="opinion-cancel"
        @click="emit('cancel')"
      >
        Annuler
      </button>
      <span class="text-xs text-muted" :class="compact ? 'text-center' : ''"
        >{{ otherText ? `${otherText} ` : '' }}Tes notes ne touchent pas au
        verdict.</span
      >
    </div>
  </form>
</template>
