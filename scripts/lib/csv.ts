/**
 * Découpe d'une ligne CSV (RFC 4180, sans retour à la ligne dans un champ) :
 * séparateur au choix, guillemets doublés pour un guillemet littéral.
 */
export function parseCsvLine(line: string, separator = ','): string[] {
  const fields: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i] as string
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += char
      }
    } else if (char === '"' && field === '') {
      quoted = true
    } else if (char === separator) {
      fields.push(field)
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }
  fields.push(field)
  return fields
}

/** Une ligne en objet, avec l'en-tête. */
export function recordOf(
  header: readonly string[],
  fields: readonly string[]
): Record<string, string> {
  const record: Record<string, string> = {}
  header.forEach((name, index) => {
    record[name] = fields[index] ?? ''
  })
  return record
}

/** Un fichier CSV entier en objets (petits fichiers : référentiels, contrôles). */
export function parseCsv(
  text: string,
  separator = ','
): Record<string, string>[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split('\n')
    .filter(l => l.trim() !== '')
  const header = parseCsvLine(lines[0] ?? '', separator)
  return lines
    .slice(1)
    .map(line => recordOf(header, parseCsvLine(line, separator)))
}
