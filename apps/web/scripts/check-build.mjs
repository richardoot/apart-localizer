// Après `vite build` : le worker de MapLibre doit être publié dans dist/assets
// et référencé par le code, sinon les cartes restent vides en production
// (src/lib/maplibre-worker.ts).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const assets = join(import.meta.dirname, '..', 'dist', 'assets')
const files = readdirSync(assets)
const worker = files.find(f => /^maplibre-gl-worker.*\.m?js$/.test(f))
if (!worker) {
  console.error('Build : le worker MapLibre est absent de dist/assets.')
  process.exit(1)
}
const referenced = files
  .filter(f => f.endsWith('.js') && f !== worker)
  .some(f => readFileSync(join(assets, f), 'utf8').includes(worker))
if (!referenced) {
  console.error(`Build : ${worker} n'est référencé par aucun module.`)
  process.exit(1)
}
console.log(`Build : worker MapLibre publié (${worker}).`)
