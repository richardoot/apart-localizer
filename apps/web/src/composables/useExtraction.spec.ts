import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeExtractionResult } from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  listings: { extract: vi.fn() },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import { ApiError } from '@/lib/api'
import { describeUsage, useExtraction } from './useExtraction'

describe('useExtraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('n’analyse rien sans texte ni capture, puis envoie texte, lien et captures', async () => {
    const extraction = useExtraction()
    expect(extraction.canAnalyze.value).toBe(false)
    expect(await extraction.analyze()).toBeNull()
    expect(apiMock.listings.extract).not.toHaveBeenCalled()

    const result = fakeExtractionResult()
    apiMock.listings.extract.mockResolvedValue(result)
    extraction.text.value = '  T2 Talence 189 000 € FAI  '
    extraction.url.value = ' https://agence-fictive.invalid/annonce/AGF-12345 '
    const file = new File([new Uint8Array([1, 2, 3])], 'capture.png', {
      type: 'image/png',
    })
    await extraction.addFiles([file])
    expect(extraction.images.value).toHaveLength(1)
    expect(extraction.canAnalyze.value).toBe(true)

    const returned = await extraction.analyze()
    expect(returned).toEqual(result)
    expect(extraction.result.value).toEqual(result)
    expect(extraction.pending.value).toBe(false)
    expect(apiMock.listings.extract).toHaveBeenCalledWith({
      text: 'T2 Talence 189 000 € FAI',
      url: 'https://agence-fictive.invalid/annonce/AGF-12345',
      images: [{ mediaType: 'image/png', data: 'AQID' }],
    })
    extraction.removeImage(extraction.images.value[0]?.key ?? '')
    expect(extraction.images.value).toEqual([])
  })

  it('plafonne les captures et explique une image refusée', async () => {
    const extraction = useExtraction()
    const png = (name: string) =>
      new File([new Uint8Array([1])], name, { type: 'image/png' })
    await extraction.addFiles([png('a.png'), png('b.png'), png('c.png')], 2)
    expect(extraction.images.value.map(i => i.name)).toEqual(['a.png', 'b.png'])
    expect(extraction.error.value).toContain('Au plus 2 captures')
    await extraction.addFiles([new File(['x'], 'x.bmp', { type: 'image/bmp' })])
    expect(extraction.error.value).toContain('x.bmp')
  })

  it('traduit un 503 « IA non configurée » et les autres erreurs', async () => {
    const extraction = useExtraction()
    extraction.text.value = 'x'
    apiMock.listings.extract.mockRejectedValue(
      new ApiError(503, 'IA non configurée : renseignez ANTHROPIC_API_KEY.')
    )
    expect(await extraction.analyze()).toBeNull()
    expect(extraction.error.value).toContain('IA non configurée')
    expect(extraction.error.value).toContain('saisie manuelle reste possible')
    apiMock.listings.extract.mockRejectedValue(new ApiError(422, 'Refusé'))
    await extraction.analyze()
    expect(extraction.error.value).toBe('Refusé')
    apiMock.listings.extract.mockRejectedValue(new Error('boom'))
    await extraction.analyze()
    expect(extraction.error.value).toBe("L'analyse a échoué.")
    extraction.reset()
    expect(extraction.error.value).toBeNull()
  })

  it('décrit le coût', () => {
    const text = describeUsage(fakeExtractionResult().usage)
    expect(text).toContain('≈ 0,0453 $')
    expect(text).toMatch(/3\s?200 jetons en entrée/)
    expect(text).toContain('claude-opus-5-5')
    expect(
      describeUsage({ ...fakeExtractionResult().usage, estimatedCostUsd: null })
    ).toContain('coût inconnu')
  })
})
