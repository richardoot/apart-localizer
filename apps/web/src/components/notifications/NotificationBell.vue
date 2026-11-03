<script setup lang="ts">
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  import type { Notification } from '@apart/contracts'
  import { useNotifications } from '@/composables/useNotifications'
  import { formatRelativeDays } from '@/lib/format'

  const router = useRouter()
  const { data, unreadCount, markRead, markAllRead } = useNotifications(
    false,
    10
  )
  const open = ref(false)

  async function follow(notification: Notification): Promise<void> {
    open.value = false
    if (!notification.readAt) {
      await markRead.mutateAsync({ id: notification.id, read: true })
    }
    if (notification.url) await router.push(notification.url)
  }
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="relative rounded-lg border border-line px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg"
      :aria-label="`Notifications${unreadCount ? ` : ${unreadCount} non lue(s)` : ''}`"
      :aria-expanded="open"
      data-testid="bell"
      @click="open = !open"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        class="size-4"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      <span
        v-if="unreadCount"
        class="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-accent px-1 text-center text-[11px] font-semibold text-accent-fg"
        data-testid="bell-count"
        >{{ unreadCount > 99 ? '99+' : unreadCount }}</span
      >
    </button>
    <div
      v-if="open"
      class="absolute right-0 z-20 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-1 rounded-xl border border-line bg-surface p-2 shadow-panel"
      role="dialog"
      aria-label="Notifications"
    >
      <div class="flex items-center justify-between px-2 py-1">
        <strong class="text-sm">Notifications</strong>
        <button
          v-if="unreadCount"
          type="button"
          class="text-xs text-accent underline"
          @click="markAllRead.mutate()"
        >
          Tout marquer comme lu
        </button>
      </div>
      <ul class="grid max-h-96 gap-1 overflow-y-auto">
        <li v-for="item in data?.items ?? []" :key="item.id">
          <button
            type="button"
            class="grid w-full gap-0.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
            :class="item.readAt ? 'text-muted' : ''"
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
            <span class="text-xs">{{ item.body }}</span>
            <span class="text-[11px] text-muted">{{
              formatRelativeDays(item.createdAt)
            }}</span>
          </button>
        </li>
        <li
          v-if="(data?.items ?? []).length === 0"
          class="px-2 py-3 text-sm text-muted"
        >
          Aucune notification.
        </li>
      </ul>
      <RouterLink
        to="/notifications"
        class="rounded-lg px-2 py-1.5 text-center text-xs text-accent hover:bg-surface-2"
        @click="open = false"
      >
        Toutes les notifications et réglages
      </RouterLink>
    </div>
  </div>
</template>
