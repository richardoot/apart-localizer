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
  import { useAction } from '@/composables/useAction'
  import { formatRelativeDays, plural } from '@/lib/format'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import InstallHelp from '@/components/nav/InstallHelp.vue'
  import { installState, readInstallEnv } from '@/lib/install'

  const router = useRouter()
  const notifications = useNotifications(false, 50)
  const { data, markRead, markAllRead } = notifications
  const prefsAction = useAction('Le réglage n’a pas été enregistré.')
  const settings = useNotificationSettings()
  const { data: workspace } = useWorkspace()
  const types = NotificationTypeSchema.options
  /** Lot 26 : Safari sur iPhone, application pas installée (l'aide le dit). */
  const iosBrowser = installState(readInstallEnv()) === 'ios-browser'
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
    void prefsAction.run(() =>
      settings.updatePreferences.mutateAsync({ [type]: { [channel]: value } })
    )
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
      <UiButton v-if="data?.unreadCount" @click="markAllRead.mutate()">
        Tout marquer comme lu
      </UiButton>
    </header>

    <QueryState
      :query="notifications"
      :empty="data?.items.length === 0"
      empty-title="Aucune notification."
      empty-text="Quand l’autre membre ou Claude change quelque chose qui te concerne, tu le verras ici."
      skeleton="rows"
      loading-label="des notifications"
    >
      <ul class="grid gap-1" data-testid="notifications">
        <li v-for="item in data?.items ?? []" :key="item.id">
          <div
            class="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm"
            :class="item.readAt ? 'text-muted' : ''"
          >
            <UiButton
              variant="ghost"
              size="sm"
              class="grid! justify-start! justify-items-start gap-0.5 py-1.5 text-left"
              :class="item.readAt ? 'text-muted' : 'text-fg'"
              @click="follow(item)"
            >
              <strong class="font-medium">{{ item.title }}</strong>
              <span>{{ item.body }}</span>
            </UiButton>
            <span class="flex items-center gap-2 text-xs text-muted">
              {{ formatRelativeDays(item.createdAt) }}
              <UiButton
                variant="link"
                size="sm"
                @click="markRead.mutate({ id: item.id, read: !item.readAt })"
              >
                {{ item.readAt ? 'Marquer non lue' : 'Marquer lue' }}
              </UiButton>
            </span>
          </div>
        </li>
      </ul>
    </QueryState>

    <QueryState :query="settings" skeleton="block" loading-label="des réglages">
      <UiCard v-if="settings.data.value" title="Préférences">
        <div class="grid gap-4">
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
                <tr
                  v-for="type in types"
                  :key="type"
                  class="border-t border-line"
                >
                  <td class="py-1 pr-2">
                    {{ NOTIFICATION_TYPE_LABELS[type] }}
                  </td>
                  <td
                    v-for="channel in channels"
                    :key="channel"
                    class="px-2 py-0"
                  >
                    <UiCheckbox
                      :model-value="preferences[type][channel]"
                      :aria-label="`${NOTIFICATION_TYPE_LABELS[type]} — ${NOTIFICATION_CHANNEL_LABELS[channel]}`"
                      :data-pref="`${type}.${channel}`"
                      @update:model-value="
                        value => toggle(type, channel, value === true)
                      "
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <UiAlert v-if="prefsAction.error.value">
            {{ prefsAction.error.value }}
          </UiAlert>

          <div class="grid gap-1 text-sm" data-testid="push">
            <h3 class="font-medium">Notifications push sur cet appareil</h3>
            <p v-if="!settings.data.value.push.enabled" class="text-muted">
              Les notifications push ne sont pas encore activées sur ce serveur
              : la colonne « Push » reste sans effet pour l’instant.
            </p>
            <template v-else>
              <p class="text-muted">
                {{
                  plural(
                    settings.data.value.push.subscriptions,
                    'appareil abonné',
                    'appareils abonnés'
                  )
                }}
                pour toi.
              </p>
              <!-- Lot 26 : dans Safari sur iPhone, le push attend l'application installée. -->
              <InstallHelp context="notifications" />
              <div class="flex flex-wrap gap-2">
                <UiButton
                  variant="primary"
                  :loading="settings.pushBusy.value"
                  :disabled="settings.support !== 'supported'"
                  @click="settings.subscribePush()"
                >
                  Activer sur cet appareil
                </UiButton>
                <UiButton
                  :loading="settings.pushBusy.value"
                  :disabled="settings.support !== 'supported'"
                  @click="settings.unsubscribePush()"
                >
                  Désactiver sur cet appareil
                </UiButton>
              </div>
              <p
                v-if="settings.support === 'unsupported' && !iosBrowser"
                class="text-sm text-muted"
              >
                Ce navigateur ne reçoit pas les notifications push ici.
              </p>
              <p v-if="settings.support === 'denied'" class="text-sm text-warn">
                Les notifications sont bloquées pour ce site dans le navigateur.
              </p>
            </template>
            <UiAlert v-if="settings.pushError.value">
              {{ settings.pushError.value }}
            </UiAlert>
          </div>

          <div class="grid gap-1 text-sm">
            <h3 class="font-medium">E-mail</h3>
            <p class="text-muted">
              <template v-if="settings.data.value.email.enabled">
                Les notifications cochées dans la colonne « E-mail » partent à
                {{ settings.data.value.email.address ?? 'ton adresse' }}.
              </template>
              <template v-else>
                L’envoi d’e-mails n’est pas encore activé sur ce serveur : la
                colonne « E-mail » reste sans effet pour l’instant.
              </template>
            </p>
          </div>

          <div class="grid gap-1 text-sm" data-testid="inbound">
            <h3 class="font-medium">Transfert d'alertes e-mail</h3>
            <p v-if="settings.data.value.inbound.enabled" class="text-muted">
              Pour recevoir ici les alertes SeLoger, Leboncoin ou PAP, fais-les
              suivre vers le service d’e-mails entrants réglé sur cette adresse
              :
              <code class="break-all">{{ inboundUrl }}</code>
              (espace {{ workspace?.workspace.name }}). Les annonces arrivent
              dans l’étape « À valider » des annonces.
            </p>
            <p v-else class="text-muted">
              Le transfert d’alertes e-mail n’est pas encore activé pour cet
              espace.
            </p>
          </div>
        </div>
      </UiCard>
    </QueryState>
  </section>
</template>
