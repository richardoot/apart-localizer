import { describe, expect, it } from 'vitest'
import { StackUsageError, parseStackArgs } from '../lib/stack/options.js'

describe('parseStackArgs', () => {
  it('lit up avec ses défauts (aucun jeu, pas de dev)', () => {
    expect(parseStackArgs(['up'])).toMatchObject({
      command: 'up',
      dataset: 'none',
      opendata: false,
      dev: false,
      yes: false,
      help: false,
    })
  })

  it('accepte le séparateur -- de pnpm et toutes les options de up', () => {
    expect(
      parseStackArgs(['up', '--', '--dataset', 'demo', '--opendata', '--dev'])
    ).toMatchObject({
      command: 'up',
      dataset: 'demo',
      opendata: true,
      dev: true,
    })
  })

  it('accepte les e-mails seulement avec --dataset artifact', () => {
    expect(
      parseStackArgs([
        'up',
        '--dataset',
        'artifact',
        '--richard-email',
        'r@exemple.fr',
        '--chloe-email',
        'c@exemple.fr',
      ])
    ).toMatchObject({
      richardEmail: 'r@exemple.fr',
      chloeEmail: 'c@exemple.fr',
    })
    expect(() =>
      parseStackArgs(['up', '--richard-email', 'r@exemple.fr'])
    ).toThrow(/--dataset artifact/)
    expect(() =>
      parseStackArgs([
        'up',
        '--dataset',
        'artifact',
        '--chloe-email',
        'pas-un-email',
      ])
    ).toThrow(/n'est pas une adresse/)
  })

  it('refuse un jeu inconnu, une commande inconnue, une option inconnue', () => {
    expect(() => parseStackArgs(['up', '--dataset', 'prod'])).toThrow(
      StackUsageError
    )
    expect(() => parseStackArgs(['start'])).toThrow(/Commande inconnue/)
    expect(() => parseStackArgs(['up', '--force'])).toThrow(StackUsageError)
  })

  it('réserve chaque option à sa commande', () => {
    expect(() => parseStackArgs(['up', '--yes'])).toThrow(/stack:reset/)
    expect(() => parseStackArgs(['down', '--dataset', 'demo'])).toThrow(
      /stack:down/
    )
    expect(() => parseStackArgs(['reset', '--dev'])).toThrow(/stack:up/)
    expect(() =>
      parseStackArgs(['up', '--database-url', 'postgresql://x'])
    ).toThrow(/stack:reset/)
  })

  it('lit reset avec --yes, son jeu et une base jetable', () => {
    expect(
      parseStackArgs([
        'reset',
        '--yes',
        '--dataset',
        'demo',
        '--database-url',
        'postgresql://postgres:postgres@127.0.0.1:54329/jetable',
      ])
    ).toMatchObject({
      command: 'reset',
      yes: true,
      dataset: 'demo',
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:54329/jetable',
    })
  })

  it("donne l'aide sans commande ou avec --help", () => {
    expect(parseStackArgs([]).help).toBe(true)
    expect(parseStackArgs(['--help']).help).toBe(true)
    expect(parseStackArgs(['status', '--help'])).toMatchObject({
      command: 'status',
      help: true,
    })
  })
})
