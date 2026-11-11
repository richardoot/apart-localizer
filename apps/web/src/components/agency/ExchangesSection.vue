<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { ListingContactInputRaw } from '@apart/contracts'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiInput from '@/components/ui/UiInput.vue'
  import QueryState from '@/components/ui/QueryState.vue'
  import { useExchangeActions } from '@/composables/useExchangeActions'
  import ContactCard from './ContactCard.vue'

  /**
   * Lot 17, rangé au lot 19 dans la colonne de l'onglet « À faire » : le
   * contact de l'annonceur (saisi, modifié, effacé ici, jamais par Claude)
   * et la signature des messages de l'espace. Les messages à valider, les
   * envois et les réponses sont des lignes de la liste « À faire » ; leur
   * chronologie est dans l'Historique (filtre « Échanges »). L'application
   * n'envoie rien : les messages partent par les outils de l'utilisateur.
   * Lot 22 : lecture par `QueryState`, erreurs dans ce bloc, réussites dans
   * la zone de messages commune.
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
</script>

<template>
  <div class="grid gap-4" data-testid="exchanges">
    <QueryState
      :query="actions.exchanges"
      skeleton="cards"
      :skeleton-count="1"
      loading-label="l’annonceur"
    >
      <template v-if="view">
        <UiAlert v-if="actions.failure.value">{{
          actions.failure.value
        }}</UiAlert>
        <ContactCard
          ref="contactCard"
          :contact="view.contact"
          :busy="actions.busy.value"
          @save="saveContact"
          @clear="clearContact"
        />
        <p class="text-xs text-muted" data-testid="exchanges-outbound">
          Les messages partent par tes outils (Gmail, messagerie du portail),
          jamais par le serveur.
        </p>
        <section
          class="flex flex-wrap items-center gap-2 text-sm text-muted"
          aria-label="Signature des messages"
          data-testid="signature"
        >
          <template v-if="!editingSignature">
            <span
              >Signature des messages :
              <strong class="font-medium text-fg">{{ view.signature }}</strong>
              (aucune adresse ni aucun téléphone ajouté)</span
            >
            <UiButton
              variant="link"
              data-testid="signature-edit"
              @click="editSignature"
            >
              Modifier
            </UiButton>
          </template>
          <form
            v-else
            class="flex w-full flex-wrap items-center gap-2"
            @submit.prevent="saveSignature()"
          >
            <!-- La signature termine les messages aux agences. -->
            <UiInput
              v-model="signature"
              class="min-w-0 flex-1"
              maxlength="300"
              align="left"
              aria-label="Signature des messages"
            />
            <UiButton type="submit" size="sm">Enregistrer</UiButton>
            <UiButton
              v-if="actions.settings.data.value?.custom"
              size="sm"
              @click="saveSignature(true)"
            >
              Par défaut ({{ actions.settings.data.value?.defaultSignature }})
            </UiButton>
            <UiButton size="sm" @click="editingSignature = false">
              Annuler
            </UiButton>
          </form>
        </section>
      </template>
    </QueryState>
  </div>
</template>
