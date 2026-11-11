<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { AGENCY_CHANNEL_LABELS, AgencyChannelSchema } from '@apart/contracts'
  import type { AgencyChannel, ListingContact } from '@apart/contracts'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiConfirm from '@/components/ui/UiConfirm.vue'
  import UiField from '@/components/ui/UiField.vue'
  import { errorMessage } from '@/lib/errors'
  import { formatDate } from '@/lib/format'
  import { cardClasses } from '@/lib/ui'

  /**
   * Lot 17 : la carte du contact de l'annonceur (agence, interlocuteur,
   * e-mail, téléphone, lien de la messagerie du portail, canal préféré).
   * Données personnelles d'un tiers : ce que l'annonce donne, rien de plus,
   * modifiables et effaçables ici (jamais par Claude).
   */
  const props = defineProps<{
    contact: ListingContact | null
    busy?: boolean
  }>()
  const emit = defineEmits<{
    save: [
      input: {
        agencyName: string | null
        contactName: string | null
        email: string | null
        phone: string | null
        portalMessageUrl: string | null
        preferredChannel: AgencyChannel | null
      },
    ]
    clear: []
  }>()

  const editing = ref(false)
  const failure = ref<string | null>(null)
  const form = ref({
    agencyName: '',
    contactName: '',
    email: '',
    phone: '',
    portalMessageUrl: '',
    preferredChannel: '' as AgencyChannel | '',
  })

  // Lot 22 : en constante (vue-tsc lit mal « https://… » écrit dans l'attribut d'un composant).
  const URL_PLACEHOLDER = 'https://…'
  const channelOptions = [
    { value: '', label: 'Selon ce qui est connu' },
    ...AgencyChannelSchema.options.map(c => ({
      value: c,
      label: AGENCY_CHANNEL_LABELS[c],
    })),
  ]

  function startEditing(): void {
    const c = props.contact
    form.value = {
      agencyName: c?.agencyName ?? '',
      contactName: c?.contactName ?? '',
      email: c?.email ?? '',
      phone: c?.phone ?? '',
      portalMessageUrl: c?.portalMessageUrl ?? '',
      preferredChannel: c?.preferredChannel ?? '',
    }
    failure.value = null
    editing.value = true
  }

  const orNull = (value: string): string | null => value.trim() || null

  const empty = computed(() =>
    Object.values(form.value).every(v => String(v).trim() === '')
  )

  function submit(): void {
    if (empty.value) {
      failure.value = 'Renseigne au moins un champ, ou efface le contact.'
      return
    }
    emit('save', {
      agencyName: orNull(form.value.agencyName),
      contactName: orNull(form.value.contactName),
      email: orNull(form.value.email),
      phone: orNull(form.value.phone),
      portalMessageUrl: orNull(form.value.portalMessageUrl),
      preferredChannel: form.value.preferredChannel || null,
    })
  }

  /** Appelé par le parent une fois l'enregistrement fait, ou en échec. */
  function done(error?: unknown): void {
    if (error) {
      failure.value = errorMessage(error, 'L’enregistrement a échoué.')
      return
    }
    editing.value = false
  }
  defineExpose({ done })
</script>

