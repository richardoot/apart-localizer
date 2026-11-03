import { describe, expect, it } from 'vitest'
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { z } from 'zod'
import { DATA_TAG, answer, dataResult, refusal } from './tool-results'

describe('dataResult', () => {
  it('encadre le JSON dans la balise et le rend aussi en structuredContent', () => {
    const result = dataResult('Une annonce', { a: 1, nan: Number.NaN })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe(
      `Une annonce\n<${DATA_TAG}>\n{"a":1,"nan":null}\n</${DATA_TAG}>`
    )
    expect(result.structuredContent).toEqual({ a: 1, nan: null })
  })
})

describe('refusal et answer', () => {
  it('rend les refus des services comme des réponses, pas des exceptions', async () => {
    expect(refusal('non')).toEqual({
      content: [{ type: 'text', text: 'non' }],
      isError: true,
    })
    const notFound = await answer(() => {
      throw new NotFoundException('Annonce introuvable')
    })
    expect(notFound.isError).toBe(true)
    expect(notFound.content[0]?.text).toBe('Refusé : Annonce introuvable')
    const conflict = await answer(() => {
      throw new ConflictException('Le prix attendu était 1 €')
    })
    expect(conflict.content[0]?.text).toContain('prix attendu')
    const bad = await answer(() => {
      throw new BadRequestException(['title', 'price'])
    })
    expect(bad.content[0]?.text).toBe('Refusé : title, price')
  })

  it('explique une entrée invalide champ par champ', async () => {
    const result = await answer(() => {
      z.object({ price: z.number().min(0) }).parse({ price: -1 })
      return Promise.resolve(refusal('inatteignable'))
    })
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toMatch(/^Entrée invalide : price : /)
  })

  it('laisse remonter une vraie panne', async () => {
    await expect(
      answer(() => {
        throw new InternalServerErrorException('boom')
      })
    ).rejects.toThrow('boom')
    await expect(
      answer(() => {
        throw new Error('db down')
      })
    ).rejects.toThrow('db down')
  })
})
