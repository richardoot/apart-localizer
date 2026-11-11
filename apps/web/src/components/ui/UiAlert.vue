<script setup lang="ts">
  import { computed } from 'vue'
  import { alertClasses } from '@/lib/ui'
  import type { Tone } from '@/lib/ui'
  import type { IconName } from '@/lib/icons'
  import UiButton from './UiButton.vue'
  import UiIcon from './UiIcon.vue'

  /**
   * Lot 22 : un message dans la page, là où l'on a agi (une erreur sous le
   * bouton cliqué, pas en haut de l'écran). `bad` est annoncé tout de suite
   * (`role="alert"`), les autres poliment. `retry` ajoute « Réessayer »,
   * `dismissible` une croix ; le slot `actions` d'autres boutons.
   */
  const props = withDefaults(
    defineProps<{
      tone?: Tone | undefined
      title?: string | undefined
      retry?: boolean | undefined
      retrying?: boolean | undefined
      dismissible?: boolean | undefined
    }>(),
    {
      title: undefined,
      tone: 'bad',
      retry: false,
      retrying: false,
      dismissible: false,
    }
  )
  const emit = defineEmits<{ retry: []; dismiss: [] }>()
  const icon = computed<IconName>(() =>
    props.tone === 'bad' || props.tone === 'warn'
      ? 'alert'
      : props.tone === 'good'
        ? 'check'
        : 'info'
  )
</script>

<template>
  <div
    :role="tone === 'bad' ? 'alert' : 'status'"
    class="flex items-start gap-2"
    :class="alertClasses(tone)"
    :data-tone="tone"
  >
    <UiIcon :name="icon" class="mt-0.5 size-4" />
    <div class="grid min-w-0 flex-1 gap-1">
      <p v-if="title" class="font-semibold">{{ title }}</p>
      <div class="min-w-0 break-words"><slot /></div>
      <div v-if="retry || $slots.actions" class="flex flex-wrap gap-2 pt-1">
        <UiButton
          v-if="retry"
          size="sm"
          icon="refresh"
          :loading="retrying"
          data-testid="retry"
          @click="emit('retry')"
          >Réessayer</UiButton
        >
        <slot name="actions" />
      </div>
    </div>
    <UiButton
      v-if="dismissible"
      variant="ghost"
      size="icon"
      class="-my-1.5 -mr-1.5"
      aria-label="Fermer le message"
      @click="emit('dismiss')"
    >
      <UiIcon name="close" />
    </UiButton>
  </div>
</template>
