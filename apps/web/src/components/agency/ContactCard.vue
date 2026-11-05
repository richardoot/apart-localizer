<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { AGENCY_CHANNEL_LABELS, AgencyChannelSchema } from '@apart/contracts'
  import type { AgencyChannel, ListingContact } from '@apart/contracts'
  import { ApiError } from '@/lib/api'
  import { formatDate } from '@/lib/format'

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
  const confirmingClear = ref(false)
  const failure = ref<string | null>(null)
  const form = ref({
    agencyName: '',
    contactName: '',
    email: '',
    phone: '',
    portalMessageUrl: '',
    preferredChannel: '' as AgencyChannel | '',
  })

  const channels = AgencyChannelSchema.options

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
      failure.value = 'Renseignez au moins un champ, ou effacez le contact.'
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
      failure.value =
        error instanceof ApiError ? error.message : "L'enregistrement a échoué."
      return
    }
    editing.value = false
    confirmingClear.value = false
  }
  defineExpose({ done })

  const inputClass =
    'min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm sm:min-h-9'
  const buttonClass =
    'inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm hover:bg-surface-2 disabled:opacity-60 sm:min-h-9'
</script>

<template>
  <section
    class="grid gap-3 rounded-xl border border-line p-4"
    aria-labelledby="contact-title"
    data-testid="agency-contact"
  >
    <header class="flex flex-wrap items-start justify-between gap-2">
      <div class="grid gap-0.5">
        <h3 id="contact-title" class="font-display text-base font-semibold">
          Contact de l’annonceur
        </h3>
        <p class="text-xs text-muted">
          Ce que l’annonce donne, rien de plus ; modifiable et effaçable à tout
          moment.
        </p>
      </div>
      <div v-if="!editing" class="flex flex-wrap gap-2">
        <button
          type="button"
          :class="buttonClass"
          data-testid="contact-edit"
          @click="startEditing"
        >
          {{ contact ? 'Modifier' : 'Ajouter un contact' }}
        </button>
        <button
          v-if="contact && !confirmingClear"
          type="button"
          :class="buttonClass"
          data-testid="contact-clear"
          @click="confirmingClear = true"
        >
          Effacer
        </button>
      </div>
    </header>

    <div
      v-if="confirmingClear"
      class="flex flex-wrap items-center gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm"
      role="alert"
      data-testid="contact-clear-confirm"
    >
      <span class="flex-1"
        >Effacer le contact de l’annonceur ? Les messages déjà envoyés restent
        dans la chronologie, avec le nom affiché seulement.</span
      >
      <button
        type="button"
        :class="buttonClass"
        @click="confirmingClear = false"
      >
        Garder
      </button>
      <button
        type="button"
        class="inline-flex min-h-11 items-center rounded-lg bg-bad px-3 text-sm font-medium text-accent-fg disabled:opacity-60 sm:min-h-9"
        :disabled="busy"
        data-testid="contact-clear-yes"
        @click="emit('clear')"
      >
        Effacer le contact
      </button>
    </div>

    <form
      v-if="editing"
      class="grid gap-3 sm:grid-cols-2"
      data-testid="contact-form"
      @submit.prevent="submit"
    >
      <label class="grid gap-1 text-xs font-medium text-muted">
        Agence (ou « particulier »)
        <input
          v-model="form.agencyName"
          :class="inputClass"
          maxlength="120"
          autocomplete="off"
          data-testid="contact-agency"
        />
      </label>
      <label class="grid gap-1 text-xs font-medium text-muted">
        Interlocuteur
        <input
          v-model="form.contactName"
          :class="inputClass"
          maxlength="120"
          autocomplete="off"
          placeholder="Mme [Exemple]"
        />
      </label>
      <label class="grid gap-1 text-xs font-medium text-muted">
        E-mail
        <input
          v-model="form.email"
          type="email"
          inputmode="email"
          :class="inputClass"
          maxlength="254"
          autocomplete="off"
          data-testid="contact-email"
        />
      </label>
      <label class="grid gap-1 text-xs font-medium text-muted">
        Téléphone
        <input
          v-model="form.phone"
          type="tel"
          inputmode="tel"
          :class="inputClass"
          maxlength="30"
          autocomplete="off"
        />
      </label>
      <label class="grid gap-1 text-xs font-medium text-muted sm:col-span-2">
        Lien de la messagerie du portail
        <input
          v-model="form.portalMessageUrl"
          type="url"
          inputmode="url"
          :class="inputClass"
          maxlength="2000"
          placeholder="https://…"
        />
      </label>
      <label class="grid gap-1 text-xs font-medium text-muted">
        Canal préféré
        <select
          v-model="form.preferredChannel"
          :class="inputClass"
          data-testid="contact-channel"
        >
          <option value="">Selon ce qui est connu</option>
          <option v-for="c in channels" :key="c" :value="c">
            {{ AGENCY_CHANNEL_LABELS[c] }}
          </option>
        </select>
      </label>
      <p
        v-if="failure"
        role="alert"
        class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad sm:col-span-2"
      >
        {{ failure }}
      </p>
      <div class="flex flex-wrap justify-end gap-2 sm:col-span-2">
        <button type="button" :class="buttonClass" @click="editing = false">
          Annuler
        </button>
        <button
          type="submit"
          class="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-60 sm:min-h-9"
          :disabled="busy"
          data-testid="contact-save"
        >
          Enregistrer
        </button>
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
          <a
            :href="contact.portalMessageUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="break-all text-accent underline"
            >ouvrir la conversation</a
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
      message ; vous pouvez aussi le saisir.
    </p>
  </section>
</template>
