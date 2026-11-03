import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatVerifySummary } from '../lib/verify/summary.js'
import { parseCiWorkflow, stepKind } from '../lib/verify/workflow.js'

const repo = path.resolve(import.meta.dirname, '..', '..')

describe('parseCiWorkflow', () => {
  it('lit les étapes et les variables du vrai .github/workflows/ci.yml', () => {
    const workflow = parseCiWorkflow(
      readFileSync(path.join(repo, '.github/workflows/ci.yml'), 'utf8')
    )
    expect(workflow.steps.map(s => s.run)).toEqual([
      'pnpm install --frozen-lockfile',
      'pnpm build:packages',
      'pnpm lint',
      'pnpm format:check',
      'pnpm -r type-check',
      'pnpm -r test:unit',
      'pnpm -r test:e2e',
      'pnpm build',
    ])
    expect(workflow.env).toMatchObject({
      TEST_DATABASE_URL:
        'postgresql://postgres:postgres@127.0.0.1:54329/postgres',
      SUPABASE_SERVICE_ROLE_KEY: 'ci-placeholder',
      VITE_API_URL: 'http://localhost:3000',
    })
  })

  it('classe les étapes : --quick saute les e2e et le build', () => {
    expect(
      stepKind({ name: 'e2e', run: 'pnpm --filter @apart/api test:e2e' })
    ).toBe('e2e')
    expect(stepKind({ name: 'Build', run: 'pnpm build' })).toBe('build')
    expect(
      stepKind({ name: 'Build shared packages', run: 'pnpm build:packages' })
    ).toBe('check')
    expect(stepKind({ name: 'Lint', run: 'pnpm lint' })).toBe('check')
  })

  it('lit un run sur plusieurs lignes et saute les étapes sans run', () => {
    const yaml = [
      'name: CI',
      'jobs:',
      '  checks:',
      '    runs-on: ubuntu-latest',
      '    env:',
      "      A: 'un'",
      '      B: deux # commentaire',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - name: Multi',
      '        run: |',
      '          echo un',
      '          echo deux',
      '      - name: Simple',
      '        run: pnpm lint',
    ].join('\n')
    expect(parseCiWorkflow(yaml)).toEqual({
      env: { A: 'un', B: 'deux' },
      steps: [
        { name: 'Multi', run: 'echo un\necho deux' },
        { name: 'Simple', run: 'pnpm lint' },
      ],
    })
  })

  it('refuse un fichier sans job ni étape', () => {
    expect(() => parseCiWorkflow('name: x\n')).toThrow(/jobs/)
  })
})

describe('formatVerifySummary', () => {
  const step = (name: string, run: string) => ({ name, run })

  it('nomme l’étape qui échoue et ce qui n’a pas été lancé', () => {
    const text = formatVerifySummary(
      [
        { step: step('Lint', 'pnpm lint'), state: 'passed', ms: 2100 },
        {
          step: step('Unit tests', 'pnpm -r test:unit'),
          state: 'failed',
          ms: 45_000,
          code: 1,
        },
        {
          step: step('Build', 'pnpm build'),
          state: 'skipped',
          reason: 'non lancée (échec plus haut)',
        },
      ],
      48_000
    )
    expect(text).toContain('✓ Lint')
    expect(text).toContain('✗ Unit tests')
    expect(text).toContain('– Build')
    expect(text).toContain(
      'Échec à l’étape « Unit tests » (pnpm -r test:unit), code 1'
    )
  })

  it('dit quand tout est vert', () => {
    expect(
      formatVerifySummary(
        [{ step: step('Lint', 'pnpm lint'), state: 'passed', ms: 1000 }],
        1000
      )
    ).toContain('✓ Tout est vert')
  })
})
