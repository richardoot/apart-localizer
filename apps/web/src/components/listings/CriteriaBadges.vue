<script setup lang="ts">
  import type { CriteriaMatch } from '@apart/contracts'
  import { criteriaApproximateNote } from '@apart/domain'

  /** Les critères dans lesquels l'annonce est entrée (alertes, besoin G6). */
  defineProps<{ matches: readonly CriteriaMatch[] }>()
</script>

<template>
  <span v-if="matches.length" class="inline-flex flex-wrap gap-1">
    <span
      v-for="m in matches"
      :key="m.criteriaId"
      class="rounded-full border border-accent bg-accent-soft px-2 text-xs"
      :title="
        m.approximate
          ? criteriaApproximateNote(m.name)
          : `Dans le critère « ${m.name} »`
      "
      data-testid="criteria-badge"
    >
      ◎ {{ m.name }}<template v-if="m.approximate"> ≈</template>
    </span>
  </span>
</template>
