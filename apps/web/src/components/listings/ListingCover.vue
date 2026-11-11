<script setup lang="ts">
  import { ref, watch } from 'vue'
  import type { ListingCover } from '@apart/contracts'

  /**
   * Lot 25 (ADR 0035) : la photo de couverture d'une annonce (fiche, cartes,
   * lignes), pour la reconnaître d'un coup d'œil : la vignette d'une photo
   * de visite, jamais une image de portail ; rien sans photo. L'URL est
   * signée et courte : une image qui ne se charge plus (URL expirée)
   * disparaît et demande une relecture.
   */
  const props = withDefaults(
    defineProps<{
      cover: ListingCover | null | undefined
      /** `row` : 48 px ; `thumb` : 64 px (fiche) ; `card` : bandeau de carte ; `mini` : 32 px (ligne collée). */
      size?: 'mini' | 'row' | 'thumb' | 'card'
    }>(),
    { size: 'row' }
  )
  const emit = defineEmits<{ expired: [] }>()

  const failed = ref(false)
  watch(
    () => props.cover?.thumbnailUrl,
    () => {
      failed.value = false
    }
  )
  function onError(): void {
    failed.value = true
    emit('expired')
  }

  const SIZES = {
    mini: 'size-8 rounded-md',
    row: 'size-12 rounded-lg',
    thumb: 'size-16 rounded-xl sm:size-20',
    card: 'h-32 w-full rounded-xl',
  } as const
</script>

<template>
  <img
    v-if="cover?.thumbnailUrl && !failed"
    :src="cover.thumbnailUrl"
    alt=""
    loading="lazy"
    decoding="async"
    referrerpolicy="no-referrer"
    class="flex-none bg-surface-2 object-cover"
    :class="SIZES[size]"
    :data-cover="cover.photoId"
    data-testid="listing-cover"
    @error="onError"
  />
</template>
