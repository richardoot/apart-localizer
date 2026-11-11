<script setup lang="ts">
  import { computed, onBeforeUnmount } from 'vue'
  import { useFeedbackStore } from '@/stores/feedback'
  import UiButton from './UiButton.vue'
  import UiIcon from './UiIcon.vue'

  /**
   * Lot 22 : la zone des messages (`stores/feedback.ts`), en bas de l'écran,
   * au-dessus de la barre d'accueil de l'iPhone (`safe-area-inset-bottom`),
   * à droite sur ordinateur. Les messages sont annoncés (`aria-live`) ; une
   * erreur l'est tout de suite. Survol ou focus : le message reste.
   */
  const store = useFeedbackStore()
  const token = store.registerHost()
  onBeforeUnmount(() => store.unregisterHost(token))
  const active = computed(() => store.isActiveHost(token))

  const toneClass = {
    good: 'border-good',
    bad: 'border-bad',
    info: 'border-line',
    warn: 'border-warn',
  } as const
  const iconOf = {
    good: 'check',
    bad: 'alert',
    info: 'info',
    warn: 'alert',
  } as const
  const iconClass = {
    good: 'text-good',
    bad: 'text-bad',
    info: 'text-accent',
    warn: 'text-warn',
  } as const
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] sm:items-end sm:px-6"
    aria-live="polite"
    aria-relevant="additions"
    data-testid="feedback"
  >
    <template v-if="active">
      <div
        v-for="message in store.messages"
        :key="message.id"
        :role="message.tone === 'bad' ? 'alert' : 'status'"
        class="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border-l-4 bg-surface py-2 pr-2 pl-3 text-sm text-fg shadow-panel"
        :class="toneClass[message.tone]"
        :data-tone="message.tone"
        data-testid="feedback-message"
        @mouseenter="store.hold(message.id)"
        @mouseleave="store.release(message.id)"
        @focusin="store.hold(message.id)"
        @focusout="store.release(message.id)"
      >
        <UiIcon
          :name="iconOf[message.tone]"
          class="size-4"
          :class="iconClass[message.tone]"
        />
        <p class="min-w-0 flex-1 py-1.5">{{ message.text }}</p>
        <UiButton
          v-if="message.action"
          variant="outline"
          size="sm"
          data-testid="feedback-action"
          @click="store.act(message.id)"
          >{{ message.action.label }}</UiButton
        >
        <UiButton
          variant="ghost"
          size="icon"
          aria-label="Fermer le message"
          @click="store.dismiss(message.id)"
        >
          <UiIcon name="close" />
        </UiButton>
      </div>
    </template>
  </div>
</template>
