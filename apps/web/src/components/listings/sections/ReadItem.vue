<script setup lang="ts">
  import { computed } from 'vue'
  import { useListingEditor } from '@/composables/useListingEditor'
  import { provenanceOf } from '@/lib/provenance'
  import AiMark from './AiMark.vue'

  /**
   * Lot 19 : une valeur lue d'une section de la fiche (terme et valeur d'une
   * liste de définitions), avec la marque « IA » quand l'IA l'a lue dans
   * l'annonce, et « modifié » quand elle a changé depuis la dernière
   * ouverture de la fiche. Une valeur absente se dit « — ».
   */
  const props = withDefaults(
    defineProps<{
      label: string
      value?: string | null
      /** Clé de provenance (`surface`, `floor`, `renovation`…). */
      source?: string
      /** Clés du journal « ce qui a changé » qui la concernent. */
      changedKeys?: readonly string[]
      /** Teinte d'une valeur à surveiller. */
      tone?: 'default' | 'warn'
    }>(),
    { value: null, source: '', changedKeys: () => [], tone: 'default' }
  )
  const editor = useListingEditor()
  const provenance = computed(() =>
    props.source ? provenanceOf(editor.fieldSources.value, props.source) : null
  )
  const changed = computed(() =>
    props.changedKeys.some(k => editor.changedFields.value.includes(k))
  )
</script>

<template>
  <div class="grid min-w-0 content-start gap-0.5">
    <dt class="text-xs text-muted">{{ label }}</dt>
    <dd
      class="m-0 font-semibold break-words"
      :class="tone === 'warn' ? 'text-warn' : 'text-fg'"
    >
      <slot>{{ value ?? '—' }}</slot>
      <AiMark :provenance="provenance" />
      <span
        v-if="changed"
        class="ml-1 inline-block rounded-md bg-accent px-1.5 align-[1px] text-[11px] leading-[18px] font-semibold text-accent-fg"
        title="Modifié depuis votre dernière ouverture de la fiche"
        >modifié</span
      >
    </dd>
  </div>
</template>
