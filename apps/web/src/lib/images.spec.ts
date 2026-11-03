import { describe, expect, it } from 'vitest'
import { AI_MAX_IMAGE_BYTES } from '@apart/contracts'
import { dataUrlToBase64, fileToExtractionImage } from './images'

describe('captures d’écran', () => {
  it('lit un fichier image en base64 (sans toile, tel quel)', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71])
    const file = new File([bytes], 'capture.png', { type: 'image/png' })
    const image = await fileToExtractionImage(file)
    expect(image.mediaType).toBe('image/png')
    expect(image.data).toBe(btoa(String.fromCharCode(...bytes)))
  })

  it('refuse un type non géré et un fichier trop lourd', async () => {
    const bmp = new File(['x'], 'image.bmp', { type: 'image/bmp' })
    await expect(fileToExtractionImage(bmp)).rejects.toThrow(
      'jpeg, png, gif ou webp'
    )
    const big = new File(
      [new Uint8Array(AI_MAX_IMAGE_BYTES + 1)],
      'grande.png',
      {
        type: 'image/png',
      }
    )
    await expect(fileToExtractionImage(big)).rejects.toThrow('dépasse 5 Mo')
  })

  it('extrait la partie base64 d’une URL data', () => {
    expect(dataUrlToBase64('data:image/png;base64,QUJD')).toBe('QUJD')
    expect(dataUrlToBase64('QUJD')).toBe('QUJD')
  })
})
