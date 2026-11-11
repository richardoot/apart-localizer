import { computed, ref } from 'vue'
import type { ExtractionImage, ExtractionResult } from '@apart/contracts'
import { ApiError, api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { fileToExtractionImage } from '@/lib/images'

/** Une capture déposée, avec un aperçu. */
export interface PendingImage {
  key: string
  name: string
  image: ExtractionImage
}

let imageCounter = 0

/**
 * L'onglet « Coller une annonce » : le texte, le lien, les captures, l'appel
 * à l'extraction et son résultat (fiche pré-remplie, champs manquants,
 * doublons, coût). Aucune écriture : l'enregistrement passe par le formulaire.
 */
export function useExtraction() {
  const text = ref('')
  const url = ref('')
  const images = ref<PendingImage[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)
  /** Vrai quand l'API a répondu 503 : l'IA n'est pas configurée côté serveur. */
  const unavailable = ref(false)
  const result = ref<ExtractionResult | null>(null)

  const canAnalyze = computed(
    () =>
      !pending.value && (text.value.trim() !== '' || images.value.length > 0)
  )

  async function addFiles(files: Iterable<File>, maxImages = 4): Promise<void> {
    error.value = null
    for (const file of files) {
      if (images.value.length >= maxImages) {
        error.value = `Au plus ${maxImages} captures par analyse.`
        return
      }
      try {
        const image = await fileToExtractionImage(file)
        imageCounter += 1
        images.value.push({
          key: `img-${imageCounter}`,
          name: file.name,
          image,
        })
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Image illisible.'
      }
    }
  }

  function removeImage(key: string): void {
    images.value = images.value.filter(image => image.key !== key)
  }

  async function analyze(): Promise<ExtractionResult | null> {
    if (!canAnalyze.value) return null
    pending.value = true
    error.value = null
    unavailable.value = false
    try {
      const trimmedUrl = url.value.trim()
      result.value = await api.listings.extract({
        text: text.value.trim() || null,
        url: trimmedUrl || null,
        images: images.value.map(image => image.image),
      })
      return result.value
    } catch (err) {
      unavailable.value = err instanceof ApiError && err.status === 503
      error.value = unavailable.value
        ? `${errorMessage(err)} L’analyse par IA est indisponible ; la saisie manuelle reste possible.`
        : errorMessage(err, 'L’analyse a échoué.')
      return null
    } finally {
      pending.value = false
    }
  }

  function reset(): void {
    result.value = null
    error.value = null
  }

  return {
    text,
    url,
    images,
    pending,
    error,
    unavailable,
    result,
    canAnalyze,
    addFiles,
    removeImage,
    analyze,
    reset,
  }
}

/** « 0,05 $ · 3 200 jetons en entrée, 1 400 en sortie · claude-opus-5-5 ». */
export function describeUsage(usage: ExtractionResult['usage']): string {
  const cost =
    usage.estimatedCostUsd === null
      ? 'coût inconnu'
      : `≈ ${usage.estimatedCostUsd.toLocaleString('fr-FR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        })} $`
  return `${cost} · ${usage.inputTokens.toLocaleString('fr-FR')} jetons en entrée, ${usage.outputTokens.toLocaleString('fr-FR')} en sortie · ${usage.model}`
}
