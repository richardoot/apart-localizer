/**
 * Lecture de `.github/workflows/ci.yml` pour que `pnpm verify` rejoue
 * exactement les étapes de la CI : les `run:` des étapes du job, dans
 * l'ordre, avec les variables `env:` du job. Lecteur volontairement étroit
 * (la forme de ce fichier), testé sur le vrai fichier : une étape ajoutée à
 * la CI l'est aussi localement, sans rien changer ici.
 */

export interface CiStep {
  name: string
  run: string
}

export interface CiWorkflow {
  env: Record<string, string>
  steps: CiStep[]
}

const indentOf = (line: string): number => line.length - line.trimStart().length

function scalar(raw: string): string {
  const value = raw.trim()
  if (
    value.length >= 2 &&
    ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"')))
  ) {
    return value.slice(1, -1)
  }
  return value.replace(/\s+#.*$/, '')
}

export function parseCiWorkflow(yaml: string): CiWorkflow {
  const lines = yaml.split(/\r?\n/)
  const env: Record<string, string> = {}
  const steps: CiStep[] = []

  const jobsIndex = lines.findIndex(l => /^jobs:\s*$/.test(l))
  if (jobsIndex < 0) throw new Error('ci.yml : section « jobs » introuvable')
  const jobLine = lines.findIndex(
    (l, i) =>
      i > jobsIndex &&
      /^\s+[A-Za-z0-9_-]+:\s*$/.test(l) &&
      !l.trim().startsWith('#')
  )
  if (jobLine < 0) throw new Error('ci.yml : aucun job')
  const jobIndent = indentOf(lines[jobLine] as string)
  const keyIndent = jobIndent + 2

  let i = jobLine + 1
  while (i < lines.length) {
    const line = lines[i] as string
    if (line.trim() === '' || line.trim().startsWith('#')) {
      i++
      continue
    }
    if (indentOf(line) <= jobIndent) break
    if (indentOf(line) === keyIndent && /^\s*env:\s*$/.test(line)) {
      i++
      while (i < lines.length) {
        const entry = lines[i] as string
        if (entry.trim() === '' || entry.trim().startsWith('#')) {
          i++
          continue
        }
        if (indentOf(entry) <= keyIndent) break
        const match = /^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(entry)
        if (match?.[1]) env[match[1]] = scalar(match[2] ?? '')
        i++
      }
      continue
    }
    if (indentOf(line) === keyIndent && /^\s*steps:\s*$/.test(line)) {
      i++
      let current: { name: string; run: string | null } | null = null
      const flush = () => {
        if (current?.run) steps.push({ name: current.name, run: current.run })
        current = null
      }
      while (i < lines.length) {
        const entry = lines[i] as string
        if (entry.trim() === '' || entry.trim().startsWith('#')) {
          i++
          continue
        }
        if (indentOf(entry) <= keyIndent) break
        const item = /^(\s*)-\s+(.*)$/.exec(entry)
        const body = item ? (item[2] ?? '') : entry.trim()
        if (item) {
          flush()
          current = { name: '', run: null }
        }
        const field = /^([A-Za-z_-]+):\s*(.*)$/.exec(body.trim())
        if (current && field?.[1]) {
          const key = field[1]
          const value = field[2] ?? ''
          if (key === 'name') current.name = scalar(value)
          if (key === 'run') {
            if (value.trim() === '|' || value.trim() === '>') {
              // La colonne de la clé `run` ; le bloc est ce qui est plus indenté qu'elle.
              const fieldIndent = item
                ? (item[1] ?? '').length + 2
                : indentOf(entry)
              const block: string[] = []
              i++
              while (
                i < lines.length &&
                (lines[i]?.trim() === '' ||
                  indentOf(lines[i] as string) > fieldIndent)
              ) {
                block.push((lines[i] as string).trim())
                i++
              }
              current.run = block
                .filter(Boolean)
                .join(value.trim() === '|' ? '\n' : ' ')
              continue
            }
            current.run = scalar(value)
          }
        }
        i++
      }
      flush()
      continue
    }
    i++
  }
  if (steps.length === 0) throw new Error('ci.yml : aucune étape `run:`')
  return { env, steps }
}

/** Ce qu'une étape vérifie : `--quick` saute les e2e et le build. */
export function stepKind(step: CiStep): 'e2e' | 'build' | 'check' {
  if (/test:e2e/.test(step.run)) return 'e2e'
  if (/^pnpm\s+(-r\s+)?build\s*$/.test(step.run.trim())) return 'build'
  return 'check'
}
