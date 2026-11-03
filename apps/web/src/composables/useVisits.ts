import { computed, ref, unref } from 'vue'
import type { MaybeRef } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { VisitInputRaw, VisitUpdate } from '@apart/contracts'
import { ApiError, api, uploadToSignedUrl } from '@/lib/api'
import { preparePhoto } from '@/lib/photos'
import { listingKeys } from './useListings'

export const visitKeys = {
  list: (listingId: string) => ['listings', 'visits', listingId] as const,
}

/** Une photo en cours d'envoi, pour la barre de progression. */
export interface PhotoUploadState {
  name: string
  step: 'preparing' | 'uploading' | 'done' | 'failed'
  error: string | null
}

/**
 * Les visites d'une annonce et leurs écritures ; l'envoi des photos enchaîne
 * réduction dans le navigateur, annonce à l'API, PUT direct vers le stockage
 * (URL signée) et fin d'envoi vérifiée par l'API.
 */
export function useVisits(listingId: MaybeRef<string>) {
  const client = useQueryClient()
  const key = computed(() => visitKeys.list(unref(listingId)))
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.visits.list(unref(listingId)),
    enabled: computed(() => Boolean(unref(listingId))),
  })

  function refresh(): void {
    void client.invalidateQueries({ queryKey: key.value })
    // Une tâche de préparation ou une écriture change la fiche et son journal.
    void client.invalidateQueries({
      queryKey: listingKeys.detail(unref(listingId)),
    })
    void client.invalidateQueries({
      queryKey: ['listings', 'activity', unref(listingId)],
    })
  }

  const create = useMutation({
    mutationFn: (input: VisitInputRaw) =>
      api.visits.create(unref(listingId), input),
    onSuccess: refresh,
  })
  const update = useMutation({
    mutationFn: ({
      visitId,
      update,
    }: {
      visitId: string
      update: VisitUpdate
    }) => api.visits.update(unref(listingId), visitId, update),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (visitId: string) =>
      api.visits.remove(unref(listingId), visitId),
    onSuccess: refresh,
  })
  const removePhoto = useMutation({
    mutationFn: ({ visitId, photoId }: { visitId: string; photoId: string }) =>
      api.visits.removePhoto(unref(listingId), visitId, photoId),
    onSuccess: refresh,
  })

  const uploads = ref<PhotoUploadState[]>([])

  async function uploadPhotos(
    visitId: string,
    files: Iterable<File>
  ): Promise<number> {
    let sent = 0
    for (const file of files) {
      const state: PhotoUploadState = {
        name: file.name,
        step: 'preparing',
        error: null,
      }
      uploads.value = [...uploads.value, state]
      const set = (patch: Partial<PhotoUploadState>) => {
        uploads.value = uploads.value.map(u =>
          u === state ? Object.assign(state, patch) : u
        )
      }
      try {
        const prepared = await preparePhoto(file)
        set({ step: 'uploading' })
        const announced = await api.visits.requestPhotoUpload(
          unref(listingId),
          visitId,
          {
            contentType: prepared.photoType,
            sizeBytes: prepared.photo.size,
            width: prepared.width,
            height: prepared.height,
            thumbnail: {
              contentType: prepared.thumbnailType,
              sizeBytes: prepared.thumbnail.size,
            },
          }
        )
        await uploadToSignedUrl(announced.upload, prepared.photo)
        await uploadToSignedUrl(announced.thumbnailUpload, prepared.thumbnail)
        await api.visits.completePhoto(
          unref(listingId),
          visitId,
          announced.photo.id
        )
        set({ step: 'done' })
        sent += 1
      } catch (error) {
        set({
          step: 'failed',
          error:
            error instanceof ApiError || error instanceof Error
              ? error.message
              : "L'envoi a échoué.",
        })
      }
    }
    refresh()
    return sent
  }

  function clearUploads(): void {
    uploads.value = uploads.value.filter(u => u.step === 'failed')
  }

  return {
    ...query,
    create,
    update,
    remove,
    removePhoto,
    uploads,
    uploadPhotos,
    clearUploads,
  }
}
