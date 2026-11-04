import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

// Le lanceur NestJS de Vercel charge dist/main.js : un module qui exporte
// quelque chose sans export par défaut est refusé (« Invalid export found in
// module … The default export must be a function or server ») et chaque
// requête répond 500. main.ts ne fait qu'amorcer l'application.
describe('main.ts', () => {
  it("n'exporte rien, pour que le runtime Vercel l'accepte", () => {
    const source = readFileSync(join(__dirname, 'main.ts'), 'utf8')
    expect(source).not.toMatch(/^\s*export\s/m)
  })
})
