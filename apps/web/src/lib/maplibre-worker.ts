/**
 * Le worker de MapLibre 6 : la bibliothèque calcule son adresse à
 * l'exécution (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`), que
 * Vite ne voit pas au build. Sans ce module, le fichier n'est pas publié,
 * la réécriture SPA de Vercel renvoie index.html à sa place et aucune tuile
 * ne se charge (carte vide, dessin impossible). L'import `?url` fait publier
 * le fichier ; `setWorkerUrl` le déclare avant la création de toute carte.
 * Importé en tête de chaque composant de carte ; `scripts/check-build.mjs`
 * vérifie que le build le contient.
 */
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

setWorkerUrl(workerUrl)

export { workerUrl as maplibreWorkerUrl }
