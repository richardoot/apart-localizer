<script setup lang="ts">
  import type { PropertyFact } from '@/lib/workflow'

  /**
   * Le volet « Les données du bien » du tri et des archives : ce qui est
   * connu du bien, et la description de l'annonce. L'état ouvert est tenu par
   * le parent : d'une annonce à l'autre du tri, il reste ouvert.
   */
  defineProps<{
    facts: readonly PropertyFact[]
    description: string | null
  }>()
  const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <details
    v-if="facts.length || description"
    class="rounded-2xl border border-line bg-surface"
    data-testid="property-facts"
    :open="open"
    @toggle="open = ($event.target as HTMLDetailsElement).open"
  >
    <summary
      class="flex min-h-11 cursor-pointer items-center px-3.5 text-base font-semibold"
    >
      Les données du bien
    </summary>
    <div class="flex flex-col gap-3 border-t border-line px-3.5 py-3">
      <dl
        v-if="facts.length"
        class="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div v-for="fact in facts" :key="fact.label" class="min-w-0">
          <dt class="text-xs text-muted">{{ fact.label }}</dt>
          <dd class="break-words">{{ fact.value }}</dd>
        </div>
      </dl>
      <section v-if="description" class="flex flex-col gap-1">
        <h3 class="text-xs text-muted">Description de l’annonce</h3>
        <p class="max-h-64 overflow-y-auto leading-normal whitespace-pre-line">
          {{ description }}
        </p>
      </section>
    </div>
  </details>
</template>
