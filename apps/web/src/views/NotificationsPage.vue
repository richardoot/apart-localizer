<script setup lang="ts">
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    NOTIFICATION_CHANNEL_LABELS,
    NOTIFICATION_TYPE_LABELS,
    NotificationChannelSchema,
    NotificationTypeSchema,
    resolveNotificationPreferences,
  } from '@apart/contracts'
  import type {
    Notification,
    NotificationChannel,
    NotificationType,
  } from '@apart/contracts'
  import {
    useNotificationSettings,
    useNotifications,
  } from '@/composables/useNotifications'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { formatRelativeDays } from '@/lib/format'

  const router = useRouter()
  const { data, markRead, markAllRead } = useNotifications(false, 50)
  const settings = useNotificationSettings()
  const { data: workspace } = useWorkspace()
  const types = NotificationTypeSchema.options
  const channels = NotificationChannelSchema.options

  const apiUrl = (
    import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
  ).replace(/\/$/, '')
  const inboundUrl = computed(() =>
    settings.data.value ? `${apiUrl}${settings.data.value.inbound.path}` : ''
  )

  /**
   * Les préférences, complétées des valeurs par défaut : une API d'une
   * version antérieure ne connaît pas encore les types récents (lot 15 :
   * « Mise à jour d'une annonce »).
   */
  const preferences = computed(() =>
    resolveNotificationPreferences(settings.data.value?.preferences ?? {})
  )

  function toggle(
    type: NotificationType,
    channel: NotificationChannel,
    value: boolean
  ): void {
    settings.updatePreferences.mutate({ [type]: { [channel]: value } })
  }

  async function follow(notification: Notification): Promise<void> {
    if (!notification.readAt) {
      await markRead.mutateAsync({ id: notification.id, read: true })
    }
    if (notification.url) await router.push(notification.url)
  }
</script>

<template>
  <section class="mx-auto grid max-w-4xl gap-6 px-4 py-6">
    <header class="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h1 class="font-display text-2xl font-bold">Notifications</h1>
        <p class="text-sm text-muted">
          Nouvelle annonce de l'autre membre ou de Claude, changement de statut,
          tâche assignée, entrée dans un critère, réponse à une offre, annonces
          reçues par e-mail, mise à jour trouvée en vérifiant une annonce,
          réponse d'une agence enregistrée.
        </p>
      </div>
      <button
        v-if="data?.unreadCount"
        type="button"
        class="rounded-lg border border-line px-3 py-1.5 text-sm"
        @click="markAllRead.mutate()"
      >
        Tout marquer comme lu
      </button>
    </header>

    <ul class="grid gap-1" data-testid="notifications">
      <li v-for="item in data?.items ?? []" :key="item.id">
        <div
          class="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
          :class="item.readAt ? 'text-muted' : ''"
        >
          <button
            type="button"
            class="grid gap-0.5 text-left"
            @click="follow(item)"
          >
            <strong class="font-medium">{{ item.title }}</strong>
            <span class="text-xs">{{ item.body }}</span>
          </button>
          <span class="flex items-center gap-2 text-xs text-muted">
            {{ formatRelativeDays(item.createdAt) }}
            <button
              type="button"
              class="underline"
              @click="markRead.mutate({ id: item.id, read: !item.readAt })"
            >
              {{ item.readAt ? 'Marquer non lue' : 'Marquer lue' }}
            </button>
          </span>
        </div>
      </li>
      <li v-if="(data?.items ?? []).length === 0" class="text-sm text-muted">
        Aucune notification.
      </li>
    </ul>

    <section
      v-if="settings.data.value"
      class="grid gap-3 rounded-xl border border-line bg-surface p-4"
      aria-labelledby="prefs-title"
    >
      <h2 id="prefs-title" class="font-display text-base font-semibold">
        Préférences
      </h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm" data-testid="preferences">
          <thead>
            <tr class="text-left text-xs text-muted">
              <th class="py-1 pr-2 font-medium">Type</th>
              <th
                v-for="channel in channels"
                :key="channel"
                class="px-2 py-1 font-medium"
              >
                {{ NOTIFICATION_CHANNEL_LABELS[channel] }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="type in types" :key="type" class="border-t border-line">
              <td class="py-1.5 pr-2">{{ NOTIFICATION_TYPE_LABELS[type] }}</td>
              <td
                v-for="channel in channels"
                :key="channel"
                class="px-2 py-1.5"
              >
                <input
                  type="checkbox"
                  class="accent-accent"
                  :aria-label="`${NOTIFICATION_TYPE_LABELS[type]} — ${NOTIFICATION_CHANNEL_LABELS[channel]}`"
                  :checked="preferences[type][channel]"
                  :data-pref="`${type}.${channel}`"
                  @change="
                    toggle(
                      type,
                      channel,
                      ($event.target as HTMLInputElement).checked
                    )
                  "
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="grid gap-1 text-sm" data-testid="push">
        <h3 class="font-medium">Notifications push sur cet appareil</h3>
        <p v-if="!settings.data.value.push.enabled" class="text-muted">
          Le serveur n'a pas de clés VAPID : le push est désactivé
          (docs/deploiement.md).
        </p>
        <template v-else>
          <p class="text-muted">
            {{ settings.data.value.push.subscriptions }} appareil(s) abonné(s)
            pour vous. Sur iPhone, installez d'abord l'application sur l'écran
            d'accueil.
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-60"
              :disabled="
                settings.pushBusy.value || settings.support !== 'supported'
              "
              @click="settings.subscribePush()"
            >
              Activer sur cet appareil
            </button>
            <button
              type="button"
              class="rounded-lg border border-line px-3 py-1.5 text-sm disabled:opacity-60"
              :disabled="
                settings.pushBusy.value || settings.support !== 'supported'
              "
              @click="settings.unsubscribePush()"
            >
              Désactiver sur cet appareil
            </button>
          </div>
          <p
            v-if="settings.support === 'unsupported'"
            class="text-xs text-muted"
          >
            Ce navigateur ne gère pas le web push ici.
          </p>
          <p v-if="settings.support === 'denied'" class="text-xs text-warn">
            Les notifications sont bloquées pour ce site dans le navigateur.
          </p>
        </template>
        <p
          v-if="settings.pushError.value"
          role="alert"
          class="text-xs text-bad"
        >
          {{ settings.pushError.value }}
        </p>
      </div>

      <div class="grid gap-1 text-sm">
        <h3 class="font-medium">E-mail</h3>
        <p class="text-muted">
          <template v-if="settings.data.value.email.enabled">
            Envoi configuré ; les notifications cochées partent à
            {{ settings.data.value.email.address ?? 'votre adresse' }}.
          </template>
          <template v-else>
            Aucun envoi d'e-mails n'est configuré sur le serveur : la colonne «
            E-mail » reste sans effet.
          </template>
        </p>
      </div>

      <div class="grid gap-1 text-sm" data-testid="inbound">
        <h3 class="font-medium">Transfert d'alertes e-mail</h3>
        <p v-if="settings.data.value.inbound.enabled" class="text-muted">
          Faites suivre les alertes SeLoger, Leboncoin ou PAP à votre service
          d'e-mails entrants ; il appelle, signé,
          <code class="break-all">{{ inboundUrl }}</code>
          (espace {{ workspace?.workspace.name }}). Les annonces arrivent « à
          valider » sur la synthèse.
        </p>
        <p v-else class="text-muted">
          Le webhook d'e-mails entrants n'est pas configuré
          (INBOUND_EMAIL_SECRET, docs/deploiement.md).
        </p>
      </div>
    </section>
  </section>
</template>
