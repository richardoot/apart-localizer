import { inflateRawSync } from 'node:zlib'

/**
 * Lecture minimale d'un classeur .xlsx (Office Open XML) : un zip dont on
 * lit le répertoire central, les chaînes partagées et les feuilles. Assez
 * pour les tableaux de loyers de référence de la préfecture (valeurs et
 * cellules fusionnées), sans dépendance. Pas de formules recalculées : la
 * valeur enregistrée dans la cellule est lue telle quelle.
 */

/** Les fichiers d'une archive zip (méthodes « stockée » et « deflate »). */
export function unzip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>()
  // Fin du répertoire central : signature 0x06054b50, cherchée depuis la fin.
  let eocd = -1
  for (
    let i = buffer.length - 22;
    i >= Math.max(0, buffer.length - 65_557);
    i--
  ) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0)
    throw new Error('Archive zip illisible : répertoire central introuvable')
  const entries = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  for (let n = 0; n < entries; n++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(
        'Archive zip illisible : entrée du répertoire central attendue'
      )
    }
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const data = buffer.subarray(start, start + compressedSize)
    if (method === 0) files.set(name, Buffer.from(data))
    else if (method === 8) files.set(name, inflateRawSync(data))
    else
      throw new Error(
        `Méthode de compression zip ${method} non gérée (${name})`
      )
    offset += 46 + nameLength + extraLength + commentLength
  }
  return files
}

const decodeXml = (text: string): string =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code: string) =>
      String.fromCodePoint(Number(code))
    )
    .replace(/&amp;/g, '&')

/** Les chaînes partagées du classeur, dans l'ordre. */
export function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(si =>
    [...(si[1] ?? '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map(t => decodeXml(t[1] ?? ''))
      .join('')
  )
}

export interface Sheet {
  name: string
  /** Valeurs par référence de cellule (« A1 ») : texte ou nombre. */
  cells: Map<string, string | number>
  /** Plages fusionnées (« A5:A20 »). */
  merges: string[]
}

/** Les feuilles d'un classeur, avec leurs noms. */
export function readWorkbook(buffer: Buffer): Sheet[] {
  const files = unzip(buffer)
  const text = (name: string): string => {
    const file = files.get(name)
    if (!file) throw new Error(`Classeur incomplet : ${name} absent`)
    return file.toString('utf8')
  }
  const strings = files.has('xl/sharedStrings.xml')
    ? sharedStrings(text('xl/sharedStrings.xml'))
    : []
  const rels = new Map(
    [
      ...text('xl/_rels/workbook.xml.rels').matchAll(
        /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g
      ),
    ].map(m => [m[1] as string, m[2] as string])
  )
  return [
    ...text('xl/workbook.xml').matchAll(
      /<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g
    ),
  ].map(m => {
    const target = (rels.get(m[2] as string) ?? '').replace(/^\/?(xl\/)?/, '')
    const xml = text(`xl/${target}`)
    const cells = new Map<string, string | number>()
    for (const c of xml.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1] ?? ''
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1]
      const type = attrs.match(/t="([^"]+)"/)?.[1]
      const body = c[2] ?? ''
      if (!ref) continue
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      if (type === 'inlineStr') {
        const t = body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1]
        if (t !== undefined) cells.set(ref, decodeXml(t))
      } else if (v === undefined) {
        continue
      } else if (type === 's') {
        cells.set(ref, strings[Number(v)] ?? '')
      } else if (type === 'str' || type === 'b') {
        cells.set(ref, decodeXml(v))
      } else {
        const n = Number(v)
        cells.set(ref, Number.isFinite(n) ? n : decodeXml(v))
      }
    }
    const merges = [...xml.matchAll(/<mergeCell ref="([^"]+)"/g)].map(
      x => x[1] as string
    )
    return { name: decodeXml(m[1] as string), cells, merges }
  })
}

/** La colonne et la ligne d'une référence (« C12 » → ["C", 12]). */
export function splitRef(ref: string): [string, number] {
  const match = ref.match(/^([A-Z]+)(\d+)$/)
  if (!match) throw new Error(`Référence de cellule invalide : ${ref}`)
  return [match[1] as string, Number(match[2])]
}
