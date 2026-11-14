<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { plural } from '@/lib/format'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'

  /**
   * Lot 32 (ADR 0047) : les photos de l'annonce sur le portail, pour la
   * regarder sans y retourner. Ce sont des liens : le navigateur charge
   * chaque image depuis le portail (sans en-tête Referer), le serveur ne la
   * télécharge jamais. Une image que le portail a retirée disparaît ; si
   * aucune ne se charge, la galerie le dit. Une grande photo, ses voisines
   * en vignettes (flèches et vignettes de 44 px au toucher).
   */
  const props = withDefaults(
    defineProps<{
      photos: readonly string[]
      /** Le portail, pour le dire (« Photos de Leboncoin »). */
      portalLabel?: string | null
      /** `compact` : une hauteur réduite (panneau d'un brouillon au téléphone). */
      compact?: boolean
    }>(),
    { portalLabel: null, compact: false }
  )

  const failed = ref<ReadonlySet<string>>(new Set())
  const index = ref(0)
  watch(
    () => props.photos,
    () => {
      failed.value = new Set()
      index.value = 0
    }
  )

  const shown = computed(() => props.photos.filter(p => !failed.value.has(p)))
  const current = computed(
    () => shown.value[Math.min(index.value, shown.value.length - 1)] ?? null
  )
  const position = computed(() =>
    current.value ? shown.value.indexOf(current.value) : -1
  )
  const allFailed = computed(
    () => props.photos.length > 0 && shown.value.length === 0
  )

  function onError(url: string): void {
    const next = new Set(failed.value)
    next.add(url)
    failed.value = next
  }
  function go(step: number): void {
    const count = shown.value.length
    if (count === 0) return
    index.value = (position.value + step + count) % count
  }
  function pick(url: string): void {
    index.value = shown.value.indexOf(url)
  }
</script>

<template>
  <section
    v-if="photos.length"
    class="grid gap-2"
    aria-label="Photos de l’annonce"
    data-testid="portal-photos"
  >
    <p
      v-if="allFailed"
      class="rounded-xl bg-surface-2 p-3 text-sm text-muted"
      data-testid="portal-photos-gone"
    >
      Les photos ne se chargent plus : le portail les a sans doute retirées.
    </p>
    <template v-else-if="current">
      <div class="relative overflow-hidden rounded-xl bg-surface-2">
        <img
          :key="current"
          :src="current"
          :alt="`Photo ${position + 1} sur ${shown.length}`"
          decoding="async"
          referrerpolicy="no-referrer"
          class="w-full object-contain"
          :class="compact ? 'h-56 sm:h-72' : 'h-64 sm:h-96'"
          data-testid="portal-photo-main"
          @error="onError(current)"
        />
        <template v-if="shown.length > 1">
          <UiButton
            size="icon"
            class="absolute top-1/2 left-2 -translate-y-1/2 bg-surface/90"
            aria-label="Photo précédente"
            data-action="previous-photo"
            @click="go(-1)"
          >
            <UiIcon name="chevron-left" class="size-5" />
          </UiButton>
          <UiButton
            size="icon"
            class="absolute top-1/2 right-2 -translate-y-1/2 bg-surface/90"
            aria-label="Photo suivante"
            data-action="next-photo"
            @click="go(1)"
          >
            <UiIcon name="chevron-right" class="size-5" />
          </UiButton>
        </template>
      </div>
      <!-- Lot 22 : une vignette est une image cliquable, pas un bouton d'action. -->
      <div
        v-if="shown.length > 1"
        class="flex gap-1.5 overflow-x-auto pb-1"
        data-testid="portal-photo-thumbs"
      >
        <button
          v-for="(url, i) in shown"
          :key="url"
          type="button"
          class="flex-none overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          :class="i === position ? 'ring-2 ring-accent' : 'opacity-80'"
          :aria-label="`Voir la photo ${i + 1}`"
          :aria-current="i === position ? 'true' : undefined"
          @click="pick(url)"
        >
          <img
            :src="url"
            alt=""
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
            class="size-11 bg-surface-2 object-cover sm:size-14"
            @error="onError(url)"
          />
        </button>
      </div>
    </template>
    <p class="text-xs text-muted">
      {{ plural(photos.length, 'photo') }}
      {{ portalLabel ? `de ${portalLabel}` : 'du portail' }}, affichées depuis
      le portail : elles disparaissent s’il retire l’annonce.
    </p>
  </section>
</template>
