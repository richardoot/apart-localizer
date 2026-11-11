<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import type { Notification } from '@apart/contracts'
  import { useNotifications } from '@/composables/useNotifications'
  import { formatRelativeDays, plural } from '@/lib/format'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import UiPopover from '@/components/ui/UiPopover.vue'

  const router = useRouter()
  const { data, unreadCount, markRead, markAllRead } = useNotifications(
    false,
    10
  )
  const open = ref(false)

  /**
   * Lot 22 : la cloche ouvre un panneau ancré (reka-ui) : Échap et un clic
   * ailleurs le ferment, le focus revient à la cloche.
   */
  const label = computed(() =>
    unreadCount.value
      ? `Notifications : ${plural(unreadCount.value, 'non lue', 'non lues')}`
      : 'Notifications'
  )

  async function follow(notification: Notification): Promise<void> {
    open.value = false
    if (!notification.readAt) {
      await markRead.mutateAsync({ id: notification.id, read: true })
    }
    if (notification.url) await router.push(notification.url)
  }
</script>

<template>
  <UiPopover v-model:open="open" label="Notifications">
    <template #trigger>
      <UiButton
        variant="ghost"
        size="icon"
        class="relative border border-line"
        :aria-label="label"
        data-testid="bell"
      >
        <UiIcon name="bell" class="size-5" />
        <span
          v-if="unreadCount"
          class="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-accent px-1 text-center text-xs font-semibold text-accent-fg"
          data-testid="bell-count"
          >{{ unreadCount > 99 ? '99+' : unreadCount }}</span
        >
      </UiButton>
    </template>
    <div class="flex items-center justify-between gap-2 px-2 py-1">
      <strong class="text-sm">Notifications</strong>
      <UiButton
        v-if="unreadCount"
        variant="link"
        size="sm"
        @click="markAllRead.mutate()"
      >
        Tout marquer comme lu
      </UiButton>
    </div>
    <ul class="grid max-h-96 gap-1 overflow-y-auto">
      <li v-for="item in data?.items ?? []" :key="item.id">
        <UiButton
          variant="ghost"
          block
          class="grid! justify-start! justify-items-start gap-0.5 py-1.5 text-left"
          :class="item.readAt ? 'text-muted' : 'text-fg'"
          :data-unread="item.readAt ? undefined : 'true'"
          @click="follow(item)"
        >
          <span class="flex items-baseline gap-2">
            <span
              v-if="!item.readAt"
              class="inline-block size-2 shrink-0 rounded-full bg-accent"
              aria-hidden="true"
            />
            <strong class="font-medium">{{ item.title }}</strong>
          </span>
          <span class="text-sm">{{ item.body }}</span>
          <span class="text-xs text-muted">{{
            formatRelativeDays(item.createdAt)
          }}</span>
        </UiButton>
      </li>
      <li
        v-if="data && data.items.length === 0"
        class="px-2 py-3 text-sm text-muted"
      >
        Aucune notification.
      </li>
    </ul>
    <UiButton
      to="/notifications"
      variant="ghost"
      size="sm"
      class="text-accent"
      @click="open = false"
    >
      Toutes les notifications et réglages
    </UiButton>
  </UiPopover>
</template>
