import type { DownloadedFile } from './api'

/** Fait télécharger un fichier reçu de l'API (lien temporaire, aussitôt révoqué). */
export function saveFile(file: DownloadedFile): void {
  const url = URL.createObjectURL(file.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