<template>
  <section
    class="grid gap-3"
    :class="cardClasses()"
    aria-labelledby="contact-title"
    data-testid="agency-contact"
  >
    <header class="flex flex-wrap items-start justify-between gap-2">
      <div class="grid gap-0.5">
        <h3 id="contact-title" class="font-display text-base font-bold">
          Contact de l’annonceur
        </h3>
        <p class="text-xs text-muted">
          Ce que l’annonce donne, rien de plus ; modifiable et effaçable à tout
          moment.
        </p>
      </div>
      <div
        v-if="!editing"
        class="flex flex-wrap items-center gap-2"
        data-testid="contact-clear-confirm"
      >
        <UiButton size="sm" data-testid="contact-edit" @click="startEditing">
          {{ contact ? 'Modifier' : 'Ajouter un contact' }}
        </UiButton>
        <UiConfirm
          v-if="contact"
          label="Effacer"
          question="Effacer le contact de l’annonceur ? Les messages déjà envoyés restent dans la chronologie, avec le nom affiché seulement."
          confirm-label="Effacer le contact"
          cancel-label="Garder"
          :busy="busy"
          :confirm-attrs="{ 'data-testid': 'contact-clear-yes' }"
          data-testid="contact-clear"
          @confirm="emit('clear')"
        />
      </div>
    </header>

    <form
      v-if="editing"
      class="grid gap-3 sm:grid-cols-2"
      data-testid="contact-form"
      novalidate
      @submit.prevent="submit"
    >
      <UiField
        id="contact-agency"
        v-model="form.agencyName"
        label="Agence (ou « particulier »)"
        quiet
        maxlength="120"
        autocomplete="off"
        data-testid="contact-agency"
      />
      <UiField
        id="contact-name"
        v-model="form.contactName"
        label="Interlocuteur"
        quiet
        maxlength="120"
        autocomplete="off"
        placeholder="Mme [Exemple]"
      />
      <UiField
        id="contact-email"
        v-model="form.email"
        label="E-mail"
        quiet
        type="email"
        inputmode="email"
        maxlength="254"
        autocomplete="off"
        data-testid="contact-email"
      />
      <UiField
        id="contact-phone"
        v-model="form.phone"
        label="Téléphone"
        quiet
        type="tel"
        inputmode="tel"
        align="left"
        maxlength="30"
        autocomplete="off"
      />
      <UiField
        id="contact-portal"
        v-model="form.portalMessageUrl"
        label="Lien de la messagerie du portail"
        quiet
        full
        type="url"
        inputmode="url"
        maxlength="2000"
        :placeholder="URL_PLACEHOLDER"
      />
      <UiField
        id="contact-channel"
        v-model="form.preferredChannel"
        as="select"
        label="Canal préféré"
        quiet
        :options="channelOptions"
        data-testid="contact-channel"
      />
      <UiAlert v-if="failure" class="sm:col-span-2">{{ failure }}</UiAlert>
      <div class="flex flex-wrap justify-end gap-2 sm:col-span-2">
        <UiButton @click="editing = false">Annuler</UiButton>
        <UiButton
          type="submit"
          variant="primary"
          :loading="busy"
          data-testid="contact-save"
        >
          Enregistrer
        </UiButton>
      </div>
    </form>

    <dl
      v-else-if="contact"
      class="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]"
      data-testid="contact-view"
    >
      <template v-if="contact.agencyName">
        <dt class="text-xs text-muted sm:pt-0.5">Agence</dt>
        <dd>{{ contact.agencyName }}</dd>
      </template>
      <template v-if="contact.contactName">
        <dt class="text-xs text-muted sm:pt-0.5">Interlocuteur</dt>
        <dd>{{ contact.contactName }}</dd>
      </template>
      <template v-if="contact.email">
        <dt class="text-xs text-muted sm:pt-0.5">E-mail</dt>
        <dd class="break-all">{{ contact.email }}</dd>
      </template>
      <template v-if="contact.phone">
        <dt class="text-xs text-muted sm:pt-0.5">Téléphone</dt>
        <dd>{{ contact.phone }}</dd>
      </template>
      <template v-if="contact.portalMessageUrl">
        <dt class="text-xs text-muted sm:pt-0.5">Messagerie</dt>
        <dd>
          <UiButton
            :href="contact.portalMessageUrl"
            variant="link"
            target="_blank"
            rel="noopener noreferrer"
            icon-right="external"
            class="break-all"
            >ouvrir la conversation</UiButton
          >
        </dd>
      </template>
      <template v-if="contact.preferredChannel">
        <dt class="text-xs text-muted sm:pt-0.5">Canal préféré</dt>
        <dd>{{ AGENCY_CHANNEL_LABELS[contact.preferredChannel] }}</dd>
      </template>
      <dd class="text-xs text-muted sm:col-span-2">
        Mis à jour le {{ formatDate(contact.updatedAt) }}
      </dd>
    </dl>
    <p v-else class="text-sm text-muted" data-testid="contact-empty">
      Aucun contact enregistré. Claude le lit sur l’annonce quand il prépare un
      message ; tu peux aussi le saisir.
    </p>
  </section>
</template>
