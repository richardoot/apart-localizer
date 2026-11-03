import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parse as dotenvParse } from 'dotenv'
import { describe, expect, it } from 'vitest'
import {
  MANAGED_HEADER,
  formatEnvValue,
  mergeEnv,
  parseEnv,
  parseEnvValue,
  writeEnvFile,
} from '../lib/env-file.js'

describe('parseEnv', () => {
  it('lit les valeurs, ôte guillemets et commentaires de fin, garde la dernière occurrence', () => {
    const env = parseEnv(
      [
        '# commentaire',
        'A=1',
        'B="deux mots" # note',
        "C='simple'",
        'export D=quatre',
        'E=',
        'F=a#b',
        'A=2',
        'pas une ligne',
      ].join('\n')
    )
    expect(Object.fromEntries(env)).toEqual({
      A: '2',
      B: 'deux mots',
      C: 'simple',
      D: 'quatre',
      E: '',
      F: 'a#b',
    })
  })

  it('aller-retour : une valeur formatée se relit telle quelle', () => {
    for (const value of [
      '',
      'simple',
      'deux mots',
      'a#b c',
      'guil"lemet',
      'eyJ.abc.def',
    ]) {
      expect(parseEnvValue(formatEnvValue(value))).toBe(value)
    }
  })

  it('écrit ce que dotenv (lu par l’API et Prisma) relit à l’identique', () => {
    const values = {
      A: 'eyJ.abc-def_ghi',
      B: 'deux mots',
      C: 'a#b c',
      D: 'guil"lemet',
      E: "l'apostrophe",
      F: '',
    }
    const text = Object.entries(values)
      .map(([k, v]) => `${k}=${formatEnvValue(v)}`)
      .join('\n')
    expect(dotenvParse(text)).toEqual(values)
    expect(Object.fromEntries(parseEnv(text))).toEqual(values)
  })
})

describe('mergeEnv', () => {
  const plan = {
    managed: {
      DATABASE_URL: 'postgresql://local',
      SUPABASE_URL: 'http://127.0.0.1:54321',
    },
    defaults: {
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_SUBJECT: 'mailto:demo@apart.local',
    },
  }

  it('ne réécrit que les clés gérées et garde les valeurs de l’utilisateur, ses commentaires et l’ordre', () => {
    const existing = [
      '# Mon fichier',
      'ANTHROPIC_API_KEY=sk-ant-perso',
      'DATABASE_URL=postgresql://ancienne',
      'SENTRY_DSN=https://k@sentry.invalid/1',
      'VAPID_PUBLIC_KEY=ma-cle-a-moi',
      '',
    ].join('\n')
    const result = mergeEnv(existing, plan)
    const env = parseEnv(result.text)
    expect(env.get('ANTHROPIC_API_KEY')).toBe('sk-ant-perso')
    expect(env.get('SENTRY_DSN')).toBe('https://k@sentry.invalid/1')
    expect(env.get('VAPID_PUBLIC_KEY')).toBe('ma-cle-a-moi')
    expect(env.get('DATABASE_URL')).toBe('postgresql://local')
    expect(env.get('SUPABASE_URL')).toBe('http://127.0.0.1:54321')
    expect(env.get('VAPID_SUBJECT')).toBe('mailto:demo@apart.local')
    expect(
      result.text.startsWith(
        '# Mon fichier\nANTHROPIC_API_KEY=sk-ant-perso\nDATABASE_URL=postgresql://local\n'
      )
    ).toBe(true)
    expect(result.text).toContain(MANAGED_HEADER)
    expect(result.updated).toEqual(['DATABASE_URL'])
    expect(result.added.sort()).toEqual(['SUPABASE_URL', 'VAPID_SUBJECT'])
  })

  it('remplit une valeur par défaut vide sur place, sans toucher une valeur saisie', () => {
    const result = mergeEnv(
      'VAPID_PUBLIC_KEY=\nVAPID_SUBJECT=mailto:moi@exemple.fr\n',
      plan
    )
    expect(parseEnv(result.text).get('VAPID_PUBLIC_KEY')).toBe('pub')
    expect(parseEnv(result.text).get('VAPID_SUBJECT')).toBe(
      'mailto:moi@exemple.fr'
    )
    expect(result.text.split('\n')[0]).toBe('VAPID_PUBLIC_KEY=pub')
  })

  it('part du modèle .env.example pour un fichier à créer', () => {
    const template =
      '# Exemple\nDATABASE_URL=postgresql://exemple\nSENTRY_DSN=\n'
    const result = mergeEnv(null, plan, template)
    expect(
      result.text.startsWith(
        '# Exemple\nDATABASE_URL=postgresql://local\nSENTRY_DSN=\n'
      )
    ).toBe(true)
    expect(result.added).toContain('DATABASE_URL')
  })

  it('est idempotente : fusionner deux fois ne change plus rien', () => {
    const once = mergeEnv('X=1\n', plan).text
    const twice = mergeEnv(once, plan)
    expect(twice.text).toBe(once)
    expect(twice.updated).toEqual([])
    expect(twice.added).toEqual([])
  })
})

describe('writeEnvFile', () => {
  const dir = () => mkdtempSync(path.join(tmpdir(), 'apart-env-'))
  const plan = { managed: { SUPABASE_SERVICE_ROLE_KEY: 'cle-locale' } }

  it('sauvegarde un fichier existant avant la première écriture, une seule fois', () => {
    const root = dir()
    const file = path.join(root, '.env')
    writeFileSync(
      file,
      'ANTHROPIC_API_KEY=perso\nSUPABASE_SERVICE_ROLE_KEY=ancienne\n'
    )
    const first = writeEnvFile(file, plan)
    expect(first.action).toBe('updated')
    expect(first.backup).toBe(`${file}.backup`)
    expect(readFileSync(`${file}.backup`, 'utf8')).toContain(
      'SUPABASE_SERVICE_ROLE_KEY=ancienne'
    )
    expect(parseEnv(readFileSync(file, 'utf8')).get('ANTHROPIC_API_KEY')).toBe(
      'perso'
    )

    const again = writeEnvFile(file, plan)
    expect(again.action).toBe('unchanged')
    expect(again.backup).toBeNull()

    writeEnvFile(file, { managed: { SUPABASE_SERVICE_ROLE_KEY: 'nouvelle' } })
    // La sauvegarde garde l'état d'avant la pile locale.
    expect(readFileSync(`${file}.backup`, 'utf8')).toContain(
      'SUPABASE_SERVICE_ROLE_KEY=ancienne'
    )
  })

  it('crée un fichier absent depuis le modèle, sans sauvegarde', () => {
    const root = dir()
    const file = path.join(root, '.env')
    const template = path.join(root, '.env.example')
    writeFileSync(template, '# Modèle\nSUPABASE_SERVICE_ROLE_KEY=\n')
    const result = writeEnvFile(file, plan, template)
    expect(result.action).toBe('created')
    expect(result.backup).toBeNull()
    expect(existsSync(`${file}.backup`)).toBe(false)
    expect(readFileSync(file, 'utf8')).toBe(
      '# Modèle\nSUPABASE_SERVICE_ROLE_KEY=cle-locale\n'
    )
  })
})
