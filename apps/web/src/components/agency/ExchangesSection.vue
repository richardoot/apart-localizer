<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { ListingContactInputRaw } from '@apart/contracts'
  import { useExchangeActions } from '@/composables/useExchangeActions'
  import ContactCard from './ContactCard.vue'

  /**
   * Lot 17, rangé au lot 19 dans la colonne de l'onglet « À faire » : le
   * contact de l'annonceur (saisi, modifié, effacé ici, jamais par Claude)
   * et la signature des messages de l'espace. Les messages à valider, les
   * envois et les réponses sont des lignes de la liste « À faire » ; leur
   * chronologie est dans l'Historique (filtre « Échanges »). L'application
   * n'envoie rien : les messages partent par les outils de l'utilisateur.
   */
  const props = defineProps<{ listingId: string }>()

  const actions = useExchangeActions(computed(() => props.listingId))
  const view = computed(() => actions.view.value)
  const contactCard = ref<InstanceType<typeof ContactCard> | null>(null)
  const editingSignature = ref(false)
  const signature = ref('')

  async function saveContact(input: ListingContactInputRaw): Promise<void> {
    const error = await actions.saveContact(input)
    contactCard.value?.done(error ?? undefined)
  }
  async function clearContact(): Promise<void> {
    if (await actions.clearContact()) contactCard.value?.done()
  }

  function editSignature(): void {
    signature.value = actions.settings.data.value?.signature ?? ''
    editingSignature.value = true
  }
  async function saveSignature(reset = false): Promise<void> {
    const ok = await actions.saveSignature(
      reset ? null : signature.value.trim() || null
    )
    if (ok) editingSignature.value = false
  }

  const buttonClass =
    'inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm hover:bg-surface-2 disabled:opacity-60 sm:min-h-9'
</script>

<template>
  <div class="grid gap-4" data-testid="exchanges">
    <p
      v-if="actions.exchanges.error.value"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ actions.exchanges.error.value.message }}
    </p>
    <template v-else-if="view">
      <p
        v-if="actions.failure.value"
        role="alert"
        class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
      >
        {{ actions.failure.value }}
      </p>
      <p
        v-else-if="actions.notice.value"
        class="text-sm text-good"
        aria-live="polite"
      >
        {{ actions.notice.value }}
      </p>
      <ContactCard
        ref="contactCard"
        class="bg-surface"
        :contact="view.contact"
        :busy="actions.busy.value"
        @save="saveContact"
        @clear="clearContact"
      />
      <p class="text-xs text-muted" data-testid="exchanges-outbound">
        Les messages partent par vos outils (Gmail, messagerie du portail),
        jamais par le serveur.
      </p>
      <section
        class="flex flex-wrap items-center gap-2 text-xs text-muted"
        aria-label="Signature des messages"
        data-testid="signature"
      >
        <template v-if="!editingSignature">
          <span
            >Signature des messages :
            <strong class="font-medium text-fg">{{ view.signature }}</strong>
            (aucune adresse ni aucun téléphone ajouté)</span
          >
          <button
            type="button"
            class="inline-flex min-h-11 items-center text-accent underline sm:min-h-0"
            data-testid="signature-edit"
            @click="editSignature"
          >
            Modifier
          </button>
        </template>
        <form
          v-else
          class="flex w-full flex-wrap items-center gap-2"
          @submit.prevent="saveSignature()"
        >
          <input
            v-model="signature"
            maxlength="300"
            class="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm text-fg sm:min-h-9"
            aria-label="Signature des messages"
          />
          <button type="submit" :class="buttonClass">Enregistrer</button>
          <button
            v-if="actions.settings.data.value?.custom"
            type="button"
            :class="buttonClass"
            @click="saveSignature(true)"
          >
            Par défaut ({{ actions.settings.data.value?.defaultSignature }})
          </button>
          <button
            type="button"
            :class="buttonClass"
            @click="editingSignature = false"
          >
            Annuler
          </button>
        </form>
      </section>
    </template>
    <p v-else class="text-sm text-muted">Chargement des échanges…</p>
  </div>
</template>
